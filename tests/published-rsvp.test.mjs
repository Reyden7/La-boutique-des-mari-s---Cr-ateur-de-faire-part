import test from 'node:test';
import assert from 'node:assert/strict';
import {hasPublishedRsvpForm} from '../supabase/functions/_shared/publishedRsvp.ts';
import {calculatePromoDiscount} from '../supabase/functions/_shared/promo.ts';
import {PRICING,calculateTotalPricing,calculateGuestUpgrade} from '../supabase/functions/_shared/pricing.ts';
import {guestCheckoutMetadata,matchesGuestCheckout} from '../supabase/functions/_shared/guestPayment.ts';
import {versionPaymentMetadata,matchesVersionPayment} from '../supabase/functions/_shared/publicationVersions.ts';

test('published form detection uses the questionnaire, never purchase flag, invitation type or draft',()=>{
 for(const kind of ['wedding','birth','other']) for(const purchased of [false,true]) {
  assert.equal(hasPublishedRsvpForm({kind,rsvp:{enabled:true,purchased,fields:[{id:'name'}]}}),true);
  assert.equal(hasPublishedRsvpForm({kind,rsvp:{enabled:false,purchased,fields:[{id:'name'}]}}),false);
 }
 for(const snapshot of [null,{}, {rsvp:{enabled:true,fields:[]}}, {rsvp:{enabled:true,fields:'forged'}}, {rsvp:{enabled:'true',fields:[1]}}, {rsvp:{enabled:true,fields:Array(31).fill(1)}}]) assert.equal(hasPublishedRsvpForm(snapshot),false);
});
test('v3 pricing and zero promotional total remain integer cents, with no RSVP surcharge',()=>{
 assert.equal(PRICING.version,'guest-v3');
 for(const count of [1,40,41,50,100]) {
  assert.deepEqual(calculateTotalPricing(count,true).formPriceCents,0);
  assert.equal(calculateTotalPricing(count,true).totalPriceCents,calculateTotalPricing(count,false).totalPriceCents);
  assert.equal(calculatePromoDiscount(calculateTotalPricing(count,true).totalPriceCents,100).finalAmount,0);
 }
 for(const extra of [1,5,10,20]) assert.equal(calculateGuestUpgrade(40,40+extra).upgradePriceCents,extra*70);
});
test('historical v1/v2 Stripe metadata remains exactly bound to original unit and form amounts',()=>{
 const base={id:'receipt',project_id:'project',owner_id:'owner',purchase_type:'initial_publication',guest_count:40,guest_capacity:40,has_form:true,currency:'eur',amount_cents:3440,stripe_checkout_session_id:'cs_old',status:'pending',created_at:'date'};
 for(const version of ['guest-v1','guest-v2']) {
  const receipt={...base,pricing_version:version,...(version==='guest-v1'?{extra_blocks:0,previous_extra_blocks:0,additional_blocks:0}:{extra_guests:0,previous_guest_capacity:0,additional_guests:0})};
  const metadata=guestCheckoutMetadata(receipt);assert.equal(metadata.form_amount_cents,'990');
  if(version==='guest-v2') {assert.equal(metadata.extra_guest_unit_price,'100');assert.equal(metadata.invitation_price,'2450');}
  assert.equal(matchesGuestCheckout({id:'cs_old',currency:'eur',amount_total:3440,metadata},receipt),true);
 }
});
test('version webhooks accept immutable historical and v3 receipts without cross-pricing',()=>{
 const base={id:'version',project_id:'project',owner_id:'owner',version_id:'candidate',base_version_id:'active',guest_count:50,guest_capacity:50,terms_version:'paid-versions-v1',currency:'eur',stripe_checkout_session_id:'cs_version'};
 for(const [pricing_version,has_form,amount_cents] of [['guest-v2',true,4440],['guest-v2',false,3450],['guest-v3',false,3999]]) {
  const receipt={...base,pricing_version,has_form,amount_cents};const metadata=versionPaymentMetadata(receipt);
  assert.equal(matchesVersionPayment({id:'cs_version',currency:'eur',amount_total:amount_cents,metadata},receipt),true);
  assert.equal(matchesVersionPayment({id:'cs_version',currency:'eur',amount_total:amount_cents+1,metadata},receipt),false);
 }
 assert.throws(()=>versionPaymentMetadata({...base,pricing_version:'guest-v3',has_form:true,amount_cents:3999}));
});
