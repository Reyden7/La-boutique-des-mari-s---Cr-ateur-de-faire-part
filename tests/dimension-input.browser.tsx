// Real properties panel, isolated from autosave and all production data.
import React from "react";
import { createRoot } from "react-dom/client";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { useEditorStore } from "../src/stores/editorStore";
import { getElementLayout, materializeElementLayouts } from "../src/utils/responsiveLayout";
import type { ShapeElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const element = materializeElementLayouts({ id: "shape", type: "shape", name: "Forme de test", x: 20, y: 30, width: 202, height: 204, rotation: 0, opacity: 1, visible: true, zIndex: 1, shape: "rectangle", fill: "#ddd", stroke: "#333", strokeWidth: 1, cornerRadius: 0, locked: false, animation: { type: "none", duration: 1, delay: 0 } } as ShapeElement);
useEditorStore.setState({ project: { id: "dimensions-test", name: "Test local", introductionMode: "none", pages: [{ id: "page", name: "Document", background: { type: "color", color: "#fff" }, elements: [element, { ...structuredClone(element), id: "other", name: "Autre forme", width: 150 }] }], customFonts: [] } as WeddingProject, currentPageId: "page", selectedElementId: "shape", selectedElementIds: ["shape"], previewDevice: "mobile", sidebarView: "elements", past: [], future: [] });

function Fixture() {
  const state = useEditorStore();
  const selected = state.project!.pages[0].elements.find((item) => item.id === state.selectedElementId)!;
  return <>
    <p>Test local sans sauvegarde distante</p>
    <div>{(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{device}</button>)}</div>
    <button onClick={() => state.selectElement(state.selectedElementId === "shape" ? "other" : "shape")}>Changer d’élément</button>
    <button onClick={() => state.toggleElementLocked(selected.id)}>Verrouiller / déverrouiller</button>
    <button onClick={() => state.updateElementLayout(selected.id, { width: 250 })}>Largeur externe 250</button>
    <pre id="saved">{JSON.stringify({ device: state.previewDevice, selected: selected.id, layout: getElementLayout(selected, state.previewDevice), mobile: getElementLayout(selected, "mobile"), tablet: getElementLayout(selected, "tablet"), desktop: getElementLayout(selected, "desktop"), undoEntries: state.past.length })}</pre>
    <div style={{ width: 320 }}><PropertiesPanel onPreviewOpening={() => {}} /></div>
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
