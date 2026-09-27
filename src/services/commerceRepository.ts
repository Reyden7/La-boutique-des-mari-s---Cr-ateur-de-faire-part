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

const checkoutError = async (error: unknown, fallback: string) => {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: unknown; code?: unknown } | null;
    if (typeof payload?.error === "string") {
      const knownMessages: Record<string, string> = {
        "Authentication required": "Votre session a expiré. Reconnectez-vous avant de réessayer.",
        "Invalid authentication": "Votre session n’est plus valide. Reconnectez-vous avant de réessayer.",
        "Request not found": "La demande sur mesure est introuvable.",
        "Project not found": "Le projet est introuvable.",
        Forbidden: "Vous n’êtes pas autorisé à payer cette demande.",
        "Order already paid": "Cette demande a déjà été payée.",
        "Option already paid": "Le formulaire a déjà été acheté pour ce projet.",
        "Project must be paid and published before purchasing the form separately": "Le formulaire séparé est réservé aux faire-part déjà publiés.",
        "Form must be enabled before checkout": "Activez le formulaire dans l’éditeur avant de poursuivre.",
        "Checkout creation failed": "Stripe n’a pas pu créer la page de paiement. Réessayez dans quelques instants.",
        "Stripe tax configuration is incomplete for this product": "Stripe refuse le paiement car la configuration fiscale du produit est incomplète.",
        "Internal server error": "Le serveur de paiement a rencontré une erreur. La demande reste enregistrée ; réessayez dans quelques instants.",
      };
      return new Error(knownMessages[payload.error] ?? payload.error);
    }
  }
  return new Error(error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback);
};

const invokeCheckout = async (kind: "custom_invitation" | "rsvp_addon", entityId: string) => {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data, error } = await supabase.functions.invoke("create-commerce-checkout", { body: { kind, entityId } });
  if (error) throw await checkoutError(error, "Le paiement n’a pas pu être préparé.");
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
