/** Shared normalization and cent-based arithmetic; never grants a discount alone. */
export const normalizePromoCode = (value: unknown): string => typeof value === "string" ? value.trim().toUpperCase() : "";
export function isValidDiscountValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 90
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}
export function calculatePromoDiscount(subtotal: number, percentage: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || !isValidDiscountValue(percentage)) throw new Error("Invalid promo quote");
  const discountAmount = Math.round(subtotal * Math.round(percentage * 100) / 10000);
  return { subtotalAmount: subtotal, discountAmount, finalAmount: subtotal - discountAmount };
}
