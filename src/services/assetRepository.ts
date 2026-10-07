import type { WeddingProject } from "../types/editor";
import { requireSupabaseSession, supabase } from "../lib/supabase";
import { saveRemoteProject } from "./projectRepository";
import { getFontFileInfo } from "../features/fonts/fontFile";

const safeFilename = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "fichier";

export type ProjectAssetKind = "image" | "audio" | "font";

const normalizedMimeType = (file: File, kind: ProjectAssetKind) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (kind === "audio" && extension === "m4a") return "audio/mp4";
  if (kind === "audio" && extension === "wav") return "audio/wav";
  if (kind === "font") {
    return getFontFileInfo(file).mimeType;
  }
  return file.type || (kind === "image" ? "image/jpeg" : "audio/mpeg");
};

export async function uploadProjectAsset(project: WeddingProject, file: File, kind: ProjectAssetKind, options?: { folder: "program-icons" | "envelope/bases" | "envelope/flaps" | "envelope/seals" }) {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  if (options && (kind !== "image" || !["program-icons", "envelope/bases", "envelope/flaps", "envelope/seals"].includes(options.folder))) throw new Error("Ce dossier est réservé aux images du projet.");
  if (kind === "font") {
    getFontFileInfo(file);
  }
  const user = await requireSupabaseSession();
  if (!project.ownerId || project.ownerId !== user.id) throw new Error("Associez d’abord ce projet à votre compte.");
  const persistedProject = await saveRemoteProject(project);
  const folder = options?.folder ?? (kind === "image" ? "images" : kind === "audio" ? "audio" : "fonts");
  const storagePath = `${user.id}/${persistedProject.id}/${folder}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const mimeType = normalizedMimeType(file, kind);
  const { error: uploadError } = await supabase.storage.from("wedding-assets").upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const publicUrl = supabase.storage.from("wedding-assets").getPublicUrl(storagePath).data.publicUrl;
  const { data, error: metadataError } = await supabase.from("assets").insert({
    project_id: persistedProject.id,
    owner_id: user.id,
    kind,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: mimeType,
    size_bytes: file.size,
  }).select("id").single<{ id: string }>();
  if (metadataError || !data) {
    await supabase.storage.from("wedding-assets").remove([storagePath]);
    throw metadataError ?? new Error("Impossible d’enregistrer le fichier.");
  }
  return { id: data.id, url: publicUrl, path: storagePath };
}

export async function deleteProjectAsset(assetId: string) {
  if (!supabase) return;
  await requireSupabaseSession();
  const { data, error } = await supabase.from("assets").select("storage_path").eq("id", assetId).maybeSingle<{ storage_path: string }>();
  if (error) throw error;
  if (!data) return;
  const { error: storageError } = await supabase.storage.from("wedding-assets").remove([data.storage_path]);
  if (storageError) throw storageError;
  const { error: metadataError } = await supabase.from("assets").delete().eq("id", assetId);
  if (metadataError) throw metadataError;
}

/** Persists removed references first, then deletes only an asset no longer used anywhere in the project. */
export async function deleteProjectAssetIfUnused(project: WeddingProject, assetId: string, publicUrl: string) {
  if (JSON.stringify(project).includes(publicUrl)) return false;
  await saveRemoteProject(project);
  await deleteProjectAsset(assetId);
  return true;
}
