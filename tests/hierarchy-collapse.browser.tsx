// Local-only real UI regression fixture: no remote save or publication effect.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HierarchyList, HierarchySectionActions } from "../src/components/sidebar/HierarchyList";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore } from "../src/stores/editorStore";
import { useHierarchyUiStore } from "../src/stores/hierarchyUiStore";
import { materializeElementLayouts } from "../src/utils/responsiveLayout";
import { getDocumentHeight } from "../src/utils/documentLayout";
import { resolveWelcomePage } from "../src/features/welcome/welcomeDefaults";
import type { EditorElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const base = { x: 20, y: 30, width: 340, height: 60, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false };
const section = (id: string, name: string, y: number, zIndex: number) => materializeElementLayouts({ ...base, id, type: "section", name: "Section", editorName: name, x: 0, y, width: 390, height: 650, zIndex, padding: 0, cornerRadius: 0, background: { type: "color", color: "#f4e7df" } } as EditorElement);
const text = (id: string, name: string, parent: string | null, y: number, zIndex: number) => materializeElementLayouts({ ...base, id, type: "text", name, editorName: name, text: name, y, zIndex, sectionId: parent, fontFamily: "Cormorant Garamond", fontSize: 28, fontWeight: 400, color: "#504239", textAlign: "center", lineHeight: 1.1, letterSpacing: 0 } as EditorElement);
const elements = [section("header", "Header", 0, 1), text("names", "Emma & Lucas", "header", 30, 2), section("history", "Notre histoire", 650, 3), text("story", "Une belle rencontre", "history", 690, 4), text("loose", "Texte à déplacer", null, 1340, 5)];
elements[1].responsive!.tablet = { ...elements[1].responsive!.tablet, sectionId: "history" };
elements[3].responsive!.tablet = { ...elements[3].responsive!.tablet, sectionId: "header" };
const initial = { id: "local-collapse", name: "Test local", introductionMode: "none", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#ffffff" }, elements }], rsvp: { enabled: true, purchased: false, title: "Confirmez votre présence", submitLabel: "Envoyer", positionY: 160, height: 620, fields: [], sectionId: "header" }, welcomePage: resolveWelcomePage() } as WeddingProject;
useEditorStore.setState({ project: initial, currentPageId: "page", sidebarView: "elements", selectedElementId: "loose", selectedElementIds: ["loose"], past: [], future: [] });
useHierarchyUiStore.setState({ collapsedSectionsByProject: {} });

// Exercise the actual React drag handlers via native DOM DragEvents; no direct store reparenting.
async function simulateDrop(source: string, target: string) {
  const transfer = new DataTransfer();
  const handle = document.querySelector(`[data-element-id="${source}"] .layer-drag-handle`)!;
  handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  await new Promise(requestAnimationFrame);
  const row = document.querySelector(`[data-element-id="${target}"]`)!;
  const bounds = row.getBoundingClientRect();
  const options = { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: bounds.y + bounds.height / 2 };
  row.dispatchEvent(new DragEvent("dragover", options));
  await new Promise(requestAnimationFrame);
  row.dispatchEvent(new DragEvent("drop", options));
  handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
}

function Fixture() {
  const state = useEditorStore();
  const ui = useHierarchyUiStore();
  const [mode, setMode] = useState<"preview" | "public">("preview");
  const [width, setWidth] = useState(280);
  const project = state.project!;
  const activeElements = project.pages[0].elements;
  return <div style={{ padding: 20 }}>
    <h1 style={{ fontSize: 24 }}>Sections repliables — banc local</h1><p>État UI uniquement : aucun autosave distant.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      {(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{device}</button>)}
      <button onClick={() => state.selectElement("header")}>Sélection canvas Header</button>
      <button onClick={() => state.duplicateElement("header")}>Dupliquer Header</button>
      <button onClick={() => state.removeElement("header")}>Supprimer Header local</button>
      <button onClick={() => void simulateDrop("loose", "header")}>Simuler drop vers Header</button>
      <button onClick={() => void simulateDrop("history", "header")}>Simuler déplacement Section</button>
      <button onClick={() => { state.selectElement("__rsvp-form__"); state.moveHierarchyItem("__rsvp-form__", null, "after"); }}>Formulaire hors Section</button>
      <button onClick={() => void simulateDrop("__rsvp-form__", "header")}>Simuler drop Formulaire</button>
      <button onClick={() => setWidth(width === 280 ? 240 : 280)}>Panneau étroit</button>
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Mode {mode}</button>
      <button onClick={() => state.addElement(section(crypto.randomUUID(), "Nouvelle section", 1500, 10))}>Ajouter Section</button>
      <button onClick={() => useEditorStore.setState({ project: { ...project, pages: [{ ...project.pages[0], elements: [...activeElements, ...Array.from({ length: 100 }, (_, i) => text(`long-${i}`, `Ligne ${i}`, "history", 800, i + 6))] }] } })}>Liste longue</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: `${width}px 320px 390px`, gap: 24, alignItems: "start" }}>
      <aside className="left-sidebar" style={{ width, padding: 12 }}><div className="layers-heading"><h2>CALQUES</h2><HierarchySectionActions elements={activeElements} /></div><HierarchyList elements={activeElements} /></aside>
      <PropertiesPanel onPreviewOpening={() => {}} />
      <div id="render-result"><WeddingRenderer project={project} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
    </div>
    <details><summary>Données de contrôle</summary><pre id="collapse-result">{JSON.stringify({ project, selected: state.selectedElementId, undoEntries: state.past.length, device: state.previewDevice, documentHeight: getDocumentHeight(project.pages[0], state.previewDevice, project.rsvp), ui: ui.collapsedSectionsByProject })}</pre></details>
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
