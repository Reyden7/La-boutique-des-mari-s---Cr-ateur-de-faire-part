export { normalizePromoCode, isValidDiscountValue, calculatePromoDiscount } from "../../supabase/functions/_shared/promo";
export interface AppliedPromo { code: string; discountType: "percentage"; discountValue: number }
