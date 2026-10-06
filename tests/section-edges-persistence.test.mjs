import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "section-edge:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "section-edge:no-network") return { format: "module", source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};", shortCircuit: true };
    return next(url, context);
  },
});
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const { getElementLayout } = await import("../src/utils/responsiveLayout.ts");
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const edge = (style) => ({ enabled: true, style, height: 36, intensity: .8, inverted: true });
const section = { id: "section", type: "section", name: "Section", x: 0, y: 0, width: 390, height: 300, rotation: 0, opacity: 1, visible: true, zIndex: 1, padding: 20, cornerRadius: 12, background: { type: "color", color: "#abc" } };
const child = { ...section, type: "image", id: "child", sectionId: "section", x: 35, y: 70, width: 180, height: 70, src: "https://example.invalid/photo.png", alt: "Photo" };
const project = { id: "edges", ownerId: "owner", name: "Projet", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: [section, child] }] };
const reset = (locked = false) => {
  useEditorStore.getState().setProject(structuredClone(project));
  useEditorStore.setState({ currentPageId: "page", selectedElementId: "section", selectedElementIds: ["section"], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });
  if (locked) useEditorStore.getState().setElementsLocked(["section"], true);
};
const current = () => useEditorStore.getState().project.pages[0].elements[0];

test("real store changes only the active edge/device and never shifts existing children", () => {
  reset();
  const store = useEditorStore.getState();
  const originalChild = structuredClone(store.project.pages[0].elements[1]);
  store.updateElementLayout("section", { bottomEdge: edge("tear") });
  assert.equal(getElementLayout(current(), "mobile").bottomEdge.style, "tear");
  assert.equal(getElementLayout(current(), "mobile").topEdge.style, "none");
  for (const device of ["tablet", "desktop"]) assert.equal(getElementLayout(current(), device).bottomEdge.style, "none");
  store.setPreviewDevice("tablet"); store.updateElementLayout("section", { topEdge: edge("wave") });
  assert.equal(getElementLayout(current(), "tablet").topEdge.style, "wave");
  assert.equal(getElementLayout(current(), "mobile").topEdge.style, "none");
  assert.deepEqual(useEditorStore.getState().project.pages[0].elements[1], originalChild);
  store.undo(); assert.equal(getElementLayout(current(), "tablet").topEdge.style, "none");
  store.redo(); assert.equal(getElementLayout(current(), "tablet").topEdge.style, "wave");
});
test("locked section keeps geometry frozen but permits decorative appearance changes", () => {
  reset(true);
  useEditorStore.getState().updateElementLayout("section", { topEdge: edge("scallop"), x: 999, width: 800 });
  assert.equal(current().x, 0); assert.equal(current().width, 390);
  assert.equal(getElementLayout(current(), "mobile").topEdge.style, "scallop");
});
test("local save/reload, actual duplication and template instantiation preserve both edge configs", () => {
  reset(); const store = useEditorStore.getState();
  store.updateElementLayout("section", { topEdge: edge("scallop"), bottomEdge: edge("diagonal") });
  store.setPreviewDevice("desktop"); store.updateElementLayout("section", { bottomEdge: edge("paper-cut") });
  const source = structuredClone(current());
  store.duplicateElement("section");
  const duplicate = useEditorStore.getState().project.pages[0].elements.find((item) => item.type === "section" && item.id !== "section");
  for (const device of ["mobile", "tablet", "desktop"]) {
    assert.deepEqual(getElementLayout(duplicate, device).topEdge, getElementLayout(source, device).topEdge);
    assert.deepEqual(getElementLayout(duplicate, device).bottomEdge, getElementLayout(source, device).bottomEdge);
  }
  upsertProject(useEditorStore.getState().project);
  const loaded = getProject(project.id, "owner");
  const template = { name: "Modèle", templateData: sanitizeProjectForTemplate(loaded) };
  const instance = instantiateProjectFromTemplate(template, "another-owner");
  for (const candidate of [loaded, instance]) for (const device of ["mobile", "tablet", "desktop"]) {
    const actual = getElementLayout(candidate.pages[0].elements.find((item) => item.id === "section"), device);
    assert.deepEqual(actual.topEdge, getElementLayout(source, device).topEdge);
    assert.deepEqual(actual.bottomEdge, getElementLayout(source, device).bottomEdge);
  }
  instance.pages[0].elements[0].topEdge.height = 99;
  assert.equal(template.templateData.pages[0].elements[0].topEdge.height, 36);
});
test.after(() => { hooks.deregister(); delete globalThis.localStorage; });
