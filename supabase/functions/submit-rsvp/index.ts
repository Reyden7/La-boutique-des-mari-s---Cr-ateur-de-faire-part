import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const ALLOWED_FIELD_TYPES = new Set([
  "short_text",
  "long_text",
  "number",
  "boolean",
  "single_choice",
  "multiple_choice",
  "select",
  "email",
]);

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]!,
  );

const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

const validEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, true);
  }

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 40_000) {
      return jsonResponse({ error: "Payload too large" }, 413, true);
    }

    const body = await request.json().catch(() => null) as {
      publicId?: unknown;
      answers?: unknown;
      startedAt?: unknown;
      website?: unknown;
    } | null;
    if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400, true);

    // Honeypot submissions intentionally receive a generic success response.
    if (typeof body.website === "string" && body.website.trim()) {
      return jsonResponse({ ok: true }, 200, true);
    }
    if (
      typeof body.publicId !== "string" ||
      body.publicId.length < 16 ||
      body.publicId.length > 128 ||
      !body.answers ||
      typeof body.answers !== "object" ||
      Array.isArray(body.answers)
    ) {
      return jsonResponse({ error: "Invalid response" }, 400, true);
    }
    if (JSON.stringify(body).length > 40_000) {
      return jsonResponse({ error: "Payload too large" }, 413, true);
    }

    const startedAt = typeof body.startedAt === "number" ? body.startedAt : NaN;
    const elapsed = Date.now() - startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 2_000 || elapsed > 24 * 60 * 60 * 1_000) {
      return jsonResponse({ error: "Invalid form timing" }, 400, true);
    }

    const abuseSalt = requireEnvironment("RSVP_ABUSE_SALT");
    if (abuseSalt.length < 32) {
      throw new Error("RSVP_ABUSE_SALT must contain at least 32 characters");
    }

    const admin = createClient<any>(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, owner_id, name, project_data, status, payment_status, expires_at")
      .eq("public_id", body.publicId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (
      !project ||
      project.status !== "published" ||
      project.payment_status !== "paid" ||
      (project.expires_at && new Date(project.expires_at) <= new Date())
    ) {
      return jsonResponse({ error: "Invitation unavailable" }, 404, true);
    }

    const rsvp = project.project_data?.rsvp;
    const { data: purchase, error: purchaseError } = await admin
      .from("rsvp_addon_purchases")
      .select("id")
      .eq("project_id", project.id)
      .eq("owner_id", project.owner_id)
      .eq("status", "paid")
      .maybeSingle();
    if (purchaseError) throw purchaseError;
    if (!rsvp?.enabled || !purchase || !Array.isArray(rsvp.fields)) {
      return jsonResponse({ error: "Form unavailable" }, 404, true);
    }
    if (rsvp.fields.length === 0 || rsvp.fields.length > 30) {
      return jsonResponse({ error: "Invalid form configuration" }, 409, true);
    }

    const answers = body.answers as Record<string, unknown>;
    const knownIds = new Set<string>();
    const knownLabels = new Set<string>();
    for (const field of rsvp.fields) {
      if (
        !field ||
        typeof field.id !== "string" ||
        !field.id ||
        field.id.length > 128 ||
        knownIds.has(field.id) ||
        typeof field.label !== "string" ||
        !field.label.trim() ||
        field.label.length > 200 ||
        knownLabels.has(field.label) ||
        !ALLOWED_FIELD_TYPES.has(field.type)
      ) {
        return jsonResponse({ error: "Invalid form configuration" }, 409, true);
      }
      knownIds.add(field.id);
      knownLabels.add(field.label);
    }

    if (Object.keys(answers).some((key) => !knownIds.has(key))) {
      return jsonResponse({ error: "Unknown form field" }, 400, true);
    }

    const validated: Record<string, unknown> = Object.create(null);
    for (const field of rsvp.fields) {
      const answer = answers[field.id];
      const missing = answer === undefined || answer === null || answer === "" ||
        (Array.isArray(answer) && answer.length === 0);
      if (field.required && missing) {
        return jsonResponse({ error: `Missing required field: ${field.label}` }, 400, true);
      }
      if (missing) continue;

      if (field.type === "short_text" || field.type === "long_text") {
        const limit = field.type === "short_text" ? 300 : 2_000;
        if (typeof answer !== "string" || answer.length > limit) {
          return jsonResponse({ error: "Invalid text answer" }, 400, true);
        }
      } else if (field.type === "email") {
        if (typeof answer !== "string" || !validEmail(answer)) {
          return jsonResponse({ error: "Invalid email answer" }, 400, true);
        }
      } else if (field.type === "number") {
        if (typeof answer !== "number" || !Number.isFinite(answer) || answer < 0 || answer > 10_000) {
          return jsonResponse({ error: "Invalid number answer" }, 400, true);
        }
      } else if (field.type === "boolean") {
        if (typeof answer !== "boolean") {
          return jsonResponse({ error: "Invalid boolean answer" }, 400, true);
        }
      } else {
        const options = Array.isArray(field.options) ? field.options : [];
        if (
          options.length === 0 ||
          options.length > 50 ||
          options.some((option: unknown) => typeof option !== "string" || !option || option.length > 100) ||
          new Set(options).size !== options.length
        ) {
          return jsonResponse({ error: "Invalid form configuration" }, 409, true);
        }
        if (field.type === "multiple_choice") {
          if (
            !Array.isArray(answer) ||
            answer.length > options.length ||
            new Set(answer).size !== answer.length ||
            answer.some((item) => typeof item !== "string" || !options.includes(item))
          ) {
            return jsonResponse({ error: "Invalid choice answer" }, 400, true);
          }
        } else if (typeof answer !== "string" || !options.includes(answer)) {
          return jsonResponse({ error: "Invalid choice answer" }, 400, true);
        }
      }

      validated[field.label] = answer;
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const fingerprint = await hash(
      `${forwarded}:${request.headers.get("user-agent") ?? ""}:${abuseSalt}`,
    );
    const inserted = await admin.rpc("submit_rsvp_response", {
      p_project_id: project.id,
      p_owner_id: project.owner_id,
      p_answers: validated,
      p_client_fingerprint: fingerprint,
    });
    if (inserted.error) {
      if (inserted.error.message?.includes("RSVP_RATE_LIMIT")) {
        return jsonResponse({ error: "Too many responses" }, 429, true);
      }
      if (inserted.error.message?.includes("RSVP_UNAVAILABLE")) {
        return jsonResponse({ error: "Form unavailable" }, 404, true);
      }
      throw inserted.error;
    }

    const { data: ownerData, error: ownerError } = await admin.auth.admin
      .getUserById(project.owner_id);
    if (ownerError) {
      console.error("rsvp_owner_lookup_failed", { projectId: project.id });
    }
    const destination = ownerData.user?.email;
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const from = Deno.env.get("RSVP_EMAIL_FROM")?.trim();
    if (destination && resendKey && from) {
      const rows = Object.entries(validated).map(([label, value]) =>
        `<tr><th style="text-align:left;padding:8px">${escapeHtml(label)}</th><td style="padding:8px">${
          escapeHtml(Array.isArray(value) ? value.join(", ") : value)
        }</td></tr>`
      ).join("");
      const email = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from,
          to: [destination],
          subject: `Nouvelle réponse au formulaire · ${project.name}`,
          html: `<h1>Nouvelle réponse au formulaire</h1><table>${rows}</table><p>Réponse reçue le ${
            new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
          }.</p>`,
        }),
      });
      if (!email.ok) {
        console.error("rsvp_email_failed", {
          projectId: project.id,
          status: email.status,
        });
      }
    }

    return jsonResponse({ ok: true }, 200, true);
  } catch (error) {
    console.error("rsvp_submission_failed", {
      result: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ error: "Response could not be saved" }, 500, true);
  }
});
