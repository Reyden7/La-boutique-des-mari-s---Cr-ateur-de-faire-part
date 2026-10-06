import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "image-qa:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "image-qa:no-network") return { format: "module", source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};", shortCircuit: true };
    return next(url, context);
  },
});
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { resolveImageAppearance, setImageAppearanceForDevice, resolveImageFade } = await import("../src/utils/imageAppearance.ts");
const { getElementLayout } = await import("../src/utils/responsiveLayout.ts");
const { upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map(); globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const source = { id: "photo", type: "image", name: "Photo", src: "https://example.invalid/photo.png", alt: "Local fixture", width: 220, height: 100, x: 20, y: 30, rotation: 0, opacity: 1, fit: "contain", zIndex: 1, locked: false, visible: true, animation: { type: "none", duration: .8, delay: 0 } };
const reset = () => {
  useEditorStore.getState().setProject({ id: "image-project", ownerId: "owner", name: "Image QA", introductionMode: "none", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: [structuredClone(source)] }] });
  useEditorStore.setState({ currentPageId: "page", selectedElementId: source.id, selectedElementIds: [source.id], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });
};
const photo = () => useEditorStore.getState().project.pages[0].elements.find((x) => x.id === source.id);
test("real store retains appearance on save/reload, duplicates and template snapshots", () => {
  reset(); const store = useEditorStore.getState();
  store.updateElement(source.id, setImageAppearanceForDevice(photo(), "mobile", { bottomEdge: { enabled: true, style: "tear", height: 32, intensity: .7 }, topFade: resolveImageFade({ enabled: true }) }));
  store.setPreviewDevice("desktop"); store.updateElement(source.id, setImageAppearanceForDevice(photo(), "desktop", { bottomFade: resolveImageFade({ enabled: true, blur: 12, opacity: .1 }) }));
  const expected = structuredClone(photo().imageStyle);
  upsertProject(useEditorStore.getState().project); const restored = getProject("image-project", "owner");
  assert.deepEqual(restored.pages[0].elements[0].imageStyle, expected);
  store.setProject(restored); store.selectElement(source.id);
  assert.deepEqual(photo().imageStyle, expected);
  store.duplicateElement(source.id); const copy = useEditorStore.getState().project.pages[0].elements.find((x) => x.id !== source.id);
  assert.deepEqual(copy.imageStyle, expected); assert.notEqual(copy.id, source.id);
  const snapshot = sanitizeProjectForTemplate(useEditorStore.getState().project);
  const instance = instantiateProjectFromTemplate({ name: "Photo template", templateData: snapshot }, "new-owner");
  assert.deepEqual(instance.pages[0].elements[0].imageStyle, expected);
  assert.equal(instance.status, "draft"); assert.equal(instance.paymentStatus, "unpaid");
});
test("locked image permits appearance changes without altering geometry; undo restores it", () => {
  reset(); const store = useEditorStore.getState(); store.setElementsLocked([source.id], true);
  const layout = getElementLayout(photo(), "mobile");
  store.updateElement(source.id, setImageAppearanceForDevice(photo(), "mobile", { bottomFade: resolveImageFade({ enabled: true }) }));
  assert.equal(resolveImageAppearance(photo(), "mobile").bottomFade.enabled, true);
  assert.deepEqual(getElementLayout(photo(), "mobile"), layout);
  store.undo(); assert.equal(resolveImageAppearance(photo(), "mobile").bottomFade.enabled, false);
  store.redo(); assert.equal(resolveImageAppearance(photo(), "mobile").bottomFade.enabled, true);
  store.updateElementLayout(source.id, { rotation: 90, width: 500 }); assert.deepEqual(getElementLayout(photo(), "mobile"), layout);
});
