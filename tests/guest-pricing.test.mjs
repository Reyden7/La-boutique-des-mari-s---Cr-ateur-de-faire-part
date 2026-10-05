import test from "node:test";
import assert from "node:assert/strict";
import { PRICING, calculateGuestPricing, calculateTotalPricing, calculateGuestUpgrade } from "../supabase/functions/_shared/pricing.ts";
import { guestReceiptAmount, guestCheckoutMetadata, matchesGuestCheckout } from "../supabase/functions/_shared/guestPayment.ts";

for (const [guests, price, capacity] of [[1,2450,40],[40,2450,40],[41,2900,47],[47,2900,47],[48,3350,54],[53,3350,54],[54,3350,54],[55,3800,61],[61,3800,61],[62,4250,68],[68,4250,68],[69,4700,75],[75,4700,75],[76,5150,82],[82,5150,82]]) {
  test(`${guests} guests: ${price} cents, capacity ${capacity}, optional form +990`, () => {
    const quote = calculateGuestPricing(guests);
    assert.equal(quote.invitationPriceCents, price);
    assert.equal(quote.guestCapacity, capacity);
    assert.equal(calculateTotalPricing(guests, false).totalPriceCents, price);
    assert.equal(calculateTotalPricing(guests, true).totalPriceCents, price + 990);
  });
}
for (const [current, requested, price, capacity] of [[40,47,450,47],[40,54,900,54],[47,54,450,54],[54,53,0,54],[68,50,0,68]]) {
  test(`upgrade ${current} → ${requested}: only ${price} cents, retained capacity ${capacity}`, () => {
    const quote = calculateGuestUpgrade(current, requested);
    assert.equal(quote.upgradePriceCents, price);
    assert.equal(quote.guestCapacity, capacity);
  });
}
test("strict integer validation, operational upper bound and no free base charge", () => {
  for (const value of [0,-1,1.5,NaN,Infinity,"40",null,undefined,100001]) assert.throws(() => calculateGuestPricing(value));
  assert.equal(calculateGuestPricing(PRICING.maxGuestCount).guestCapacity, 100000);
  for (const value of [0,39,41,NaN]) assert.throws(() => calculateGuestUpgrade(value, 54));
});

export const initialReceipt = {
  id: "receipt", project_id: "project", owner_id: "owner", purchase_type: "initial_publication",
  pricing_version: "guest-v1", guest_count: 53, guest_capacity: 54, extra_blocks: 2,
  previous_extra_blocks: 0, additional_blocks: 2, has_form: true, amount_cents: 4340,
  currency: "eur", stripe_checkout_session_id: "cs_initial", status: "pending", created_at: new Date().toISOString(),
};
test("receipt and every metadata field are bound to the Stripe amount/session", () => {
  const session = { id: "cs_initial", amount_total: 4340, currency: "eur", metadata: guestCheckoutMetadata(initialReceipt) };
  assert.equal(matchesGuestCheckout(session, initialReceipt), true);
  for (const key of Object.keys(session.metadata)) {
    assert.equal(matchesGuestCheckout({ ...session, metadata: { ...session.metadata, [key]: "tampered" } }, initialReceipt), false, key);
  }
  for (const patch of [{id:"other"},{amount_total:1},{currency:"usd"},{metadata:null}]) assert.equal(matchesGuestCheckout({...session,...patch}, initialReceipt), false);
  assert.throws(() => guestReceiptAmount({...initialReceipt,guest_capacity:47}));
  assert.throws(() => guestReceiptAmount({...initialReceipt,previous_extra_blocks:1}));
  const upgrade = {...initialReceipt,purchase_type:"guest_capacity_upgrade",has_form:false,previous_extra_blocks:1,additional_blocks:1,amount_cents:450};
  assert.equal(guestReceiptAmount(upgrade),450);
  assert.throws(() => guestReceiptAmount({...upgrade,has_form:true}));
});
