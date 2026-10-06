import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Real Edge handlers, isolated fake Auth/DB/Storage. No credentials or network.
let user, source, snapshot, copyError;
const calls = [];
const reset = () => {
  user = { id: "owner", app_metadata: { role: "admin" } };
  source = { id: "asset", owner_id: "owner", kind: "image", storage_path: "owner/project/program-icons/icon.png", mime_type: "image/png", size_bytes: 1024 };
  snapshot = {}; copyError = null; calls.length = 0;
};
reset();
const client = {
  auth: { getUser: async () => ({ data: { user }, error: null }) },
  rpc: async (name, args) => { calls.push({ op: "rpc", name, args }); return { data: { id: "template", template_data: snapshot }, error: null }; },
  from: (table) => {
    let mutation, filters = [];
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push([key, value]); return query; },
      update: (data) => { mutation = data; calls.push({ op: "update", table, data }); return query; },
      insert: (data) => { mutation = data; calls.push({ op: "insert", table, data }); return query; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => table === "assets"
        ? { data: filters.every(([key, value]) => source[key] === value) ? source : null, error: null }
        : { data: { id: table === "templates" ? "template" : "global", ...mutation }, error: null },
    };
    return query;
  },
  storage: { from: (bucket) => ({
    copy: async (path, destination, options) => { calls.push({ op: "copy", bucket, path, destination, options }); return { error: copyError }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://example.invalid/storage/v1/object/public/${bucket}/${path}` } }),
    remove: async (paths) => { calls.push({ op: "remove", bucket, paths }); return { error: null }; },
  }) },
};
globalThis.__iconEdgeClient = client;
let handler;
globalThis.Deno = { env: { get: (name) => ({ SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "fake-anon", SUPABASE_SERVICE_ROLE_KEY: "fake-service" })[name] }, serve: (callback) => { handler = callback; } };
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("npm:@supabase/supabase-js@")) return { url: "icon-edge:client", shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "icon-edge:client") return { format: "module", source: "export const createClient=()=>globalThis.__iconEdgeClient;", shortCircuit: true };
    return next(url, context);
  },
});
await import("../supabase/functions/publish-template/index.ts");
const publishTemplate = handler;
await import("../supabase/functions/publish-global-asset/index.ts");
const publishGlobal = handler;
const request = (body, authorized = true) => new Request("https://example.invalid", { method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer fixture" } : {}) }, body: JSON.stringify(body) });
const globalBody = { type: "program_icon", sourceAssetId: "asset", name: "Planète" };
const templateBody = { projectId: "project", name: "Mariage", slug: "mariage", category: "mariage", isPublished: true };

test("template copies nested project icons once, rewrites active/cache URLs and preserves global URLs", async () => {
  reset();
  const local = "https://example.invalid/storage/v1/object/public/wedding-assets/owner/project/program-icons/icone.png";
  const global = "https://example.invalid/storage/v1/object/public/global-assets/program-icons/global.webp";
  snapshot = { pages: [{ elements: [{ type: "schedule", iconSize: 28, items: [
    { time: "16:00", title: "Accueil", icon: { type: "custom", url: local }, customIcon: { type: "custom", url: local } },
    { time: "18:00", icon: { type: "custom", url: global, globalAssetId: "global" } },
  ] }] }] };
  const response = await publishTemplate(request(templateBody));
  assert.equal(response.status, 200);
  const copies = calls.filter((call) => call.op === "copy");
  assert.equal(copies.length, 1);
  assert.equal(copies[0].path, "owner/project/program-icons/icone.png");
  assert.match(copies[0].destination, /^templates\/template\/.+-icone\.png$/);
  assert.equal(copies[0].options.destinationBucket, "template-assets");
  assert.equal(calls.find((call) => call.op === "rpc").args.p_is_published, false);
  const data = (await response.json()).template.template_data;
  const items = data.pages[0].elements[0].items;
  assert.match(items[0].icon.url, /\/template-assets\/templates\/template\//);
  assert.equal(items[0].customIcon.url, items[0].icon.url);
  assert.equal(items[1].icon.url, global);
  assert.equal(items[0].title, "Accueil");
  assert.equal(calls.at(-1).data.is_published, true);
});

test("template copy failure never publishes the template", async () => {
  reset(); snapshot = { icon: { type: "custom", url: "https://example.invalid/storage/v1/object/public/wedding-assets/owner/icon.png" } };
  copyError = new Error("fixture copy failure");
  const response = await publishTemplate(request(templateBody));
  assert.equal(response.status, 500);
  assert.equal(calls.find((call) => call.op === "rpc").args.p_is_published, false);
  assert.equal(calls.some((call) => call.op === "update"), false);
});

test("global program_icon publishes only after a durable copy into global-assets", async () => {
  reset();
  const response = await publishGlobal(request(globalBody));
  assert.equal(response.status, 200);
  const { asset } = await response.json();
  assert.equal(asset.type, "program_icon");
  assert.equal(asset.is_published, true);
  assert.match(asset.url, /\/global-assets\/program-icons\//);
  assert.equal(asset.thumbnail_url, asset.url);
  assert.equal(asset.metadata.mimeType, "image/png");
  assert.equal(calls[0].op, "copy");
  assert.equal(calls[0].options.destinationBucket, "global-assets");
  assert.equal(calls[1].op, "insert");
});

test("anonymous/non-admin cannot publish; ownership, format and size are validated before copying", async () => {
  for (const [role, expected] of [[null, 401], ["user", 403]]) {
    reset(); user = role ? { id: "owner", app_metadata: { role } } : null;
    assert.equal((await publishGlobal(request(globalBody))).status, expected);
    assert.equal(calls.length, 0);
  }
  reset(); assert.equal((await publishGlobal(request(globalBody, false))).status, 401);
  for (const [change, status] of [[{ owner_id: "other" }, 404], [{ storage_path: "other/project/icon.png" }, 400], [{ storage_path: "owner/icon.svg", mime_type: "image/svg+xml" }, 400], [{ size_bytes: 5 * 1024 * 1024 + 1 }, 400]]) {
    reset(); Object.assign(source, change);
    assert.equal((await publishGlobal(request(globalBody))).status, status);
    assert.equal(calls.length, 0);
  }
});

test("global copy failure creates no published record", async () => {
  reset(); copyError = new Error("fixture copy failure");
  assert.equal((await publishGlobal(request(globalBody))).status, 500);
  assert.equal(calls.some((call) => call.op === "insert"), false);
  assert.equal(calls.at(-1).op, "remove");
});

test.after(() => { hooks.deregister(); delete globalThis.Deno; delete globalThis.__iconEdgeClient; });
