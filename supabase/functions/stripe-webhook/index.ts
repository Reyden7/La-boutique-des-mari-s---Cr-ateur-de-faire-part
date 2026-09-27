import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { jsonResponse } from "../_shared/http.ts";

const PRICE_CENTS = 2490;
const CURRENCY = "eur";

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

const stripeId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id ?? null;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let stripe: Stripe;
  let admin: ReturnType<typeof createClient<any>>;
  let webhookSecret: string;
  try {
    const stripeSecretKey = requireEnvironment("STRIPE_SECRET_KEY");
    if (!stripeSecretKey.startsWith("sk_test_")) {
      return jsonResponse({
        error: "This deployment accepts Stripe test mode only",
      }, 503);
    }
    stripe = new Stripe(stripeSecretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    webhookSecret = requireEnvironment("STRIPE_WEBHOOK_SECRET");
    admin = createClient<any>(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  } catch (error) {
    console.error("webhook_configuration_error", {
      result: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ error: "Webhook configuration error" }, 500);
  }

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) {
    return jsonResponse({ error: "Missing Stripe-Signature" }, 400);
  }
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    console.warn("webhook_invalid_signature");
    return jsonResponse({ error: "Invalid webhook signature" }, 400);
  }

  console.info("stripe_event_received", { eventType: event.type });
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        console.info("checkout_not_paid_yet", {
          eventType: event.type,
          checkoutSessionId: session.id,
        });
        return jsonResponse({ received: true });
      }

      const purchaseKind = session.metadata?.purchase_kind;
      const entityId = session.metadata?.entity_id;
      const commerceOwnerId = session.metadata?.owner_id;
      const commercePaymentIntentId = stripeId(session.payment_intent);
      if (purchaseKind === "custom_invitation" || purchaseKind === "rsvp_addon") {
        if (!entityId || !commerceOwnerId || !commercePaymentIntentId || session.currency !== CURRENCY || !session.amount_total) return jsonResponse({ error: "Missing commerce metadata" }, 400);
        const expectedAmount = purchaseKind === "custom_invitation" ? 5000 : Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
        if (session.amount_total !== expectedAmount) return jsonResponse({ error: "Commerce amount mismatch" }, 400);
        const rpc = purchaseKind === "custom_invitation" ? "finalize_custom_invitation_payment" : "finalize_rsvp_addon_payment";
        const parameters = purchaseKind === "custom_invitation"
          ? { p_request_id: entityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: commercePaymentIntentId, p_amount_cents: expectedAmount }
          : { p_project_id: entityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: commercePaymentIntentId, p_amount_cents: expectedAmount };
        const finalized = await admin.rpc(rpc, parameters);
        if (finalized.error) throw finalized.error;
        console.info("commerce_payment_finalized", { purchaseKind, entityId, checkoutSessionId: session.id });
        return jsonResponse({ received: true });
      }

      const projectId = session.metadata?.project_id;
      const ownerId = session.metadata?.owner_id;
      const paymentIntentId = stripeId(session.payment_intent);
      if (!projectId || !ownerId || !paymentIntentId) {
        console.error("checkout_metadata_missing", {
          checkoutSessionId: session.id,
          paymentIntentId,
        });
        return jsonResponse({ error: "Missing Checkout metadata" }, 400);
      }
      if (
        session.amount_total !== PRICE_CENTS || session.currency !== CURRENCY
      ) {
        console.error("checkout_amount_mismatch", {
          projectId,
          checkoutSessionId: session.id,
          paymentIntentId,
        });
        return jsonResponse(
          { error: "Checkout amount or currency mismatch" },
          400,
        );
      }

      const [
        { data: payment, error: paymentError },
        { data: project, error: projectError },
      ] = await Promise.all([
        admin.from("project_payments").select(
          "project_id, owner_id, stripe_checkout_session_id, amount_cents, currency, status",
        ).eq("project_id", projectId).maybeSingle(),
        admin.from("projects").select("id, owner_id, payment_status, status")
          .eq("id", projectId).maybeSingle(),
      ]);
      if (paymentError) throw paymentError;
      if (projectError) throw projectError;
      if (
        !payment || !project ||
        payment.owner_id !== ownerId || project.owner_id !== ownerId ||
        payment.stripe_checkout_session_id !== session.id ||
        payment.amount_cents !== PRICE_CENTS || payment.currency !== CURRENCY
      ) {
        console.error("checkout_coherence_failed", {
          projectId,
          checkoutSessionId: session.id,
          paymentIntentId,
        });
        return jsonResponse({ error: "Payment coherence check failed" }, 409);
      }

      const { error: finalizeError } = await admin.rpc(
        "finalize_project_payment",
        {
          p_project_id: projectId,
          p_owner_id: ownerId,
          p_checkout_session_id: session.id,
          p_payment_intent_id: paymentIntentId,
        },
      );
      if (finalizeError) throw finalizeError;
      console.info("project_published", {
        projectId,
        checkoutSessionId: session.id,
        paymentIntentId,
      });
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const purchaseKind = session.metadata?.purchase_kind;
      const entityId = session.metadata?.entity_id;
      const commerceOwnerId = session.metadata?.owner_id;
      if (purchaseKind === "custom_invitation" && entityId && commerceOwnerId) {
        const failed = await admin.from("custom_invitation_requests").update({ status: "draft", stripe_checkout_session_id: null }).eq("id", entityId).eq("owner_id", commerceOwnerId).eq("stripe_checkout_session_id", session.id);
        if (failed.error) throw failed.error;
        return jsonResponse({ received: true });
      }
      if (purchaseKind === "rsvp_addon" && entityId && commerceOwnerId) {
        const failed = await admin.from("rsvp_addon_purchases").update({ status: "unpaid", stripe_checkout_session_id: null }).eq("project_id", entityId).eq("owner_id", commerceOwnerId).eq("stripe_checkout_session_id", session.id);
        if (failed.error) throw failed.error;
        return jsonResponse({ received: true });
      }
      const projectId = session.metadata?.project_id;
      const ownerId = session.metadata?.owner_id;
      if (!projectId || !ownerId) {
        return jsonResponse({ error: "Missing Checkout metadata" }, 400);
      }
      const { error } = await admin.rpc("fail_project_payment", {
        p_project_id: projectId,
        p_owner_id: ownerId,
        p_checkout_session_id: session.id,
      });
      if (error) throw error;
      console.info("project_payment_failed", {
        projectId,
        checkoutSessionId: session.id,
      });
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      if (!charge.refunded) return jsonResponse({ received: true });
      const paymentIntentId = stripeId(charge.payment_intent);
      if (!paymentIntentId) {
        return jsonResponse({ error: "Refund has no PaymentIntent" }, 400);
      }
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
      });
      const session = sessions.data[0];
      const purchaseKind = session?.metadata?.purchase_kind;
      const entityId = session?.metadata?.entity_id;
      const commerceOwnerId = session?.metadata?.owner_id;
      if (session && entityId && commerceOwnerId && (purchaseKind === "custom_invitation" || purchaseKind === "rsvp_addon")) {
        const rpc = purchaseKind === "custom_invitation" ? "refund_custom_invitation_payment" : "refund_rsvp_addon_payment";
        const parameters = purchaseKind === "custom_invitation"
          ? { p_request_id: entityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: paymentIntentId }
          : { p_project_id: entityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: paymentIntentId };
        const refunded = await admin.rpc(rpc, parameters);
        if (refunded.error) throw refunded.error;
        return jsonResponse({ received: true });
      }
      const projectId = session?.metadata?.project_id;
      const ownerId = session?.metadata?.owner_id;
      if (!session || !projectId || !ownerId) {
        return jsonResponse(
          { error: "Refund Checkout metadata is missing" },
          400,
        );
      }
      if (
        session.amount_total !== PRICE_CENTS || session.currency !== CURRENCY
      ) {
        return jsonResponse({
          error: "Refund Checkout amount or currency mismatch",
        }, 400);
      }
      const { error } = await admin.rpc("refund_project_payment", {
        p_project_id: projectId,
        p_owner_id: ownerId,
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntentId,
      });
      if (error) throw error;
      console.info("project_payment_refunded", {
        projectId,
        checkoutSessionId: session.id,
        paymentIntentId,
      });
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error("webhook_processing_failed", {
      eventType: event.type,
      result: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ error: "Webhook processing failed" }, 500);
  }
});
