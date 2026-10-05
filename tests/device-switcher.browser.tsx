// Isolated real canvas/workspace fixture: no EditorPage autosave or remote project.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { EditorWorkspace } from "../src/components/editor/EditorWorkspace";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { useEditorStore } from "../src/stores/editorStore";
import { materializeElementLayouts } from "../src/utils/responsiveLayout";
import type { SectionElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const elements = Array.from({ length: 6 }, (_, index) => materializeElementLayouts({
  id: `section-${index}`, type: "section", name: `Section ${index + 1}`, x: 0, y: index * 1400,
  width: 390, height: 1400, rotation: 0, opacity: 1, zIndex: index, visible: true,
  background: { type: "color", color: ["#e7ddd0", "#dce5d5", "#e6cad0", "#d4e3ed", "#e3dbc5", "#d2c8df"][index] },
  padding: 20, cornerRadius: 0, responsive: { tablet: { width: 768 }, desktop: { width: 1440 } },
} as SectionElement));
useEditorStore.setState({ project: { id: "local-switcher-test", name: "Vérification locale", introductionMode: "none", customFonts: [], audio: { enabled: false, startMode: "opening-interaction" }, opening: { type: "none" }, status: "draft", paymentStatus: "unpaid", pages: [{ id: "page", name: "Faire-part", background: { type: "color", color: "#fff" }, elements }] } as WeddingProject,
  currentPageId: "page", sidebarView: "elements", selectedElementId: null, selectedElementIds: [], previewDevice: "mobile", past: [], future: [], zoom: 1 });

function Fixture() {
  const state = useEditorStore();
  const [preview, setPreview] = useState(false);
  const scroll = (fraction: number) => {
    const host = document.querySelector(".editor-main");
    if (host) host.scrollTop = (host.scrollHeight - host.clientHeight) * fraction;
  };
  if (preview) return <PreviewMode project={state.project!} device={state.previewDevice} onClose={() => setPreview(false)} />;
  return <div className="studio-layout">
    <header className="top-toolbar" style={{ display: "flex", gap: 12, padding: "0 12px", flexWrap: "wrap" }}>
      <strong style={{ fontSize: 12 }}>Banc local — aucun enregistrement</strong>
      <button onClick={() => scroll(0)}>Haut</button><button onClick={() => scroll(.5)}>Milieu</button><button onClick={() => scroll(1)}>Bas</button>
      <button onClick={() => { const host = document.querySelector(".editor-main"); if (host) host.scrollLeft = host.scrollWidth; }}>Scroll horizontal</button>
      <button onClick={() => setPreview(true)}>Tester Aperçu</button>
    </header>
    <div className="editor-panel-host tools-panel-host"><aside className="left-sidebar"><h2>CALQUES</h2>{elements.map((element) => <p key={element.id}>{element.name}</p>)}</aside></div>
    <EditorWorkspace pageName="Faire-part"><EditorCanvas /></EditorWorkspace>
    <div className="editor-panel-host properties-panel-host"><aside className="properties-panel"><h2>Réglages</h2><p>Les deux panneaux occupent leurs colonnes habituelles.</p></aside></div>
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
