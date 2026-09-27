import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type PurchaseType = "custom_invitation" | "rsvp_addon";

const CUSTOM_INVITATION_PRICE_CENTS = 5000;
const CURRENCY = "eur";
const PRODUCTION_ORIGIN = "https://www.laboutiquedesmaries.fr";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

const requireSiteOrigin = () => {
  const configured = new URL(requireEnvironment("SITE_URL"));
  if (configured.origin !== PRODUCTION_ORIGIN) {
    throw new Error(`SITE_URL must be ${PRODUCTION_ORIGIN}`);
  }
  return configured.origin;
};

const requireStripeKey = () => {
  const key = requireEnvironment("STRIPE_SECRET_KEY");
  if (!/^(?:sk|rk)_(?:test|live)_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY has an unsupported format");
  }
  return key;
};

const rsvpPrice = () => {
  const amount = Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("RSVP_ADDON_PRICE_CENTS must be a positive integer");
  }
  return amount;
};

const integrationIdentifier = (purchaseType: PurchaseType) =>
  `lbm-${purchaseType}-${
    Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (value) => String.fromCharCode(97 + value % 26),
    ).join("")
  }`;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, true);
  }

  try {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      return jsonResponse({ error: "Authentication required" }, 401, true);
    }

    const admin = createClient<any>(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous) {
      return jsonResponse({ error: "Invalid authentication" }, 401, true);
    }

    const body = await request.json().catch(() => null) as {
      kind?: unknown;
      entityId?: unknown;
    } | null;
    if (
      !body ||
      (body.kind !== "custom_invitation" && body.kind !== "rsvp_addon") ||
      typeof body.entityId !== "string" ||
      !UUID_PATTERN.test(body.entityId)
    ) {
      return jsonResponse({ error: "Invalid purchase" }, 400, true);
    }

    const purchaseType: PurchaseType = body.kind;
    const entityId = body.entityId;
    const ownerId = authData.user.id;
    const siteUrl = requireSiteOrigin();
    const stripe = new Stripe(requireStripeKey(), {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let amount: number;
    let label: string;
    let projectId: string | undefined;
    let paymentRecordId: string;
    let attemptVersion: string;

    if (purchaseType === "custom_invitation") {
      const { data: customRequest, error } = await admin
        .from("custom_invitation_requests")
        .select("id, owner_id, status, amount_cents, stripe_checkout_session_id")
        .eq("id", entityId)
        .maybeSingle();
      if (error) throw error;
      if (!customRequest) {
        return jsonResponse({ error: "Request not found" }, 404, true);
      }
      if (customRequest.owner_id !== ownerId) {
        return jsonResponse({ error: "Forbidden" }, 403, true);
      }
      if (["paid", "in_progress", "completed"].includes(customRequest.status)) {
        return jsonResponse({ error: "Order already paid" }, 409, true);
      }
      if (customRequest.status === "cancelled") {
        return jsonResponse({ error: "Cancelled order cannot be paid" }, 409, true);
      }
      if (customRequest.amount_cents !== CUSTOM_INVITATION_PRICE_CENTS) {
        throw new Error("Custom invitation amount is inconsistent");
      }

      if (customRequest.stripe_checkout_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(
          customRequest.stripe_checkout_session_id,
        );
        if (existing.status === "open" && existing.url) {
          return jsonResponse({ url: existing.url }, 200, true);
        }
        if (existing.payment_status === "paid") {
          return jsonResponse({
            error: "Payment confirmation is in progress",
            code: "confirmation_pending",
          }, 409, true);
        }
      }

      const transition = await admin
        .from("custom_invitation_requests")
        .update({
          status: "pending_payment",
          stripe_checkout_session_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .eq("owner_id", ownerId)
        .in("status", ["draft", "pending_payment"])
        .select("id, updated_at")
        .single();
      if (transition.error) throw transition.error;

      amount = CUSTOM_INVITATION_PRICE_CENTS;
      label = "Faire-part numérique sur mesure";
      paymentRecordId = transition.data.id;
      attemptVersion = transition.data.updated_at;
    } else {
      projectId = entityId;
      amount = rsvpPrice();
      label = "Formulaire invité personnalisable";

      const { data: project, error } = await admin
        .from("projects")
        .select("id, owner_id, status, payment_status, project_data")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (!project) {
        return jsonResponse({ error: "Project not found" }, 404, true);
      }
      if (project.owner_id !== ownerId) {
        return jsonResponse({ error: "Forbidden" }, 403, true);
      }
      if (project.status !== "published" || project.payment_status !== "paid") {
        return jsonResponse({
          error: "Project must be paid and published before purchasing the form separately",
        }, 409, true);
      }
      if (project.project_data?.rsvp?.enabled !== true) {
        return jsonResponse({ error: "Form must be enabled before checkout" }, 409, true);
      }

      const { data: purchase, error: purchaseError } = await admin
        .from("rsvp_addon_purchases")
        .select("id, status, amount_cents, stripe_checkout_session_id")
        .eq("project_id", projectId)
        .maybeSingle();
      if (purchaseError) throw purchaseError;
      if (purchase?.status === "paid") {
        return jsonResponse({ error: "Option already paid" }, 409, true);
      }
      if (purchase?.status === "refunded") {
        return jsonResponse({
          error: "Refunded form purchases require support before a new payment",
        }, 409, true);
      }

      if (purchase?.stripe_checkout_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(
          purchase.stripe_checkout_session_id,
        );
        if (existing.status === "open" && existing.url) {
          return jsonResponse({ url: existing.url }, 200, true);
        }
        if (existing.payment_status === "paid") {
          return jsonResponse({
            error: "Payment confirmation is in progress",
            code: "confirmation_pending",
          }, 409, true);
        }
      }

      if (purchase) {
        const transition = await admin
          .from("rsvp_addon_purchases")
          .update({
            status: "pending",
            amount_cents: amount,
            stripe_checkout_session_id: null,
            stripe_payment_intent_id: null,
            paid_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id)
          .eq("owner_id", ownerId)
          .in("status", ["unpaid", "pending"])
          .select("id, updated_at")
          .single();
        if (transition.error) throw transition.error;
        paymentRecordId = transition.data.id;
        attemptVersion = transition.data.updated_at;
      } else {
        const inserted = await admin
          .from("rsvp_addon_purchases")
          .insert({
            project_id: projectId,
            owner_id: ownerId,
            status: "pending",
            amount_cents: amount,
            currency: CURRENCY,
          })
          .select("id, updated_at")
          .single();
        if (inserted.error) throw inserted.error;
        paymentRecordId = inserted.data.id;
        attemptVersion = inserted.data.updated_at;
      }
    }

    try {
      const metadata = {
        purchase_type: purchaseType,
        owner_id: ownerId,
        ...(projectId ? { project_id: projectId } : {
          custom_request_id: entityId,
        }),
      };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        managed_payments: { enabled: false },
        integration_identifier: integrationIdentifier(purchaseType),
        client_reference_id: entityId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: amount,
            product_data: { name: label },
          },
        }],
        metadata,
        payment_intent_data: { metadata },
        success_url: `${siteUrl}/payment/success?kind=${purchaseType}&entityId=${entityId}${
          projectId ? `&projectId=${projectId}` : ""
        }&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/payment/cancel?kind=${purchaseType}&entityId=${entityId}${
          projectId ? `&projectId=${projectId}` : ""
        }`,
      }, {
        idempotencyKey: `${purchaseType}-${paymentRecordId}-${amount}-${
          new Date(attemptVersion).getTime()
        }`,
      });
      if (!session.url) throw new Error("Stripe Checkout Session has no URL");

      const table = purchaseType === "custom_invitation"
        ? "custom_invitation_requests"
        : "rsvp_addon_purchases";
      const attached = await admin
        .from(table)
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", paymentRecordId)
        .is("stripe_checkout_session_id", null)
        .select("id")
        .maybeSingle();
      if (attached.error) throw attached.error;
      if (!attached.data) {
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
        return jsonResponse({
          error: "Another Checkout Session is already active",
          code: "checkout_conflict",
        }, 409, true);
      }

      console.info("commerce_checkout_created", {
        purchaseType,
        entityId,
        checkoutSessionId: session.id,
      });
      return jsonResponse({ url: session.url }, 200, true);
    } catch (stripeError) {
      const table = purchaseType === "custom_invitation"
        ? "custom_invitation_requests"
        : "rsvp_addon_purchases";
      const status = purchaseType === "custom_invitation" ? "draft" : "unpaid";
      await admin.from(table).update({ status }).eq("id", paymentRecordId)
        .is("stripe_checkout_session_id", null);
      console.error("commerce_checkout_creation_failed", {
        purchaseType,
        entityId,
        result: stripeError instanceof Error
          ? stripeError.message
          : "unknown_error",
      });
      const stripeMessage = stripeError instanceof Error ? stripeError.message : "";
      return jsonResponse({
        error: stripeMessage.includes("product tax code is missing")
          ? "Stripe tax configuration is incomplete for this product"
          : "Checkout creation failed",
        code: "stripe_checkout_failed",
      }, 502, true);
    }
  } catch (error) {
    console.error("commerce_checkout_server_error", {
      result: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ error: "Internal server error" }, 500, true);
  }
});
