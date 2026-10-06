import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "program-icons:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "program-icons:no-network") return { format: "module", source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};", shortCircuit: true };
    return next(url, context);
  },
});
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const custom = { type: "custom", url: "https://example.invalid/storage/v1/object/public/template-assets/templates/t/icon.png", name: "Planète", assetId: "asset" };
const element = { id: "programme", type: "schedule", name: "Programme", x: 20, y: 30, width: 350, height: 300, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, orientation: "horizontal", iconSize: 28, iconColor: "#2563aa55", stepGap: 8, displayStyle: "timeline", items: [{ id: "a", time: "16:00", title: "Accueil", icon: custom, customIcon: custom }, { id: "b", time: "18:00", title: "Cocktail", icon: { type: "preset", name: "wine" } }] };
const project = { id: "icon-project", ownerId: "owner", name: "Projet", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: [element] }] };

test("real store duplication and local save/reload preserve independent programme icons", () => {
  useEditorStore.getState().setProject(structuredClone(project));
  useEditorStore.setState({ currentPageId: "page", selectedElementId: "programme", selectedElementIds: ["programme"], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });
  useEditorStore.getState().duplicateElement("programme");
  const elements = useEditorStore.getState().project.pages[0].elements;
  assert.equal(elements.length, 2);
  const duplicate = elements.find((item) => item.id !== "programme");
  assert.deepEqual(duplicate.items, element.items);
  duplicate.items[0].icon.name = "Copie";
  assert.equal(elements.find((item) => item.id === "programme").items[0].icon.name, "Planète");
  upsertProject(useEditorStore.getState().project);
  const loaded = getProject(project.id, "owner");
  const iconData = (items) => items.map(({ id, items, orientation, iconSize, iconColor }) => ({ id, items, orientation, iconSize, iconColor }));
  assert.deepEqual(iconData(loaded.pages[0].elements), iconData(elements));
  useEditorStore.getState().setProject(loaded);
  for (const device of ["mobile", "tablet", "desktop"]) {
    useEditorStore.getState().setPreviewDevice(device);
    assert.deepEqual(useEditorStore.getState().project.pages[0].elements[0].items, element.items);
  }
});

test("real template sanitization and instantiation retain custom/preset/cache icons independently", () => {
  const template = { name: "Modèle", templateData: sanitizeProjectForTemplate(project) };
  const instance = instantiateProjectFromTemplate(template, "other-owner");
  assert.notEqual(instance.id, project.id);
  assert.equal(instance.ownerId, "other-owner");
  assert.equal(instance.status, "draft");
  assert.equal(instance.paymentStatus, "unpaid");
  assert.deepEqual(instance.pages[0].elements[0].items, element.items);
  instance.pages[0].elements[0].items[0].icon.name = "Personnalisé";
  assert.equal(template.templateData.pages[0].elements[0].items[0].icon.name, "Planète");
});

test.after(() => { hooks.deregister(); delete globalThis.localStorage; });
