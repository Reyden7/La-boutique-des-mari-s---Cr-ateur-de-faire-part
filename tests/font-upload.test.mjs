import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Exercise the real upload service with isolated Auth/Storage adapters. No
// Supabase project is contacted and no file or project is persisted.
const calls = [];
globalThis.__fontUploadMock = {
  requireSupabaseSession: async () => ({ id: "owner" }),
  saveRemoteProject: async (project) => { calls.push({ operation: "save" }); return project; },
  supabase: {
    storage: { from: (bucket) => ({
      upload: async (path, file, options) => { calls.push({ operation: "upload", bucket, path, file, options }); return { error: null }; },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://example.invalid/${bucket}/${path}` } }),
    }) },
    from: () => ({ insert: (metadata) => {
      calls.push({ operation: "metadata", metadata });
      return { select: () => ({ single: async () => ({ data: { id: "asset" }, error: null }) }) };
    } }),
  },
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/src/services/assetRepository.ts")) {
      if (specifier === "../lib/supabase") return { url: "font-test:supabase", shortCircuit: true };
      if (specifier === "./projectRepository") return { url: "font-test:repository", shortCircuit: true };
      if (specifier === "../features/fonts/fontFile") return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "font-test:supabase") return { format: "module", source: "export const {supabase, requireSupabaseSession} = globalThis.__fontUploadMock;", shortCircuit: true };
    if (url === "font-test:repository") return { format: "module", source: "export const {saveRemoteProject} = globalThis.__fontUploadMock;", shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { uploadProjectAsset } = await import("../src/services/assetRepository.ts");

test("the real Storage upload always sends contentType font/ttf for TTF", async () => {
  for (const type of ["", "application/octet-stream", "font/ttf"]) {
    calls.length = 0;
    const file = new File([new Uint8Array([0, 1, 0, 0])], "STARWARS.TTF", { type });
    await uploadProjectAsset({ id: "project", ownerId: "owner" }, file, "font");
    const upload = calls.find((call) => call.operation === "upload");
    assert.equal(upload.bucket, "wedding-assets");
    assert.match(upload.path, /^owner\/project\/fonts\/.+-starwars\.ttf$/);
    assert.deepEqual(upload.options, { contentType: "font/ttf", upsert: false });
    assert.equal(calls.find((call) => call.operation === "metadata").metadata.mime_type, "font/ttf");
  }
});

test("invalid extensions and ownership mismatch never reach Storage", async () => {
  calls.length = 0;
  await assert.rejects(uploadProjectAsset({ id: "project", ownerId: "owner" }, new File(["x"], "font.exe"), "font"), /Format de police non pris en charge\. Utilisez TTF, OTF, WOFF ou WOFF2\./);
  await assert.rejects(uploadProjectAsset({ id: "project", ownerId: "other" }, new File(["x"], "font.ttf"), "font"), /Associez d’abord/);
  assert.equal(calls.length, 0);
});

test.after(() => { hooks.deregister(); delete globalThis.__fontUploadMock; });
