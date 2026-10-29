import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { calculateTotalPricing, calculateGuestUpgrade } from "../supabase/functions/_shared/pricing.ts";
import { guestCheckoutMetadata } from "../supabase/functions/_shared/guestPayment.ts";
import { calculatePromoDiscount } from "../supabase/functions/_shared/promo.ts";
import { versionPaymentMetadata } from "../supabase/functions/_shared/publicationVersions.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
let mock;
const reset = (form = false) => {
  mock = {
    user: { id: ownerId, is_anonymous: false }, listTotal: 40,
    project: {id:projectId,owner_id:ownerId,status:"draft",payment_status:"unpaid",project_data:{rsvp:{enabled:form}},purchased_guest_capacity:null,purchased_extra_blocks:null},
    receipts: [], versionReceipts: [], publication: null, form: null, sessions: {}, calls: [], rejectReservation: false,
    promos: [{id:"44444444-4444-4444-8444-444444444444",code:"WP21",discount_value:10,is_active:true}], invalidateOnReserve: false,
  };
};
reset();

function query(table) {
  const filters = [];
  let patch;
  const result = () => {
    let rows = table === "projects" ? [mock.project] : table === "guest_license_payments" ? mock.receipts : table === "project_payments" ? (mock.publication ? [mock.publication] : []) : table === "rsvp_addon_purchases" ? (mock.form ? [mock.form] : []) : [];
    if (table === "promo_codes") rows = mock.promos;
    if (table === "publication_version_payments") rows = mock.versionReceipts;
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
    if (name === "recipient_checkout_total") return {data:mock.listTotal,error:null};
    mock.calls.push({kind:"rpc",name,params});
    if (name === "complete_free_initial_publication") {
      if (mock.invalidateOnReserve) return {data:null,error:{message:'PROMO_UNAVAILABLE'}};
      if (mock.rejectReservation) return {data:null,error:{message:'FREE_REPLAY_CONFLICT'}};
      return {data:{kind:'free_publication',completed:true,transactionId:'55555555-5555-4555-8555-555555555555',projectId,publicationVersionId:'snapshot-free'},error:null};
    }
    if (name !== "reserve_guest_checkout_v2" && name !== "reserve_confirmed_initial_publication") return {data:null,error:null};
    if (mock.rejectReservation) return {data:null,error:{code:"P0001",message:"CHECKOUT_BUSY"}};
    if (mock.invalidateOnReserve) return {data:null,error:{code:"P0001",message:"PROMO_UNAVAILABLE"}};
    const upgrade = mock.project.payment_status === "paid";
    const form = !upgrade && mock.project.project_data.rsvp.enabled && mock.form?.status !== "paid";
    const quote = calculateTotalPricing(params.p_guest_count,form);
    const additional = upgrade ? calculateGuestUpgrade(mock.project.purchased_guest_capacity,params.p_guest_count) : null;
    const receipt = {
      id:"33333333-3333-4333-8333-333333333333",project_id:projectId,owner_id:ownerId,
      purchase_type:upgrade ? "guest_capacity_upgrade" : "initial_publication",pricing_version:"guest-v2",
      guest_count:quote.guestCount,guest_capacity:quote.guestCapacity,extra_guests:quote.extraGuests,
      previous_guest_capacity:upgrade ? mock.project.purchased_guest_capacity : 0,additional_guests:additional?.additionalGuests ?? quote.extraGuests,
      has_form:form,amount_cents:additional?.upgradePriceCents ?? quote.totalPriceCents,currency:"eur",
      stripe_checkout_session_id:null,stripe_payment_intent_id:null,status:"pending",created_at:new Date().toISOString(),
      subtotal_amount:additional?.upgradePriceCents ?? quote.totalPriceCents,discount_amount:0,
    };
    if (params.p_promo_code) {
      const promo = mock.promos.find((item) => item.code === params.p_promo_code && item.is_active);
      if (!promo) return {data:null,error:{code:"P0001",message:"PROMO_UNAVAILABLE"}};
      const amounts = calculatePromoDiscount(receipt.amount_cents,promo.discount_value);
      Object.assign(receipt,{promo_code_id:promo.id,promo_code:promo.code,discount_value:promo.discount_value,subtotal_amount:amounts.subtotalAmount,discount_amount:amounts.discountAmount,amount_cents:amounts.finalAmount});
    }
    if(name==='reserve_confirmed_initial_publication')receipt.publication_version_id='snapshot-first-verified';
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
current="validate";await import("../supabase/functions/validate-promo-code/index.ts");
current="commerce";await import("../supabase/functions/create-commerce-checkout/index.ts");
const checkout = (body,auth=true) => { const {listGuestCount,...payload}=body;if ("listGuestCount" in body) mock.listTotal=listGuestCount;return handlers.checkout(new Request("https://edge.invalid",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer token"}:{})},body:JSON.stringify({pricingVersion:"guest-v2",...payload})})); };
const webhook = (type,object,signature="valid-test-signature") => handlers.webhook(new Request("https://edge.invalid",{method:"POST",headers:{"Stripe-Signature":signature},body:JSON.stringify({type,data:{object}})}));
const calls = (kind) => mock.calls.filter((call)=>call.kind===kind);

test('server maintenance blocks both checkout handlers before all side effects; body cannot disable it; CORS remains available',async()=>{
 reset();env.PAYMENTS_MAINTENANCE='true';
 try {
  const response=await checkout({projectId,maintenance:false,PAYMENTS_MAINTENANCE:false});
  assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'120');assert.equal((await response.json()).code,'payments_maintenance');
  const commerce=await handlers.commerce(new Request('https://edge.invalid',{method:'POST',body:'{"kind":"rsvp_addon","maintenance":false}'}));
  assert.equal(commerce.status,503);assert.equal(calls('stripe-create').length,0);assert.equal(mock.calls.length,0);assert.equal(mock.project.payment_status,'unpaid');
  assert.equal((await handlers.checkout(new Request('https://edge.invalid',{method:'OPTIONS'}))).status,200);
 } finally {delete env.PAYMENTS_MAINTENANCE;}
});
test('maintenance is off by default and false; invalid nonempty server values fail closed',async()=>{
 for(const value of [undefined,'false']){reset();if(value===undefined)delete env.PAYMENTS_MAINTENANCE;else env.PAYMENTS_MAINTENANCE=value;assert.equal((await checkout({projectId})).status,200);assert.equal(calls('stripe-create').length,1);}
 env.PAYMENTS_MAINTENANCE='unexpected';assert.equal((await checkout({projectId})).status,503);delete env.PAYMENTS_MAINTENANCE;
});
test('maintenance never blocks signed Stripe confirmations, delayed success or retries',async()=>{
 reset();await checkout({projectId});const session={...mock.sessions.cs_created,payment_status:'paid'};mock.calls=[];env.PAYMENTS_MAINTENANCE='true';
 try {for(const event of ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.completed'])assert.equal((await webhook(event,session)).status,200);assert.equal(calls('rpc').filter(x=>x.name==='finalize_guest_checkout').length,3);}finally{delete env.PAYMENTS_MAINTENANCE;}
});

test('100% initial publication uses authenticated atomic RPC and never creates Stripe Checkout',async()=>{
 for (const form of [false,true]) {
  reset(form);mock.promos[0].discount_value=100;mock.project.publication_policy='paid_versions';
  const response=await checkout({projectId,promoCode:'wp21',purchaseKind:'initial_publication',publicationTerms:'paid-versions-v1',expectedAmount:0});
  assert.equal(response.status,200);assert.equal((await response.json()).kind,'free_publication');assert.equal(calls('stripe-create').length,0);
  const rpc=calls('rpc');assert.equal(rpc.length,1);assert.equal(rpc[0].name,'complete_free_initial_publication');assert.equal(rpc[0].params.p_owner_id,ownerId);
 }
 reset();mock.promos[0].discount_value=99.99;
 assert.equal((await checkout({projectId,promoCode:'WP21',purchaseKind:'initial_publication',expectedAmount:0})).status,200);assert.equal(calls('stripe-create').length,0);
});
test('free route denies unauthenticated, foreign, empty-list and invalidated requests without granting rights',async()=>{
 reset();mock.promos[0].discount_value=100;
 assert.equal((await checkout({projectId,promoCode:'WP21'},false)).status,401);
 mock.project.owner_id='someone-else';assert.equal((await checkout({projectId,promoCode:'WP21'})).status,403);mock.project.owner_id=ownerId;
 mock.listTotal=0;assert.equal((await checkout({projectId,promoCode:'WP21'})).status,400);mock.listTotal=40;
 mock.invalidateOnReserve=true;assert.equal((await checkout({projectId,promoCode:'WP21',expectedAmount:0})).status,400);
 assert.equal(calls('stripe-create').length,0);assert.equal(mock.project.payment_status,'unpaid');
});
test('free initial replay and concurrent clicks return only server confirmation; upgrades/republication keep promo restriction',async()=>{
 reset();mock.promos[0].discount_value=100;
 const body={projectId,promoCode:'WP21',purchaseKind:'initial_publication',expectedAmount:0};
 const responses=await Promise.all([checkout(body),checkout(body)]);assert.ok(responses.every(r=>r.status===200));
 mock.project.payment_status='paid';mock.project.status='published';mock.project.purchased_guest_capacity=40;
 assert.equal((await checkout(body)).status,200);
 assert.equal((await checkout({...body,purchaseKind:'guest_capacity_upgrade',listGuestCount:41})).status,400);
 mock.project.publication_policy='paid_versions';mock.project.has_version_draft=true;
 assert.equal((await checkout({...body,purchaseKind:'paid_version'})).status,400);
 mock.rejectReservation=true;assert.equal((await checkout(body)).status,409);assert.equal(calls('stripe-create').length,0);
});

test("real Checkout handler computes per-guest prices, ignores client amount and generates complete server quote metadata", async () => {
  for (const guests of [1,40,41,42,45,47,48,50,53,54,55,60,80,100]) for (const form of [false,true]) {
    reset(form);
    assert.equal((await checkout({projectId,listGuestCount:guests,amount:1,extraBlocks:0,hasForm:false})).status,200);
    const {params,options} = calls("stripe-create")[0];
    assert.equal(params.line_items.reduce((sum,item)=>sum+item.quantity*item.price_data.unit_amount,0),calculateTotalPricing(guests,form).totalPriceCents);
    assert.equal(params.metadata.has_form,String(form)); assert.equal(params.metadata.guest_count,String(guests));
    const extras = Math.max(0,guests-40);
    const subtotal=2450+extras*100+(form?990:0);
    assert.deepEqual(params.metadata,{
      receipt_id:"33333333-3333-4333-8333-333333333333",project_id:projectId,owner_id:ownerId,
      purchase_type:"initial_publication",pricing_version:"guest-v2",guest_count:String(guests),
      guest_capacity:String(Math.max(40,guests)),included_guests:"40",extra_guests:String(extras),extra_guest_unit_price:"100",
      previous_guest_capacity:"0",additional_guests:String(extras),invitation_price:String(2450+extras*100),form_price:String(form?990:0),
      subtotal:String(subtotal),subtotal_amount:String(subtotal),discount_amount:"0",final_amount:String(subtotal),
      has_form:String(form),includes_form:String(form),form_amount_cents:String(form?990:0),
    });
    assert.deepEqual(params.metadata,params.payment_intent_data.metadata);
    assert.equal(params.managed_payments.enabled,false); assert.equal(params.payment_method_types,undefined);
    assert.match(options.idempotencyKey,/^guest-license-/);
  }
});
test("invalid persisted guest total, absent/anonymous session or another owner's project never create Checkout", async () => {
  for (const count of [null,0,-1,1.1,"40",100001]) {reset();assert.equal((await checkout({projectId,listGuestCount:count})).status,400);assert.equal(calls("stripe-create").length,0);}
  reset();assert.equal((await checkout({projectId,listGuestCount:40},false)).status,401);
  reset();mock.user.is_anonymous=true;assert.equal((await checkout({projectId,listGuestCount:40})).status,401);
  reset();mock.project.owner_id="other";assert.equal((await checkout({projectId,listGuestCount:40})).status,403);
  assert.equal(calls("stripe-create").length,0);
});

test("a stale UI cannot create a differently-priced session", async () => {
  for(const pricingVersion of [undefined,"guest-v1","unknown"]) {
    reset();const response=await checkout({projectId,listGuestCount:55,pricingVersion});
    assert.equal(response.status,409);assert.equal((await response.json()).code,"pricing_changed");
    assert.equal(mock.calls.length,0);
  }
  reset();const response=await checkout({projectId,listGuestCount:55});
  assert.equal((await response.json()).pricingVersion,"guest-v2");
});
test("paid capacity upgrades charge only additional guests, never base or form", async () => {
  for (const [capacity,count,amount] of [[40,41,100],[40,47,700],[40,54,1400],[47,54,700],[54,60,600],[53,54,100],[54,45,0]]) {
    reset(true);Object.assign(mock.project,{payment_status:"paid",status:"published",purchased_guest_capacity:capacity,purchased_extra_blocks:(capacity-40)/7});
    const response=await checkout({projectId,listGuestCount:count});
    if (!amount) {assert.equal(response.status,409);assert.equal(calls("stripe-create").length,0);continue;}
    assert.equal(response.status,200);const {params}=calls("stripe-create")[0];assert.equal(params.line_items.length,1);
    assert.equal(params.line_items[0].quantity*params.line_items[0].price_data.unit_amount,amount);
    assert.equal(params.metadata.has_form,"false");assert.equal(params.metadata.purchase_type,"guest_capacity_upgrade");
    assert.equal(params.metadata.guest_count,String(count));
    assert.equal(params.metadata.guest_capacity,String(count));
    assert.equal(params.metadata.previous_guest_capacity,String(capacity));
    assert.equal(params.metadata.additional_guests,String(amount/100));
    assert.equal("extra_blocks" in params.metadata,false);
    assert.deepEqual(params.metadata,params.payment_intent_data.metadata);
  }
});
test("legacy paid orders cannot be accidentally recharged; reservations reject concurrent attempts", async () => {
  reset();Object.assign(mock.project,{payment_status:"paid",status:"published"});
  assert.equal((await checkout({projectId,listGuestCount:54})).status,409);assert.equal(calls("stripe-create").length,0);
  reset();mock.rejectReservation=true;assert.equal((await checkout({projectId,listGuestCount:54})).status,409);assert.equal(calls("stripe-create").length,0);
});
test("same quote reuses Checkout; a changed quote expires the old session; delayed payments are not replaced", async () => {
  reset();await checkout({projectId,listGuestCount:53});mock.calls=[];
  assert.equal((await checkout({projectId,listGuestCount:53})).status,200);assert.equal(calls("stripe-create").length,0);
  assert.equal((await checkout({projectId,listGuestCount:54})).status,200);assert.equal(calls("expire").length,1);
  reset();await checkout({projectId,listGuestCount:40});mock.calls=[];mock.sessions.cs_created.status="complete";
  assert.equal((await checkout({projectId,listGuestCount:54})).status,409);assert.equal(calls("stripe-create").length,0);
});
test("new webhook validates signature, Stripe settlement, persisted receipt, all metadata and amount", async () => {
  reset(true);await checkout({projectId,listGuestCount:53});mock.calls=[];
  const session={...mock.sessions.cs_created,payment_status:"paid"};
  assert.equal((await webhook("checkout.session.completed",session,"bad")).status,400);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",{...session,payment_status:"unpaid"})).status,200);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",{...session,amount_total:1})).status,409);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",{...session,metadata:{...session.metadata,guest_capacity:"999"}})).status,409);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("checkout.session.completed",session)).status,200);
  assert.equal(calls("rpc")[0].name,"finalize_guest_checkout");assert.equal(calls("rpc")[0].params.p_amount_cents,4740);
  assert.equal((await webhook("checkout.session.async_payment_succeeded",session)).status,200);
  assert.equal((await webhook("checkout.session.async_payment_failed",session)).status,200);
  assert.equal(calls("rpc").at(-1).name,"fail_guest_checkout");
});
test("guest full refund routes to atomic refund RPC; partial refunds do not revoke publication", async () => {
  reset(true);await checkout({projectId,listGuestCount:53});mock.calls=[];
  assert.equal((await webhook("charge.refunded",{refunded:false,payment_intent:"pi_created",currency:"eur",amount_refunded:100})).status,200);assert.equal(calls("rpc").length,0);
  assert.equal((await webhook("charge.refunded",{refunded:true,payment_intent:"pi_created",currency:"eur",amount_refunded:4740})).status,200);
  assert.equal(calls("rpc")[0].name,"refund_guest_checkout");
});

test("historical guest-v1 payments and refunds remain payable; an open old quote is not reused for a new purchase", async () => {
  reset(true);
  const old={id:"old-receipt",project_id:projectId,owner_id:ownerId,purchase_type:"initial_publication",pricing_version:"guest-v1",
    guest_count:53,guest_capacity:54,extra_blocks:2,previous_extra_blocks:0,additional_blocks:2,has_form:true,amount_cents:4340,
    currency:"eur",status:"pending",stripe_checkout_session_id:"cs_v1",stripe_payment_intent_id:null,created_at:new Date().toISOString()};
  const session={id:"cs_v1",currency:"eur",amount_total:4340,payment_status:"paid",payment_intent:"pi_v1",metadata:guestCheckoutMetadata(old)};
  mock.receipts=[old];mock.sessions.cs_v1=session;
  assert.equal((await webhook("checkout.session.completed",session)).status,200);
  assert.equal(calls("rpc").at(-1).params.p_amount_cents,4340);
  assert.equal((await webhook("charge.refunded",{refunded:true,payment_intent:"pi_v1",currency:"eur",amount_refunded:4340})).status,200);
  assert.equal(calls("rpc").at(-1).name,"refund_guest_checkout");
  mock.calls=[];mock.sessions.cs_v1={...session,status:"open",payment_status:"unpaid",url:"https://checkout.stripe.invalid/old"};
  assert.equal((await checkout({projectId,listGuestCount:53})).status,200);
  assert.equal(calls("expire")[0].id,"cs_v1");assert.equal(calls("stripe-create").length,1);
  assert.equal(mock.sessions.cs_created.amount_total,4740);
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
test("promo validation is authenticated, normalized and never lists codes or records use", async () => {
  reset();
  const validate = (body, auth=true) => handlers.validate(new Request("https://edge.invalid",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer token"}:{})},body:JSON.stringify(body)}));
  assert.equal((await validate({promoCode:"WP21"},false)).status,401);
  assert.deepEqual(await (await validate({promoCode:"  wp21 "})).json(),{valid:true,code:"WP21",discountType:"percentage",discountValue:10});
  assert.deepEqual(await (await validate({promoCode:"missing"})).json(),{valid:false});
  mock.promos[0].is_active=false;
  assert.deepEqual(await (await validate({promoCode:"WP21"})).json(),{valid:false});
  assert.equal(mock.calls.length,0);assert.equal(mock.receipts.length,0);
  mock.user.is_anonymous=true;assert.equal((await validate({promoCode:"WP21"})).status,401);
});
test("actual Checkout promo handlers ignore forged amounts and generate exact net charge and both metadata snapshots", async () => {
  for (const [count,form,subtotal,discount,final] of [[40,false,2450,245,2205],[40,true,3440,344,3096],[54,true,4840,484,4356],[55,true,4940,494,4446]]) {
    reset(form);
    assert.equal((await checkout({projectId,listGuestCount:count,promoCode:" wp21 ",discountPercentage:90,discountAmount:999999,finalAmount:1})).status,200);
    const params=calls("stripe-create")[0].params;
    assert.equal(mock.sessions.cs_created.amount_total,final);
    assert.deepEqual(params.metadata,params.payment_intent_data.metadata);
    for(const [key,value] of Object.entries({promo_code_id:mock.promos[0].id,promo_code:"WP21",discount_type:"percentage",discount_value:"10",subtotal_amount:String(subtotal),discount_amount:String(discount),final_amount:String(final)})) assert.equal(params.metadata[key],value);
    assert.equal(mock.calls.some((call)=>call.table==="promo_code_uses"),false);
    // Admin changes after the reservation must not affect settlement of the saved quote.
    Object.assign(mock.promos[0],{code:"RENAMED",discount_value:15,is_active:false});mock.calls=[];
    const paid={...mock.sessions.cs_created,payment_status:"paid"};
    assert.equal((await webhook("checkout.session.completed",paid)).status,200);
    assert.equal(calls("rpc").at(-1).params.p_amount_cents,final);
    assert.equal((await webhook("checkout.session.async_payment_succeeded",paid)).status,200);
    assert.equal((await webhook("checkout.session.completed",{...paid,metadata:{...paid.metadata,discount_value:"90"}})).status,409);
    assert.equal((await webhook("charge.refunded",{refunded:true,payment_intent:"pi_created",currency:"eur",amount_refunded:final})).status,200);
    assert.equal(calls("rpc").at(-1).name,"refund_guest_checkout");
  }
});
test("promo absent/removed retains standard tariffs; changed code/rate expires a pending quote; invalid code creates no Stripe call", async () => {
  reset();await checkout({projectId,listGuestCount:40,promoCode:"WP21"});mock.calls=[];
  assert.equal((await checkout({projectId,listGuestCount:40,promoCode:"wp21"})).status,200);assert.equal(calls("stripe-create").length,0);
  mock.promos[0].discount_value=15;
  assert.equal((await checkout({projectId,listGuestCount:40,promoCode:"WP21"})).status,200);assert.equal(calls("expire").length,1);assert.equal(mock.sessions.cs_created.amount_total,2082);
  mock.calls=[];assert.equal((await checkout({projectId,listGuestCount:40})).status,200);assert.equal(calls("expire").length,1);assert.equal(mock.sessions.cs_created.amount_total,2450);
  for (const promoCode of ["INVALID",{},"x".repeat(65)]) {reset();assert.equal((await checkout({projectId,listGuestCount:40,promoCode})).status,400);assert.equal(mock.calls.length,0);}
  reset();mock.invalidateOnReserve=true;const response=await checkout({projectId,listGuestCount:40,promoCode:"WP21"});assert.equal(response.status,400);assert.equal((await response.json()).error,"Ce code promo n’est plus disponible.");assert.equal(calls("stripe-create").length,0);
  reset();Object.assign(mock.project,{status:"published",payment_status:"paid",purchased_guest_capacity:40,purchased_extra_blocks:0});
  assert.equal((await checkout({projectId,listGuestCount:54,promoCode:"WP21"})).status,400);assert.equal(calls("stripe-create").length,0);
});

test("forged frontend guest count is ignored; the persisted household total determines the price",async()=>{reset();mock.listTotal=48;assert.equal((await checkout({projectId,guestCount:1,amount:1})).status,200);assert.equal(mock.sessions.cs_created.amount_total,3250);assert.equal(mock.sessions.cs_created.metadata.guest_count,"48");reset();mock.listTotal=0;assert.equal((await checkout({projectId,guestCount:1000})).status,400);assert.equal(calls("stripe-create").length,0);});

test("new initial publication cannot skip acknowledgement; legacy quote entry remains unchanged",async()=>{
 reset();mock.project.publication_policy="paid_versions";
 assert.equal((await checkout({projectId,listGuestCount:40})).status,400);assert.equal(calls("stripe-create").length,0);
 assert.equal((await checkout({projectId,listGuestCount:40,publicationTerms:"paid-versions-v1",expectedAmount:2450})).status,200);
 const reserved=calls("rpc").find(x=>x.name==="reserve_confirmed_initial_publication");assert.equal(reserved.params.p_terms,"paid-versions-v1");assert.equal(reserved.params.p_expected_amount,2450);
 assert.equal(mock.sessions.cs_created.metadata.publication_version_id,'snapshot-first-verified');
 const paid={...mock.sessions.cs_created,payment_status:'paid'};assert.equal((await webhook('checkout.session.completed',{...paid,metadata:{...paid.metadata,publication_version_id:'another-snapshot'}})).status,409);
 reset();mock.project.publication_policy="legacy";assert.equal((await checkout({projectId,listGuestCount:40})).status,200);assert.ok(calls("rpc").some(x=>x.name==="reserve_guest_checkout_v2"));
});

test("signed version webhooks dispatch to their own ledger; amount, snapshot and signature tampering refused",async()=>{
 reset();const receipt={id:"version-receipt",project_id:projectId,owner_id:ownerId,version_id:"snapshot-2",base_version_id:"snapshot-1",guest_count:4,guest_capacity:40,has_form:false,amount_cents:2450,currency:"eur",terms_version:"paid-versions-v1",status:"pending",stripe_checkout_session_id:"cs_version",stripe_payment_intent_id:null};mock.versionReceipts=[receipt];
 const session={id:"cs_version",metadata:versionPaymentMetadata(receipt),amount_total:2450,currency:"eur",payment_intent:"pi_version",payment_status:"unpaid"};
 assert.equal((await webhook("checkout.session.completed",session)).status,200);assert.equal(calls("rpc").length,0);
 session.payment_status="paid";mock.sessions[session.id]=session;
 assert.equal((await webhook("checkout.session.completed",session)).status,200);assert.equal(calls("rpc").at(-1).name,"finalize_version_publication");
 assert.equal((await webhook("checkout.session.async_payment_succeeded",session)).status,200);
 for(const changed of [{...session,amount_total:1},{...session,metadata:{...session.metadata,version_id:"forged"}},{...session,metadata:{...session.metadata,owner_id:"another-owner"}}])assert.equal((await webhook("checkout.session.completed",changed)).status,409);
 assert.equal((await webhook("checkout.session.completed",session,"invalid")).status,400);
 assert.equal((await webhook("checkout.session.async_payment_failed",session)).status,200);assert.equal(calls("rpc").at(-1).name,"fail_version_publication");
 assert.equal((await webhook("charge.refunded",{refunded:true,payment_intent:"pi_version",currency:"eur",amount_refunded:2450})).status,200);assert.equal(calls("rpc").at(-1).name,"refund_version_publication");
});

test.after(() => {hooks.deregister();delete globalThis.__pricingEdgeMock;delete globalThis.Deno;});
