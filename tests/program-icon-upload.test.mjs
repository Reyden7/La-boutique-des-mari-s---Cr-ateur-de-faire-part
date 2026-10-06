import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const calls = [];
let uploadError = null, metadataError = null;
globalThis.__programIconUploadMock = {
  requireSupabaseSession: async () => ({ id: "owner" }),
  saveRemoteProject: async (project) => { calls.push({ operation: "save" }); return project; },
  supabase: { storage: { from: (bucket) => ({
    upload: async (path, file, options) => { calls.push({ operation: "upload", bucket, path, file, options }); return { error: uploadError }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://example.invalid/storage/v1/object/public/${bucket}/${path}` } }),
    remove: async (paths) => { calls.push({ operation: "remove", paths }); return { error: null }; },
  }) }, from: () => ({ insert: (metadata) => { calls.push({ operation: "metadata", metadata }); return { select: () => ({ single: async () => ({ data: metadataError ? null : { id: "asset" }, error: metadataError }) }) }; } }) },
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/src/services/programIconRepository.ts") && specifier === "./assetRepository") return nextResolve(`${specifier}.ts`, context);
    if (context.parentURL?.endsWith("/src/services/assetRepository.ts")) {
      if (specifier === "../lib/supabase") return { url: "icon-test:supabase", shortCircuit: true };
      if (specifier === "./projectRepository") return { url: "icon-test:repository", shortCircuit: true };
      if (specifier === "../features/fonts/fontFile") return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  }, load(url, context, nextLoad) {
    if (url === "icon-test:supabase") return { format: "module", source: "export const {supabase,requireSupabaseSession}=globalThis.__programIconUploadMock;", shortCircuit: true };
    if (url === "icon-test:repository") return { format: "module", source: "export const {saveRemoteProject}=globalThis.__programIconUploadMock;", shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { uploadProgramIconAsset } = await import("../src/services/programIconRepository.ts");
const project = { id: "project", ownerId: "owner" };

test("PNG and WebP uploads use wedding-assets, the owned program-icons path and canonical MIME", async () => {
  for (const [extension, mime] of [["png", "image/png"], ["webp", "image/webp"], ["jpg", "image/jpeg"]]) for (const type of [mime, "", "application/octet-stream"]) {
    calls.length = 0;
    const file = new File(["fixture"], `Planète.${extension}`, { type });
    const icon = await uploadProgramIconAsset(project, file);
    const upload = calls.find((call) => call.operation === "upload");
    assert.equal(upload.bucket, "wedding-assets");
    assert.match(upload.path, new RegExp(`^owner/project/program-icons/.+-planete\\.${extension}$`));
    assert.deepEqual(upload.options, { contentType: mime, upsert: false });
    assert.equal(upload.file.type, mime);
    assert.deepEqual(icon, { type: "custom", url: `https://example.invalid/storage/v1/object/public/wedding-assets/${upload.path}`, assetId: "asset", name: file.name });
    assert.equal(calls.find((call) => call.operation === "metadata").metadata.kind, "image");
  }
});

test("unsupported, mismatched MIME, too large and wrong-owner uploads never write to Storage", async () => {
  for (const file of [new File(["x"], "icon.svg", { type: "image/svg+xml" }), new File(["x"], "icon.png", { type: "text/html" }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], "icon.png", { type: "image/png" })]) {
    calls.length = 0;
    await assert.rejects(uploadProgramIconAsset(project, file));
    assert.equal(calls.length, 0);
  }
  calls.length = 0;
  await assert.rejects(uploadProgramIconAsset({ ...project, ownerId: "other" }, new File(["x"], "icon.png", { type: "image/png" })));
  assert.equal(calls.length, 0);
});

test("upload failure returns no selectable icon; metadata failure cleans only the newly uploaded file", async () => {
  uploadError = new Error("Storage down"); calls.length = 0;
  await assert.rejects(uploadProgramIconAsset(project, new File(["x"], "icon.png", { type: "image/png" })), /Storage down/);
  assert.equal(calls.some((call) => call.operation === "metadata"), false);
  uploadError = null; metadataError = new Error("Metadata rejected"); calls.length = 0;
  await assert.rejects(uploadProgramIconAsset(project, new File(["x"], "icon.png", { type: "image/png" })), /Metadata rejected/);
  assert.deepEqual(calls.find((call) => call.operation === "remove").paths, [calls.find((call) => call.operation === "upload").path]);
  metadataError = null;
});

test.after(() => { hooks.deregister(); delete globalThis.__programIconUploadMock; });
