// Uses the real editor UI/store. No remote save, publication or checkout effect.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HierarchyList } from "../src/components/sidebar/HierarchyList";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore } from "../src/stores/editorStore";
import { normalizeProject } from "../src/utils/storage";
import { resolveWelcomePage } from "../src/features/welcome/welcomeDefaults";
import type { EditorElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const base = { x: 30, y: 30, width: 300, height: 100, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false };
const text = { ...base, id: "text", name: "Emma & Lucas", type: "text", text: "Emma & Lucas", fontFamily: "Cormorant Garamond", fontSize: 34, fontWeight: 400, color: "#504239", textAlign: "center", lineHeight: 1.1, letterSpacing: 0 } as EditorElement;
const section = { ...base, id: "section", name: "Section", type: "section", x: 0, y: 0, width: 390, height: 650, zIndex: 1, padding: 0, cornerRadius: 0, background: { type: "color", color: "#f4e7df" } } as EditorElement;
const image = { ...base, id: "image", name: "Photo couple", type: "image", src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='100'%3E%3Crect width='300' height='100' fill='%23dbc3ad'/%3E%3C/svg%3E", alt: "Visuel de test", fit: "contain", y: 140 } as EditorElement;
const project = normalizeProject({ id: "local-editor-names", name: "Test local", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#ffffff" }, elements: [section, { ...text, sectionId: "section" }, image] }], rsvp: { enabled: true, purchased: false, title: "Confirmez votre présence", submitLabel: "Envoyer", positionY: 250, fields: [], sectionId: "section" }, welcomePage: resolveWelcomePage({ elements: [{ ...text, id: "welcome-text", name: "Texte accueil" }] }) } as WeddingProject)!;
useEditorStore.setState({ project, currentPageId: "page", sidebarView: "elements", selectedElementId: "section", selectedElementIds: ["section"], past: [], future: [] });

function Fixture() {
  const state = useEditorStore();
  const current = state.project!;
  const welcome = state.sidebarView === "introduction";
  return <div style={{ padding: 20 }}>
    <h1 style={{ fontSize: 24 }}>Renommer les calques — banc local</h1>
    <p>Aucune sauvegarde distante. Les noms restent propres à l’éditeur.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      {(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{device}</button>)}
      <button onClick={() => { state.updateIntroductionMode(welcome ? "none" : "welcome"); state.setSidebarView(welcome ? "elements" : "introduction"); state.selectElement(welcome ? "section" : "welcome-text"); }}>Changer de contexte</button>
      <button onClick={() => state.duplicateElement(state.selectedElementId!)}>Dupliquer la sélection</button>
      <button onClick={() => state.undo()}>Annuler</button>
      <button onClick={() => { sessionStorage.setItem("local-editor-name-regression", JSON.stringify(current)); }}>Sauvegarder localement</button>
      <button onClick={() => { const saved = sessionStorage.getItem("local-editor-name-regression"); if (saved) state.setProject(normalizeProject(JSON.parse(saved))!); }}>Recharger le projet</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "280px 320px 390px", gap: 24, alignItems: "start" }}>
      <aside className="left-sidebar" style={{ width: 280, padding: 12 }}><h2>CALQUES</h2><HierarchyList elements={welcome ? current.welcomePage!.elements : current.pages[0].elements} /></aside>
      <PropertiesPanel onPreviewOpening={() => {}} />
      <div id="public-render"><WeddingRenderer project={current} device={state.previewDevice} mode="preview" playAnimations={false} /></div>
    </div>
    <details><summary>Données de contrôle</summary><pre id="names-result">{JSON.stringify({ project: current, undoEntries: state.past.length, selected: state.selectedElementId, device: state.previewDevice })}</pre></details>
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
