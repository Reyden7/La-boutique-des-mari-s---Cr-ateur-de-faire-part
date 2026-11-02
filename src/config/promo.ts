export { normalizePromoCode, isValidDiscountValue, calculatePromoDiscount } from "../../supabase/functions/_shared/promo";
export interface AppliedPromo { code: string; discountType: "percentage"; discountValue: number }
export { PROMO_USED_MESSAGE, PROMO_RESERVED_MESSAGE } from "../../supabase/functions/_shared/promo";
