import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { recipientFieldRole, standardAttendanceAnswer } from "../_shared/recipientRsvp.ts";

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
      recipientToken?: unknown;
      attendance?: unknown;
      presentCount?: unknown;
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

    const abuseSalt = body.recipientToken ? "" : requireEnvironment("RSVP_ABUSE_SALT");
    if (!body.recipientToken && abuseSalt.length < 32) {
      throw new Error("RSVP_ABUSE_SALT must contain at least 32 characters");
    }

    const admin = createClient<any>(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, owner_id, name, project_data, status, payment_status, expires_at, recipient_links_required, publication_policy")
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

    let rsvp = project.project_data?.rsvp;
    if (project.publication_policy === "paid_versions") {
      const live=await admin.rpc(body.recipientToken?"get_recipient_invitation":"get_public_project",body.recipientToken?{p_public_id:body.publicId,p_token:body.recipientToken}:{p_public_id:body.publicId});
      if(live.error)throw live.error;
      rsvp=(body.recipientToken?live.data?.project:live.data)?.project_data?.rsvp;
      if(!rsvp)return jsonResponse({error:"Published form unavailable"},404,true);
    }
    let recipient: {displayName:string;guestCount:number} | null = null;
    if(body.recipientToken) {
      if(typeof body.recipientToken!=="string"||!/^[a-f0-9]{64}$/.test(body.recipientToken)) return jsonResponse({error:"Invitation unavailable"},404,true);
      const lookup=await admin.rpc("get_recipient_invitation",{p_public_id:body.publicId,p_token:body.recipientToken});
      if(lookup.error)throw lookup.error;
      recipient=lookup.data?.recipient;
      if(!recipient)return jsonResponse({error:"Invitation unavailable"},404,true);
      if(!["confirmed","declined"].includes(String(body.attendance))||typeof body.presentCount!=="number"||!Number.isInteger(body.presentCount)||body.presentCount<0||body.presentCount>recipient.guestCount||
        (body.attendance==="confirmed"&&body.presentCount<1)||(body.attendance==="declined"&&body.presentCount!==0))return jsonResponse({error:"Invalid attendance or guest capacity"},400,true);
    } else if(project.recipient_links_required) return jsonResponse({error:"Personal invitation required"},403,true);
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
    if(recipient)for(const field of rsvp.fields) {
      if(recipientFieldRole(field)==="count")answers[field.id]=body.presentCount;
      if(recipientFieldRole(field)==="attendance") { const value=standardAttendanceAnswer(field,String(body.attendance));if(value!==undefined)answers[field.id]=value; }
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

    // Personal invitations are not tied to an IP, browser fingerprint or device.
    const fingerprint = recipient ? null : await hash(
      `${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown"}:${request.headers.get("user-agent")??""}:${abuseSalt}`,
    );
    const inserted = recipient ? await admin.rpc("submit_recipient_rsvp", {
      p_public_id:body.publicId,p_token:body.recipientToken,p_answers:validated,p_answers_by_id:answers,p_attendance:body.attendance,p_present_count:body.presentCount,
    }) : await admin.rpc("submit_rsvp_response", {
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
          subject: `Nouvelle réponse${recipient?` de ${recipient.displayName}`:" au formulaire"} · ${project.name}`,
          html: `<h1>Nouvelle réponse${recipient?` de ${escapeHtml(recipient.displayName)}`:" au formulaire"}</h1><table>${rows}</table><p>Réponse reçue le ${
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
      result: error instanceof Error ? error.name : "unknown_error",
    });
    return jsonResponse({ error: "Response could not be saved" }, 500, true);
  }
});
