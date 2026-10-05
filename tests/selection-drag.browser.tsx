// Open /tests/selection-drag.browser.html with npm run dev. This mounts the real
// editor but not its autosave/payment shell; all fixture data stays in memory.
import React from "react";
import { createRoot } from "react-dom/client";
import Konva from "konva";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { useEditorStore } from "../src/stores/editorStore";
import { getElementLayout, materializeElementLayouts } from "../src/utils/responsiveLayout";
import { DEFAULT_WELCOME_PAGE } from "../src/features/welcome/welcomeDefaults";
import type { EditorElement, WeddingProject } from "../src/types/editor";
import type { PreviewDevice } from "../src/config/previewDevices";
import "../src/styles.css";

const fixture = document.getElementById("fixture")!;
const output = document.getElementById("results")!;
const button = document.getElementById("run") as HTMLButtonElement;
const root = createRoot(fixture);
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const near = (actual: number, expected: number, label: string) => {
  if (Math.abs(actual - expected) > .001) throw new Error(`${label}: ${actual} != ${expected}`);
};
let fixtureKey = 0;

function elements(baseY: number): EditorElement[] {
  const base = { opacity: 1, visible: true, locked: false, animation: { type: "none", duration: 1, delay: 0 } };
  return [
    { ...base, id: "section", name: "Section", type: "section", x: 20, y: baseY + 100, width: 300, height: 350, rotation: 0, zIndex: 1, background: { type: "color", color: "#eee2d7" }, padding: 20, cornerRadius: 0 },
    { ...base, id: "child", name: "Texte verrouillé", type: "text", x: 55, y: baseY + 140, width: 100, height: 40, rotation: 25, zIndex: 2, locked: true, sectionId: "section", text: "Emma & Lucas", fontFamily: "Arial", fontSize: 16, fill: "#333", align: "center", lineHeight: 1.1, letterSpacing: 0 },
    { ...base, id: "image", name: "Image tournée", type: "image", x: 200, y: baseY + 350, width: 70, height: 45, rotation: 45, zIndex: 3, fit: "contain", src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='45'%3E%3Crect width='70' height='45' fill='pink'/%3E%3C/svg%3E" },
    { ...base, id: "root", name: "Élément racine", type: "shape", shape: "rectangle", x: 60, y: baseY + 490, width: 45, height: 40, rotation: -15, zIndex: 4, fill: "#caa765", stroke: "#caa765", strokeWidth: 0, cornerRadius: 0 },
    { ...base, id: "fixed", name: "Verrouillé indépendant", type: "shape", shape: "rectangle", x: 180, y: baseY + 500, width: 40, height: 30, rotation: 0, zIndex: 5, locked: true, fill: "#333", stroke: "#333", strokeWidth: 0, cornerRadius: 0 },
    { ...base, id: "other-section", name: "Autre Section immobile", type: "section", x: 25, y: baseY + 570, width: 300, height: 150, rotation: 0, zIndex: 6, background: { type: "color", color: "#f9f0e8" }, padding: 20, cornerRadius: 0 },
    { ...base, id: "other-child", name: "Autre enfant sélectionné", type: "text", x: 60, y: baseY + 600, width: 100, height: 40, rotation: 0, zIndex: 7, sectionId: "other-section", text: "Invitation", fontFamily: "Arial", fontSize: 16, fill: "#333", align: "center", lineHeight: 1.1, letterSpacing: 0 },
  ].map((item) => materializeElementLayouts(item as EditorElement));
}

async function mount(device: PreviewDevice, zoom: number, baseY = 0, welcome = false) {
  const items = elements(baseY);
  const project = {
    id: "drag-regression", name: "Régression locale", status: "draft", paymentStatus: "unpaid",
    createdAt: "2026-10-05", updatedAt: "2026-10-05", introductionMode: welcome ? "welcome" : "none",
    pages: [{ id: "page", name: "Document", elements: items, background: { type: "color", color: "#fff" } }],
    welcomePage: { ...structuredClone(DEFAULT_WELCOME_PAGE), enabled: welcome, showArch: false, showBackground: false, elements: items },
    customFonts: [],
  } as WeddingProject;
  useEditorStore.setState({ project, currentPageId: "page", previewDevice: device, sidebarView: welcome ? "introduction" : "elements", selectedElementId: "section", selectedElementIds: ["section", "child", "image", "root", "fixed", "other-child"], past: [], future: [] });
  root.render(<EditorCanvas key={++fixtureKey} />);
  await tick();
  useEditorStore.setState({ zoom });
  await tick();
  fixture.scrollTop = baseY * zoom;
  await tick();
  const stage = Konva.stages.find((item) => fixture.contains(item.container()));
  if (!stage) throw new Error("Stage absent");
  const transformer = stage.findOne((node) => typeof (node as Konva.Transformer).nodes === "function") as Konva.Transformer;
  if (!transformer) throw new Error(`Transformer absent du Stage : ${stage.getChildren().map((layer) => `${layer.getClassName()}(${layer.getChildren().map((node) => node.getClassName()).join(",")})`).join(";")}`);
  if (transformer.nodes().length !== 0) throw new Error("Le Transformer proxy toujours le drag collectif");
  return { stage, items };
}

function mouse(target: EventTarget, type: string, x: number, y: number, altKey = true) {
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === "mouseup" ? 0 : 1, bubbles: true, altKey }));
}

async function dragCase(device: PreviewDevice, zoom: number, grab: { x: number; y: number }, baseY = 0, welcome = false, snap = false) {
  const { stage, items } = await mount(device, zoom, baseY, welcome);
  const rect = stage.content.getBoundingClientRect();
  const scaleX = rect.width / stage.content.clientWidth * stage.scaleX();
  const scaleY = rect.height / stage.content.clientHeight * stage.scaleY();
  const x = rect.left + grab.x * scaleX;
  const y = rect.top + (grab.y + baseY) * scaleY;
  const initial = new Map(items.map((item) => [item.id, stage.findOne(`#${item.id}`)!.position()]));
  mouse(stage.content, "mousedown", x, y, !snap);
  mouse(window, "mousemove", x + 1, y + 1, !snap);
  let dx = 1 / scaleX;
  let dy = 1 / scaleY;
  for (const item of items) {
    const node = stage.findOne(`#${item.id}`)!;
    const start = initial.get(item.id)!;
    if (item.id === "fixed" || item.id === "other-section") {
      near(node.x(), start.x, "verrouillé X"); near(node.y(), start.y, "verrouillé Y");
    } else if (!snap) {
      near(node.x(), start.x + dx, `${item.id} premier px X`);
      near(node.y(), start.y + dy, `${item.id} premier px Y`);
    } else {
      if (Math.abs(node.x() - start.x - dx) > 6 / zoom + .001 || Math.abs(node.y() - start.y - dy) > 6 / zoom + .001) throw new Error("Snap initial excessif");
    }
  }
  // Many frames, then return near the start: catches cumulative drift.
  for (let step = 1; step <= 40; step++) mouse(window, "mousemove", x + step * 2, y + step * 3, !snap);
  mouse(window, "mousemove", x + 23, y + 17, !snap);
  dx = 23 / scaleX; dy = 17 / scaleY;
  mouse(stage.content, "mouseup", x + 23, y + 17, !snap);
  await tick();
  const saved = useEditorStore.getState().project!;
  const savedItems = welcome ? saved.welcomePage!.elements : saved.pages[0].elements;
  for (const item of savedItems) {
    const old = items.find((original) => original.id === item.id)!;
    const before = getElementLayout(old, device);
    const after = getElementLayout(item, device);
    if (!snap) {
      near(after.x, before.x + (item.id === "fixed" || item.id === "other-section" ? 0 : dx), `${item.id} enregistré X`);
      near(after.y, before.y + (item.id === "fixed" || item.id === "other-section" ? 0 : dy), `${item.id} enregistré Y`);
    }
    for (const other of ["mobile", "tablet", "desktop"] as const) {
      if (other !== device && JSON.stringify(getElementLayout(item, other)) !== JSON.stringify(getElementLayout(old, other))) throw new Error(`Layout ${other} modifié`);
    }
    if (after.sectionId !== before.sectionId) throw new Error("Association Section modifiée");
    if (after.rotation !== before.rotation) throw new Error("Rotation modifiée");
  }
  if (useEditorStore.getState().past.length !== 1) throw new Error("Le drag doit être une seule action undo");
  useEditorStore.getState().undo();
  const undone = useEditorStore.getState().project!;
  const undoneItems = welcome ? undone.welcomePage!.elements : undone.pages[0].elements;
  for (const item of undoneItems) near(getElementLayout(item, device).y, getElementLayout(items.find((old) => old.id === item.id)!, device).y, "Undo Y");
}

button.addEventListener("click", async () => {
  button.disabled = true;
  output.textContent = "Tests en cours…";
  let passed = 0;
  const consoleError = console.error;
  const renderErrors: string[] = [];
  console.error = (...args) => { renderErrors.push(args.map(String).join(" ")); consoleError(...args); };
  try {
    for (const device of ["mobile", "tablet", "desktop"] as const) {
      for (const zoom of [.5, .75, 1, 1.25, 1.5]) {
        for (const grab of [{ x: 22, y: 102 }, { x: 150, y: 310 }, { x: 315, y: 528 }, { x: 230, y: 370 }]) {
          await dragCase(device, zoom, grab);
          passed++;
          output.textContent = `${passed} scénarios Konva OK`;
        }
      }
      await dragCase(device, .75, { x: 150, y: 310 }, 1800); passed++;
      await dragCase(device, .75, { x: 150, y: 310 }, 0, true); passed++;
      await dragCase(device, 1, { x: 150, y: 310 }, 0, false, true); passed++;
    }
    if (renderErrors.length) throw new Error(`Erreur console : ${renderErrors[0]}`);
    output.textContent = `PASS — ${passed} scénarios Konva réels : 1 px, 4 points d’ancrage, 5 zooms, 3 formats, scroll, rotations, verrous, Section/enfant dédupliqué, undo, Page d’accueil et snap. Aucune erreur console.`;
  } catch (error) {
    output.textContent = `FAIL après ${passed} scénarios : ${error instanceof Error ? error.message : error}`;
    console.error(error);
  } finally {
    console.error = consoleError;
    button.disabled = false;
  }
});
