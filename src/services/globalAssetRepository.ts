import { isSupabaseConfigured, requireSupabaseSession, supabase } from "../lib/supabase";
import type { EnvelopeGlobalAssetType, GlobalAssetRecord, GlobalAssetType, PublishGlobalAssetInput } from "../types/globalAssets";
import { validateEnvelopeFile } from "../features/openings/envelopeAssets";

interface GlobalAssetRow {
  id: string; type: GlobalAssetType; name: string; slug: string; storage_path: string | null;
  url: string; thumbnail_url: string | null; metadata: Record<string, unknown>; category: string | null;
  is_published: boolean; is_featured: boolean; sort_order: number; source_asset_id: string | null;
  delete_pending?: boolean;
  created_by: string; created_at: string; updated_at: string;
}

const fromRow = (row: GlobalAssetRow): GlobalAssetRecord => ({
  id: row.id, type: row.type, name: row.name, slug: row.slug, storagePath: row.storage_path,
  url: row.url, thumbnailUrl: row.thumbnail_url, metadata: row.metadata ?? {}, category: row.category,
  isPublished: row.is_published, deletePending: row.delete_pending ?? false, isFeatured: row.is_featured, sortOrder: row.sort_order,
  sourceAssetId: row.source_asset_id, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

let publishedCache: GlobalAssetRecord[] | null = null;
let publishedRequest: Promise<GlobalAssetRecord[]> | null = null;
let cacheRevision = 0;
let cacheExpiresAt = 0;
export const GLOBAL_ASSET_CACHE_INVALIDATED = "global-assets:invalidated";

const requireClient = () => {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
};

export const clearGlobalAssetCache = () => {
  cacheRevision++;
  publishedCache = null;
  publishedRequest = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GLOBAL_ASSET_CACHE_INVALIDATED));
};

export async function listPublishedGlobalAssets(type?: GlobalAssetType): Promise<GlobalAssetRecord[]> {
  if (!isSupabaseConfigured) return [];
  if (publishedCache && Date.now() >= cacheExpiresAt) publishedCache = null;
  if (!publishedCache) {
    const revision = cacheRevision;
    if (!publishedRequest) {
      const pending = (async () => {
        const { data, error } = await requireClient().from("global_assets").select("*")
          .eq("is_published", true).order("is_featured", { ascending: false })
          .order("sort_order", { ascending: true }).order("created_at", { ascending: false }).returns<GlobalAssetRow[]>();
        if (error) throw error;
        const assets = data.map(fromRow);
        if (revision === cacheRevision) { publishedCache = assets; cacheExpiresAt = Date.now() + 30_000; }
        return assets;
      })().finally(() => { if (publishedRequest === pending) publishedRequest = null; });
      publishedRequest = pending;
    }
    await publishedRequest;
    // An older response must never overwrite a publication/depublication refresh.
    if (revision !== cacheRevision) return listPublishedGlobalAssets(type);
  }
  return type ? publishedCache!.filter((asset) => asset.type === type) : publishedCache!;
}

export async function listAdminGlobalAssets() {
  await requireSupabaseSession();
  const { data, error } = await requireClient().from("global_assets").select("*")
    .order("type").order("sort_order", { ascending: true }).order("updated_at", { ascending: false }).returns<GlobalAssetRow[]>();
  if (error) throw error;
  return data.map(fromRow);
}

export async function publishGlobalAsset(input: PublishGlobalAssetInput) {
  await requireSupabaseSession();
  const { data, error } = await requireClient().functions.invoke<{ asset: GlobalAssetRow }>("publish-global-asset", { body: input });
  if (error) throw error;
  if (!data?.asset) throw new Error("La publication n’a retourné aucun asset.");
  clearGlobalAssetCache();
  return fromRow(data.asset);
}

async function invokeEnvelopeAction<T>(body: FormData | Record<string, unknown>): Promise<T> {
  await requireSupabaseSession();
  const { data, error } = await requireClient().functions.invoke<T>("publish-global-asset", { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (!data) throw new Error("La fonction n’a retourné aucune réponse.");
  return data;
}

export async function publishGlobalEnvelopeAsset(file: File, type: EnvelopeGlobalAssetType, name: string) {
  validateEnvelopeFile(file);
  const body = new FormData();
  body.set("file", file); body.set("type", type); body.set("name", name.trim());
  // The SDK sets the multipart boundary; do not set Content-Type manually.
  const data = await invokeEnvelopeAction<{ asset: GlobalAssetRow }>(body);
  if (!data.asset) throw new Error("Aucun asset publié.");
  clearGlobalAssetCache();
  return fromRow(data.asset);
}

export interface GlobalEnvelopeUsage { projects: number; templates: number }
export const getGlobalEnvelopeUsage = (id: string) => invokeEnvelopeAction<GlobalEnvelopeUsage>({ action: "usage", assetId: id });
export async function deleteGlobalEnvelopeAsset(id: string) {
  await invokeEnvelopeAction<{ deleted: boolean }>({ action: "delete", assetId: id, confirmed: true });
  clearGlobalAssetCache();
}

export async function updateGlobalAsset(id: string, updates: Partial<Pick<GlobalAssetRecord, "name" | "category" | "metadata" | "isPublished" | "isFeatured" | "sortOrder">>) {
  await requireSupabaseSession();
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) values.name = updates.name.trim();
  if (updates.category !== undefined) values.category = updates.category?.trim() || null;
  if (updates.metadata !== undefined) values.metadata = updates.metadata;
  if (updates.isPublished !== undefined) values.is_published = updates.isPublished;
  if (updates.isFeatured !== undefined) values.is_featured = updates.isFeatured;
  if (updates.sortOrder !== undefined) values.sort_order = updates.sortOrder;
  const { data, error } = await requireClient().from("global_assets").update(values).eq("id", id).select("*").single<GlobalAssetRow>();
  if (error) throw error;
  clearGlobalAssetCache();
  return fromRow(data);
}

