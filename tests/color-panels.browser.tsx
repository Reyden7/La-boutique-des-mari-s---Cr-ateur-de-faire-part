// Actual panels, temporary in-memory project only. No autosave or publication mounted.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WelcomePageEditor } from "../src/features/welcome/WelcomePageEditor";
import { ParticlePanel } from "../src/features/particles/ParticlePanel";
import { useEditorStore, makeTextElement, makeShapeElement } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { createBlankProject } from "../src/templates/templates";
import { normalizeProject } from "../src/utils/storage";
import { makeScheduleElement, makeScratchElement, makeSectionElement, makeCalendarElement, makeButtonElement, makeLocationElement } from "../src/features/elements/elementFactories";
import { resolveWelcomePage } from "../src/features/welcome/welcomeDefaults";
import { RSVP_EDITOR_ELEMENT_ID } from "../src/features/rsvp/rsvpEditorElement";
import type { EditorElement } from "../src/types/editor";
import "../src/styles.css";

const project = normalizeProject(createBlankProject())!;
const elements: EditorElement[] = [makeTextElement(), makeShapeElement("rectangle"), makeScheduleElement(), makeScratchElement(), makeSectionElement(), makeCalendarElement(), makeButtonElement(), makeLocationElement()];
const shape = makeShapeElement("heart");
elements.push({ ...shape, name: "Cœur" });
elements.push({ ...shape, id: crypto.randomUUID(), type: "image", name: "Image + cadre", src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='50'%3E%3Crect width='100' height='50' fill='%239a6d51'/%3E%3C/svg%3E", fit: "contain", imageStyle: { frame: { enabled: true } } } as EditorElement);
project.pages[0].elements = elements;
project.particles.enabled = true;
project.rsvp!.enabled = true;
project.welcomePage = resolveWelcomePage();
useEditorStore.setState({ project, currentPageId: project.pages[0].id, selectedElementId: elements[0].id, selectedElementIds: [elements[0].id], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });
usePropertyPanelStore.setState({ propertySectionOpenState: Object.fromEntries(["disposition", "police", "apparence", "style", "programme", "zone-a-gratter", "indicateur", "fond", "cadre", "couleurs"].map((key) => [key, true])) });

function Fixture() {
  const [panel, setPanel] = useState("properties");
  const state = useEditorStore();
  const select = (id: string | null, sidebar = "elements") => { setPanel("properties"); useEditorStore.setState({ selectedElementId: id, selectedElementIds: id ? [id] : [], sidebarView: sidebar as typeof state.sidebarView }); };
  return <main style={{ padding: 16 }}>
    <h1>Panneaux réels — test local</h1><p>Aucune sauvegarde distante. Les modifications restent dans la mémoire de cette page.</p>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {elements.map((element) => <button key={element.id} onClick={() => select(element.id)}>{element.type === "shape" && element.name !== "Cœur" ? "Forme" : element.name}</button>)}
      <button onClick={() => select(null)}>Fond document</button>
      <button onClick={() => select(RSVP_EDITOR_ELEMENT_ID)}>Formulaire</button>
      <button onClick={() => select(null, "introduction")}>Ouverture</button>
      <button onClick={() => setPanel("welcome")}>Page d’accueil</button>
      <button onClick={() => setPanel("particles")}>Particules</button>
    </nav>
    <pre id="history">{JSON.stringify({ undoEntries: state.past.length, selected: state.selectedElementId, device: state.previewDevice })}</pre>
    <div>{(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{device}</button>)}</div>
    <div id="panel" style={{ width: 320, maxWidth: "100%" }}>{panel === "welcome" ? <WelcomePageEditor embedded /> : panel === "particles" ? <ParticlePanel /> : <PropertiesPanel onPreviewOpening={() => {}} />}</div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><Fixture /></MemoryRouter>);
