import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { normalizePromoCode } from "../_shared/promo.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, true);
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, true);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user || auth.user.is_anonymous) return jsonResponse({ error: "Invalid authentication" }, 401, true);
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ valid: false }, 400, true); }
    const code = normalizePromoCode(body?.promoCode);
    if (!code || code.length > 64) return jsonResponse({ valid: false }, 200, true);
    const { data, error } = await admin.from("promo_codes").select("code, discount_value").eq("code", code).eq("is_active", true).maybeSingle();
    if (error) throw error;
    return jsonResponse(data ? { valid: true, code: data.code, discountType: "percentage", discountValue: Number(data.discount_value) } : { valid: false }, 200, true);
  } catch {
    return jsonResponse({ error: "Validation indisponible. Réessayez." }, 500, true);
  }
});
