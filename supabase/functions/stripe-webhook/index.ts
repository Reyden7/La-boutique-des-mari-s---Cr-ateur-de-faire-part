import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { jsonResponse } from "../_shared/http.ts";
import { matchesGuestCheckout } from "../_shared/guestPayment.ts";

// Only historical sessions use the previous fixed tariff.
const LEGACY_PRICE_CENTS = 2490;
const CURRENCY = "eur";
type PurchaseType = "publication" | "initial_publication" | "guest_capacity_upgrade" | "custom_invitation" | "rsvp_addon";

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

const stripeId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id ?? null;

const purchaseTypeFromSession = (session: Stripe.Checkout.Session): PurchaseType | null => {
  const explicit = session.metadata?.purchase_type;
  if (explicit === "publication" || explicit === "initial_publication" || explicit === "guest_capacity_upgrade" || explicit === "custom_invitation" || explicit === "rsvp_addon") {
    return explicit;
  }
  if (explicit) return null;

  // Transitional compatibility for Checkout Sessions created before the
  // explicit purchase_type metadata was deployed. Never infer from amount.
  const legacy = session.metadata?.purchase_kind;
  if (legacy === "custom_invitation" || legacy === "rsvp_addon") return legacy;
  if (session.metadata?.project_id && !session.metadata?.entity_id) return "publication";
  return null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let stripe: Stripe;
  let admin: ReturnType<typeof createClient<any>>;
  let webhookSecret: string;
  try {
    const stripeSecretKey = requireEnvironment("STRIPE_SECRET_KEY");
    if (!/^(?:sk|rk)_(?:test|live)_/.test(stripeSecretKey)) {
      throw new Error("STRIPE_SECRET_KEY has an unsupported format");
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
  const processGuestPayment = async (session: Stripe.Checkout.Session, refund = false) => {
    const receiptId = session.metadata?.receipt_id;
    const ownerId = session.metadata?.owner_id;
    const paymentIntentId = stripeId(session.payment_intent);
    if (!receiptId || !ownerId || !paymentIntentId) return jsonResponse({ error: "Missing guest payment metadata" }, 400);
    const { data: receipt, error } = await admin.from("guest_license_payments").select("*").eq("id", receiptId).maybeSingle();
    if (error) throw error;
    // Stripe can deliver the event before the session ID has been attached.
    // Return 500 so Stripe retries; never grant rights using metadata alone.
    if (!receipt || !receipt.stripe_checkout_session_id) throw new Error("Guest receipt attachment pending");
    if (!matchesGuestCheckout(session, receipt)
      || (receipt.stripe_payment_intent_id && receipt.stripe_payment_intent_id !== paymentIntentId)) {
      return jsonResponse({ error: "Guest payment coherence check failed" }, 409);
    }
    const result = await admin.rpc(refund ? "refund_guest_checkout" : "finalize_guest_checkout", {
      p_receipt_id: receiptId, p_owner_id: ownerId, p_session_id: session.id,
      p_payment_intent_id: paymentIntentId, p_amount_cents: session.amount_total,
    });
    if (result.error) throw result.error;
    return jsonResponse({ received: true });
  };
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

      const purchaseType = purchaseTypeFromSession(session);
      if (!purchaseType) {
        return jsonResponse({ error: "Unknown purchase type" }, 400);
      }
      if (purchaseType === "initial_publication" || purchaseType === "guest_capacity_upgrade") {
        return await processGuestPayment(session);
      }
      const commerceOwnerId = session.metadata?.owner_id;
      const commercePaymentIntentId = stripeId(session.payment_intent);
      if (purchaseType === "custom_invitation" || purchaseType === "rsvp_addon") {
        const entityId = purchaseType === "custom_invitation"
          ? session.metadata?.custom_request_id ?? session.metadata?.entity_id
          : session.metadata?.project_id ?? session.metadata?.entity_id;
        if (!entityId || !commerceOwnerId || !commercePaymentIntentId || session.currency !== CURRENCY || !session.amount_total) return jsonResponse({ error: "Missing commerce metadata" }, 400);
        const expectedAmount = purchaseType === "custom_invitation" ? 5000 : Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
        if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) throw new Error("Invalid configured commerce amount");
        if (session.amount_total !== expectedAmount) return jsonResponse({ error: "Commerce amount mismatch" }, 400);
        const rpc = purchaseType === "custom_invitation" ? "finalize_custom_invitation_payment" : "finalize_rsvp_addon_payment";
        const parameters = purchaseType === "custom_invitation"
          ? { p_request_id: entityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: commercePaymentIntentId, p_amount_cents: expectedAmount }
          : { p_project_id: entityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: commercePaymentIntentId, p_amount_cents: expectedAmount };
        const finalized = await admin.rpc(rpc, parameters);
        if (finalized.error) throw finalized.error;
        console.info("commerce_payment_finalized", { purchaseType, entityId, checkoutSessionId: session.id });
        return jsonResponse({ received: true });
      }

      const projectId = session.metadata?.project_id;
      const ownerId = session.metadata?.owner_id;
      const paymentIntentId = stripeId(session.payment_intent);
      const includesForm = session.metadata?.includes_form === "true";
      const formPriceCents = Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
      if (!Number.isSafeInteger(formPriceCents) || formPriceCents <= 0) {
        throw new Error("Invalid configured form amount");
      }
      const expectedPublicationAmount = LEGACY_PRICE_CENTS + (includesForm ? formPriceCents : 0);
      if (!projectId || !ownerId || !paymentIntentId) {
        console.error("checkout_metadata_missing", {
          checkoutSessionId: session.id,
          paymentIntentId,
        });
        return jsonResponse({ error: "Missing Checkout metadata" }, 400);
      }
      if (
        session.amount_total !== expectedPublicationAmount || session.currency !== CURRENCY
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
          "project_id, owner_id, stripe_checkout_session_id, amount_cents, currency, status, includes_rsvp",
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
        payment.amount_cents !== expectedPublicationAmount ||
        payment.includes_rsvp !== includesForm ||
        payment.currency !== CURRENCY
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
      const purchaseType = purchaseTypeFromSession(session);
      if (!purchaseType) return jsonResponse({ error: "Unknown purchase type" }, 400);
      if (purchaseType === "initial_publication" || purchaseType === "guest_capacity_upgrade") {
        const receiptId = session.metadata?.receipt_id;
        if (!receiptId) return jsonResponse({ error: "Missing guest receipt" }, 400);
        const failed = await admin.rpc("fail_guest_checkout", { p_receipt_id: receiptId, p_session_id: session.id });
        if (failed.error) throw failed.error;
        return jsonResponse({ received: true });
      }
      const commerceOwnerId = session.metadata?.owner_id;
      const commerceEntityId = purchaseType === "custom_invitation"
        ? session.metadata?.custom_request_id ?? session.metadata?.entity_id
        : session.metadata?.project_id ?? session.metadata?.entity_id;
      if (purchaseType === "custom_invitation" && commerceEntityId && commerceOwnerId) {
        const failed = await admin.from("custom_invitation_requests").update({ status: "draft", stripe_checkout_session_id: null }).eq("id", commerceEntityId).eq("owner_id", commerceOwnerId).eq("stripe_checkout_session_id", session.id);
        if (failed.error) throw failed.error;
        return jsonResponse({ received: true });
      }
      if (purchaseType === "rsvp_addon" && commerceEntityId && commerceOwnerId) {
        const failed = await admin.from("rsvp_addon_purchases").update({ status: "unpaid", stripe_checkout_session_id: null }).eq("project_id", commerceEntityId).eq("owner_id", commerceOwnerId).eq("stripe_checkout_session_id", session.id);
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
      const purchaseType = session ? purchaseTypeFromSession(session) : null;
      if (!session || !purchaseType) {
        return jsonResponse({ error: "Refund purchase type is missing" }, 400);
      }
      if (purchaseType === "initial_publication" || purchaseType === "guest_capacity_upgrade") {
        if (charge.currency !== CURRENCY || charge.amount_refunded !== session.amount_total) {
          return jsonResponse({ error: "Guest refund amount mismatch" }, 400);
        }
        return await processGuestPayment(session, true);
      }
      const commerceOwnerId = session?.metadata?.owner_id;
      const commerceEntityId = purchaseType === "custom_invitation"
        ? session.metadata?.custom_request_id ?? session.metadata?.entity_id
        : session.metadata?.project_id ?? session.metadata?.entity_id;
      if (commerceEntityId && commerceOwnerId && (purchaseType === "custom_invitation" || purchaseType === "rsvp_addon")) {
        const expectedAmount = purchaseType === "custom_invitation" ? 5000 : Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
        if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || session.amount_total !== expectedAmount || session.currency !== CURRENCY) {
          return jsonResponse({ error: "Refund commerce amount mismatch" }, 400);
        }
        const rpc = purchaseType === "custom_invitation" ? "refund_custom_invitation_payment" : "refund_rsvp_addon_payment";
        const parameters = purchaseType === "custom_invitation"
          ? { p_request_id: commerceEntityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: paymentIntentId }
          : { p_project_id: commerceEntityId, p_owner_id: commerceOwnerId, p_session_id: session.id, p_payment_intent_id: paymentIntentId };
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
      const includesForm = session.metadata?.includes_form === "true";
      const formPriceCents = Number(requireEnvironment("RSVP_ADDON_PRICE_CENTS"));
      if (!Number.isSafeInteger(formPriceCents) || formPriceCents <= 0) {
        throw new Error("Invalid configured form amount");
      }
      const expectedPublicationAmount = LEGACY_PRICE_CENTS + (includesForm ? formPriceCents : 0);
      if (
        session.amount_total !== expectedPublicationAmount || session.currency !== CURRENCY
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
