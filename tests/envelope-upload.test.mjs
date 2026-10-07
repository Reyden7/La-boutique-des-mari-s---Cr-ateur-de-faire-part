import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const calls = [];
let uploadError = null, metadataError = null;
globalThis.__envelopeUpload = {
  requireSupabaseSession: async () => ({ id: "owner" }),
  saveRemoteProject: async (project) => { calls.push({ op: "save", project }); return project; },
  supabase: { storage: { from: (bucket) => ({
    upload: async (path, file, options) => { calls.push({ op: "upload", bucket, path, file, options }); return { error: uploadError }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://example.invalid/storage/v1/object/public/${bucket}/${path}` } }),
    remove: async (paths) => { calls.push({ op: "remove", paths }); return { error: null }; },
  }) }, from: (table) => ({
    insert: (metadata) => { calls.push({ op: "metadata", table, metadata }); return { select: () => ({ single: async () => ({ data: metadataError ? null : { id: "asset" }, error: metadataError }) }) }; },
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { storage_path: "owner/project/envelope/bases/new.png" }, error: null }) }) }),
    delete: () => ({ eq: async () => { calls.push({ op: "delete", table }); return { error: null }; } }),
  }) },
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/src/services/assetRepository.ts")) {
      if (specifier === "../lib/supabase") return { url: "envelope-upload:supabase", shortCircuit: true };
      if (specifier === "./projectRepository") return { url: "envelope-upload:repository", shortCircuit: true };
      if (specifier === "../features/fonts/fontFile") return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  }, load(url, context, next) {
    if (url === "envelope-upload:supabase") return { format: "module", source: "export const {supabase,requireSupabaseSession}=globalThis.__envelopeUpload;", shortCircuit: true };
    if (url === "envelope-upload:repository") return { format: "module", source: "export const {saveRemoteProject}=globalThis.__envelopeUpload;", shortCircuit: true };
    return next(url, context);
  },
});
const { uploadProjectAsset, deleteProjectAssetIfUnused } = await import("../src/services/assetRepository.ts");
const project = { id: "project", ownerId: "owner" };
test("real uploader uses owned envelope paths, original File, PNG/WebP MIME and existing wedding-assets", async () => {
  for (const folder of ["envelope/bases", "envelope/flaps", "envelope/seals"]) for (const [extension, mime] of [["png", "image/png"], ["webp", "image/webp"]]) {
    calls.length = 0;
    const file = new File(["original bytes"], `Modèle.${extension}`, { type: mime });
    const asset = await uploadProjectAsset(project, file, "image", { folder });
    const upload = calls.find((call) => call.op === "upload");
    assert.equal(upload.bucket, "wedding-assets"); assert.match(upload.path, new RegExp(`^owner/project/${folder}/.+-modele\\.${extension}$`));
    assert.equal(upload.file, file); assert.deepEqual(upload.options, { contentType: mime, upsert: false });
    assert.equal(calls[0].op, "save"); assert.equal(asset.id, "asset");
    assert.equal(calls.find((call) => call.op === "metadata").metadata.owner_id, "owner");
  }
});
test("wrong owner and arbitrary folder overrides fail before any writes", async () => {
  const file = new File(["x"], "base.png", { type: "image/png" });
  calls.length = 0;
  await assert.rejects(uploadProjectAsset({ ...project, ownerId: "other" }, file, "image", { folder: "envelope/bases" }));
  await assert.rejects(uploadProjectAsset(project, file, "image", { folder: "../../other" }));
  await assert.rejects(uploadProjectAsset(project, file, "audio", { folder: "envelope/bases" }));
  assert.equal(calls.length, 0);
});
test("failed upload creates no metadata, rejected metadata cleans only newly uploaded path", async () => {
  const file = new File(["x"], "base.png", { type: "image/png" });
  uploadError = new Error("Storage down"); calls.length = 0;
  await assert.rejects(uploadProjectAsset(project, file, "image", { folder: "envelope/bases" }), /Storage down/);
  assert.equal(calls.some((call) => call.op === "metadata"), false);
  uploadError = null; metadataError = new Error("Metadata rejected"); calls.length = 0;
  await assert.rejects(uploadProjectAsset(project, file, "image", { folder: "envelope/bases" }), /Metadata rejected/);
  assert.deepEqual(calls.at(-1).paths, [calls.find((call) => call.op === "upload").path]); metadataError = null;
});
test("used image is never physically deleted; detached references are saved before deletion", async () => {
  const url = "https://example.invalid/used.png";
  calls.length = 0;
  assert.equal(await deleteProjectAssetIfUnused({ ...project, opening: { envelope: { flapAsset: { url } } } }, "asset", url), false);
  assert.equal(calls.length, 0);
  assert.equal(await deleteProjectAssetIfUnused(project, "asset", url), true);
  assert.equal(calls[0].op, "save"); assert.equal(calls[1].op, "remove"); assert.equal(calls[2].op, "delete");
});
test.after(() => { hooks.deregister(); delete globalThis.__envelopeUpload; });
