import { requireSupabaseSession, supabase } from "../lib/supabase";
import { projectFromRow, type ProjectRow } from "./projectRepository";
import type { TemplateMetadataInput, TemplateRecord } from "../types/templates";
import type { WeddingProject } from "../types/editor";

interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[] | null;
  theme: string | null;
  thumbnail_url: string | null;
  preview_image_url: string | null;
  template_data: Partial<WeddingProject>;
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
  version: number;
  source_project_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const fromRow = (row: TemplateRow): TemplateRecord => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  category: row.category,
  tags: row.tags ?? [],
  theme: row.theme,
  thumbnailUrl: row.thumbnail_url,
  previewImageUrl: row.preview_image_url,
  templateData: row.template_data,
  isPublished: row.is_published,
  isFeatured: row.is_featured,
  sortOrder: row.sort_order,
  version: row.version,
  sourceProjectId: row.source_project_id,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requireClient = () => {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
};

export async function loadPublishedTemplates() {
  const client = requireClient();
  const { data, error } = await client.from("templates").select("*")
    .eq("is_published", true)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<TemplateRow[]>();
  if (error) throw error;
  return data.map(fromRow);
}

export async function loadAdminTemplates() {
  const client = requireClient();
  await requireSupabaseSession();
  const { data, error } = await client.from("templates").select("*")
    .order("sort_order", { ascending: true }).order("updated_at", { ascending: false })
    .returns<TemplateRow[]>();
  if (error) throw error;
  return data.map(fromRow);
}

export async function uploadTemplateThumbnail(file: File) {
  const client = requireClient();
  const user = await requireSupabaseSession();
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
    throw new Error("La vignette doit être une image de moins de 10 Mo.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `drafts/${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from("template-assets").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return client.storage.from("template-assets").getPublicUrl(path).data.publicUrl;
}

export async function publishProjectAsTemplate(
  projectId: string,
  metadata: TemplateMetadataInput,
  templateId?: string | null,
) {
  const client = requireClient();
  await requireSupabaseSession();
  const { data, error } = await client.functions.invoke<{ template: TemplateRow }>("publish-template", {
    body: { projectId, templateId: templateId ?? null, ...metadata },
  });
  if (error) throw error;
  if (!data?.template) throw new Error("La publication du modèle n’a retourné aucun résultat.");
  return fromRow(data.template);
}

export async function instantiateRemoteTemplate(templateId: string, name?: string) {
  const client = requireClient();
  await requireSupabaseSession();
  const { data, error } = await client.rpc("instantiate_project_from_template", {
    p_template_id: templateId,
    p_name: name?.trim() || null,
  }).single<ProjectRow>();
  if (error) throw error;
  return projectFromRow(data);
}

export async function updateTemplateMetadata(templateId: string, updates: Partial<TemplateMetadataInput>) {
  const client = requireClient();
  await requireSupabaseSession();
  const databaseUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) databaseUpdates.name = updates.name;
  if (updates.slug !== undefined) databaseUpdates.slug = updates.slug;
  if (updates.description !== undefined) databaseUpdates.description = updates.description;
  if (updates.category !== undefined) databaseUpdates.category = updates.category;
  if (updates.tags !== undefined) databaseUpdates.tags = updates.tags;
  if (updates.thumbnailUrl !== undefined) databaseUpdates.thumbnail_url = updates.thumbnailUrl;
  if (updates.previewImageUrl !== undefined) databaseUpdates.preview_image_url = updates.previewImageUrl;
  if (updates.isPublished !== undefined) databaseUpdates.is_published = updates.isPublished;
  if (updates.isFeatured !== undefined) databaseUpdates.is_featured = updates.isFeatured;
  if (updates.sortOrder !== undefined) databaseUpdates.sort_order = updates.sortOrder;
  const { data, error } = await client.from("templates").update(databaseUpdates).eq("id", templateId).select("*").single<TemplateRow>();
  if (error) throw error;
  return fromRow(data);
}

export async function duplicateRemoteTemplate(templateId: string) {
  const client = requireClient();
  await requireSupabaseSession();
  const { data, error } = await client.rpc("duplicate_template", { p_template_id: templateId }).single<TemplateRow>();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteRemoteTemplate(templateId: string) {
  const client = requireClient();
  await requireSupabaseSession();
  const { error } = await client.from("templates").delete().eq("id", templateId);
  if (error) throw error;
}
