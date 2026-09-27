import { requireSupabaseSession, supabase } from "../lib/supabase";
import type { WeddingProject } from "../types/editor";
import { saveRemoteProject } from "./projectRepository";

export interface CustomInvitationRequestInput {
  coupleNames: string;
  weddingDate: string;
  theme: string;
  desiredColors: string;
  desiredStyle: string;
  description: string;
}

const invokeCheckout = async (kind: "custom_invitation" | "rsvp_addon", entityId: string) => {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data, error } = await supabase.functions.invoke("create-commerce-checkout", { body: { kind, entityId } });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error ?? "Stripe n’a pas retourné de lien de paiement.");
  return String(data.url);
};

export async function createCustomInvitationRequest(input: CustomInvitationRequestInput, references: File[]) {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const user = await requireSupabaseSession();
  const { data, error } = await supabase.from("custom_invitation_requests").insert({
    owner_id: user.id,
    couple_names: input.coupleNames,
    wedding_date: input.weddingDate || null,
    theme: input.theme,
    desired_colors: input.desiredColors,
    desired_style: input.desiredStyle,
    description: input.description,
  }).select("id").single<{ id: string }>();
  if (error || !data) throw error ?? new Error("Impossible de créer la demande.");

  const referenceUrls: string[] = [];
  for (const file of references.slice(0, 5)) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Les références doivent être des images JPG, PNG ou WebP de moins de 10 Mo.");
    const path = `${user.id}/${data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
    const upload = await supabase.storage.from("custom-request-assets").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    referenceUrls.push(path);
  }
  if (referenceUrls.length) {
    const updated = await supabase.from("custom_invitation_requests").update({ reference_urls: referenceUrls }).eq("id", data.id);
    if (updated.error) throw updated.error;
  }
  return data.id;
}

export const startCustomInvitationCheckout = (requestId: string) => invokeCheckout("custom_invitation", requestId);

export async function startRsvpAddonCheckout(project: WeddingProject) {
  await saveRemoteProject(project);
  return invokeCheckout("rsvp_addon", project.id);
}
