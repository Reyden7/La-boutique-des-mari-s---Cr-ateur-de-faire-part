import { isSupabaseConfigured, requireSupabaseSession, supabase } from "../lib/supabase";
import type { GlobalAssetRecord, GlobalAssetType, PublishGlobalAssetInput } from "../types/globalAssets";

interface GlobalAssetRow {
  id: string; type: GlobalAssetType; name: string; slug: string; storage_path: string | null;
  url: string; thumbnail_url: string | null; metadata: Record<string, unknown>; category: string | null;
  is_published: boolean; is_featured: boolean; sort_order: number; source_asset_id: string | null;
  created_by: string; created_at: string; updated_at: string;
}

const fromRow = (row: GlobalAssetRow): GlobalAssetRecord => ({
  id: row.id, type: row.type, name: row.name, slug: row.slug, storagePath: row.storage_path,
  url: row.url, thumbnailUrl: row.thumbnail_url, metadata: row.metadata ?? {}, category: row.category,
  isPublished: row.is_published, isFeatured: row.is_featured, sortOrder: row.sort_order,
  sourceAssetId: row.source_asset_id, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

let publishedCache: GlobalAssetRecord[] | null = null;
let publishedRequest: Promise<GlobalAssetRecord[]> | null = null;
export const GLOBAL_ASSET_CACHE_INVALIDATED = "global-assets:invalidated";

const requireClient = () => {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
};

export const clearGlobalAssetCache = () => {
  publishedCache = null;
  publishedRequest = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GLOBAL_ASSET_CACHE_INVALIDATED));
};

export async function listPublishedGlobalAssets(type?: GlobalAssetType): Promise<GlobalAssetRecord[]> {
  if (!isSupabaseConfigured) return [];
  if (!publishedCache) {
    publishedRequest ??= (async () => {
      const { data, error } = await requireClient().from("global_assets").select("*")
        .eq("is_published", true).order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true }).order("created_at", { ascending: false }).returns<GlobalAssetRow[]>();
      if (error) throw error;
      publishedCache = data.map(fromRow);
      return publishedCache;
    })().finally(() => { publishedRequest = null; });
    await publishedRequest;
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

