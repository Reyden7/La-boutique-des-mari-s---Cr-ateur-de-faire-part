import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { decodeRgba, neutralTemplate } from "../scripts/generate-envelope-templates.mjs";
import { ENVELOPE_PARTS, ENVELOPE_PART_FIELDS, ENVELOPE_PRESETS, resolveEnvelopeAsset, removeEnvelopeCustom, validateEnvelopeFile, ENVELOPE_MAX_FILE_BYTES } from "../src/features/openings/envelopeAssets.ts";
import { getPngEnvelopeLayout } from "../src/features/openings/pngEnvelopeLayout.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "envelope:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "envelope:no-network") return { format: "module", source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};", shortCircuit: true };
    return next(url, context);
  },
});
const { normalizeProject, upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const custom = (part) => ({ type: "custom", id: `custom-${part}`, name: part, assetId: `asset-${part}`, url: `https://example.invalid/storage/v1/object/public/wedding-assets/owner/project/${ENVELOPE_PART_FIELDS[part].folder}/image.png`, width: 941, height: 1672 });
const envelope = Object.fromEntries(ENVELOPE_PARTS.flatMap((part) => [[ENVELOPE_PART_FIELDS[part].active, custom(part)], [ENVELOPE_PART_FIELDS[part].library, [custom(part)]]]));
const project = normalizeProject({ id: "envelope-project", ownerId: "owner", name: "Enveloppe", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: [] }], opening: { type: "envelope", duration: 1.5, envelope } });

test("three independent catalogues have stable IDs and exact original PNG dimensions", () => {
  for (const part of ENVELOPE_PARTS) {
    assert.equal(ENVELOPE_PRESETS[part].length, 3);
    assert.equal(new Set(ENVELOPE_PRESETS[part].map((item) => item.id)).size, 3);
    for (const preset of ENVELOPE_PRESETS[part]) {
      const { width, height, pixels } = decodeRgba(readFileSync(new URL(`../public${preset.url}`, import.meta.url)));
      assert.equal(width, preset.width); assert.equal(height, preset.height);
      assert.ok(pixels.some((value, i) => i % 4 === 3 && value === 0));
    }
  }
});

test("old/invalid configs use corresponding defaults; presets resolve by ID, not filename", () => {
  for (const part of ENVELOPE_PARTS) {
    const field = ENVELOPE_PART_FIELDS[part].active;
    for (const config of [undefined, {}, { [field]: { type: "preset", id: "unknown", url: "/rabat2.png" } }, { [field]: { type: "custom", url: "javascript:alert(1)" } }]) assert.deepEqual(resolveEnvelopeAsset(config, part), ENVELOPE_PRESETS[part][0]);
    assert.deepEqual(resolveEnvelopeAsset({ [field]: { type: "preset", id: ENVELOPE_PRESETS[part][2].id, url: "wrong-name" } }, part), ENVELOPE_PRESETS[part][2]);
  }
});

test("all supplied base/flap pairs close without a slit, preserving contain and fixed geometry", () => {
  const images = (part) => ENVELOPE_PRESETS[part].map((asset) => decodeRgba(readFileSync(new URL(`../public${asset.url}`, import.meta.url))));
  const bases = images("base"), flaps = images("flap");
  const alpha = (image, box, x, y) => {
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const sx = Math.floor((x - box.x - (box.width - image.width * scale) / 2) / scale), sy = Math.floor((y - box.y - (box.height - image.height * scale) / 2) / scale);
    return sx < 0 || sy < 0 || sx >= image.width || sy >= image.height ? 0 : image.pixels[(sy * image.width + sx) * 4 + 3];
  };
  for (const [w, h] of [[320,568], [390,844], [430,932]]) for (const base of bases) for (const flap of flaps) {
    const layout = getPngEnvelopeLayout(w, h);
    for (let y = 4; y < h - 4; y += 8) for (let x = 4; x < w - 4; x += 8) assert.ok(Math.max(alpha(base, layout.base, x, y), alpha(flap, layout.flap, x, y)) >= 220);
  }
});

test("mixing all preset/custom/global combinations does not alter another part", () => {
  for (const base of [ENVELOPE_PRESETS.base[1], custom("base")]) for (const flap of [ENVELOPE_PRESETS.flap[2], custom("flap")]) for (const seal of [ENVELOPE_PRESETS.seal[0], custom("seal"), { type: "global", id: "global-seal", url: "https://example.invalid/storage/v1/object/public/global-assets/seal.png" }]) {
    const config = { baseAsset: base, flapAsset: flap, sealAsset: seal };
    for (const [part, expected] of [["base", base], ["flap", flap], ["seal", seal]]) assert.deepEqual(resolveEnvelopeAsset(config, part), expected);
  }
});

test("extension AND MIME validation accepts PNG/WebP only, empty files and >5 MiB fail", () => {
  for (const [ext, type] of [["png", "image/png"], ["webp", "image/webp"]]) assert.equal(validateEnvelopeFile({ name: `IMAGE.${ext.toUpperCase()}`, type, size: ENVELOPE_MAX_FILE_BYTES }), type);
  for (const file of [ { name: "x.jpg", type: "image/jpeg", size: 1 }, { name: "x.png", type: "image/webp", size: 1 }, { name: "x.png", type: "", size: 1 }, { name: "x.svg", type: "image/png", size: 1 }, { name: "x.png", type: "image/png", size: 0 }, { name: "x.png", type: "image/png", size: ENVELOPE_MAX_FILE_BYTES + 1 } ]) assert.throws(() => validateEnvelopeFile(file));
});

test("delete selected custom resets only its part; nonselected deletion retains current choice", () => {
  for (const part of ENVELOPE_PARTS) {
    const fields = ENVELOPE_PART_FIELDS[part];
    const next = removeEnvelopeCustom(envelope, part, custom(part).id);
    assert.deepEqual(next[fields.active], ENVELOPE_PRESETS[part][0]); assert.deepEqual(next[fields.library], []);
    for (const other of ENVELOPE_PARTS.filter((p) => p !== part)) assert.deepEqual(next[ENVELOPE_PART_FIELDS[other].active], custom(other));
    assert.deepEqual(removeEnvelopeCustom({ ...envelope, [fields.active]: ENVELOPE_PRESETS[part][2] }, part, custom(part).id)[fields.active], ENVELOPE_PRESETS[part][2]);
  }
  assert.deepEqual(project.opening.envelope, envelope);
});

test("project save/reload and template instantiation retain refs, libraries and independent copies", () => {
  upsertProject(project);
  assert.deepEqual(getProject(project.id, "owner").opening.envelope, envelope);
  const template = { name: "Modèle", templateData: sanitizeProjectForTemplate(project) };
  const instance = instantiateProjectFromTemplate(template, "new-owner");
  assert.deepEqual(instance.opening.envelope, envelope);
  instance.opening.envelope.baseAsset.name = "Changed";
  instance.opening.envelope.customBases[0].name = "Changed library";
  assert.equal(template.templateData.opening.envelope.baseAsset.name, "base");
  assert.equal(template.templateData.opening.envelope.customBases[0].name, "base");
});

test("global envelope refs survive save/reload, template sanitization and independent instantiation", () => {
  const globals = Object.fromEntries(ENVELOPE_PARTS.map((part) => [ENVELOPE_PART_FIELDS[part].active, { type: "global", id: `global-${part}`, name: part, url: `https://example.invalid/storage/v1/object/public/global-assets/${ENVELOPE_PART_FIELDS[part].folder}/global.png` }]));
  const source = { ...project, id: "global-envelope-project", opening: { ...project.opening, envelope: globals } };
  upsertProject(source);
  assert.deepEqual(getProject(source.id, "owner").opening.envelope, globals);
  const template = { name: "Global envelope", templateData: sanitizeProjectForTemplate(source) };
  const instance = instantiateProjectFromTemplate(template, "other-owner");
  assert.deepEqual(instance.opening.envelope, globals);
  assert.notEqual(instance.id, source.id);
  assert.equal(instance.ownerId, "other-owner");
  instance.opening.envelope.baseAsset.name = "Independent";
  assert.equal(template.templateData.opening.envelope.baseAsset.name, "base");
  assert.equal(source.opening.envelope.baseAsset.name, "base");
});

test("downloadable guides preserve every source alpha pixel, canvas and neutral RGB", () => {
  for (const part of ENVELOPE_PARTS) {
    const originalBytes = readFileSync(new URL(`../public${ENVELOPE_PRESETS[part][0].url}`, import.meta.url));
    const guideBytes = readFileSync(new URL(`../public/envelope-templates/envelope-${part}-template.png`, import.meta.url));
    assert.deepEqual(guideBytes, neutralTemplate(originalBytes));
    const original = decodeRgba(originalBytes), guide = decodeRgba(guideBytes);
    assert.equal(guide.width, original.width); assert.equal(guide.height, original.height);
    for (let i = 0; i < original.pixels.length; i++) assert.equal(guide.pixels[i], i % 4 === 3 ? original.pixels[i] : 160);
  }
});

test("controls use shared UI sections, lazy original thumbnails and persist-before-delete helper", () => {
  const ui = read("src/features/openings/EnvelopeAssetControls.tsx");
  assert.match(ui, /<PropertySection sectionKey=\{`envelope-\$\{part\}`\}/);
  assert.match(ui, /loading="lazy"/); assert.match(ui, /download=\{/);
  assert.match(ui, /role="alertdialog"/); assert.match(ui, /deleteProjectAssetIfUnused\(latest/);
  assert.match(ui, /await decodeEnvelopeFile\(file\)[\s\S]*?await uploadProjectAsset/);
  assert.match(ui, /Dimensions différentes du modèle/);
  assert.doesNotMatch(ui, /canvas|toDataURL|colorize/);
  const renderer = read("src/features/openings/animations/PngEnvelopeOpening.tsx");
  assert.match(renderer, /failedUrls\[selected\] \? PNG_ENVELOPE_ASSETS\[part\]/);
  assert.match(renderer, /assetsSettled[\s\S]*ready\[src\] \|\| failedUrls\[src\]/);
});

test.after(() => { hooks.deregister(); delete globalThis.localStorage; });
