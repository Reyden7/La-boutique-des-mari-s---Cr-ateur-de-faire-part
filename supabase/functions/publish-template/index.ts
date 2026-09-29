import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type PublishTemplateBody = {
  projectId: string;
  templateId?: string | null;
  name: string;
  slug: string;
  description?: string;
  category: string;
  tags?: string[];
  thumbnailUrl?: string | null;
  previewImageUrl?: string | null;
  isFeatured?: boolean;
  sortOrder?: number;
  isPublished?: boolean;
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const collectWeddingAssetPaths = (value: unknown, result = new Set<string>()): Set<string> => {
  if (typeof value === "string") {
    const marker = "/storage/v1/object/public/wedding-assets/";
    const index = value.indexOf(marker);
    if (index >= 0) result.add(decodeURIComponent(value.slice(index + marker.length).split("?")[0]));
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectWeddingAssetPaths(item, result));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectWeddingAssetPaths(item, result));
  }
  return result;
};

const replaceAssetUrls = (value: unknown, replacements: Map<string, string>): unknown => {
  if (typeof value === "string") {
    for (const [source, destination] of replacements) {
      if (value.includes(`/storage/v1/object/public/wedding-assets/${encodeURI(source)}`)
        || value.includes(`/storage/v1/object/public/wedding-assets/${source}`)) return destination;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => replaceAssetUrls(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, replaceAssetUrls(item, replacements)]));
  }
  return value;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, true);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required" }, 401, true);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous) return jsonResponse({ error: "Authentication required" }, 401, true);
    if (authData.user.app_metadata?.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403, true);

    const body = await request.json() as PublishTemplateBody;
    if (!body.projectId || !body.name?.trim() || !body.slug?.trim() || !body.category?.trim()) {
      return jsonResponse({ error: "Missing template metadata" }, 400, true);
    }

    const { data: template, error: publishError } = await userClient.rpc("publish_project_as_template", {
      p_project_id: body.projectId,
      p_template_id: body.templateId ?? null,
      p_name: body.name.trim(),
      p_slug: body.slug.trim(),
      p_description: body.description?.trim() ?? "",
      p_category: body.category.trim(),
      p_tags: body.tags ?? [],
      p_thumbnail_url: body.thumbnailUrl ?? null,
      p_preview_image_url: body.previewImageUrl ?? null,
      p_is_featured: body.isFeatured ?? false,
      p_sort_order: body.sortOrder ?? 0,
      // Keep the row private until every durable asset copy succeeds.
      p_is_published: false,
    });
    if (publishError || !template) throw publishError ?? new Error("Template publication failed");

    const templateRow = template as { id: string; template_data: unknown };
    const replacements = new Map<string, string>();
    for (const sourcePath of collectWeddingAssetPaths(templateRow.template_data)) {
      const filename = sourcePath.split("/").pop() ?? crypto.randomUUID();
      const destinationPath = `templates/${templateRow.id}/${crypto.randomUUID()}-${filename}`;
      const { error: copyError } = await admin.storage.from("wedding-assets").copy(sourcePath, destinationPath, {
        destinationBucket: "template-assets",
      });
      if (copyError) throw copyError;
      replacements.set(sourcePath, admin.storage.from("template-assets").getPublicUrl(destinationPath).data.publicUrl);
    }

    const durableData = replacements.size > 0
      ? replaceAssetUrls(templateRow.template_data, replacements)
      : templateRow.template_data;
    const { data: updated, error: updateError } = await admin.from("templates")
      .update({
        template_data: durableData,
        is_published: body.isPublished ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateRow.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return jsonResponse({ template: updated }, 200, true);
  } catch (error) {
    console.error("publish-template", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Template publication failed" }, 500, true);
  }
});
