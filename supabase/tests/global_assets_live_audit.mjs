import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const fontPath = required("AUDIT_FONT_PATH");
const archPath = required("AUDIT_ARCH_PATH");
const backgroundPath = required("AUDIT_BACKGROUND_PATH");
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cleanup = { sourcePaths: [], globalPaths: [], globalIds: [], assetIds: [], projectIds: [], templateIds: [], templatePaths: [] };
const results = {};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sessionFor = async (user) => {
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (linkError) throw linkError;
  const tokenHash = link.properties?.hashed_token;
  assert(tokenHash, "Magic-link token was not generated");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || !data.session) throw error ?? new Error("Session was not created");
  return {
    accessToken: data.session.access_token,
    client: createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
};

const insertSourceAsset = async ({ client, userId, projectId, kind, path, localPath, mimeType }) => {
  const body = await readFile(localPath);
  const { error: uploadError } = await client.storage.from("wedding-assets").upload(path, body, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  cleanup.sourcePaths.push(path);
  const publicUrl = service.storage.from("wedding-assets").getPublicUrl(path).data.publicUrl;
  const { data, error } = await client.from("assets").insert({
    project_id: projectId,
    owner_id: userId,
    kind,
    storage_path: path,
    public_url: publicUrl,
    mime_type: mimeType,
    size_bytes: body.byteLength,
  }).select("id,storage_path,public_url").single();
  if (error) throw error;
  cleanup.assetIds.push(data.id);
  return data;
};

const invoke = async (client, name, body) => {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    const status = error.context?.status ?? null;
    let payload = null;
    try { payload = await error.context?.clone().json(); } catch { /* response body is optional */ }
    const wrapped = new Error(payload?.error ?? error.message);
    wrapped.status = status;
    throw wrapped;
  }
  return data;
};

try {
  const { data: usersPage, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const adminUser = usersPage.users.find((user) => !user.is_anonymous && user.app_metadata?.role === "admin" && user.email);
  const normalUser = usersPage.users.find((user) => !user.is_anonymous && user.app_metadata?.role !== "admin" && user.email);
  assert(adminUser, "No admin user available");
  assert(normalUser, "No non-admin user available");

  const adminSession = await sessionFor(adminUser);
  const normalSession = await sessionFor(normalUser);
  const { data: baseProjects, error: projectError } = await adminSession.client.from("projects")
    .select("id,name,project_data").eq("owner_id", adminUser.id).order("updated_at", { ascending: false }).limit(20);
  if (projectError) throw projectError;
  assert(baseProjects?.length, "Admin has no source project");
  const baseProject = [...baseProjects].sort((a, b) =>
    (JSON.stringify(a.project_data).match(/wedding-assets/g)?.length ?? 0)
    - (JSON.stringify(b.project_data).match(/wedding-assets/g)?.length ?? 0))[0];

  const sourceBase = `${adminUser.id}/${baseProject.id}`;
  const fontSource = await insertSourceAsset({ client: adminSession.client, userId: adminUser.id, projectId: baseProject.id,
    kind: "font", path: `${sourceBase}/fonts/audit-${runId}.ttf`, localPath: fontPath, mimeType: "font/ttf" });
  const archSource = await insertSourceAsset({ client: adminSession.client, userId: adminUser.id, projectId: baseProject.id,
    kind: "image", path: `${sourceBase}/images/audit-arch-${runId}.png`, localPath: archPath, mimeType: "image/png" });
  const backgroundSource = await insertSourceAsset({ client: adminSession.client, userId: adminUser.id, projectId: baseProject.id,
    kind: "image", path: `${sourceBase}/images/audit-background-${runId}.png`, localPath: backgroundPath, mimeType: "image/png" });

  const published = [];
  for (const input of [
    { sourceAssetId: fontSource.id, type: "font", name: `Audit Police ${runId}`, metadata: { family: `AuditAntiqua${runId}`, format: "ttf" } },
    { sourceAssetId: archSource.id, type: "welcome_arch", name: `Audit Arche ${runId}` },
    { sourceAssetId: backgroundSource.id, type: "welcome_background", name: `Audit Paysage ${runId}` },
  ]) {
    const response = await invoke(adminSession.client, "publish-global-asset", input);
    assert(response?.asset?.id, `Publishing ${input.type} returned no asset`);
    published.push(response.asset);
    cleanup.globalIds.push(response.asset.id);
    cleanup.globalPaths.push(response.asset.storage_path);
  }

  const { data: adminLibrary, error: adminLibraryError } = await adminSession.client.from("global_assets")
    .select("id,type,url,storage_path,is_published,metadata").in("id", cleanup.globalIds);
  if (adminLibraryError) throw adminLibraryError;
  assert(adminLibrary.length === 3 && adminLibrary.every((asset) => asset.is_published), "Admin library does not contain the three published assets");
  for (const asset of adminLibrary) {
    assert(asset.url.includes("/global-assets/"), `${asset.type} URL does not target global-assets`);
    const { data: copied, error: downloadError } = await service.storage.from("global-assets").download(asset.storage_path);
    if (downloadError) throw downloadError;
    assert(copied.size > 0, `${asset.type} copy is empty`);
  }
  results.admin_publish = { passed: true, types: adminLibrary.map((asset) => asset.type), storageCopies: 3 };

  const { data: publicRead, error: publicReadError } = await anonymous.from("global_assets")
    .select("id,type").in("id", cleanup.globalIds);
  if (publicReadError) throw publicReadError;
  assert(publicRead.length === 3, "Anonymous/non-admin published library read failed");

  const forbiddenSlug = `audit-forbidden-${runId}`;
  const { error: insertDenied } = await normalSession.client.from("global_assets").insert({
    type: "font", name: "Forbidden", slug: forbiddenSlug, url: "https://example.invalid/forbidden", created_by: normalUser.id,
  });
  assert(insertDenied, "Non-admin INSERT unexpectedly succeeded");
  const protectedAsset = adminLibrary[0];
  const originalName = published.find((item) => item.id === protectedAsset.id).name;
  const { data: updateRows, error: updateError } = await normalSession.client.from("global_assets")
    .update({ name: "Forbidden update" }).eq("id", protectedAsset.id).select("id");
  const { data: deleteRows, error: deleteError } = await normalSession.client.from("global_assets")
    .delete().eq("id", protectedAsset.id).select("id");
  const { data: untouched } = await service.from("global_assets").select("name").eq("id", protectedAsset.id).single();
  assert((updateError || updateRows?.length === 0) && untouched.name === originalName, "Non-admin UPDATE changed the row");
  assert(deleteError || deleteRows?.length === 0, "Non-admin DELETE unexpectedly succeeded");
  let nonAdminFunctionDenied = false;
  let nonAdminFunctionStatus = null;
  try {
    await invoke(normalSession.client, "publish-global-asset", {
      sourceAssetId: archSource.id, type: "decoration", name: "Forbidden function call",
    });
  } catch (error) {
    nonAdminFunctionStatus = error.status;
    nonAdminFunctionDenied = error.status === 403 || /admin/i.test(error.message);
  }
  assert(nonAdminFunctionDenied, "Non-admin function call was not rejected");
  results.non_admin = {
    passed: true,
    publishedRead: publicRead.length,
    insertDenied: Boolean(insertDenied),
    updateDenied: Boolean(updateError) || updateRows?.length === 0,
    deleteDenied: Boolean(deleteError) || deleteRows?.length === 0,
    functionDenied: true,
    functionStatus: nonAdminFunctionStatus,
  };

  const fontGlobal = adminLibrary.find((asset) => asset.type === "font");
  const archGlobal = adminLibrary.find((asset) => asset.type === "welcome_arch");
  const backgroundGlobal = adminLibrary.find((asset) => asset.type === "welcome_background");
  const projectData = structuredClone(baseProject.project_data);
  projectData.customFonts = [...(projectData.customFonts ?? []), {
    id: `global-${fontGlobal.id}`, globalAssetId: fontGlobal.id, name: `Audit Police ${runId}`,
    family: `AuditAntiqua${runId}`, format: "ttf", url: fontGlobal.url,
  }];
  projectData.welcomePage = {
    ...(projectData.welcomePage ?? {}), enabled: true,
    showArch: true, showBackground: true,
    archId: `global-${archGlobal.id}`, backgroundId: `global-${backgroundGlobal.id}`,
    customArches: [...(projectData.welcomePage?.customArches ?? []), { id: `global-${archGlobal.id}`, globalAssetId: archGlobal.id, name: `Audit Arche ${runId}`, url: archGlobal.url }],
    customBackgrounds: [...(projectData.welcomePage?.customBackgrounds ?? []), { id: `global-${backgroundGlobal.id}`, globalAssetId: backgroundGlobal.id, name: `Audit Paysage ${runId}`, url: backgroundGlobal.url }],
  };
  const testProjectId = crypto.randomUUID();
  const { error: createProjectError } = await adminSession.client.from("projects").insert({
    id: testProjectId, owner_id: adminUser.id, name: `Audit assets globaux ${runId}`, project_data: projectData,
    status: "draft", payment_status: "unpaid", public_id: null, published_at: null,
  });
  if (createProjectError) throw createProjectError;
  cleanup.projectIds.push(testProjectId);

  const { error: unpublishError } = await adminSession.client.from("global_assets")
    .update({ is_published: false }).eq("id", archGlobal.id);
  if (unpublishError) throw unpublishError;
  const { data: hiddenArch } = await anonymous.from("global_assets").select("id").eq("id", archGlobal.id);
  const { data: persistedProject } = await service.from("projects").select("project_data").eq("id", testProjectId).single();
  assert(hiddenArch.length === 0, "Unpublished asset remains in the public library");
  assert(JSON.stringify(persistedProject.project_data).includes(archGlobal.url), "Existing project lost the unpublished asset URL");
  results.unpublish = { passed: true, hiddenFromLibrary: true, existingProjectUrlPreserved: true };
  await adminSession.client.from("global_assets").update({ is_published: true }).eq("id", archGlobal.id);

  const templateSlug = `audit-global-assets-${runId}`;
  const publishedTemplate = await invoke(adminSession.client, "publish-template", {
    projectId: testProjectId,
    name: `Audit assets globaux ${runId}`,
    slug: templateSlug,
    description: "Audit temporaire des assets globaux",
    category: "Audit",
    tags: ["audit"],
    isPublished: true,
  });
  const template = publishedTemplate?.template;
  assert(template?.id, "Template publication returned no row");
  cleanup.templateIds.push(template.id);
  const snapshotText = JSON.stringify(template.template_data);
  assert(snapshotText.includes(fontGlobal.url) && snapshotText.includes(archGlobal.url) && snapshotText.includes(backgroundGlobal.url), "Template snapshot lost a global URL");
  const { data: templateObjects, error: templateListError } = await service.storage.from("template-assets")
    .list(`templates/${template.id}`, { limit: 1000 });
  if (templateListError) throw templateListError;
  cleanup.templatePaths.push(...templateObjects.map((item) => `templates/${template.id}/${item.name}`));
  assert(!templateObjects.some((item) => cleanup.globalPaths.some((path) => path.endsWith(item.name))), "A global asset was copied to template-assets");

  const { data: instance, error: instanceError } = await normalSession.client.rpc("instantiate_project_from_template", {
    p_template_id: template.id,
    p_name: `Audit instance ${runId}`,
  }).single();
  if (instanceError) throw instanceError;
  cleanup.projectIds.push(instance.id);
  assert(instance.owner_id === normalUser.id, "Instantiated project owner is not auth.uid()");
  assert(instance.status === "draft" && instance.payment_status === "unpaid" && instance.public_id === null, "Instantiated project transactional fields are invalid");
  assert(JSON.stringify(instance.project_data).includes(fontGlobal.url), "Instantiated project lost the global font URL");
  results.template = {
    passed: true,
    globalUrlsPreserved: true,
    globalAssetsCopiedToTemplateBucket: false,
    instantiated: true,
    ownerFromAuth: true,
    status: instance.status,
    paymentStatus: instance.payment_status,
  };

  results.font_data = {
    passed: fontGlobal.metadata?.family === `AuditAntiqua${runId}` && fontGlobal.url.includes("/global-assets/"),
    family: fontGlobal.metadata?.family,
    format: fontGlobal.metadata?.format,
    stableSnapshotInTemplate: snapshotText.includes(fontGlobal.url),
  };
} finally {
  if (cleanup.templatePaths.length) await service.storage.from("template-assets").remove(cleanup.templatePaths);
  if (cleanup.projectIds.length) await service.from("projects").delete().in("id", cleanup.projectIds);
  if (cleanup.templateIds.length) await service.from("templates").delete().in("id", cleanup.templateIds);
  if (cleanup.globalIds.length) await service.from("global_assets").delete().in("id", cleanup.globalIds);
  if (cleanup.globalPaths.length) await service.storage.from("global-assets").remove(cleanup.globalPaths);
  if (cleanup.assetIds.length) await service.from("assets").delete().in("id", cleanup.assetIds);
  if (cleanup.sourcePaths.length) await service.storage.from("wedding-assets").remove(cleanup.sourcePaths);
}

console.log(JSON.stringify({ runId, results, cleanup: {
  sourceObjectsRemoved: cleanup.sourcePaths.length,
  globalRowsRemoved: cleanup.globalIds.length,
  globalObjectsRemoved: cleanup.globalPaths.length,
  projectsRemoved: cleanup.projectIds.length,
  templatesRemoved: cleanup.templateIds.length,
  templateObjectsRemoved: cleanup.templatePaths.length,
} }, null, 2));
