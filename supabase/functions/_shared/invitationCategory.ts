export type InvitationCategory = "wedding" | "birth";
export const isInvitationCategory = (value: unknown): value is InvitationCategory => value === "wedding" || value === "birth";
/** Missing historical metadata always belongs to the wedding gallery. */
export const resolveInvitationCategory = (value: unknown): InvitationCategory => isInvitationCategory(value) ? value : "wedding";
