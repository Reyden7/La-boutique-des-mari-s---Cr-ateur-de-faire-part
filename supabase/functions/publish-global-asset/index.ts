import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { getGlobalFontMetadata } from "../_shared/fontFormats.ts";
import { getProgramIconFileInfo } from "../_shared/programIconFormats.ts";

const TYPES = ["font", "welcome_arch", "welcome_background", "music", "particle", "decoration", "program_icon"] as const;
type GlobalAssetType = typeof TYPES[number];

type Body = {
  sourceAssetId: string;
  type: GlobalAssetType;
  name: string;
  slug?: string;
  category?: string;
  metadata?: Record<string, unknown>;
};

type SourceAsset = {
  id: string;
  owner_id: string;
  kind: "image" | "audio" | "font";
  storage_path: string;
  public_url: string;
  mime_type: string | null;
  size_bytes: number | null;
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "asset";

const destinationFolder: Record<GlobalAssetType, string> = {
  font: "fonts",
  welcome_arch: "welcome/arches",
  welcome_background: "welcome/backgrounds",
  music: "music",
  particle: "particles",
  decoration: "decorations",
  program_icon: "program-icons",
};

const expectedKind: Record<GlobalAssetType, SourceAsset["kind"]> = {
  font: "font",
  welcome_arch: "image",
  welcome_background: "image",
  music: "audio",
  particle: "image",
  decoration: "image",
  program_icon: "image",
};

const sanitizeMetadata = (type: GlobalAssetType, input: Record<string, unknown>, source: SourceAsset) => {
  if (type === "font") {
    return getGlobalFontMetadata(input, source.storage_path);
  }
  if (type === "music") return {
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined,
    artist: typeof input.artist === "string" && input.artist.trim() ? input.artist.trim() : undefined,
    duration: typeof input.duration === "number" && Number.isFinite(input.duration) && input.duration >= 0 ? input.duration : undefined,
    mimeType: source.mime_type ?? undefined,
  };
  return {
    width: typeof input.width === "number" && input.width > 0 ? input.width : undefined,
    height: typeof input.height === "number" && input.height > 0 ? input.height : undefined,
    mimeType: source.mime_type ?? undefined,
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, true);

  let copiedPath: string | null = null;
  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required" }, 401, true);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user || user.is_anonymous) return jsonResponse({ error: "Authentication required" }, 401, true);
    if (user.app_metadata?.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403, true);

    const body = await request.json() as Body;
    if (!body.sourceAssetId || !TYPES.includes(body.type) || !body.name?.trim()) return jsonResponse({ error: "Invalid asset payload" }, 400, true);

    const { data: duplicate } = await admin.from("global_assets").select("*")
      .eq("source_asset_id", body.sourceAssetId).eq("type", body.type).maybeSingle();
    if (duplicate) {
      const { data: published, error } = await admin.from("global_assets").update({ is_published: true, updated_at: new Date().toISOString() })
        .eq("id", duplicate.id).select("*").single();
      if (error) throw error;
      return jsonResponse({ asset: published, duplicate: true }, 200, true);
    }

    const { data: source, error: sourceError } = await admin.from("assets").select("id,owner_id,kind,storage_path,public_url,mime_type,size_bytes")
      .eq("id", body.sourceAssetId).eq("owner_id", user.id).single<SourceAsset>();
    if (sourceError || !source) return jsonResponse({ error: "Source asset not found" }, 404, true);
    if (source.kind !== expectedKind[body.type] || !source.storage_path.startsWith(`${user.id}/`)) return jsonResponse({ error: "Source asset type rejected" }, 400, true);
    if (body.type === "program_icon") {
      try { getProgramIconFileInfo({ name: source.storage_path, type: source.mime_type, size: source.size_bytes ?? 0 }); }
      catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : "Invalid program icon" }, 400, true); }
    }

    const filename = source.storage_path.split("/").pop() ?? crypto.randomUUID();
    copiedPath = `${destinationFolder[body.type]}/${crypto.randomUUID()}-${filename}`;
    const { error: copyError } = await admin.storage.from("wedding-assets").copy(source.storage_path, copiedPath, { destinationBucket: "global-assets" });
    if (copyError) throw copyError;

    const publicUrl = admin.storage.from("global-assets").getPublicUrl(copiedPath).data.publicUrl;
    const metadata = sanitizeMetadata(body.type, body.metadata ?? {}, source);
    const baseSlug = slugify(body.slug?.trim() || body.name);
    const { data: slugMatch } = await admin.from("global_assets").select("id").eq("slug", baseSlug).maybeSingle();
    const slug = slugMatch ? `${baseSlug}-${crypto.randomUUID().slice(0, 8)}` : baseSlug;
    const visual = ["welcome_arch", "welcome_background", "particle", "decoration", "program_icon"].includes(body.type);
    const { data: asset, error: insertError } = await admin.from("global_assets").insert({
      type: body.type,
      name: body.name.trim(),
      slug,
      storage_path: copiedPath,
      url: publicUrl,
      thumbnail_url: visual ? publicUrl : null,
      metadata,
      category: body.category?.trim() || null,
      is_published: true,
      source_asset_id: source.id,
      created_by: user.id,
    }).select("*").single();
    if (insertError) throw insertError;
    return jsonResponse({ asset, duplicate: false }, 200, true);
  } catch (error) {
    console.error("publish-global-asset", error);
    if (copiedPath) {
      try {
        const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
        await admin.storage.from("global-assets").remove([copiedPath]);
      } catch { /* best-effort rollback */ }
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Global asset publication failed" }, 500, true);
  }
});
