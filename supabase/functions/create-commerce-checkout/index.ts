import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type PurchaseKind = "custom_invitation" | "rsvp_addon";
const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};
const integrationIdentifier = () => `lbm-commerce-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (value) => String.fromCharCode(97 + value % 26)).join("")}`;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, true);
  try {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, 401, true);
    const admin = createClient<any>(requireEnvironment("SUPABASE_URL"), requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: "Invalid authentication" }, 401, true);
    const body = await request.json().catch(() => ({})) as { kind?: PurchaseKind; entityId?: string };
    if (!body.entityId || !/^[0-9a-f-]{36}$/i.test(body.entityId) || !["custom_invitation", "rsvp_addon"].includes(body.kind ?? "")) return jsonResponse({ error: "Invalid purchase" }, 400, true);
    const ownerId = authData.user.id;
    const siteUrl = requireEnvironment("SITE_URL").replace(/\/$/, "");
    const stripe = new Stripe(requireEnvironment("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
    let amount: number;
    let label: string;
    let projectId: string | undefined;
    let existingSessionId: string | null = null;
    let paymentRecordId = body.entityId;

    if (body.kind === "custom_invitation") {
      const { data, error } = await admin.from("custom_invitation_requests").select("id, owner_id, status, amount_cents, stripe_checkout_session_id, updated_at").eq("id", body.entityId).maybeSingle();
      if (error) throw error;
      if (!data || data.owner_id !== ownerId) return jsonResponse({ error: "Forbidden" }, 403, true);
      if (["paid", "in_progress", "completed"].includes(data.status)) return jsonResponse({ error: "Order already paid" }, 409, true);
      amount = 5000; label = "Faire-part numérique sur mesure"; existingSessionId = data.stripe_checkout_session_id;
      const update = await admin.from("custom_invitation_requests").update({ status: "pending_payment", stripe_checkout_session_id: null, updated_at: new Date().toISOString() }).eq("id", data.id).in("status", ["draft", "pending_payment"]);
      if (update.error) throw update.error;
    } else {
      projectId = body.entityId;
      amount = Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
      if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid RSVP_ADDON_PRICE_CENTS");
      label = "Option formulaire RSVP personnalisable";
      const { data: project, error } = await admin.from("projects").select("id, owner_id").eq("id", projectId).maybeSingle();
      if (error) throw error;
      if (!project || project.owner_id !== ownerId) return jsonResponse({ error: "Forbidden" }, 403, true);
      const { data: purchase, error: purchaseError } = await admin.from("rsvp_addon_purchases").select("id, status, stripe_checkout_session_id").eq("project_id", projectId).maybeSingle();
      if (purchaseError) throw purchaseError;
      if (purchase?.status === "paid") return jsonResponse({ error: "Option already paid" }, 409, true);
      if (purchase) {
        paymentRecordId = purchase.id; existingSessionId = purchase.stripe_checkout_session_id;
        const updated = await admin.from("rsvp_addon_purchases").update({ status: "pending", amount_cents: amount, stripe_checkout_session_id: null, updated_at: new Date().toISOString() }).eq("id", purchase.id);
        if (updated.error) throw updated.error;
      } else {
        const inserted = await admin.from("rsvp_addon_purchases").insert({ project_id: projectId, owner_id: ownerId, status: "pending", amount_cents: amount }).select("id").single();
        if (inserted.error) throw inserted.error;
        paymentRecordId = inserted.data.id;
      }
    }

    if (existingSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(existingSessionId);
      if (existing.status === "open" && existing.url) return jsonResponse({ url: existing.url }, 200, true);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      integration_identifier: integrationIdentifier(),
      client_reference_id: body.entityId,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amount, product_data: { name: label } } }],
      metadata: { purchase_kind: body.kind!, entity_id: body.entityId, owner_id: ownerId, ...(projectId ? { project_id: projectId } : {}) },
      payment_intent_data: { metadata: { purchase_kind: body.kind!, entity_id: body.entityId, owner_id: ownerId } },
      success_url: `${siteUrl}/payment/success?kind=${body.kind}&entityId=${body.entityId}${projectId ? `&projectId=${projectId}` : ""}`,
      cancel_url: `${siteUrl}/payment/cancel?kind=${body.kind}&entityId=${body.entityId}${projectId ? `&projectId=${projectId}` : ""}`,
    }, { idempotencyKey: `${body.kind}-${paymentRecordId}-${amount}-${Math.floor(Date.now() / 60000)}` });
    if (!session.url) throw new Error("Stripe Checkout Session has no URL");
    const table = body.kind === "custom_invitation" ? "custom_invitation_requests" : "rsvp_addon_purchases";
    const attached = await admin.from(table).update({ stripe_checkout_session_id: session.id }).eq("id", paymentRecordId);
    if (attached.error) throw attached.error;
    return jsonResponse({ url: session.url }, 200, true);
  } catch (error) {
    console.error("commerce_checkout_failed", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ error: "Checkout creation failed" }, 500, true);
  }
});
