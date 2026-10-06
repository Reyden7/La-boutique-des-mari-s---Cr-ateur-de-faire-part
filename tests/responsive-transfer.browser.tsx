import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { EditorWorkspace } from "../src/components/editor/EditorWorkspace";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore } from "../src/stores/editorStore";
import { getElementLayout } from "../src/utils/responsiveLayout";
import { upsertProject, getProject } from "../src/utils/storage";
import { transferFixture } from "./responsive-transfer.fixture";
import "../src/styles.css";

const initialFixture = transferFixture();
const reset = () => {
  useEditorStore.getState().setProject(structuredClone(initialFixture));
  useEditorStore.setState({ currentPageId: "page", previewDevice: "mobile", sidebarView: "elements", zoom: .6, selectedElementId: null, selectedElementIds: [], past: [], future: [] });
};
reset();
const mobileSnapshot = (project: NonNullable<ReturnType<typeof useEditorStore.getState>["project"]>) => JSON.stringify(project.pages[0].elements.map((element) => getElementLayout(element, "mobile")));
const originalMobile = mobileSnapshot(useEditorStore.getState().project!);
function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"editor" | "preview" | "public">("editor");
  const [saved, setSaved] = useState(false);
  const project = state.project!;
  const summary = { mobileUnchanged: mobileSnapshot(project) === originalMobile, undoActions: state.past.length, device: state.previewDevice,
    layouts: project.pages[0].elements.map((element) => ({ id: element.id, ...getElementLayout(element, state.previewDevice) })), form: project.rsvp?.responsive?.[state.previewDevice === "mobile" ? "tablet" : state.previewDevice] };
  if (mode === "preview") return <PreviewMode project={project} device={state.previewDevice} onClose={() => setMode("editor")} />;
  if (mode === "public") return <div><button onClick={() => setMode("editor")}>Retour à l’éditeur</button><p>Renderer Public local — envoi désactivé, aucun publicId</p><WeddingRenderer project={{ ...project, rsvp: { ...project.rsvp!, purchased: true } }} device={state.previewDevice} mode="public" playAnimations={false} /></div>;
  return <div className="studio-layout">
    <header className="top-toolbar" style={{ display: "flex", gap: 10, padding: "0 12px", overflowX: "auto", whiteSpace: "nowrap" }}><strong style={{ fontSize: 12 }}>Banc local — aucun enregistrement distant</strong><button onClick={() => state.undo()}>Annuler</button><button onClick={() => state.redo()}>Rétablir</button><button onClick={() => setMode("preview")}>Tester Aperçu</button><button onClick={() => setMode("public")}>Tester Public</button><button onClick={() => { upsertProject(project); setSaved(true); }}>Sauvegarde locale</button><button disabled={!saved} onClick={() => state.setProject(getProject(project.id, "local-owner")!)}>Recharger local</button><button onClick={reset}>Réinitialiser le banc</button></header>
    <div className="editor-panel-host tools-panel-host"><aside className="left-sidebar"><h2>CALQUES</h2><p data-testid="mobile-unchanged">Smartphone inchangé : {summary.mobileUnchanged ? "OUI" : "NON"}</p><p data-testid="undo-count">Actions annulables : {state.past.length}</p>{project.pages[0].elements.map((element) => <button key={element.id} style={{ display: "block", marginBottom: 8 }} onClick={() => state.selectElement(element.id)}>{element.name}</button>)}<details><summary>Mesures du layout</summary><pre data-testid="layout-summary" style={{ fontSize: 9, whiteSpace: "pre-wrap" }}>{JSON.stringify(summary, null, 2)}</pre></details></aside></div>
    <EditorWorkspace pageName="Faire-part"><EditorCanvas /></EditorWorkspace>
    <div className="editor-panel-host properties-panel-host"><PropertiesPanel /></div>
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
