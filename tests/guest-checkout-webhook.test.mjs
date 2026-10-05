import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { calculateTotalPricing, calculateGuestUpgrade } from "../supabase/functions/_shared/pricing.ts";
import { guestCheckoutMetadata } from "../supabase/functions/_shared/guestPayment.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
let mock;
const reset = (form = false) => {
  mock = {
    user: { id: ownerId, is_anonymous: false },
    project: {id:projectId,owner_id:ownerId,status:"draft",payment_status:"unpaid",project_data:{rsvp:{enabled:form}},purchased_guest_capacity:null,purchased_extra_blocks:null},
    receipts: [], publication: null, form: null, sessions: {}, calls: [], rejectReservation: false,
  };
};
reset();

function query(table) {
  const filters = [];
  let patch;
  const result = () => {
    let rows = table === "projects" ? [mock.project] : table === "guest_license_payments" ? mock.receipts : table === "project_payments" ? (mock.publication ? [mock.publication] : []) : table === "rsvp_addon_purchases" ? (mock.form ? [mock.form] : []) : [];
    rows = rows.filter((row) => filters.every(([key,value]) => row[key] === value));
    if (patch) rows.forEach((row) => Object.assign(row,patch));
    return {data:rows[0] ?? null,error:null};
  };
  const chain = {
    select: () => chain, eq: (key,value) => { filters.push([key,value]); return chain; },
    is: (key,value) => { filters.push([key,value]); return chain; },
    update: (value) => { patch = value; mock.calls.push({kind:"update",table,value}); return chain; },
    maybeSingle: async () => result(), single: async () => result(),
    then: (resolve,reject) => Promise.resolve(result()).then(resolve,reject),
  };
  return chain;
}
const client = {
  auth: {getUser:async () => ({data:{user:mock.user},error:null})}, from: query,
  rpc: async (name,params) => {
    mock.calls.push({kind:"rpc",name,params});
    if (name !== "reserve_guest_checkout") return {data:null,error:null};
    if (mock.rejectReservation) return {data:null,error:{code:"P0001",message:"CHECKOUT_BUSY"}};
    const upgrade = mock.project.payment_status === "paid";
    const form = !upgrade && mock.project.project_data.rsvp.enabled && mock.form?.status !== "paid";
    const quote = calculateTotalPricing(params.p_guest_count,form);
    const additional = upgrade ? calculateGuestUpgrade(mock.project.purchased_guest_capacity,params.p_guest_count) : null;
    const receipt = {
      id:"33333333-3333-4333-8333-333333333333",project_id:projectId,owner_id:ownerId,
      purchase_type:upgrade ? "guest_capacity_upgrade" : "initial_publication",pricing_version:"guest-v1",
      guest_count:quote.guestCount,guest_capacity:quote.guestCapacity,extra_blocks:quote.extraBlocks,
      previous_extra_blocks:mock.project.purchased_extra_blocks ?? 0,additional_blocks:additional?.additionalBlocks ?? quote.extraBlocks,
      has_form:form,amount_cents:additional?.upgradePriceCents ?? quote.totalPriceCents,currency:"eur",
      stripe_checkout_session_id:null,stripe_payment_intent_id:null,status:"pending",created_at:new Date().toISOString(),
    };
    mock.receipts.push(receipt); return {data:receipt,error:null};
  },
};
class FakeStripe {
  static createFetchHttpClient() { return {}; }
  static createSubtleCryptoProvider() { return {}; }
  checkout = {sessions:{
    create:async (params,options) => {
      mock.calls.push({kind:"stripe-create",params,options});
      const session = {id:"cs_created",url:"https://checkout.stripe.invalid/session",status:"open",payment_status:"unpaid",currency:"eur",metadata:params.metadata,payment_intent:"pi_created",amount_total:params.line_items.reduce((sum,item)=>sum+item.quantity*item.price_data.unit_amount,0)};
      mock.sessions[session.id] = session; return session;
    },
    retrieve:async (id) => mock.sessions[id],
    expire:async (id) => {mock.calls.push({kind:"expire",id});mock.sessions[id].status="expired";return mock.sessions[id];},
    list:async () => ({data:Object.values(mock.sessions)}),
  }};
  webhooks = {constructEventAsync:async (raw,signature) => {
    if (signature !== "valid-test-signature") throw new Error("invalid signature");
    return JSON.parse(raw);
  }};
}
globalThis.__pricingEdgeMock = {client,FakeStripe};
const env = {SITE_URL:"https://www.laboutiquedesmaries.fr",STRIPE_SECRET_KEY:"sk_test_mock_only",STRIPE_WEBHOOK_SECRET:"mock_only",SUPABASE_URL:"https://supabase.invalid",SUPABASE_SERVICE_ROLE_KEY:"mock_only",RSVP_ADDON_PRICE_CENTS:"990"};
let current;
const handlers = {};
globalThis.Deno = {env:{get:(name)=>env[name]},serve:(handler)=>{handlers[current]=handler;}};
const hooks = registerHooks({
  resolve(specifier,context,nextResolve) {
    if (specifier.startsWith("npm:stripe@")) return {url:"edge-test:stripe",shortCircuit:true};
    if (specifier.startsWith("npm:@supabase/")) return {url:"edge-test:supabase",shortCircuit:true};
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad) {
    if (url === "edge-test:stripe") return {format:"module",source:"export default globalThis.__pricingEdgeMock.FakeStripe;",shortCircuit:true};
    if (url === "edge-test:supabase") return {format:"module",source:"export const createClient = () => globalThis.__pricingEdgeMock.client;",shortCircuit:true};
    return nextLoad(url,context);
  },
});
current="checkout";await import("../supabase/functions/create-checkout-session/index.ts");
current="webhook";await import("../supabase/functions/stripe-webhook/index.ts");
const checkout = (body,auth=true) => handlers.checkout(new Request("https://edge.invalid",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer token"}:{})},body:JSON.stringify(body)}));
const webhook = (type,object,signature="valid-test-signature") => handlers.webhook(new Request("https://edge.invalid",{method:"POST",headers:{"Stripe-Signature":signature},body:JSON.stringify({type,data:{object}})}));
const calls = (kind) => mock.calls.filter((call)=>call.kind===kind);

test("real Checkout handler computes all tiers, ignores client amount and generates complete server quote metadata", async () => {
  for (const guests of [1,40,41,47,48,54,55,61,62]) for (const form of [false,true]) {
    reset(form);
    assert.equal((await checkout({projectId,guestCount:guests,amount:1,extraBlocks:0,hasForm:false})).status,200);
    const {params,options} = calls("stripe-create")[0];
    assert.equal(params.line_items.reduce((sum,item)=>sum+item.quantity*item.price_data.unit_amount,0),calculateTotalPricing(guests,form).totalPriceCents);
    assert.equal(params.metadata.has_form,String(form)); assert.equal(params.metadata.guest_count,String(guests));
    const blocks = Math.max(0,Math.ceil((guests-40)/7));
    assert.deepEqual(params.metadata,{
      receipt_id:"33333333-3333-4333-8333-333333333333",project_id:projectId,owner_id:ownerId,
      purchase_type:"initial_publication",pricing_version:"guest-v1",guest_count:String(guests),
      guest_capacity:String(40+7*blocks),extra_blocks:String(blocks),previous_extra_blocks:"0",
      additional_blocks:String(blocks),has_form:String(form),includes_form:String(form),form_amount_cents:String(form?990:0),
    });
    assert.deepEqual(params.metadata,params.payment_intent_data.metadata);
    assert.equal(params.managed_payments.enabled,false); assert.equal(params.payment_method_types,undefined);
    assert.match(options.idempotencyKey,/^guest-license-/);
  }
});
test("invalid guest count, absent/anonymous session or another owner's project never create Checkout", async () => {
  for (const count of [null,0,-1,1.1,"40",100001]) {reset();assert.equal((await checkout({projectId,guestCount:count})).status,400);assert.equal(calls("stripe-create").length,0);}
  reset();assert.equal((await checkout({projectId,guestCount:40},false)).status,401);
  reset();mock.user.is_anonymous=true;assert.equal((await checkout({projectId,guestCount:40})).status,401);
  reset();mock.project.owner_id="other";assert.equal((await checkout({projectId,guestCount:40})).status,403);
  assert.equal(calls("stripe-create").length,0);
});
test("paid capacity upgrades charge only additional blocks, never base or form", async () => {
  for (const [capacity,count,amount] of [[40,47,450],[40,54,900],[47,54,450],[54,53,0]]) {
    reset(true);Object.assign(mock.project,{payment_status:"paid",status:"published",purchased_guest_capacity:capacity,purchased_extra_blocks:(capacity-40)/7});
    const response=await checkout({projectId,guestCount:count});
    if (!amount) {assert.equal(response.status,409);assert.equal(calls("stripe-create").length,0);continue;}
    assert.equal(response.status,200);const {params}=calls("stripe-create")[0];assert.equal(params.line_items.length,1);
    assert.equal(params.line_items[0].quantity*params.line_items[0].price_data.unit_amount,amount);
    assert.equal(params.metadata.has_form,"false");assert.equal(params.metadata.purchase_type,"guest_capacity_upgrade");
    assert.equal(params.metadata.guest_count,String(count));
    assert.equal(params.metadata.guest_capacity,String(40+7*Math.max(0,Math.ceil((count-40)/7))));
    assert.equal(params.metadata.previous_extra_blocks,String((capacity-40)/7));
    assert.equal(params.metadata.additional_blocks,String(amount/450));
    assert.deepEqual(params.metadata,params.payment_intent_data.metadata);
  }
});
test("legacy paid orders cannot be accidentally recharged; reservations reject concurrent attempts", async () => {
  reset();Object.assign(mock.project,{payment_status:"paid",status:"published"});
  assert.equal((await checkout({projectId,guestCount:54})).status,409);assert.equal(calls("stripe-create").length,0);
  reset();mock.rejectReservation=true;assert.equal((await checkout({projectId,guestCount:54})).status,409);assert.equal(calls("stripe-create").length,0);
});
test("same quote reuses Checkout; a changed quote expires the old session; delayed payments are not replaced", async () => {
  reset();await checkout({projectId,guestCount:53});mock.calls=[];
  assert.equal((await checkout({projectId,guestCount:53})).status,200);assert.equal(calls("stripe-create").length,0);
  assert.equal((await checkout({projectId,guestCount:54})).status,200);assert.equal(calls("expire").length,1);
  reset();await checkout({projectId,guestCount:40});mock.calls=[];mock.sessions.cs_created.status="complete";
  assert.equal((await checkout({projectId,guestCount:54})).status,409);assert.equal(calls("stripe-create").length,0);
});
test("new webhook validates signature, Stripe settlement, persisted receipt, all metadata and amount", async () => {
  reset(true);await checkout({projectId,guestCount:53});mock.calls=[];
  const session={...mock.sessions.cs_created,payment_status:"paid"};
  assert.equal((await webhook("checkout.session.completed",session,"bad")).status,400);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",{...session,payment_status:"unpaid"})).status,200);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",{...session,amount_total:1})).status,409);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",{...session,metadata:{...session.metadata,guest_capacity:"999"}})).status,409);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",session)).status,200);
  assert.equal(calls("rpc")[0].name,"finalize_guest_checkout");assert.equal(calls("rpc")[0].params.p_amount_cents,4340);
  assert.equal((await webhook("checkout.session.async_payment_succeeded",session)).status,200);
  assert.equal((await webhook("checkout.session.async_payment_failed",session)).status,200);
  assert.equal(calls("rpc").at(-1).name,"fail_guest_checkout");
});
test("guest full refund routes to atomic refund RPC; partial refunds do not revoke publication", async () => {
  reset(true);await checkout({projectId,guestCount:53});mock.calls=[];
  assert.equal((await webhook("charge.refunded",{refunded:false,payment_intent:"pi_created",currency:"eur",amount_refunded:100})).status,200);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("charge.refunded",{refunded:true,payment_intent:"pi_created",currency:"eur",amount_refunded:4340})).status,200);
  assert.equal(calls("rpc")[0].name,"refund_guest_checkout");
});
test("legacy 24.90 and 34.80 payments/refunds retain their existing RPC path", async () => {
  for (const includes of [false,true]) {
    reset();const amount=2490+(includes?990:0);
    const session={id:"cs_legacy",currency:"eur",amount_total:amount,payment_status:"paid",payment_intent:"pi_legacy",metadata:{purchase_type:"publication",project_id:projectId,owner_id:ownerId,includes_form:String(includes)}};
    mock.publication={...session,project_id:projectId,owner_id:ownerId,stripe_checkout_session_id:session.id,amount_cents:amount,includes_rsvp:includes};mock.sessions[session.id]=session;
    assert.equal((await webhook("checkout.session.completed",session)).status,200);assert.equal(calls("rpc").at(-1).name,"finalize_project_payment");
    assert.equal((await webhook("charge.refunded",{refunded:true,payment_intent:"pi_legacy"})).status,200);assert.equal(calls("rpc").at(-1).name,"refund_project_payment");
  }
});
test("separate form and custom request flows keep their existing prices and RPCs", async () => {
  for (const [kind,amount,finalize] of [["rsvp_addon",990,"finalize_rsvp_addon_payment"],["custom_invitation",5000,"finalize_custom_invitation_payment"]]) {
    reset();const session={id:"cs_commerce",currency:"eur",amount_total:amount,payment_status:"paid",payment_intent:"pi_commerce",metadata:{purchase_type:kind,project_id:projectId,entity_id:projectId,owner_id:ownerId}};
    assert.equal((await webhook("checkout.session.completed",session)).status,200);assert.equal(calls("rpc").at(-1).name,finalize);
  }
});
test.after(() => {hooks.deregister();delete globalThis.__pricingEdgeMock;delete globalThis.Deno;});
