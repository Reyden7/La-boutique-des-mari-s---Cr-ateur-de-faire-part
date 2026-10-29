import { requireSupabaseSession, supabase } from "../lib/supabase";
import type { InvitationRecipient } from "../features/recipients/recipientData";

export async function loadInvitationRecipients(projectId: string) {
  await requireSupabaseSession(); if (!supabase) throw new Error("Service non configuré.");
  const { data, error } = await supabase.rpc("read_invitation_recipients", { p_project_id: projectId });
  if (error) throw new Error("La liste n’a pas pu être chargée. Vérifiez votre connexion et les mises à jour serveur.");
  return data as { revision: number; recipients: InvitationRecipient[] };
}
export async function saveInvitationRecipients(projectId: string, revision: number, recipients: InvitationRecipient[]) {
  await requireSupabaseSession(); if (!supabase) throw new Error("Service non configuré.");
  const { data, error } = await supabase.rpc("save_invitation_recipients", {
    p_project_id: projectId, p_revision: revision,
    p_recipients: recipients.map(({ id, display_name, guest_count, is_active }) => ({ id, display_name, guest_count, is_active })),
  });
  if (error) throw new Error(error.message.includes("RECIPIENT_LIST_CHANGED") ? "La liste a changé dans un autre onglet. Fermez puis rouvrez la liste avant de réessayer." : "Enregistrement de la liste impossible. Aucune modification n’a été appliquée.");
  return data as { revision: number; recipients: InvitationRecipient[] };
}

export interface RecipientInvitation {
  id: string; displayName: string; guestCount: number; token: string;
  answers: Record<string, unknown> | null; canEdit: boolean;
  attendance?: "confirmed" | "declined" | null; presentCount?: number | null;
}
export async function loadRecipientInvitation(publicId: string, token: string) {
  if (!supabase) return null;
  const result = await supabase.rpc("get_recipient_invitation", { p_public_id: publicId, p_token: token });
  if (result.error) throw new Error("Invitation indisponible.");
  return result.data;
}
