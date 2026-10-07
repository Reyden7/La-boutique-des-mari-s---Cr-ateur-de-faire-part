import test from "node:test";
import assert from "node:assert/strict";
import { calculatePromoDiscount, isValidDiscountValue, normalizePromoCode } from "../supabase/functions/_shared/promo.ts";
test("promo normalization and percentage bounds", () => {
  assert.equal(normalizePromoCode(" wp21 "),"WP21");
  for(const rate of [1,10,15,33.33,90]) assert.equal(isValidDiscountValue(rate),true);
  for(const rate of [0,91,-1,NaN,Infinity,"10",null,1.111]) assert.equal(isValidDiscountValue(rate),false);
});
test("promo integer rounding and requested examples", () => {
  for(const [subtotal,discount,final] of [[2450,245,2205],[3440,344,3096],[4340,434,3906]]) assert.deepEqual(calculatePromoDiscount(subtotal,10),{subtotalAmount:subtotal,discountAmount:discount,finalAmount:final});
  assert.equal(calculatePromoDiscount(2450,15).discountAmount,368);
  assert.equal(calculatePromoDiscount(2450,33.33).discountAmount,817);
});
