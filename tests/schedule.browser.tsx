// No EditorPage, no autosave, no network mutations. Real Properties, Konva and DOM renderers.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Konva from "konva";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { makeScheduleElement } from "../src/features/elements/elementFactories";
import { getElementLayout } from "../src/utils/responsiveLayout";
import { getScheduleLayout } from "../src/utils/scheduleLayout";
import { getImageRenderLayout } from "../src/utils/imageLayout";
import { ProgramStepIconPicker } from "../src/features/elements/ProgramStepIconPicker";
import type { ProgramCustomIcon } from "../src/types/editor";
import type { ScheduleElement, WeddingProject } from "../src/types/editor";
import type { PreviewDevice } from "../src/config/previewDevices";
import { PREVIEW_DEVICES } from "../src/config/previewDevices";
import "../src/styles.css";

const make = () => ({ ...makeScheduleElement(), id: "programme", x: 20, y: 20, width: 350, height: 300,
  responsive: { tablet: { x: 24, y: 24, width: 720, height: 310 }, desktop: { x: 40, y: 40, width: 1360, height: 310 } },
}) as ScheduleElement;
const project = { id: "local-schedule", name: "Programme local", status: "draft", paymentStatus: "unpaid", introductionMode: "none", customFonts: [], pages: [{ id: "page", name: "Faire-part", background: { type: "color", color: "#eee7df" }, elements: [make()] }] } as WeddingProject;
useEditorStore.getState().setProject(project);
useEditorStore.setState({ currentPageId: "page", previewDevice: "mobile", sidebarView: "elements", selectedElementId: "programme", selectedElementIds: ["programme"], past: [], future: [], zoom: .9 });
usePropertyPanelStore.setState({ propertySectionOpenState: { contenu: true, disposition: false, style: false } });
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const icons = ["map-pin", "wedding-rings", "utensils", "music"];
const imageFixture = (type: string, width: number, height: number) => {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#d83166"; ctx.fillRect(width * .1, height * .15, width * .7, height * .6);
  ctx.fillStyle = "#2576bd"; ctx.fillRect(width * .5, height * .3, width * .4, height * .5);
  return canvas.toDataURL(type);
};
const customIcons: ProgramCustomIcon[] = [
  { type: "custom", url: imageFixture("image/png", 120, 30), name: "horizontal.png" },
  { type: "custom", url: imageFixture("image/webp", 30, 120), name: "vertical.webp" },
];

function compare() {
  const state = useEditorStore.getState();
  const element = state.project!.pages[0].elements[0] as ScheduleElement;
  const layout = getScheduleLayout(element, getElementLayout(element, state.previewDevice));
  const canvasGroup = Konva.stages.at(-1)!.findOne("#programme")!;
  const canvasSteps = canvasGroup.find(".schedule-step");
  const dom = document.querySelector("#dom-view .schedule-renderer")!;
  const bounds = dom.getBoundingClientRect();
  const scale = bounds.width / layout.width;
  const checkNear = (a: number, b: number, label: string) => { if (Math.abs(a - b) > .2) throw new Error(`${label}: ${a} != ${b}`); };
  checkNear(bounds.height / scale, layout.height, "height");
  layout.steps.forEach((step, index) => {
    const nodes = canvasSteps[index];
    const row = dom.querySelector(`[data-schedule-step="${step.id}"]`)!;
    const domIcon = row.querySelector("[data-schedule-icon]");
    if (Boolean(domIcon) !== Boolean(step.icon)) throw new Error("DOM icon mismatch");
    if (step.icon?.source.type === "custom") {
      const node = nodes.findOne(".schedule-custom-icon") as Konva.Image;
      if (!node || !node.image()) throw new Error("Konva custom icon not loaded");
      const img = domIcon as HTMLImageElement;
      if (!img.complete || !img.naturalWidth) throw new Error("DOM custom icon not loaded");
      if (getComputedStyle(img).objectFit !== "contain") throw new Error("DOM crop");
      const fit = getImageRenderLayout(img.naturalWidth, img.naturalHeight, step.icon.size, step.icon.size, "contain");
      checkNear(node.x(), step.icon.x + fit.x, "custom x");
      checkNear(node.y(), step.icon.y + fit.y, "custom y");
      checkNear(node.width(), fit.width, "custom width");
      checkNear(node.height(), fit.height, "custom height");
      if ((node.image() as HTMLImageElement).src !== img.src) throw new Error("different custom source");
    } else if (step.icon) {
      const group = nodes.findOne(`.schedule-icon-${step.icon.id}`)!;
      if (!group) throw new Error("Konva icon missing");
      const shape = group.findOne("Path, Circle") as Konva.Shape;
      if (shape.stroke() !== (element.iconColor ?? element.accentColor)) throw new Error("Konva icon color");
      const rect = domIcon!.getBoundingClientRect();
      checkNear(rect.width / scale, step.icon.size, "preset size");
    }
    step.text.forEach((text) => {
      const node = nodes.findOne(`.schedule-${text.role}`) as Konva.Text;
      const tag = text.role === "title" ? "strong" : text.role === "description" ? "p" : "time";
      const textDom = row.querySelector(tag)!;
      const rect = textDom.getBoundingClientRect();
      if (node.text() !== text.text || textDom.textContent !== text.text) throw new Error("wrap differs");
      checkNear((rect.x - bounds.x) / scale, node.x(), "x");
      checkNear((rect.y - bounds.y) / scale, node.y(), "y");
      checkNear(rect.width / scale, node.width(), "width");
      checkNear(parseFloat(getComputedStyle(textDom).fontSize) / scale, node.fontSize(), "font size");
    });
  });
  return { device: state.previewDevice, orientation: layout.orientation, style: element.displayStyle, icons: layout.steps.filter((step) => step.icon).length, columns: layout.columns, stepGap: layout.stepGap, height: layout.height, passed: true };
}

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"preview" | "public">("preview");
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const element = state.project!.pages[0].elements[0] as ScheduleElement;
  const layout = getScheduleLayout(element, getElementLayout(element, state.previewDevice));
  const update = (changes: Partial<ScheduleElement>) => state.updateElement(element.id, changes);
  const audit = async () => {
    setBusy(true);
    const results = [];
    try {
      await document.fonts.ready;
      for (const device of ["mobile", "tablet", "desktop"] as PreviewDevice[]) {
        state.setPreviewDevice(device);
        for (const orientation of ["vertical", "horizontal"] as const) for (const displayStyle of ["list", "timeline", "elegant"] as const) for (const iconMode of ["none", "preset", "mixed"]) for (const stepGap of [0, 20]) {
          update({ orientation, wrapSteps: false, displayStyle, items: element.items.map((item, index) => ({ ...item, icon: iconMode === "mixed" && index < 2 ? customIcons[index] : iconMode === "none" ? undefined : icons[index % icons.length] })) });
          state.updateElementLayout(element.id, { stepGap });
          await tick();
          await tick();
          for (let attempt = 0; attempt < 30 && Array.from(document.querySelectorAll<HTMLImageElement>("#dom-view [data-schedule-custom-icon]")).some((img) => !img.complete); attempt++) await tick();
          results.push(compare());
        }
      }
      setResult(results);
    } catch (error) { setResult({ error: String(error), results }); }
    finally { setBusy(false); }
  };
  return <div style={{ padding: 16 }}>
    <h1 style={{ fontSize: 22 }}>Programme — banc local sans sauvegarde distante</h1>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{PREVIEW_DEVICES[device].label}</button>)}
      <button onClick={() => state.selectElement(element.id)}>Sélectionner Programme</button>
      <button onClick={() => update({ items: element.items.map((item, index) => ({ ...item, icon: icons[index % icons.length] })) })}>Ajouter les icônes</button>
      <button onClick={() => update({ items: element.items.map((item, index) => ({ ...item, icon: index < 2 ? customIcons[index] : icons[index % icons.length] })) })}>Icônes mixtes</button>
      <button onClick={() => update({ iconColor: "#2563aa55", iconSize: 32 })}>Icônes bleues transparentes</button>
      <button onClick={() => update({ items: element.items.map((item) => ({ ...item, icon: undefined })) })}>Retirer les icônes</button>
      <button onClick={() => update({ orientation: undefined, items: element.items.map((item) => ({ ...item, icon: undefined })) })}>Ancien programme</button>
      <button onClick={() => update({ items: element.items.map((item) => ({ ...item, description: "Une longue description qui doit rester visible et ne jamais chevaucher une autre étape du programme." })) })}>Descriptions longues</button>
      <button onClick={() => { state.setProject(JSON.parse(JSON.stringify(state.project))); state.selectElement(element.id); }}>Recharger JSON</button>
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Rendu {mode}</button>
      <button onClick={() => { try { setResult(compare()); } catch (error) { setResult(String(error)); } }}>Comparer les renderers</button>
      <button disabled={busy} onClick={() => void audit()}>Auditer les 108 configurations</button>
    </div>
    <details><summary>Import local isolé — même sélecteur, Storage simulé</summary>
      <a download="horizontal.png" href={customIcons[0].url}>Télécharger fixture PNG</a>{" "}
      <a download="vertical.webp" href={customIcons[1].url}>Télécharger fixture WebP</a>
      <div id="local-import" style={{ maxWidth: 280 }}><ProgramStepIconPicker item={element.items[0]} stepNumber={99} project={state.project!}
        onSelect={(icon) => update({ items: element.items.map((item, index) => index === 0 ? { ...item, icon } : item) })}
        onImport={(icon) => { update({ items: element.items.map((item, index) => index === 0 ? { ...item, icon, customIcon: icon } : item) }); return true; }}
        onRemoveCustom={() => update({ items: element.items.map((item, index) => index === 0 ? { ...item, icon: null, customIcon: undefined } : item) })}
        uploadIcon={async (_project, file) => ({ type: "custom", name: file.name, url: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }) })}
      /></div>
    </details>
    <pre id="schedule-state" style={{ fontSize: 11, maxHeight: 45, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify({ device: state.previewDevice, orientation: layout.orientation, columns: layout.columns, height: layout.height, element })}</pre>
    <pre id="schedule-results" style={{ fontSize: 11, maxHeight: 35, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(result)}</pre>
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(350px, 1fr) minmax(350px, 1fr)", gap: 12, alignItems: "start", height: 650 }}>
      <PropertiesPanel onPreviewOpening={() => {}} />
      <div><h2 style={{ fontSize: 16 }}>Editor Konva</h2><div style={{ height: 650, display: "flex", overflow: "auto" }}><EditorCanvas /></div></div>
      <div id="dom-view" style={{ "--renderer-max-width": `${PREVIEW_DEVICES[state.previewDevice].width * state.zoom}px` } as React.CSSProperties}>
        <h2 style={{ fontSize: 16 }}>Renderer {mode}</h2><WeddingRenderer project={state.project!} device={state.previewDevice} mode={mode} playAnimations={false} />
      </div>
    </div>
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
