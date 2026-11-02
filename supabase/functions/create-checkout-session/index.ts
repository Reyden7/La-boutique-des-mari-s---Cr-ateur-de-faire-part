import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { paymentMaintenanceResponse } from "../_shared/paymentMaintenance.ts";
import { calculateGuestUpgrade, calculateTotalPricing, isValidGuestCount, PRICING, PRICING_CHANGED_MESSAGE, PAYMENT_MINIMUM_MESSAGE } from "../_shared/pricing.ts";
import { guestCheckoutMetadata, guestReceiptAmount, matchesGuestCheckout, type GuestPaymentReceipt } from "../_shared/guestPayment.ts";
import { calculatePromoDiscount, normalizePromoCode } from "../_shared/promo.ts";
import { PUBLICATION_TERMS, prepareVersionCheckout } from "../_shared/publicationVersions.ts";

const CURRENCY = "eur";
const PRODUCTION_ORIGIN = "https://www.laboutiquedesmaries.fr";
const integrationIdentifier = () => `lbm-publication-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (value) => String.fromCharCode(97 + value % 26)).join("")}`;
const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, true);
  const maintenance = paymentMaintenanceResponse();
  if (maintenance) return maintenance;
  try {
    const siteUrl = new URL(requireEnvironment("SITE_URL")).origin;
    if (siteUrl !== PRODUCTION_ORIGIN) throw new Error("Invalid SITE_URL");
    let stripeClient: Stripe | undefined;
    const stripe = () => {
      const key = requireEnvironment("STRIPE_SECRET_KEY");
      if (!/^(?:sk|rk)_(?:test|live)_/.test(key)) throw new Error("Invalid Stripe key format");
      return stripeClient ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
    };
    const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!accessToken) return jsonResponse({ error: "Authentication required" }, 401, true);
    const admin = createClient<any>(requireEnvironment("SUPABASE_URL"), requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !auth.user || auth.user.is_anonymous) return jsonResponse({ error: "Invalid authentication" }, 401, true);
    let body: { projectId?: unknown; guestCount?: unknown; promoCode?: unknown; pricingVersion?: unknown; publicationTerms?: unknown; expectedAmount?: unknown; purchaseKind?: unknown };
    try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400, true); }
    if (!body || typeof body.projectId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.projectId)) {
      return jsonResponse({ error: "A valid projectId is required" }, 400, true);
    }
    // A version handshake prevents a cached old UI showing a different tariff.
    // It never trusts any price/total supplied by the browser.
    if (body.pricingVersion !== PRICING.version) return jsonResponse({ error: PRICING_CHANGED_MESSAGE, code: "pricing_changed" }, 409, true);
    const projectId = body.projectId;
    const { data: project, error: projectError } = await admin.from("projects")
      .select("id, owner_id, status, payment_status, project_data, purchased_guest_capacity, publication_policy, active_version_id, has_version_draft")
      .eq("id", projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return jsonResponse({ error: "Project not found" }, 404, true);
    if (project.owner_id !== auth.user.id) return jsonResponse({ error: "Forbidden" }, 403, true);
    const ownerId = auth.user.id;
    if (body.purchaseKind === "paid_version") {
      if (project.publication_policy !== "paid_versions" || project.payment_status !== "paid" || !project.has_version_draft) return jsonResponse({error:"A new paid draft is required"},409,true);
      if (body.promoCode) return jsonResponse({error:"Les codes promos sont réservés à la première publication."},400,true);
      const result=await prepareVersionCheckout(admin,stripe(),project,body,siteUrl,integrationIdentifier());
      return jsonResponse(result.body,result.status,true);
    }
    if (body.purchaseKind != null && !["initial_publication","guest_capacity_upgrade"].includes(String(body.purchaseKind))) return jsonResponse({error:"Invalid purchase kind"},400,true);
    const completeFree = async (previousSession: string | null) => {
      const result = await admin.rpc("complete_free_initial_publication", {
        p_project_id: projectId, p_owner_id: ownerId, p_promo_code: normalizePromoCode(body.promoCode),
        p_previous_session_id: previousSession, p_terms: body.publicationTerms ?? null, p_expected_amount: body.expectedAmount,
      });
      if (result.error) {
        const unavailable = result.error.message?.includes("PROMO_UNAVAILABLE");
        return jsonResponse({error: unavailable ? "Ce code promo n’est plus disponible." : "La validation gratuite a échoué. Actualisez puis réessayez.",code:"free_publication_conflict"},unavailable?400:409,true);
      }
      if (result.data?.kind !== "free_publication" || result.data.completed !== true || result.data.projectId !== projectId || !result.data.transactionId) throw new Error("Invalid free publication confirmation");
      return jsonResponse({...result.data,pricingVersion:PRICING.version},200,true);
    };
    // A lost response may be retried after publication. The RPC checks the same
    // audit proof and current snapshot; it cannot reactivate an older version.
    if (project.payment_status === "paid" && body.purchaseKind === "initial_publication" && body.expectedAmount === 0 && normalizePromoCode(body.promoCode)) return await completeFree(null);
    if ((body.purchaseKind === "initial_publication" && project.payment_status === "paid")
      || (body.purchaseKind === "guest_capacity_upgrade" && project.payment_status !== "paid")) return jsonResponse({error:"Purchase kind changed"},409,true);
    const confirmedInitial = project.publication_policy === "paid_versions" && project.payment_status !== "paid";
    if (confirmedInitial && (body.publicationTerms !== PUBLICATION_TERMS || !Number.isSafeInteger(body.expectedAmount))) return jsonResponse({error:"Publication terms and verified price required"},400,true);
    const total = await admin.rpc("recipient_checkout_total", { p_project_id: projectId, p_owner_id: auth.user.id });
    if (total.error) throw total.error;
    const guestCount = total.data;
    if (!isValidGuestCount(guestCount)) return jsonResponse({ error: "Ajoutez au moins un destinataire à votre liste avant de publier votre faire-part." }, 400, true);
    if (project.payment_status === "refunded") return jsonResponse({ error: "Refunded projects require support" }, 409, true);
    const isUpgrade = project.payment_status === "paid";
    if (body.promoCode != null && typeof body.promoCode !== "string") return jsonResponse({ error: "Code invalide ou indisponible." }, 400, true);
    const promoCode = normalizePromoCode(body.promoCode);
    if (promoCode && isUpgrade) return jsonResponse({ error: "Les codes promos sont réservés à la première publication." }, 400, true);
    let promo: { id: string; code: string; discount_value: number } | null = null;
    if (promoCode) {
      if (promoCode.length > 64) return jsonResponse({ error: "Ce code promo n’est plus disponible." }, 400, true);
      const lookup = await admin.from("promo_codes").select("id, code, discount_value").eq("code", promoCode).eq("is_active", true).maybeSingle();
      if (lookup.error) throw lookup.error;
      promo = lookup.data;
      if (!promo) return jsonResponse({ error: "Ce code promo n’est plus disponible." }, 400, true);
    }
    if (isUpgrade) {
      if (project.status !== "published" || project.purchased_guest_capacity == null) {
        return jsonResponse({ error: "Historical or inactive licence: no automatic guest charge", code: "already_paid" }, 409, true);
      }
      const upgrade = calculateGuestUpgrade(project.purchased_guest_capacity, guestCount);
      if (!upgrade.additionalGuests) return jsonResponse({ error: "Capacity already covered", code: "capacity_covered" }, 409, true);
    } else if (project.status === "published") return jsonResponse({ error: "Project already published" }, 409, true);

    const { data: pending, error: pendingError } = await admin.from("guest_license_payments")
      .select("*").eq("project_id", projectId).eq("status", "pending").maybeSingle();
    if (pendingError) throw pendingError;
    const includesForm = false; // RSVP is included in every v3 licence.
    if (pending?.stripe_checkout_session_id) {
      const existing = await stripe().checkout.sessions.retrieve(pending.stripe_checkout_session_id);
      // A completed delayed-method session is still in progress even if unpaid.
      if (existing.status === "complete" || existing.payment_status === "paid") {
        return jsonResponse({ error: "Payment confirmation is in progress", code: "confirmation_pending" }, 409, true);
      }
      if (!confirmedInitial && pending.pricing_version === PRICING.version && existing.status === "open" && existing.url && pending.guest_count === guestCount
        && pending.has_form === includesForm && pending.purchase_type === (isUpgrade ? "guest_capacity_upgrade" : "initial_publication")
        && (!isUpgrade || pending.previous_guest_capacity === project.purchased_guest_capacity)
        && (pending.promo_code_id ?? null) === (promo?.id ?? null)
        && (!promo || (pending.promo_code === promo.code && Number(pending.discount_value) === Number(promo.discount_value)))
        && matchesGuestCheckout(existing, pending)) return jsonResponse({ url: existing.url, pricingVersion: PRICING.version }, 200, true);
      if (existing.status === "open") await stripe().checkout.sessions.expire(existing.id);
    }
    // Resolve/expire a legacy pending Checkout before switching prices.
    if (!isUpgrade) {
      const { data: legacy, error } = await admin.from("project_payments")
        .select("id, status, stripe_checkout_session_id").eq("project_id", projectId).maybeSingle();
      if (error) throw error;
      if (legacy?.status === "paid" || legacy?.status === "refunded") return jsonResponse({ error: "Publication already settled" }, 409, true);
      if (legacy?.status === "pending") {
        if (!legacy.stripe_checkout_session_id) return jsonResponse({ error: "Previous Checkout is being prepared" }, 409, true);
        const session = await stripe().checkout.sessions.retrieve(legacy.stripe_checkout_session_id);
        if (session.status === "complete" || session.payment_status === "paid") return jsonResponse({ error: "Previous payment is being confirmed" }, 409, true);
        if (session.status === "open") await stripe().checkout.sessions.expire(session.id);
        const failed = await admin.rpc("fail_project_payment", {
          p_project_id: projectId, p_owner_id: auth.user.id, p_checkout_session_id: session.id,
        });
        if (failed.error) throw failed.error;
      }
    }
    if (promo && calculatePromoDiscount(calculateTotalPricing(guestCount, includesForm).totalPriceCents, Number(promo.discount_value)).finalAmount === 0) {
      return await completeFree(pending?.stripe_checkout_session_id ?? null);
    }
    const reviewedTotal = isUpgrade
      ? calculateGuestUpgrade(project.purchased_guest_capacity!, guestCount).upgradePriceCents
      : (promo ? calculatePromoDiscount(calculateTotalPricing(guestCount, false).totalPriceCents, Number(promo.discount_value)).finalAmount : calculateTotalPricing(guestCount, false).totalPriceCents);
    if (reviewedTotal > 0 && reviewedTotal < PRICING.minimumCheckoutCents) return jsonResponse({error:PAYMENT_MINIMUM_MESSAGE,code:"amount_below_minimum"},409,true);
    const { data: receipt, error: reserveError } = await admin.rpc(confirmedInitial ? "reserve_confirmed_initial_publication" : "reserve_guest_checkout_v2", {
      p_project_id: projectId, p_owner_id: auth.user.id, p_guest_count: guestCount,
      p_previous_session_id: pending?.stripe_checkout_session_id ?? null,
      p_promo_code: promoCode || null,
      ...(confirmedInitial ? {p_terms:body.publicationTerms,p_expected_amount:body.expectedAmount} : {}),
    });
    if (reserveError) {
      if (reserveError.message?.includes("PROMO_UNAVAILABLE")) return jsonResponse({ error: "Ce code promo n’est plus disponible." }, 400, true);
      if (reserveError.message?.includes("PROMO_FIRST_PURCHASE_ONLY")) return jsonResponse({ error: "Les codes promos sont réservés à la première publication." }, 400, true);
      console.warn("guest_checkout_reservation_refused", { code: reserveError.code });
      return jsonResponse({ error: "Checkout changed or is already being prepared. Refresh and retry.", code: "checkout_conflict" }, 409, true);
    }
    const payment = receipt as GuestPaymentReceipt;
    try {
      if (!payment || payment.pricing_version !== PRICING.version || payment.amount_cents <= 0 || payment.amount_cents !== guestReceiptAmount(payment)) throw new Error("Server quote mismatch");
      if (payment.amount_cents < PRICING.minimumCheckoutCents) {
        await admin.rpc("fail_guest_checkout", { p_receipt_id: payment.id, p_session_id: null });
        return jsonResponse({error:PAYMENT_MINIMUM_MESSAGE,code:"amount_below_minimum"},409,true);
      }
      const metadata = guestCheckoutMetadata(payment);
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
      const addItem = (name: string, unitAmount: number, quantity = 1) => lineItems.push({
        quantity, price_data: { currency: CURRENCY, unit_amount: unitAmount, product_data: { name } },
      });
      if (payment.promo_code_id) {
        // One net line avoids per-line rounding differences and extra Stripe coupon resources.
        addItem(`Faire-part — capacité ${payment.guest_capacity} invités${payment.has_form ? " + Formulaire invité" : ""} — ${payment.promo_code} (-${payment.discount_value} %)`, payment.amount_cents);
      } else {
        if (payment.purchase_type === "initial_publication") addItem("Faire-part — licence pour un événement, jusqu’à 40 invités", PRICING.basePriceCents);
        if (payment.additional_guests) addItem("Invité supplémentaire", PRICING.extraGuestPriceCents, payment.additional_guests);
      }
      const session = await stripe().checkout.sessions.create({
        mode: "payment", managed_payments: { enabled: false }, integration_identifier: integrationIdentifier(),
        client_reference_id: projectId, line_items: lineItems, metadata, payment_intent_data: { metadata },
        success_url: `${siteUrl}/payment/success?projectId=${encodeURIComponent(projectId)}&kind=${payment.purchase_type}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/payment/cancel?projectId=${encodeURIComponent(projectId)}`,
      }, { idempotencyKey: `guest-license-${payment.id}` });
      if (!session.url) throw new Error("Stripe Checkout Session has no URL");
      const attached = await admin.from("guest_license_payments").update({ stripe_checkout_session_id: session.id })
        .eq("id", payment.id).eq("status", "pending").is("stripe_checkout_session_id", null).select("id").single();
      if (attached.error) {
        await stripe().checkout.sessions.expire(session.id);
        throw attached.error;
      }
      return jsonResponse({ url: session.url, pricingVersion: PRICING.version }, 200, true);
    } catch {
      await admin.rpc("fail_guest_checkout", { p_receipt_id: payment.id, p_session_id: null });
      console.error("guest_checkout_failed", { projectId, receiptId: payment.id });
      return jsonResponse({ error: "Stripe Checkout Session creation failed" }, 502, true);
    }
  } catch (error) {
    console.error("checkout_server_error", { result: error instanceof Error ? error.message : "unknown_error" });
    return jsonResponse({ error: "Internal server error" }, 500, true);
  }
});
