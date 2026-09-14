import type { WeddingProject } from "../types/editor";
import { isSupabaseConfigured, requireSupabaseSession, supabase } from "../lib/supabase";

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  project_data: WeddingProject;
  status: WeddingProject["status"];
  public_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
}

const fromRow = (row: ProjectRow): WeddingProject => ({
  ...row.project_data,
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  status: row.status,
  publicId: row.public_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at ?? undefined,
  expiresAt: row.expires_at ?? undefined,
});

export { isSupabaseConfigured };

export async function saveRemoteProject(project: WeddingProject) {
  if (!supabase) return project;
  const user = await requireSupabaseSession();
  const ownerId = project.ownerId ?? user.id;
  const payload = { ...project, ownerId };
  const { data, error } = await supabase.from("projects").upsert({
    id: project.id,
    owner_id: ownerId,
    name: project.name,
    project_data: payload,
    status: project.status,
    public_id: project.publicId ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    published_at: project.publishedAt ?? null,
    expires_at: project.expiresAt ?? null,
  }, { onConflict: "id" }).select().single<ProjectRow>();
  if (error) throw error;
  return fromRow(data);
}

export async function loadRemoteProjects() {
  if (!supabase) return [];
  await requireSupabaseSession();
  const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false }).returns<ProjectRow[]>();
  if (error) throw error;
  return data.map(fromRow);
}

export async function deleteRemoteProject(projectId: string) {
  if (!supabase) return;
  await requireSupabaseSession();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

const createPublicId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 14);

export async function publishRemoteProject(project: WeddingProject) {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const publishedAt = project.publishedAt ?? new Date().toISOString();
  if (project.publicId) return saveRemoteProject({ ...project, status: "published", publishedAt });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await saveRemoteProject({ ...project, status: "published", publicId: createPublicId(), publishedAt });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "23505")) throw error;
    }
  }
  throw new Error("Impossible de générer un lien public unique.");
}

export async function loadPublicProject(publicId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("public_id", publicId)
    .eq("status", "published")
    .maybeSingle<ProjectRow>();
  if (error) throw error;
  return data ? fromRow(data) : null;
}
