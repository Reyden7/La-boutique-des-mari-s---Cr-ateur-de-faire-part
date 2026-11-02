import test from 'node:test';import assert from 'node:assert/strict';
import {prepareVersionCheckout,versionPaymentMetadata,matchesVersionPayment} from '../supabase/functions/_shared/publicationVersions.ts';
const project={id:'synthetic-project',owner_id:'synthetic-owner'};
function fixture({form=false,capacity=50,pending=null,reserveError=null,attachError=null,createError=false}={}) {
 const calls=[];const receipt={id:'receipt',project_id:project.id,owner_id:project.owner_id,version_id:'candidate',base_version_id:'published',pricing_version:'guest-v3',guest_count:45,guest_capacity:capacity,has_form:false,amount_cents:3299+(capacity-40)*70,terms_version:'paid-versions-v1',currency:'eur',status:'pending',stripe_checkout_session_id:null};
 const admin={from(table){const q={select:()=>q,eq:()=>q,is:()=>q,update:x=>{calls.push(['attach',x]);return q;},maybeSingle:async()=>({data:pending,error:null}),single:async()=>({error:attachError})};return q;},rpc:async(name,args)=>{calls.push([name,args]);return {data:receipt,error:name==='reserve_version_publication'?reserveError:null};}};
 const stripe={checkout:{sessions:{retrieve:async()=>pending.session,expire:async id=>{calls.push(['expire',id]);},create:async(params,options)=>{calls.push(['stripe',params,options]);if(createError)throw new Error('Synthetic network failure');return{id:'cs_test_synthetic',url:'https://checkout.invalid/synthetic'};}}}};
 return{admin,stripe,receipt,calls};
}
const body={publicationTerms:'paid-versions-v1',expectedAmount:3999};
const run=(f,b=body)=>prepareVersionCheckout(f.admin,f.stripe,project,b,'https://example.test','synthetic-abcdefgh');

test('version Checkout requires explicit terms and a reviewed amount, before any Stripe operation',async()=>{
 for(const b of [{},{publicationTerms:'other',expectedAmount:1},{publicationTerms:'paid-versions-v1',expectedAmount:1.2}]){const f=fixture();assert.equal((await run(f,b)).status,400);assert.deepEqual(f.calls,[]);}
});
test('version Checkout uses immutable server amount, stable receipt idempotency and separate metadata',async()=>{
 const f=fixture();const result=await run(f);assert.equal(result.status,200);const c=f.calls.find(x=>x[0]==='stripe');assert.equal(c[1].line_items[0].price_data.unit_amount,3999);assert.equal(c[1].metadata.purchase_type,'paid_version');assert.equal(c[2].idempotencyKey,'publication-version-receipt');assert.match(c[1].success_url,/kind=paid_version/);assert.equal(f.calls[0][1].p_expected_amount,3999);
 assert.equal(matchesVersionPayment({id:'session',amount_total:3999,currency:'eur',metadata:versionPaymentMetadata(f.receipt)},{...f.receipt,stripe_checkout_session_id:'session'}),true);
 assert.equal(matchesVersionPayment({id:'session',amount_total:1,currency:'eur',metadata:versionPaymentMetadata(f.receipt)},{...f.receipt,stripe_checkout_session_id:'session'}),false);
});
test('completed pending payment blocks a second session; open cancellation stays unpaid until webhook',async()=>{
 let f=fixture({pending:{stripe_checkout_session_id:'old',session:{id:'old',status:'complete',payment_status:'unpaid'}}});assert.equal((await run(f)).status,409);assert.equal(f.calls.length,0);
 f=fixture({pending:{stripe_checkout_session_id:'old',session:{id:'old',status:'open',payment_status:'unpaid'}}});assert.equal((await run(f)).status,200);assert.deepEqual(f.calls[0],['expire','old']);assert.equal(f.calls.some(x=>x[0].startsWith('finalize')),false);
});
test('price drift, invalid server quote and Stripe failure cannot activate a snapshot',async()=>{
 let f=fixture({reserveError:{message:'PUBLICATION_PRICE_CHANGED'}});assert.equal((await run(f)).status,409);assert.equal(f.calls.some(x=>x[0]==='stripe'),false);
 f=fixture({createError:true});assert.equal((await run(f)).status,502);assert.ok(f.calls.some(x=>x[0]==='fail_version_publication'));assert.equal(f.calls.some(x=>x[0].startsWith('finalize')),false);
 f=fixture();f.receipt.amount_cents=1;assert.equal((await run(f)).status,502);assert.equal(f.calls.some(x=>x[0]==='stripe'),false);
});
