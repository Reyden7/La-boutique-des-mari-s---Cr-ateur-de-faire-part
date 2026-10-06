import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "calendar:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "calendar:no-network") return { format: "module", source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};", shortCircuit: true };
    return next(url, context);
  },
});
const { makeCalendarElement } = await import("../src/features/elements/elementFactories.ts");
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { getElementLayout } = await import("../src/utils/responsiveLayout.ts");
const { getEditorElementLabel } = await import("../src/utils/editorNames.ts");
const { upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map(); globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const section = { id: "section", type: "section", name: "Section", x: 0, y: 100, width: 390, height: 180, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, padding: 20, cornerRadius: 0, background: { type: "color", color: "#fff" } };
const reset = (selectSection = false) => {
  useEditorStore.getState().setProject({ id: "calendar-project", ownerId: "owner", name: "Calendrier", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: [structuredClone(section)] }] });
  useEditorStore.setState({ currentPageId: "page", selectedElementId: selectSection ? section.id : null, selectedElementIds: selectSection ? [section.id] : [], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });
};
const calendar = () => useEditorStore.getState().project.pages[0].elements.find((x) => x.type === "calendar");
test("factory, real add/select and Section insertion reuse the common pipeline", () => {
  reset(true); const element = makeCalendarElement(); const store = useEditorStore.getState();
  assert.equal(element.name, "Calendrier"); assert.equal(element.locked, false); assert.equal(element.animation.type, "none");
  assert.equal(element.style, "elegant"); assert.equal(element.title, "Save the date");
  store.addElement(element); assert.equal(useEditorStore.getState().selectedElementId, element.id);
  const mobile = getElementLayout(calendar(), "mobile"); assert.equal(mobile.sectionId, section.id); assert.ok(mobile.y >= 130);
  const parent = useEditorStore.getState().project.pages[0].elements[0]; assert.ok(parent.height >= mobile.y + mobile.height - parent.y + 30);
  assert.equal(getElementLayout(calendar(), "tablet").sectionId, null);
});
test("lock blocks direct geometry, allows content and locked child follows its Section", () => {
  reset(true); const store = useEditorStore.getState(); store.addElement(makeCalendarElement()); const id = calendar().id;
  store.setElementsLocked([id], true); const original = getElementLayout(calendar(), "mobile");
  store.updateElementLayout(id, { x: 999, y: 999, width: 999, height: 999, rotation: 45 });
  assert.deepEqual(getElementLayout(calendar(), "mobile"), original);
  store.updateElement(id, { title: "Notre date", style: "romantic", numbersFontFamily: "STARWARS" });
  assert.equal(calendar().title, "Notre date"); assert.equal(calendar().numbersFontFamily, "STARWARS");
  store.updateElementLayout(section.id, { y: 300 }); assert.equal(getElementLayout(calendar(), "mobile").y, original.y + 200);
  store.setElementsLocked([id], false); store.updateElementLayout(id, { width: 117, height: 190, rotation: -45 });
  assert.equal(getElementLayout(calendar(), "mobile").width, 117);
  assert.equal(getElementLayout(calendar(), "tablet").width, 310);
});
test("responsive visibility, renaming, duplicate/delete, undo/redo and save/template snapshots", () => {
  reset(); const store = useEditorStore.getState(); store.addElement(makeCalendarElement()); const id = calendar().id;
  store.updateElement(id, { editorName: "Notre date", title: "Emma & Lucas", month: 2, year: 2028, highlightedDay: 29, decorationStyle: "floral", backgroundColor: "#fffaf580" });
  assert.equal(getEditorElementLabel(calendar()), "Notre date");
  store.setPreviewDevice("desktop"); store.updateElementLayout(id, { width: 600, height: 410, x: 320, rotation: 25 });
  store.setElementVisibility(id, false); assert.equal(getElementLayout(calendar(), "desktop").visible, false); assert.equal(getElementLayout(calendar(), "mobile").visible, true);
  store.duplicateElement(id); const copy = useEditorStore.getState().project.pages[0].elements.find((x) => x.type === "calendar" && x.id !== id);
  assert.ok(copy); assert.equal(copy.highlightedDay, 29); assert.equal(copy.decorationStyle, "floral"); assert.notEqual(copy.id, id);
  store.removeElement(copy.id); assert.ok(!useEditorStore.getState().project.pages[0].elements.some((x) => x.id === copy.id));
  store.undo(); assert.ok(useEditorStore.getState().project.pages[0].elements.some((x) => x.id === copy.id)); store.redo();
  upsertProject(useEditorStore.getState().project); const loaded = getProject("calendar-project", "owner");
  const template = { name: "Modèle", templateData: sanitizeProjectForTemplate(loaded) }; const instance = instantiateProjectFromTemplate(template, "other");
  for (const candidate of [loaded, instance]) {
    const restored = candidate.pages[0].elements.find((x) => x.id === id);
    assert.equal(restored.type, "calendar"); assert.equal(restored.highlightedDay, 29); assert.equal(restored.backgroundColor, "#fffaf580");
    assert.deepEqual(getElementLayout(restored, "desktop"), getElementLayout(calendar(), "desktop"));
  }
  instance.pages[0].elements.find((x) => x.id === id).title = "Indépendant";
  assert.equal(template.templateData.pages[0].elements.find((x) => x.id === id).title, "Emma & Lucas");
});
test.after(() => { hooks.deregister(); delete globalThis.localStorage; });
