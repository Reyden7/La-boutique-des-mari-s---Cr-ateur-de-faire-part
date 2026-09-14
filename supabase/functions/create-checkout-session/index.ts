import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const PRICE_CENTS = 2490;
const CURRENCY = "eur";

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, true);
  }

  try {
    const supabaseUrl = requireEnvironment("SUPABASE_URL");
    const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnvironment("STRIPE_SECRET_KEY");
    const siteUrl = requireEnvironment("SITE_URL").replace(/\/$/, "");
    if (!stripeSecretKey.startsWith("sk_test_")) {
      return jsonResponse(
        { error: "This deployment accepts Stripe test mode only" },
        503,
        true,
      );
    }

    const authorization = request.headers.get("Authorization");
    const accessToken = authorization?.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return jsonResponse({ error: "Authentication required" }, 401, true);
    }

    const admin = createClient<any>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(
      accessToken,
    );
    if (userError || !userData.user) {
      return jsonResponse({ error: "Invalid authentication" }, 401, true);
    }

    let body: { projectId?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, true);
    }
    if (
      typeof body.projectId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.projectId)
    ) {
      return jsonResponse(
        { error: "A valid projectId is required" },
        400,
        true,
      );
    }
    const projectId = body.projectId;

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, owner_id, status, payment_status")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) {
      return jsonResponse({ error: "Project not found" }, 404, true);
    }
    if (project.owner_id !== userData.user.id) {
      return jsonResponse({ error: "Forbidden" }, 403, true);
    }
    if (project.payment_status === "paid") {
      return jsonResponse(
        { error: "Project already paid", code: "already_paid" },
        409,
        true,
      );
    }
    if (project.status === "published") {
      return jsonResponse({ error: "Project already published" }, 409, true);
    }
    if (project.payment_status === "refunded") {
      return jsonResponse(
        { error: "Refunded projects require support before a new payment" },
        409,
        true,
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const { data: currentPayment, error: paymentReadError } = await admin
      .from("project_payments")
      .select("id, status, stripe_checkout_session_id, updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (paymentReadError) throw paymentReadError;

    if (currentPayment?.status === "paid") {
      return jsonResponse(
        { error: "Project already paid", code: "already_paid" },
        409,
        true,
      );
    }
    if (
      currentPayment?.status === "pending" &&
      currentPayment.stripe_checkout_session_id
    ) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        currentPayment.stripe_checkout_session_id,
      );
      if (existingSession.status === "open" && existingSession.url) {
        console.info("checkout_reused", {
          projectId,
          checkoutSessionId: existingSession.id,
        });
        return jsonResponse({ url: existingSession.url }, 200, true);
      }
      if (existingSession.payment_status === "paid") {
        return jsonResponse(
          {
            error: "Payment confirmation is in progress",
            code: "confirmation_pending",
          },
          409,
          true,
        );
      }
    }

    let payment: { id: string; updated_at: string } | null = null;
    if (currentPayment) {
      const result = await admin
        .from("project_payments")
        .update({
          status: "pending",
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: null,
          paid_at: null,
        })
        .eq("id", currentPayment.id)
        .in("status", ["unpaid", "pending"])
        .select("id, updated_at")
        .single();
      if (result.error) throw result.error;
      payment = result.data;
    } else {
      const result = await admin
        .from("project_payments")
        .insert({
          project_id: projectId,
          owner_id: userData.user.id,
          amount_cents: PRICE_CENTS,
          currency: CURRENCY,
          status: "pending",
        })
        .select("id, updated_at")
        .single();
      if (result.error) throw result.error;
      payment = result.data;
    }

    const { error: pendingError } = await admin
      .from("projects")
      .update({ payment_status: "pending" })
      .eq("id", projectId)
      .eq("owner_id", userData.user.id)
      .eq("payment_status", "unpaid");
    if (pendingError) throw pendingError;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: projectId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: PRICE_CENTS,
            product_data: { name: "Publication d’un faire-part numérique" },
          },
        }],
        metadata: { project_id: projectId, owner_id: userData.user.id },
        payment_intent_data: {
          metadata: { project_id: projectId, owner_id: userData.user.id },
        },
        success_url: `${siteUrl}/payment/success?projectId=${
          encodeURIComponent(projectId)
        }&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/payment/cancel?projectId=${
          encodeURIComponent(projectId)
        }`,
      }, {
        idempotencyKey: `project-payment-${payment.id}-${
          new Date(payment.updated_at).getTime()
        }`,
      });

      if (!session.url) throw new Error("Stripe Checkout Session has no URL");
      const { error: attachError } = await admin
        .from("project_payments")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", payment.id)
        .eq("status", "pending");
      if (attachError) throw attachError;

      console.info("checkout_created", {
        projectId,
        checkoutSessionId: session.id,
      });
      return jsonResponse({ url: session.url }, 200, true);
    } catch (stripeError) {
      await admin.from("project_payments").update({ status: "unpaid" }).eq(
        "id",
        payment.id,
      ).eq("status", "pending");
      await admin.from("projects").update({ payment_status: "unpaid" }).eq(
        "id",
        projectId,
      ).eq("payment_status", "pending");
      console.error("checkout_failed", {
        projectId,
        result: stripeError instanceof Error
          ? stripeError.message
          : "unknown_error",
      });
      return jsonResponse(
        { error: "Stripe Checkout Session creation failed" },
        502,
        true,
      );
    }
  } catch (error) {
    console.error("checkout_server_error", {
      result: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ error: "Internal server error" }, 500, true);
  }
});
