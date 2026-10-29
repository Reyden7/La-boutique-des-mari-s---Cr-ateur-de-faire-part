import { corsHeaders } from "./http.ts";

/** Server configuration only. Never consult request bodies, headers or query strings. */
export function paymentMaintenanceResponse(): Response | null {
  const configured = Deno.env.get("PAYMENTS_MAINTENANCE")?.trim().toLowerCase();
  // Absent/false is the normal state. Invalid nonempty values fail closed.
  if (!configured || configured === "false") return null;
  return new Response(JSON.stringify({
    error: "Les achats sont temporairement suspendus pendant une mise à jour. Réessayez dans quelques minutes.",
    code: "payments_maintenance",
  }), { status: 503, headers: {
    ...corsHeaders, "Content-Type": "application/json", "Retry-After": "120",
    "Access-Control-Expose-Headers": "Retry-After", "Cache-Control": "no-store",
  } });
}
