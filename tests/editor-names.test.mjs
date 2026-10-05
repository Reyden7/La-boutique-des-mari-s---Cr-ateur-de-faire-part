import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { getDuplicateEditorName, getEditorElementLabel, getRsvpEditorLabel, MAX_EDITOR_NAME_LENGTH, normalizeEditorName } from "../src/utils/editorNames.ts";

// Real store, persistence and template normalizer, with networking completely disabled.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "../lib/supabase") return { url: "editor-name:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "editor-name:no-network") return { format: "module", source: "export const isSupabaseConfigured = false; export const supabase = null; export const requireSupabaseSession = () => { throw new Error('Network disabled'); };", shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { upsertProject, getProject, normalizeProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const { RSVP_EDITOR_ELEMENT_ID } = await import("../src/features/rsvp/rsvpEditorElement.ts");
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const types = ["text", "image", "shape", "icon", "carousel", "location", "schedule", "scratch", "button", "section"];
const element = (type) => ({ id: type, type, name: `Automatique ${type}`, x: 20, y: 100, width: 200, height: 100, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: true, text: "Emma & Lucas", title: "Cérémonie", src: "https://example.invalid/photo.png", alt: "photo.png", responsive: { tablet: { x: 30 }, desktop: { x: 40 } } });
const project = () => ({ id: "local-names", ownerId: "owner", name: "Projet", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#ffffff" }, elements: types.map(element) }], rsvp: { enabled: true, purchased: false, title: "Confirmez votre présence", fields: [], submitLabel: "Envoyer" } });
const reset = () => useEditorStore.setState({ project: project(), currentPageId: "page", previewDevice: "mobile", sidebarView: "elements", selectedElementId: "section", selectedElementIds: ["section"], past: [], future: [], clipboard: null });

test("legacy labels, empty names and the 80-character limit are safe", () => {
  assert.equal(getEditorElementLabel(element("section")), "Automatique section");
  assert.equal(getEditorElementLabel({ type: "section" }), "Section");
  assert.equal(getRsvpEditorLabel(), "Formulaire invité");
  assert.equal(normalizeEditorName("   "), undefined);
  assert.equal(normalizeEditorName(" Notre histoire "), "Notre histoire");
  assert.equal(normalizeEditorName("a".repeat(100)).length, MAX_EDITOR_NAME_LENGTH);
});
for (const type of types) test(`rename ${type} changes only editorName, even when locked`, () => {
  reset();
  const before = structuredClone(useEditorStore.getState().project.pages[0].elements.find((item) => item.id === type));
  useEditorStore.getState().renameElement(type, "  Nom personnalisé  ");
  const renamed = useEditorStore.getState().project.pages[0].elements.find((item) => item.id === type);
  assert.deepEqual(renamed, { ...before, editorName: "Nom personnalisé" });
  assert.deepEqual(useEditorStore.getState().selectedElementIds, ["section"]);
  for (const device of ["mobile", "tablet", "desktop"]) {
    useEditorStore.getState().setPreviewDevice(device);
    assert.equal(getEditorElementLabel(useEditorStore.getState().project.pages[0].elements.find((item) => item.id === type)), "Nom personnalisé");
  }
});
test("form label is distinct from public title; undo, redo, no-op and clearing work", () => {
  reset();
  const original = structuredClone(useEditorStore.getState().project.rsvp);
  useEditorStore.getState().renameElement(RSVP_EDITOR_ELEMENT_ID, "Section Formulaire");
  assert.deepEqual(useEditorStore.getState().project.rsvp, { ...original, editorName: "Section Formulaire" });
  useEditorStore.getState().undo();
  assert.equal(getRsvpEditorLabel(useEditorStore.getState().project.rsvp), "Formulaire invité");
  useEditorStore.getState().redo();
  const count = useEditorStore.getState().past.length;
  useEditorStore.getState().renameElement(RSVP_EDITOR_ELEMENT_ID, "Section Formulaire");
  useEditorStore.getState().renameElement("missing", "Nom");
  assert.equal(useEditorStore.getState().past.length, count);
  useEditorStore.getState().renameElement(RSVP_EDITOR_ELEMENT_ID, " ");
  assert.deepEqual(useEditorStore.getState().project.rsvp, original);
});
test("custom labels survive subsequent text edits, hierarchy moves, locks and visibility", () => {
  reset();
  const store = useEditorStore.getState();
  store.renameElement("text", "Titre principal");
  store.updateElement("text", { text: "Nouveau contenu", name: "Nouveau contenu" });
  store.moveHierarchyItem("text", "section", "inside");
  store.toggleElementLocked("text");
  store.setElementVisibility("text", false);
  const text = useEditorStore.getState().project.pages[0].elements.find((item) => item.id === "text");
  assert.equal(getEditorElementLabel(text), "Titre principal");
  assert.equal(text.text, "Nouveau contenu");
  assert.equal(text.sectionId, "section");
  assert.equal(text.visible, false);
  store.renameElement("text", "");
  assert.equal(getEditorElementLabel(useEditorStore.getState().project.pages[0].elements.find((item) => item.id === "text")), "Nouveau contenu");
});
test("duplication and paste create unique labels, including section children and 80-character names", () => {
  reset();
  const store = useEditorStore.getState();
  store.renameElement("section", "Notre histoire");
  store.renameElement("text", "Titre");
  store.moveHierarchyItem("text", "section", "inside");
  store.duplicateElement("section");
  store.duplicateElement("section");
  const elements = useEditorStore.getState().project.pages[0].elements;
  for (const name of ["Notre histoire copie", "Notre histoire copie 2", "Titre copie", "Titre copie 2"]) assert.ok(elements.some((item) => item.editorName === name));
  store.selectElement("text"); store.copyElement(); store.pasteElement();
  assert.ok(useEditorStore.getState().project.pages[0].elements.some((item) => item.editorName === "Titre copie 3"));
  const long = { ...element("image"), editorName: "a".repeat(80) };
  const copy = getDuplicateEditorName(long, []);
  assert.equal(copy.length, 80); assert.ok(copy.endsWith(" copie"));
  assert.notEqual(getDuplicateEditorName(long, [{ ...long, editorName: copy }]), copy);
  assert.equal(getDuplicateEditorName(element("image"), []), undefined);
});
test("real local save/reload and templates preserve document, form and welcome names", () => {
  reset();
  const store = useEditorStore.getState();
  store.renameElement("section", "Notre histoire");
  store.renameElement(RSVP_EDITOR_ELEMENT_ID, "Réponses");
  const current = structuredClone(useEditorStore.getState().project);
  current.welcomePage = { elements: [{ ...element("text"), id: "welcome", editorName: "Titre accueil" }] };
  current.introductionMode = "welcome";
  useEditorStore.setState({ project: current });
  upsertProject(current);
  const loaded = getProject(current.id, "owner");
  for (const target of [loaded, normalizeProject(JSON.parse(JSON.stringify(current))), sanitizeProjectForTemplate(current), instantiateProjectFromTemplate({ name: "Modèle", templateData: current }, "other")]) {
    assert.equal(target.pages[0].elements.find((item) => item.id === "section").editorName, "Notre histoire");
    assert.equal(target.rsvp.editorName, "Réponses");
    assert.equal(target.welcomePage.elements[0].editorName, "Titre accueil");
  }
  store.renameElement("welcome", "Accueil personnalisé");
  assert.equal(useEditorStore.getState().project.welcomePage.elements[0].editorName, "Accueil personnalisé");
  assert.equal(useEditorStore.getState().project.welcomePage.elements[0].text, "Emma & Lucas");
});
test.after(() => { hooks.deregister(); delete globalThis.localStorage; });
