import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePromoSession,reconcilePromoReservations,promoFailureMessage} from '../supabase/functions/_shared/promoReservations.ts';
function fixture(status='open',payment='unpaid') {
 const calls=[];let session={id:'cs_synthetic',status,payment_status:payment,payment_intent:'pi_synthetic'};
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
 const stripe={checkout:{sessions:{retrieve:async()=>session,expire:async()=>{calls.push({name:'stripe-expire'});return session={...session,status:'expired'};}}},
  paymentIntents:{retrieve:async()=>({status:'processing'}),cancel:async()=>{calls.push({name:'stripe-cancel'});return {status:'canceled'};}}};
 return {admin,stripe,calls};
}
test('cancel URL / old age alone cannot release open or deferred payment; paid late notification remains consumed',async()=>{
 for(const [status,payment] of [['open','unpaid'],['complete','unpaid'],['complete','paid']]) {
  const f=fixture(status,payment);assert.equal(await reconcilePromoSession(f.admin,f.stripe,'receipt','cs_synthetic'),false);assert.deepEqual(f.calls,[]);
 }
 const f=fixture('complete');assert.equal(await reconcilePromoSession(f.admin,f.stripe,'receipt','cs_synthetic','2000-01-01',true),false);assert.deepEqual(f.calls,[]);
});
test('expired checkout uses provider expiration, SQL identity and terminal release; failed payment cancels only retryable intent',async()=>{
 const f=fixture();assert.equal(await reconcilePromoSession(f.admin,f.stripe,'receipt','cs_synthetic','2000-01-01'),true);
 assert.deepEqual(f.calls.map(c=>c.name),['stripe-expire','release_promo_reservation']);assert.equal(f.calls[1].args.p_reason,'stripe_expired');
 const g=fixture('complete');g.stripe.paymentIntents.retrieve=async()=>({status:'requires_payment_method'});
 assert.equal(await reconcilePromoSession(g.admin,g.stripe,'receipt','cs_synthetic',undefined,true),true);
 assert.deepEqual(g.calls.map(c=>c.name),['stripe-cancel','release_promo_reservation']);assert.equal(g.calls[1].args.p_reason,'stripe_payment_canceled');
});
test('provider error or uncertain Stripe creation outcome never releases capacity',async()=>{
 const f=fixture('expired');f.stripe.checkout.sessions.retrieve=async()=>{throw new Error('network');};
 await assert.rejects(()=>reconcilePromoSession(f.admin,f.stripe,'receipt','cs_synthetic'),/network/);assert.deepEqual(f.calls,[]);
 const rpc=[];const admin={rpc:async(name)=>rpc.push(name),from:table=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'unknown',created_at:new Date().toISOString()},error:null}),then(resolve){return Promise.resolve({data:[{receipt_id:'unknown',stripe_checkout_session_id:null}],error:null}).then(resolve);}})};
 await reconcilePromoReservations(admin,()=>({checkout:{sessions:{list:async()=>({data:[],has_more:false})}}}),'promo');assert.deepEqual(rpc,[]);
});
test('safe availability messages reveal no identity',()=>{
 assert.equal(promoFailureMessage('PROMO_USED'),"Ce code promotionnel a déjà été utilisé et n'est plus disponible.");
 assert.equal(promoFailureMessage('PROMO_RESERVED'),'Ce code est temporairement indisponible. Réessayez ultérieurement.');
 assert.equal(promoFailureMessage('other'),null);
});
