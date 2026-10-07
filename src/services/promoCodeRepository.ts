import { supabase, requireSupabaseSession } from "../lib/supabase";
import { isValidDiscountValue, normalizePromoCode, type AppliedPromo } from "../config/promo";

export interface PromoCodeRecord {
  id: string; code: string; discount_type: "percentage"; discount_value: number;
  is_active: boolean; created_at: string; updated_at: string;
}
async function client() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  await requireSupabaseSession();
  return supabase;
}
export async function validatePromoCode(value: string): Promise<AppliedPromo | null> {
  const { data, error } = await (await client()).functions.invoke("validate-promo-code", { body: { promoCode: normalizePromoCode(value) } });
  if (error) throw new Error("Validation indisponible. Réessayez.");
  if (!data?.valid) return null;
  if (data.discountType !== "percentage" || !isValidDiscountValue(data.discountValue)) throw new Error("Réponse de validation invalide.");
  return { code: data.code, discountType: "percentage", discountValue: data.discountValue };
}
export async function listPromoCodes(): Promise<PromoCodeRecord[]> {
  const { data, error } = await (await client()).from("promo_codes").select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function savePromoCode(id: string | null, code: string, rate: number): Promise<PromoCodeRecord> {
  const normalized = normalizePromoCode(code);
  if (!normalized || normalized.length > 64) throw new Error("Indiquez un code de 1 à 64 caractères.");
  if (!isValidDiscountValue(rate)) throw new Error("La réduction doit être comprise entre 1 et 90 %, avec deux décimales maximum.");
  const api = await client();
  const values = { code: normalized, discount_value: rate };
  const query = id ? api.from("promo_codes").update(values).eq("id", id).eq("is_active", true) : api.from("promo_codes").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.code === "23505" ? "Ce code promo existe déjà." : "Le code n’a pas pu être enregistré.");
  return data;
}
export async function deactivatePromoCode(id: string) {
  const { error } = await (await client()).from("promo_codes").update({ is_active: false }).eq("id", id).select("id").single();
  if (error) throw new Error("Le code n’a pas pu être désactivé.");
}
