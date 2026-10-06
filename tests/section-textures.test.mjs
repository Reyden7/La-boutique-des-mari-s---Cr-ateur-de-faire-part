import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SECTION_TEXTURES, resolveSectionTexture } from "../src/config/sectionTextures.ts";

const url = new URL("../src/features/elements/SectionSurface.tsx", import.meta.url);
const compiled = await transformWithOxc(readFileSync(url, "utf8"), fileURLToPath(url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "texture:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(path, context, next) {
    if (path === "texture:no-network") return { format: "module", shortCircuit: true, source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};" };
    if (path === url.href) return { format: "module", shortCircuit: true, source: 'import React from "react";\n' + compiled.code };
    return next(path, context);
  },
});
const { SectionSurface } = await import("../src/features/elements/SectionSurface.tsx");
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { getElementLayout } = await import("../src/utils/responsiveLayout.ts");
const { upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const base = { id: "s", type: "section", name: "Section", x: 0, y: 0, width: 390, height: 320, rotation: 0, opacity: 1, visible: true, zIndex: 1, padding: 20, cornerRadius: 12, background: { type: "color", color: "#e8d5bd" }, isLastSection: true };
const render = (changes = {}, device = "mobile") => {
  const element = { ...base, ...changes };
  return renderToStaticMarkup(createElement(SectionSurface, { element, layout: getElementLayout(element, device) }));
};

test("eleven unique lightweight internal textures with no remote dependency", () => {
  assert.equal(SECTION_TEXTURES.length, 11);
  assert.equal(new Set(SECTION_TEXTURES.map((item) => item.id)).size, 11);
  for (const item of SECTION_TEXTURES) {
    assert.match(item.url, /^data:image\/svg\+xml,/);
    const svg = decodeURIComponent(item.url.split(",")[1]);
    assert.match(svg, /width="256" height="256"/);
    assert.doesNotMatch(svg, /<\/[^>]+\/>/);
    assert.doesNotMatch(svg, /<script|href=|https:\/\/(?!www.w3.org)/);
    assert.ok(item.url.length < 2500);
  }
});
test("legacy color, gradient and image sections retain their base and no texture", () => {
  for (const background of [base.background, { type: "gradient", gradient: { type: "linear", color1: "#fff", color2: "#000", angle: 45 } }, { type: "image", imageUrl: "/photo.png" }]) {
    assert.doesNotMatch(render({ background }), /data-section-texture/);
    assert.equal(resolveSectionTexture({ textureId: "soft-paper" }, 390, 320).showBase, true);
  }
  assert.match(render(), /fill="#e8d5bd"/);
});
test("texture-only omits base paint, combination retains it, none is a safe no-op", () => {
  assert.doesNotMatch(render({ backgroundType: "texture", textureId: "canvas" }), /fill="#e8d5bd"/);
  assert.match(render({ backgroundType: "color-texture", textureId: "canvas" }), /data-section-texture="canvas"/);
  assert.match(render({ backgroundType: "texture", textureId: "canvas" }), /data-section-texture="canvas"/);
  assert.doesNotMatch(render({ backgroundType: "texture", textureId: "unknown" }), /data-section-texture/);
});
test("opacity and scale clamp invalid values and modes share centered geometry", () => {
  assert.equal(resolveSectionTexture({}, 390, 320).opacity, .3);
  assert.equal(resolveSectionTexture({ textureOpacity: 0 }, 390, 320).opacity, 0);
  assert.equal(resolveSectionTexture({ textureOpacity: 5, textureScale: -1 }, 390, 320).scale, .125);
  assert.equal(resolveSectionTexture({ textureOpacity: 5 }, 390, 320).opacity, 1);
  assert.equal(resolveSectionTexture({ textureScale: NaN }, 390, 320).scale, 1);
  for (const [textureFit, size] of [["repeat", 256], ["cover", 390], ["contain", 320]]) {
    const resolved = resolveSectionTexture({ textureFit }, 390, 320);
    assert.equal(resolved.size, size);
    assert.equal(resolved.x, textureFit === "repeat" ? 0 : (390 - size) / 2);
    assert.equal(resolved.y, textureFit === "repeat" ? 0 : (320 - size) / 2);
  }
});
test("texture is inside decorative and rounded clips on each responsive layout", () => {
  for (const device of ["mobile", "tablet", "desktop"]) {
    const html = render({ backgroundType: "color-texture", textureId: "parchment", textureOpacity: .45, responsive: { tablet: { width: 768 }, desktop: { width: 1440 } }, bottomEdge: { enabled: true, style: "tear", height: 36 } }, device);
    assert.match(html, /<g clip-path="[^\"]+"><g clip-path="[^\"]+">.*data-section-texture="parchment"/);
    const surface = decodeURIComponent(resolveSectionTexture({ ...base, backgroundType: "color-texture", textureId: "parchment", textureOpacity: .45 }, 390, 320).materialSrc.split(",")[1]);
    assert.match(surface, /fill="#e8d5bd"/);
    assert.match(html, /opacity="1" data-section-texture/);
  }
});

const decodeSvg = (url) => decodeURIComponent(url.slice(url.indexOf(",") + 1));
const tintedSvg = (surface) => decodeSvg(surface.match(/<image href="([^"]+)"/)[1]);
test("all combined presets use neutral luminance and olive RGB modulation, never raw beige paint", () => {
  for (const preset of SECTION_TEXTURES) {
    const config = { ...base, background: { type: "color", color: "#85855F" }, backgroundType: "color-texture", textureId: preset.id, textureOpacity: 1 };
    const resolved = resolveSectionTexture(config, 390, 340);
    const surface = decodeSvg(resolved.materialSrc), tinted = tintedSvg(surface);
    assert.match(surface, /fill="#85855F"/);
    assert.match(tinted, /fill="#808080"/);
    assert.match(tinted, /feColorMatrix type="saturate" values="0"/);
    assert.match(tinted, /color-interpolation-filters="sRGB"/);
    const values = ["R", "G", "B"].map((channel) => tinted.match(new RegExp(`<feFunc${channel} type="table" tableValues="([^"]+)"`))[1].split(" ").map(Number));
    assert.deepEqual(values[0], values[1]);
    for (let i = 0; i < values[0].length; i++) assert.ok(Math.abs(values[2][i] / values[0][i] - 95 / 133) < .00001);
    assert.ok(Math.min(...values[0]) >= 133 / 255 * .82 - .000001);
    assert.ok(Math.max(...values[0]) <= 133 / 255 * 1.18 + .000001);
    assert.equal(resolveSectionTexture({ ...config, backgroundType: "texture" }, 390, 340).materialSrc, undefined);
    assert.equal(resolveSectionTexture(config, 390, 340).materialSrc, resolved.materialSrc);
  }
});
test("zero strength is exactly base RGB; increasing strength only increases tonal contrast", () => {
  const ranges = [];
  for (const textureOpacity of [0, .25, .5, 1]) {
    const resolved = resolveSectionTexture({ ...base, backgroundType: "color-texture", textureId: "organic", textureOpacity }, 390, 340);
    const tinted = tintedSvg(decodeSvg(resolved.materialSrc));
    const values = tinted.match(/<feFuncR type="table" tableValues="([^"]+)"/)[1].split(" ").map(Number);
    ranges.push(Math.max(...values) - Math.min(...values));
  }
  assert.equal(ranges[0], 0);
  assert.ok(ranges[1] < ranges[2] && ranges[2] < ranges[3]);
});
test("combined surface retains alpha once, including transparent backgrounds and saturated colors", () => {
  for (const color of ["#85855F80", "#85855F00", "#ff0000", "#000000", "#ffffff"]) {
    const resolved = resolveSectionTexture({ ...base, background: { type: "color", color }, backgroundType: "color-texture", textureId: "wet-paper", textureOpacity: 1 }, 390, 340);
    const surface = decodeSvg(resolved.materialSrc), tinted = tintedSvg(surface);
    assert.equal((surface.match(/<g opacity=/g) ?? []).length, 1);
    assert.match(tinted, /feFuncA type="table" tableValues="1 1"/);
    for (const match of tinted.matchAll(/feFunc[RGB] type="table" tableValues="([^"]+)"/g)) assert.ok(match[1].split(" ").map(Number).every((n) => n >= 0 && n <= 1));
  }
});
test("real store, undo/redo, duplication, save/reload and templates preserve texture data", () => {
  const project = { id: "texture-test", ownerId: "owner", name: "Texture test", pages: [{ id: "page", name: "Page", background: { type: "color", color: "#fff" }, elements: [base] }] };
  useEditorStore.getState().setProject(structuredClone(project));
  useEditorStore.setState({ currentPageId: "page", selectedElementId: "s", selectedElementIds: ["s"], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });
  const state = useEditorStore.getState();
  const config = { backgroundType: "color-texture", textureId: "canvas", textureOpacity: .4, textureScale: 1.5, textureFit: "repeat" };
  state.updateElement("s", config);
  assert.equal(getElementLayout(useEditorStore.getState().project.pages[0].elements[0], "mobile").isLastSection, true);
  state.undo(); assert.equal(useEditorStore.getState().project.pages[0].elements[0].textureId, undefined);
  state.redo(); state.duplicateElement("s");
  upsertProject(useEditorStore.getState().project);
  const saved = getProject(project.id, "owner");
  const instantiated = instantiateProjectFromTemplate({ name: "Model", templateData: sanitizeProjectForTemplate(saved) }, "other");
  for (const element of [...saved.pages[0].elements, ...instantiated.pages[0].elements]) {
    for (const [key, value] of Object.entries(config)) assert.equal(element[key], value);
  }
});
