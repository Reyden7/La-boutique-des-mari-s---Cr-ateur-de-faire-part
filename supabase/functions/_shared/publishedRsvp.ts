/** Presence of the actual published questionnaire; independent of tariff/type. */
export function hasPublishedRsvpForm(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const rsvp = (snapshot as { rsvp?: { enabled?: unknown; fields?: unknown } }).rsvp;
  return rsvp?.enabled === true && Array.isArray(rsvp.fields) && rsvp.fields.length > 0 && rsvp.fields.length <= 30;
}
