import type { WeddingProject } from "../types/editor";
import { isSupabaseConfigured, requireSupabaseSession, supabase } from "../lib/supabase";
import { PRICING, PRICING_CHANGED_MESSAGE, PAYMENT_MINIMUM_MESSAGE } from "../../supabase/functions/_shared/pricing.ts";
import { flushPreviewVideoCleanup } from "./previewVideoRepository";
import { hasTemporaryReferences, isDiscoveryProject } from "../features/discovery/discoverySession.ts";
import type { PublicationCheckoutOptions } from "../features/publication/publicationState";
import { PUBLICATION_TERMS } from "../../supabase/functions/_shared/publicationVersions.ts";

export interface ProjectRow {
  id: string;
  owner_id?: string | null;
  name: string;
  project_data: Partial<WeddingProject>;
  preview_video_path?: string | null;
  status: WeddingProject["status"];
  payment_status: NonNullable<WeddingProject["paymentStatus"]>;
  public_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  purchased_guest_capacity?: number | null;
  purchased_extra_blocks?: number | null;
  publication_license_id?: string | null;
  publication_policy?: WeddingProject["publicationPolicy"];
  active_version_id?: string | null;
  active_version_number?: number;
  has_version_draft?: boolean;
}

interface CheckoutResponse {
  pricingVersion?: string;
  url?: string;
  kind?: "free_publication";
  completed?: boolean;
  transactionId?: string;
  projectId?: string;
  publicationVersionId?: string | null;
}

interface PublicProjectRow {
  id: string;
  name: string;
  project_data: Partial<WeddingProject>;
  public_id: string;
  expires_at: string | null;
}

export const projectFromRow = (row: ProjectRow): WeddingProject => ({
  ...row.project_data,
  previewVideoPath: row.preview_video_path ?? null,
  id: row.id,
  ownerId: row.owner_id ?? undefined,
  name: row.name,
  status: row.status,
  paymentStatus: row.payment_status ?? "unpaid",
  publicId: row.public_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at ?? undefined,
  expiresAt: row.expires_at ?? undefined,
  purchasedGuestCapacity: row.purchased_guest_capacity ?? undefined,
  purchasedExtraBlocks: row.purchased_extra_blocks ?? undefined,
  publicationLicenseId: row.publication_license_id ?? undefined,
  publicationPolicy: row.publication_policy,
  activeVersionId: row.active_version_id ?? undefined,
  activeVersionNumber: row.active_version_number,
  hasVersionDraft: row.has_version_draft ?? false,
} as WeddingProject);

const editableProjectData = (project: WeddingProject): Partial<WeddingProject> => {
  const data = structuredClone(project) as Partial<WeddingProject>;
  delete data.previewVideoPath;
  delete data.ownerId;
  delete data.status;
  delete data.paymentStatus;
  delete data.publicId;
  delete data.publishedAt;
  delete data.purchasedGuestCapacity;
  delete data.purchasedExtraBlocks;
  delete data.publicationLicenseId;
  delete data.publicationPolicy;
  delete data.activeVersionId;
  delete data.activeVersionNumber;
  delete data.hasVersionDraft;
  return data;
};

export { isSupabaseConfigured };

export async function saveRemoteProject(project: WeddingProject, options?: { createOnly?: boolean }) {
  if (isDiscoveryProject(project) || hasTemporaryReferences(project)) throw new Error("Un brouillon découverte ne peut pas être sauvegardé directement.");
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const client = supabase;
  const user = await requireSupabaseSession();
  if (!project.ownerId) {
    throw new Error("Ce projet local doit être associé explicitement à votre compte avant sa première sauvegarde distante.");
  }
  if (project.ownerId !== user.id) {
    throw new Error("Ce projet appartient à un autre compte.");
  }
  const editable = {
    name: project.name,
    project_data: editableProjectData(project),
    updated_at: project.updatedAt,
    expires_at: project.expiresAt ?? null,
  };

  const updateExistingProject = async () => {
    const { data, error } = await client
      .from("projects")
      .update(editable)
      .eq("id", project.id)
      .select("*")
      .single<ProjectRow>();
    if (error) throw error;
    return projectFromRow(data);
  };

  const existing = await client
    .from("projects")
    .select("id")
    .eq("id", project.id)
    .maybeSingle<{ id: string }>();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (options?.createOnly) throw new Error("Cet identifiant existe déjà. Aucun projet n’a été écrasé.");
    return updateExistingProject();
  }

  const inserted = await client
    .from("projects")
    .insert({
      id: project.id,
      owner_id: user.id,
      ...editable,
      created_at: project.createdAt,
      status: "draft",
      payment_status: "unpaid",
      public_id: null,
      published_at: null,
    })
    .select("*")
    .single<ProjectRow>();
  if (inserted.error?.code === "23505" && !options?.createOnly) return updateExistingProject();
  if (inserted.error) throw inserted.error;
  return projectFromRow(inserted.data);
}

export async function associateLocalProject(project: WeddingProject) {
  const user = await requireSupabaseSession();
  if (project.ownerId) {
    if (project.ownerId !== user.id) throw new Error("Ce projet appartient déjà à un autre compte.");
    return saveRemoteProject(project);
  }
  return saveRemoteProject({ ...project, ownerId: user.id });
}

export async function loadRemoteProjects() {
  if (!supabase) return [];
  await requireSupabaseSession();
  const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false }).returns<ProjectRow[]>();
  if (error) throw error;
  return data.map(projectFromRow);
}

export async function refreshRemoteProject(projectId: string) {
  if (!supabase) return null;
  await requireSupabaseSession();
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle<ProjectRow>();
  if (error) throw error;
  return data ? projectFromRow(data) : null;
}

export async function deleteRemoteProject(projectId: string) {
  if (!supabase) return;
  await requireSupabaseSession();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
  await flushPreviewVideoCleanup().catch(() => undefined);
}

export async function startProjectCheckout(projectId: string, guestCount: number, promoCode?: string, options?: PublicationCheckoutOptions) {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  await requireSupabaseSession();
  const { data, error } = await supabase.functions.invoke<CheckoutResponse>("create-checkout-session", {
    body: { projectId, guestCount, pricingVersion: PRICING.version, ...(promoCode ? { promoCode } : {}),
      ...(options?{purchaseKind:options.kind,publicationTerms:options.termsAccepted?PUBLICATION_TERMS:undefined,expectedAmount:options.expectedAmount}:{}) },
  });
  if (error) {
    if (error.context instanceof Response) {
      const result = await error.context.clone().json().catch(() => null);
      if (result?.code === "amount_below_minimum") throw new Error(PAYMENT_MINIMUM_MESSAGE);
      if (result?.code === "pricing_changed") throw new Error(PRICING_CHANGED_MESSAGE);
      if (result?.error === "Ce code promo n’est plus disponible." || result?.error === "Les codes promos sont réservés à la première publication.") throw new Error(result.error);
    }
    throw error;
  }
  if (data?.pricingVersion !== PRICING.version) throw new Error(PRICING_CHANGED_MESSAGE);
  if (data.kind === "free_publication") {
    if (!data.completed || !data.transactionId || data.projectId !== projectId || options?.kind !== "initial_publication" || options.expectedAmount !== 0) throw new Error("Confirmation de publication gratuite invalide.");
    const project = await refreshRemoteProject(projectId);
    if (!project || project.paymentStatus !== "paid" || project.status !== "published" || !project.publicId
      || (project.activeVersionId ?? null) !== (data.publicationVersionId ?? null)) throw new Error("La confirmation de publication est en cours. Actualisez le projet.");
    return null;
  }
  if (!data?.url) throw new Error("Stripe n’a retourné aucune URL de paiement.");
  return data.url;
}

export async function guestCheckoutIsPaid(projectId: string, sessionId: string, versionPublication = false) {
  if (!supabase) return false;
  await requireSupabaseSession();
  const { data, error } = await supabase.from(versionPublication ? "publication_version_payments" : "guest_license_payments").select("status")
    .eq("project_id", projectId).eq("stripe_checkout_session_id", sessionId).maybeSingle<{ status: string }>();
  if (error) throw error;
  return data?.status === "paid";
}

export async function loadPublicProject(publicId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_project", { p_public_id: publicId });
  if (error) throw error;
  if (!data) return null;
  const row = data as PublicProjectRow;
  return {
    ...row.project_data,
    id: row.id,
    name: row.name,
    status: "published",
    paymentStatus: "paid",
    publicId: row.public_id,
    expiresAt: row.expires_at ?? undefined,
  } as WeddingProject;
}
