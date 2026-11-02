import { supabase, requireSupabaseSession } from "../lib/supabase";
import { isValidDiscountValue, normalizePromoCode, type AppliedPromo } from "../config/promo";
import { PROMO_USED_MESSAGE, PROMO_RESERVED_MESSAGE } from "../config/promo";
import {validCommissionRate} from '../features/partners/partnerData';

export interface PromoCodeRecord {
  id: string; code: string; discount_type: "percentage"; discount_value: number;
  is_active: boolean; created_at: string; updated_at: string;
  max_uses?: number | null; confirmed_uses?: number; reserved_uses?: number;
  partner_id?:string|null;partner_commission_rate?:number;
  batch_id?:string|null;batch_prefix?:string|null;department?:string|null;batch_number?:number|null;
}
async function client() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  await requireSupabaseSession();
  return supabase;
}
export async function validatePromoCode(value: string): Promise<AppliedPromo | null> {
  const { data, error } = await (await client()).functions.invoke("validate-promo-code", { body: { promoCode: normalizePromoCode(value) } });
  if (error) throw new Error("Validation indisponible. Réessayez.");
  if (!data?.valid) {
    if([PROMO_USED_MESSAGE,PROMO_RESERVED_MESSAGE].includes(data?.error))throw new Error(data.error);
    return null;
  }
  if (data.discountType !== "percentage" || !isValidDiscountValue(data.discountValue)) throw new Error("Réponse de validation invalide.");
  return { code: data.code, discountType: "percentage", discountValue: data.discountValue };
}
export async function listPromoCodes(): Promise<PromoCodeRecord[]> {
  const { data, error } = await (await client()).rpc("admin_promo_codes");
  if (error) throw error;
  return data ?? [];
}
export async function savePromoCode(id: string | null, code: string, rate: number, maxUses: number | null = null,partner?:{partner_id:string|null;partner_commission_rate:number}): Promise<PromoCodeRecord> {
  const normalized = normalizePromoCode(code);
  if (!normalized || normalized.length > 64) throw new Error("Indiquez un code de 1 à 64 caractères.");
  if (!isValidDiscountValue(rate)) throw new Error("La réduction doit être comprise entre 1 et 100 %, avec deux décimales maximum.");
  const api = await client();
  if(maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1||maxUses>1000000))throw new Error("La limite doit être un entier entre 1 et 1 000 000.");
  if(partner&&!validCommissionRate(partner.partner_commission_rate))throw new Error('La commission doit être comprise entre 0 et 100 %, avec deux décimales maximum.');
  const values = { code: normalized, discount_value: rate, max_uses:maxUses,...(partner?{partner_id:partner.partner_id,partner_commission_rate:partner.partner_id?partner.partner_commission_rate:0}:{}) };
  const query = id ? api.from("promo_codes").update(values).eq("id", id).eq("is_active", true) : api.from("promo_codes").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.code === "23505" ? "Ce code promo existe déjà." : error.message?.includes("PROMO_LIMIT_BELOW_COMMITTED_USES") ? "La limite ne peut pas être inférieure aux utilisations confirmées et réservées." : "Le code n’a pas pu être enregistré.");
  return (await listPromoCodes()).find(row=>row.id===data.id) ?? data;
}
export async function deactivatePromoCode(id: string) {
  const { error } = await (await client()).from("promo_codes").update({ is_active: false }).eq("id", id).select("id").single();
  if (error) throw new Error("Le code n’a pas pu être désactivé.");
}
