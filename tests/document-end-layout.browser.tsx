// Local regression harness: no save effect, no checkout, no production mutations.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { useEditorStore } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { RSVP_EDITOR_ELEMENT_ID } from "../src/features/rsvp/rsvpEditorElement";
import { useRsvpBlockLayout } from "../src/features/rsvp/useRsvpBlockLayout";
import { getDocumentHeight, getRsvpBlockHeight } from "../src/utils/documentLayout";
import { getElementLayout, materializeElementLayouts } from "../src/utils/responsiveLayout";
import type { SectionElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const sections = ["a", "b"].map((id, index) => materializeElementLayouts({ id, type: "section", name: `Section ${id.toUpperCase()}`, x: 0, y: index * 1000, width: 390, height: 800, rotation: 0, opacity: 1, zIndex: index + 1, visible: true, background: { type: "color", color: index ? "#ede1d6" : "#dbe4d5" }, padding: 30, cornerRadius: 0 } as SectionElement));
useEditorStore.setState({ project: { id: "local-layout-regression", name: "Test local", introductionMode: "none", customFonts: [], status: "draft", paymentStatus: "unpaid", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: sections }], rsvp: { enabled: true, purchased: true, positionY: 1080, width: 390, sectionId: "b", title: "Confirmez votre présence", description: "Nous avons hâte de partager cette journée avec vous.", submitLabel: "Envoyer ma réponse", fields: [{ id: "name", label: "Votre prénom", type: "short_text", required: true }, { id: "meal", label: "Votre menu", type: "single_choice", options: ["Classique", "Végétarien", "Sans gluten"], required: true }] } } as WeddingProject, currentPageId: "page", sidebarView: "elements", selectedElementId: RSVP_EDITOR_ELEMENT_ID, selectedElementIds: [RSVP_EDITOR_ELEMENT_ID], previewDevice: "mobile", past: [], future: [], zoom: .65 });
usePropertyPanelStore.setState({ propertySectionOpenState: { disposition: true, section: true } });

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"preview" | "public">("preview");
  const [narrow, setNarrow] = useState(false);
  const layout = useRsvpBlockLayout(state.project?.rsvp, state.previewDevice);
  const project = state.project!;
  return <div style={{ padding: 20 }}>
    <h1 style={{ fontSize: 24 }}>Tests locaux — aucun enregistrement distant</h1>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "12px 0" }}>
      {(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{device}</button>)}
      <button onClick={() => state.selectElement(RSVP_EDITOR_ELEMENT_ID)}>Formulaire</button>
      <button onClick={() => state.selectElement("a")}>Section A</button><button onClick={() => state.selectElement("b")}>Section B</button>
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Mode {mode}</button>
      <button onClick={() => setNarrow(!narrow)}>Viewport étroit</button>
      <button onClick={() => state.updateRsvp({ ...project.rsvp!, title: "Un titre très long pour vérifier le retour à la ligne du formulaire", fields: Array.from({ length: 10 }, (_, index) => ({ id: String(index), type: index % 2 ? "long_text" : "multiple_choice", label: "Une question très longue destinée à vérifier que son texte ne sera jamais coupé", required: true, options: ["Une réponse assez longue pour tester le retour à la ligne", "Une deuxième réponse", "Une troisième réponse"] })) })}>Contenu long</button>
      <button onClick={() => state.updateRsvp({ ...project.rsvp!, enabled: !project.rsvp!.enabled })}>Afficher / masquer formulaire</button>
      <button onClick={() => state.duplicateElement(state.selectedElementId!)}>Dupliquer</button>
      <button onClick={() => state.removeElement(state.selectedElementId!)}>Supprimer</button>
      <button onClick={() => useEditorStore.setState({ project: JSON.parse(JSON.stringify(project)) })}>Recharger JSON</button>
    </div>
    <pre id="layout-result" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify({ device: state.previewDevice, height: layout.height, minimum: layout.minimumHeight, documentHeight: getDocumentHeight(project.pages[0], state.previewDevice, project.rsvp, layout.height), heights: Object.fromEntries((["mobile", "tablet", "desktop"] as const).map((device) => [device, getRsvpBlockHeight(project.rsvp, device)])), rsvp: project.rsvp, sections: project.pages[0].elements.map((element) => ({ id: element.id, mobile: getElementLayout(element, "mobile"), tablet: getElementLayout(element, "tablet"), desktop: getElementLayout(element, "desktop") })) })}</pre>
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
      <PropertiesPanel onPreviewOpening={() => {}} />
      <div><div id="editor-host" style={{ height: 650, position: "relative", display: "flex" }}><EditorCanvas /></div>
        <div id="render-host" style={{ width: narrow ? 390 : undefined }}><WeddingRenderer project={project} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
      </div>
    </div>{layout.measurement}
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
