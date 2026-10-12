import test from "node:test";
import assert from "node:assert/strict";
import { PRICING, calculateGuestPricing, calculateTotalPricing, calculateGuestUpgrade, calculateInvitationPrice, calculateGuestUpgradePrice } from "../supabase/functions/_shared/pricing.ts";
import { guestReceiptAmount, guestCheckoutMetadata, matchesGuestCheckout } from "../supabase/functions/_shared/guestPayment.ts";

for (const [guests, price, capacity] of [[1,2450,40],[40,2450,40],[41,2550,41],[42,2650,42],[45,2950,45],[47,3150,47],[48,3250,48],[50,3450,50],[53,3750,53],[54,3850,54],[55,3950,55],[60,4450,60],[80,6450,80],[100,8450,100]]) {
  test(`${guests} guests: ${price} cents, capacity ${capacity}, optional form +990`, () => {
    const quote = calculateGuestPricing(guests);
    assert.equal(quote.invitationPriceCents, price);
    assert.equal(quote.guestCapacity, capacity);
    assert.equal(quote.extraGuests,Math.max(0,guests-40));
    assert.equal(calculateInvitationPrice(guests),price);
    assert.equal("extraBlocks" in quote,false);
    assert.equal(calculateTotalPricing(guests, false).totalPriceCents, price);
    assert.equal(calculateTotalPricing(guests, true).totalPriceCents, price + 990);
  });
}
for (const [current, requested, price, capacity] of [[40,41,100,41],[40,47,700,47],[40,54,1400,54],[47,54,700,54],[54,60,600,60],[54,45,0,54],[54,53,0,54],[68,50,0,68],[53,54,100,54]]) {
  test(`upgrade ${current} → ${requested}: only ${price} cents, retained capacity ${capacity}`, () => {
    const quote = calculateGuestUpgrade(current, requested);
    assert.equal(quote.upgradePriceCents, price);
    assert.equal(quote.guestCapacity, capacity);
    assert.equal(calculateGuestUpgradePrice(current,requested),price);
  });
}
test("strict integer validation, operational upper bound and no free base charge", () => {
  for (const value of [0,-1,1.5,NaN,Infinity,"40",null,undefined,100001]) assert.throws(() => calculateGuestPricing(value));
  assert.equal(calculateGuestPricing(PRICING.maxGuestCount).guestCapacity, 100000);
  for (const value of [0,39,40.5,100001,NaN]) assert.throws(() => calculateGuestUpgrade(value, 54));
});

export const initialReceipt = {
  id: "receipt", project_id: "project", owner_id: "owner", purchase_type: "initial_publication",
  pricing_version: "guest-v2", guest_count: 53, guest_capacity: 53, extra_guests: 13,
  previous_guest_capacity: 0, additional_guests: 13, has_form: true, amount_cents: 4740,
  currency: "eur", stripe_checkout_session_id: "cs_initial", status: "pending", created_at: new Date().toISOString(),
};
test("receipt and every metadata field are bound to the Stripe amount/session", () => {
  const session = { id: "cs_initial", amount_total: 4740, currency: "eur", metadata: guestCheckoutMetadata(initialReceipt) };
  assert.equal(matchesGuestCheckout(session, initialReceipt), true);
  for (const key of Object.keys(session.metadata)) {
    assert.equal(matchesGuestCheckout({ ...session, metadata: { ...session.metadata, [key]: "tampered" } }, initialReceipt), false, key);
  }
  for (const patch of [{id:"other"},{amount_total:1},{currency:"usd"},{metadata:null}]) assert.equal(matchesGuestCheckout({...session,...patch}, initialReceipt), false);
  assert.throws(() => guestReceiptAmount({...initialReceipt,guest_capacity:47}));
  assert.throws(() => guestReceiptAmount({...initialReceipt,previous_guest_capacity:1}));
  const upgrade = {...initialReceipt,purchase_type:"guest_capacity_upgrade",has_form:false,previous_guest_capacity:47,additional_guests:6,amount_cents:600};
  assert.equal(guestReceiptAmount(upgrade),600);
  assert.throws(() => guestReceiptAmount({...upgrade,has_form:true}));
});

test("historical guest-v1 receipts keep their exact metadata, prices and capacity", () => {
  const legacy={...initialReceipt,pricing_version:"guest-v1",guest_capacity:54,extra_blocks:2,previous_extra_blocks:0,additional_blocks:2,
    extra_guests:null,previous_guest_capacity:null,additional_guests:null,amount_cents:4340};
  assert.equal(guestReceiptAmount(legacy),4340);
  const metadata=guestCheckoutMetadata(legacy);
  assert.equal(metadata.pricing_version,"guest-v1");assert.equal(metadata.extra_blocks,"2");assert.equal(metadata.guest_capacity,"54");
  assert.equal("extra_guests" in metadata,false);
  assert.equal(matchesGuestCheckout({id:legacy.stripe_checkout_session_id,amount_total:4340,currency:"eur",metadata},legacy),true);
  const upgrade={...legacy,purchase_type:"guest_capacity_upgrade",has_form:false,previous_extra_blocks:1,additional_blocks:1,amount_cents:450};
  assert.equal(guestReceiptAmount(upgrade),450);
});
