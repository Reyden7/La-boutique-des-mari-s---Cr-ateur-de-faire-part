import type { WeddingProject } from "../types/editor";
import { isSupabaseConfigured, requireSupabaseSession, supabase } from "../lib/supabase";

interface ProjectRow {
  id: string;
  owner_id?: string | null;
  name: string;
  project_data: Partial<WeddingProject>;
  status: WeddingProject["status"];
  payment_status: NonNullable<WeddingProject["paymentStatus"]>;
  public_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
}

interface CheckoutResponse {
  url: string;
}

const fromRow = (row: ProjectRow): WeddingProject => ({
  ...row.project_data,
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
} as WeddingProject);

const editableProjectData = (project: WeddingProject): Partial<WeddingProject> => {
  const data = structuredClone(project) as Partial<WeddingProject>;
  delete data.ownerId;
  delete data.status;
  delete data.paymentStatus;
  delete data.publicId;
  delete data.publishedAt;
  return data;
};

export { isSupabaseConfigured };

export async function saveRemoteProject(project: WeddingProject) {
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
    return fromRow(data);
  };

  const existing = await client
    .from("projects")
    .select("id")
    .eq("id", project.id)
    .maybeSingle<{ id: string }>();
  if (existing.error) throw existing.error;
  if (existing.data) return updateExistingProject();

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
  if (inserted.error?.code === "23505") return updateExistingProject();
  if (inserted.error) throw inserted.error;
  return fromRow(inserted.data);
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
  return data.map(fromRow);
}

export async function refreshRemoteProject(projectId: string) {
  if (!supabase) return null;
  await requireSupabaseSession();
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle<ProjectRow>();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function deleteRemoteProject(projectId: string) {
  if (!supabase) return;
  await requireSupabaseSession();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

export async function startProjectCheckout(projectId: string) {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  await requireSupabaseSession();
  const { data, error } = await supabase.functions.invoke<CheckoutResponse>("create-checkout-session", {
    body: { projectId },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Stripe n’a retourné aucune URL de paiement.");
  return data.url;
}

export async function loadPublicProject(publicId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_project", { p_public_id: publicId });
  if (error) throw error;
  return data ? fromRow(data as ProjectRow) : null;
}
