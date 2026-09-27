import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, true);
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 40000) return jsonResponse({ error: "Payload too large" }, 413, true);
    const body = await request.json().catch(() => ({})) as { publicId?: string; answers?: Record<string, unknown>; startedAt?: number; website?: string };
    if (body.website || !body.publicId || !body.answers || typeof body.answers !== "object") return jsonResponse({ error: "Invalid response" }, 400, true);
    const elapsed = Date.now() - Number(body.startedAt ?? 0);
    if (elapsed < 2000 || elapsed > 24 * 60 * 60 * 1000) return jsonResponse({ error: "Invalid form timing" }, 400, true);
    const admin = createClient<any>(requireEnvironment("SUPABASE_URL"), requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: project, error } = await admin.from("projects").select("id, owner_id, name, project_data, status, payment_status, expires_at").eq("public_id", body.publicId).maybeSingle();
    if (error) throw error;
    if (!project || project.status !== "published" || project.payment_status !== "paid" || (project.expires_at && new Date(project.expires_at) <= new Date())) return jsonResponse({ error: "Invitation unavailable" }, 404, true);
    const rsvp = project.project_data?.rsvp;
    const purchase = await admin.from("rsvp_addon_purchases").select("id").eq("project_id", project.id).eq("owner_id", project.owner_id).eq("status", "paid").maybeSingle();
    if (purchase.error) throw purchase.error;
    if (!rsvp?.enabled || !purchase.data || !Array.isArray(rsvp.fields)) return jsonResponse({ error: "RSVP unavailable" }, 404, true);

    const validated: Record<string, unknown> = {};
    const labels: Record<string, string> = {};
    for (const field of rsvp.fields.slice(0, 30)) {
      if (!field?.id || !field?.label) continue;
      const answer = body.answers[field.id];
      const missing = answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0);
      if (field.required && missing) return jsonResponse({ error: `Missing required field: ${field.label}` }, 400, true);
      if (missing) continue;
      if (typeof answer === "string" && answer.length > 2000) return jsonResponse({ error: "Answer too long" }, 400, true);
      if (Array.isArray(answer) && (answer.length > 30 || answer.some((item) => typeof item !== "string" || item.length > 300))) return jsonResponse({ error: "Invalid answer" }, 400, true);
      if (["single_choice", "select"].includes(field.type) && Array.isArray(field.options) && !field.options.includes(answer)) return jsonResponse({ error: "Invalid option" }, 400, true);
      if (field.type === "multiple_choice" && Array.isArray(field.options) && (!Array.isArray(answer) || answer.some((item) => !field.options.includes(item)))) return jsonResponse({ error: "Invalid options" }, 400, true);
      validated[field.label] = answer;
      labels[field.label] = field.label;
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const fingerprint = await hash(`${forwarded}:${request.headers.get("user-agent") ?? ""}:${requireEnvironment("RSVP_ABUSE_SALT")}`);
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recent = await admin.from("rsvp_responses").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("client_fingerprint", fingerprint).gte("created_at", since);
    if (recent.error) throw recent.error;
    if ((recent.count ?? 0) >= 5) return jsonResponse({ error: "Too many responses" }, 429, true);
    const inserted = await admin.from("rsvp_responses").insert({ project_id: project.id, owner_id: project.owner_id, answers: validated, client_fingerprint: fingerprint });
    if (inserted.error) throw inserted.error;

    const { data: ownerData } = await admin.auth.admin.getUserById(project.owner_id);
    const destination = ownerData.user?.email;
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const from = Deno.env.get("RSVP_EMAIL_FROM")?.trim();
    if (destination && resendKey && from) {
      const rows = Object.entries(validated).map(([id, value]) => `<tr><th style="text-align:left;padding:8px">${escapeHtml(labels[id] ?? id)}</th><td style="padding:8px">${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</td></tr>`).join("");
      const email = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` }, body: JSON.stringify({ from, to: [destination], subject: `Nouvelle réponse RSVP · ${project.name}`, html: `<h1>Nouvelle réponse RSVP</h1><table>${rows}</table><p>Réponse reçue le ${new Date().toLocaleString("fr-FR")}.</p>` }) });
      if (!email.ok) console.error("rsvp_email_failed", await email.text());
    }
    return jsonResponse({ ok: true }, 200, true);
  } catch (error) {
    console.error("rsvp_submission_failed", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ error: "Response could not be saved" }, 500, true);
  }
});
