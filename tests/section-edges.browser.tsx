// Real renderers and controls; no EditorPage/autosave or remote writes.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Konva from "konva";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore, makeTextElement } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { getSectionShape } from "../src/utils/sectionEdges";
import { getElementLayout } from "../src/utils/responsiveLayout";
import { PREVIEW_DEVICES, type PreviewDevice } from "../src/config/previewDevices";
import type { PageBackground, SectionEdgeConfig, SectionElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const canvas = document.createElement("canvas"); canvas.width = 420; canvas.height = 100;
const ctx = canvas.getContext("2d")!;
const gradient = ctx.createLinearGradient(0, 0, 420, 100); gradient.addColorStop(0, "#e6bca9"); gradient.addColorStop(1, "#557564");
ctx.fillStyle = gradient; ctx.fillRect(0, 0, 420, 100); ctx.fillStyle = "#fff7e6"; ctx.beginPath(); ctx.arc(300, 40, 25, 0, 2 * Math.PI); ctx.fill();
const imageUrl = canvas.toDataURL("image/png");
const section: SectionElement = { id: "decorative-section", type: "section", name: "Section", x: 0, y: 0, width: 390, height: 320, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, background: { type: "color", color: "#eee1d1" }, padding: 20, cornerRadius: 12, responsive: { tablet: { width: 768 }, desktop: { width: 1440 } } };
const text = { ...makeTextElement(), id: "child-text", sectionId: section.id, x: 40, y: 76, width: 300, height: 65, text: "Emma & Lucas", fontSize: 38 };
const image = { id: "child-image", type: "image", name: "Image contenue", sectionId: section.id, src: imageUrl, alt: "Visuel local", x: 70, y: 155, width: 230, height: 80, fit: "contain", rotation: 0, opacity: 1, visible: true, zIndex: 3 };
const next: SectionElement = { ...section, id: "next-section", y: 320, height: 160, background: { type: "color", color: "#dae2d8" }, cornerRadius: 0 };
const project = { id: "local-edges", name: "Découpes locales", introductionMode: "none", status: "draft", paymentStatus: "unpaid", customFonts: [], pages: [{ id: "page", name: "Document", background: { type: "color", color: "#dae2d8" }, elements: [section, text, image, next] }] } as WeddingProject;
useEditorStore.getState().setProject(project);
useEditorStore.setState({ currentPageId: "page", selectedElementId: section.id, selectedElementIds: [section.id], sidebarView: "elements", previewDevice: "mobile", zoom: .8, past: [], future: [] });
usePropertyPanelStore.setState({ propertySectionOpenState: { apparence: true, section: false, disposition: false } });
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const edge = (style: SectionEdgeConfig["style"]) => ({ enabled: style !== "none", style, height: 36, intensity: 1 });
const combinations = [["none", "none"], ["none", "tear"], ["wave", "none"], ["scallop", "diagonal"]] as const;
const backgrounds: PageBackground[] = [{ type: "color", color: "#eee1d1" }, { type: "color", color: "#e2b58c80" }, { type: "gradient", gradient: { type: "linear", angle: 135, color1: "#f5e4ce", color2: "#729383" } }, { type: "image", imageUrl }, { type: "gradient", gradient: { type: "radial", color1: "#f5e4ce", color2: "#72938380" } }];

async function compare() {
  const state = useEditorStore.getState();
  const current = state.project!.pages[0].elements[0] as SectionElement;
  const layout = getElementLayout(current, state.previewDevice);
  const shape = getSectionShape(layout.width, layout.height, layout.topEdge, layout.bottomEdge);
  const group = Konva.stages.at(-1)!.findOne(`#${section.id}`)!;
  const surface = group.findOne(".section-corner-clip") as Konva.Group;
  const clip = group.findOne(".section-edge-clip") as Konva.Group;
  const coords: number[][] = [];
  clip.getAttr("clipFunc")({ beginPath() {}, closePath() {}, moveTo: (x: number, y: number) => coords.push([x, y]), lineTo: (x: number, y: number) => coords.push([x, y]) });
  if (JSON.stringify(coords) !== JSON.stringify(shape.points)) throw new Error("Konva path differs");
  const svg = document.querySelector<SVGSVGElement>(`#dom-view [data-section-surface="${section.id}"]`)!;
  if (svg.dataset.sectionPath !== shape.path) throw new Error("DOM path differs");
  const bounds = surface.getClientRect({ skipTransform: true });
  if (Math.abs(bounds.width - layout.width) > .1 || Math.abs(bounds.height - layout.height) > .1) throw new Error("Surface/Transformer bounds changed");
  const surfaceWrapper = document.querySelector(`#dom-view .rich-render-section`)!;
  const groupWrapper = surfaceWrapper.parentElement!;
  if (getComputedStyle(groupWrapper).overflow === "hidden") throw new Error("Section children clipped");
  if (groupWrapper.querySelector(".render-image-frame")?.parentElement === surfaceWrapper) throw new Error("Child in clipped surface");
  const canvasCopy = surface.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 });
  const konvaCanvas = canvasCopy.toCanvas({ x: 0, y: 0, width: layout.width, height: layout.height, pixelRatio: 1 }); canvasCopy.destroy();
  const svgCopy = svg.cloneNode(true) as SVGSVGElement; svgCopy.setAttribute("width", String(layout.width)); svgCopy.setAttribute("height", String(layout.height));
  const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgCopy)], { type: "image/svg+xml" }));
  const svgImage = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = blobUrl; });
  const domCanvas = document.createElement("canvas"); domCanvas.width = layout.width; domCanvas.height = layout.height;
  domCanvas.getContext("2d")!.drawImage(svgImage, 0, 0, layout.width, layout.height); URL.revokeObjectURL(blobUrl);
  const a = konvaCanvas.getContext("2d")!.getImageData(0, 0, layout.width, layout.height).data;
  const b = domCanvas.getContext("2d")!.getImageData(0, 0, layout.width, layout.height).data;
  let count = 0, differing = 0;
  for (let y = 4; y < layout.height - 4; y += 13) for (let x = 4; x < layout.width - 4; x += 13) {
    const index = (y * layout.width + x) * 4;
    // Include translucent gradients too; the small tolerance allows edge anti-aliasing.
    count++;
    if (Math.max(...[0, 1, 2, 3].map((channel) => Math.abs(a[index + channel] - b[index + channel]))) > 5) differing++;
  }
  if (differing > Math.max(3, count * .01)) throw new Error(`pixels differ ${differing}/${count} (${current.background.type})`);
  return { device: state.previewDevice, top: layout.topEdge?.style, bottom: layout.bottomEdge?.style, background: current.background.type, pixelSamples: count, differing, passed: true };
}

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"preview" | "public">("preview");
  const [result, setResult] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const current = state.project!.pages[0].elements[0] as SectionElement;
  const audit = async () => {
    setBusy(true); const results = [];
    try {
      for (const device of ["mobile", "tablet", "desktop"] as PreviewDevice[]) {
        state.setPreviewDevice(device);
        for (const [top, bottom] of combinations) for (const background of backgrounds) {
          state.updateElementLayout(section.id, { topEdge: edge(top), bottomEdge: edge(bottom) });
          state.updateElement(section.id, { background });
          await tick(); await tick();
          results.push(await compare());
        }
      }
      setResult(results);
    } catch (error) { setResult({ error: String(error), results }); } finally { setBusy(false); }
  };
  return <div style={{ padding: 16 }}><h1 style={{ fontSize: 22 }}>Finitions décoratives — vérification locale</h1>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
      {(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{PREVIEW_DEVICES[device].label}</button>)}
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Rendu {mode}</button>
      <button disabled={busy} onClick={() => void audit()}>Auditer 60 configurations</button>
      <button onClick={() => void compare().then(setResult).catch((error) => setResult(String(error)))}>Comparer</button>
      <button onClick={() => state.updateElement(section.id, { background: backgrounds[2] })}>Fond dégradé</button>
      <button onClick={() => state.updateElement(section.id, { background: backgrounds[3] })}>Fond image</button>
      <button onClick={() => { state.setProject(JSON.parse(JSON.stringify(state.project))); state.selectElement(section.id); }}>Recharger JSON</button>
    </div>
    <pre id="edge-state" style={{ fontSize: 10, maxHeight: 35, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify({ device: state.previewDevice, ...getElementLayout(current, state.previewDevice) })}</pre>
    <pre id="edge-results" style={{ fontSize: 10, maxHeight: 35, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(result)}</pre>
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(350px, 1fr) minmax(350px, 1fr)", gap: 12, alignItems: "start" }}>
      <div style={{ height: 600, overflow: "auto" }}><PropertiesPanel onPreviewOpening={() => {}} /></div>
      <div><h2 style={{ fontSize: 16 }}>Editor Konva</h2><div style={{ height: 600, display: "flex", overflow: "auto" }}><EditorCanvas /></div></div>
      <div id="dom-view"><h2 style={{ fontSize: 16 }}>Renderer {mode}</h2><WeddingRenderer project={state.project!} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
    </div>
  </div>;
}
const root = createRoot(document.getElementById("root")!); root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
