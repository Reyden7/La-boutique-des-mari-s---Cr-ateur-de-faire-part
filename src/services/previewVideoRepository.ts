import { requireSupabaseSession, supabase } from "../lib/supabase";
import type { WeddingProject } from "../types/editor";
import { saveRemoteProject } from "./projectRepository";
import { PREVIEW_VIDEO_BUCKET, validatePreviewVideo } from "../features/previewVideos/previewVideo";

export type PreviewVideoTarget = { kind: "project"; project: WeddingProject } | { kind: "template"; id: string };
const client = () => { if (!supabase) throw new Error("Supabase n’est pas configuré."); return supabase; };
const tableFor = (target: PreviewVideoTarget) => target.kind === "project" ? "projects" : "templates";
const idFor = (target: PreviewVideoTarget) => target.kind === "project" ? target.project.id : target.id;
const signed = new Map<string, { url: string; until: number }>();

/** No video request on card mount. Short-lived URLs exist only in memory. */
export async function resolvePreviewVideoUrl(path: string) {
  const user = await requireSupabaseSession(), db = client();
  const key = `${user.id}:${path}`, cached = signed.get(key);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await db.storage.from(PREVIEW_VIDEO_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error("Vidéo indisponible.");
  signed.set(key, { url: data.signedUrl, until: Date.now() + 240_000 });
  return data.signedUrl;
}

/** Durable retirement jobs are queued transactionally by the DB triggers.
 * Storage deletion always goes through its API, never SQL on storage.objects. */
export async function flushPreviewVideoCleanup() {
  if (!supabase) return;
  await requireSupabaseSession();
  const { data, error } = await supabase.from("preview_video_cleanup").select("storage_path").order("created_at").limit(50);
  if (error) throw error;
  for (const row of data ?? []) {
    const { error: removal } = await supabase.storage.from(PREVIEW_VIDEO_BUCKET).remove([row.storage_path]);
    if (removal) continue;
    const { error: acknowledgement } = await supabase.from("preview_video_cleanup").delete().eq("storage_path", row.storage_path);
    if (acknowledgement) throw acknowledgement;
  }
}

async function attach(target: PreviewVideoTarget, path: string | null, previous: string | null) {
  const db = client(), updatedAt = new Date().toISOString();
  let query = db.from(tableFor(target)).update({ preview_video_path: path, updated_at: updatedAt }).eq("id", idFor(target));
  query = previous ? query.eq("preview_video_path", previous) : query.is("preview_video_path", null);
  const { data, error } = await query.select("id,preview_video_path,updated_at").single();
  if (error || !data) throw new Error("La vidéo n’a pas pu être enregistrée. Vérifiez vos droits ou rechargez la liste : une autre modification peut avoir eu lieu.");
  return { path: data.preview_video_path as string | null, updatedAt: data.updated_at as string };
}

export async function uploadPreviewVideo(target: PreviewVideoTarget, file: File, previous: string | null) {
  const info = await validatePreviewVideo(file);
  const user = await requireSupabaseSession(), db = client();
  if (target.kind === "project") {
    if (target.project.ownerId !== user.id) throw new Error("Cette vidéo est réservée au propriétaire du projet.");
    const { data, error } = await db.from("projects").select("id").eq("id", target.project.id).maybeSingle();
    if (error) throw error;
    // New/local duplicates need a parent row, but existing content is never overwritten.
    if (!data) await saveRemoteProject(target.project);
  }
  const prefix = target.kind === "project" ? `projects/${user.id}/${idFor(target)}` : `templates/${idFor(target)}`;
  const path = `${prefix}/${crypto.randomUUID()}.${info.extension}`;
  const { error } = await db.storage.from(PREVIEW_VIDEO_BUCKET).upload(path, file, { contentType: info.mime, cacheControl: "300", upsert: false });
  if (error) throw error;
  try {
    const result = await attach(target, path, previous);
    await flushPreviewVideoCleanup().catch(() => undefined); // saved reference is authoritative
    return result;
  } catch (cause) {
    // Keep a durable retry job before attempting to remove this unattached upload.
    await db.from("preview_video_cleanup").upsert({ storage_path: path, kind: target.kind, owner_id: user.id }, { onConflict: "storage_path", ignoreDuplicates: true });
    await flushPreviewVideoCleanup().catch(() => undefined);
    throw cause;
  }
}

export async function removePreviewVideo(target: PreviewVideoTarget, previous: string) {
  const user = await requireSupabaseSession();
  if (target.kind === "project" && target.project.ownerId !== user.id) throw new Error("Cette vidéo est réservée au propriétaire du projet.");
  const result = await attach(target, null, previous);
  await flushPreviewVideoCleanup().catch(() => undefined);
  return result;
}
