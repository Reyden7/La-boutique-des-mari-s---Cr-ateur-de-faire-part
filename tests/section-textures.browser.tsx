// Local-only project. No EditorPage, autosave, upload or remote mutation.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Konva from "konva";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore, makeTextElement } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { SECTION_TEXTURES, resolveSectionTexture } from "../src/config/sectionTextures";
import { getElementLayout } from "../src/utils/responsiveLayout";
import type { PreviewDevice } from "../src/config/previewDevices";
import type { SectionElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const section: SectionElement = { id: "texture-section", type: "section", name: "Section Matière", x: 0, y: 0, width: 390, height: 340, rotation: 0, opacity: 1, zIndex: 1, visible: true, background: { type: "color", color: "#85855F" }, padding: 20, cornerRadius: 12, backgroundType: "color-texture", textureId: "organic", textureOpacity: 1, textureFit: "repeat", bottomEdge: { enabled: true, style: "tear", height: 36 }, isLastSection: true, responsive: { tablet: { width: 768 }, desktop: { width: 1440 } } };
const text = { ...makeTextElement(), id: "child", sectionId: section.id, x: 35, y: 75, width: 320, height: 140, text: "Emma & Lucas\nNotre histoire commence ici", fontSize: 30, color: "#fff9e6" };
const project = { id: "local-textures", name: "Matières locales", introductionMode: "none", status: "draft", paymentStatus: "unpaid", customFonts: [], pages: [{ id: "page", name: "Document", background: { type: "color", color: "#f7f3ec" }, elements: [section, text] }] } as WeddingProject;
useEditorStore.getState().setProject(project);
useEditorStore.setState({ currentPageId: "page", selectedElementId: section.id, selectedElementIds: [section.id], sidebarView: "elements", previewDevice: "mobile", zoom: .8, past: [], future: [] });
usePropertyPanelStore.setState({ propertySectionOpenState: { fond: true, apparence: false, section: false, disposition: false } });
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function compare() {
  const state = useEditorStore.getState();
  const element = state.project!.pages[0].elements[0] as SectionElement;
  const layout = getElementLayout(element, state.previewDevice);
  const texture = resolveSectionTexture(element, layout.width, layout.height);
  const group = Konva.stages.at(-1)!.findOne(`#${section.id}`)!;
  const surface = group.findOne(".section-corner-clip") as Konva.Group;
  if (texture.preset) for (let attempt = 0; attempt < 60 && !surface.findOne(".section-texture"); attempt++) await tick();
  const svg = document.querySelector<SVGSVGElement>(`#dom-view [data-section-surface="${section.id}"]`)!;
  const bounds = surface.getClientRect({ skipTransform: true });
  if (Math.abs(bounds.width - layout.width) > .1 || Math.abs(bounds.height - layout.height) > .1) throw new Error(`Transformer bounds changed: ${JSON.stringify(bounds)} expected ${layout.width}x${layout.height}`);
  if (texture.preset && svg.querySelector("[data-section-texture]")?.getAttribute("data-section-texture") !== texture.preset.id) throw new Error("Texture missing from DOM");
  const clone = surface.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 });
  const editor = clone.toCanvas({ x: 0, y: 0, width: layout.width, height: layout.height, pixelRatio: 1 }); clone.destroy();
  const copy = svg.cloneNode(true) as SVGSVGElement; copy.setAttribute("width", String(layout.width)); copy.setAttribute("height", String(layout.height));
  const src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  const dom = document.createElement("canvas"); dom.width = layout.width; dom.height = layout.height;
  const ctx = dom.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(image, 0, 0); URL.revokeObjectURL(src);
  const a = editor.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, layout.width, layout.height).data;
  const b = ctx.getImageData(0, 0, layout.width, layout.height).data;
  let samples = 0, difference = 0, maxDifference = 0;
  let greenMin = 255, greenMax = 0, alphaMin = 255, alphaMax = 0;
  for (let y = 45; y < layout.height - 45; y += 11) for (let x = 25; x < layout.width - 25; x += 11) {
    const i = (y * layout.width + x) * 4;
    for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); difference += d; maxDifference = Math.max(maxDifference, d); samples++; }
    if (element.backgroundType === "color-texture") {
      greenMin = Math.min(greenMin, a[i + 1]); greenMax = Math.max(greenMax, a[i + 1]);
      alphaMin = Math.min(alphaMin, a[i + 3]); alphaMax = Math.max(alphaMax, a[i + 3]);
      if (a[i + 3] > 0 && (Math.abs(a[i] - a[i + 1]) > 2 || Math.abs(a[i + 2] / a[i] - 95 / 133) > .025)) throw new Error("Olive hue replaced by texture pigment");
      const expectedAlpha = element.background.color === "#85855F80" ? 128 : 255;
      if (Math.abs(a[i + 3] - expectedAlpha) > 1) throw new Error("Background alpha applied more than once");
      if (a[i + 3] === 255 && (a[i] < 106 || a[i] > 160)) throw new Error("Texture overwhelmed the olive base");
      if (texture.opacity === 0 && (Math.abs(a[i] - 133) > 1 || Math.abs(a[i + 2] - 95) > 1)) throw new Error("Zero strength changed the base color");
    }
  }
  const average = difference / samples;
  if (average > 3) throw new Error(`Visual difference ${average} (${texture.fit}, ${texture.preset?.id})`);
  return { device: state.previewDevice, type: element.backgroundType, texture: element.textureId, intensity: texture.opacity, fit: texture.fit, edge: layout.bottomEdge.style, averageDifference: average, maxDifference, greenMin, greenMax, alphaMin, alphaMax, passed: true };
}

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"preview" | "public">("preview");
  const [result, setResult] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const audit = async () => {
    setBusy(true); const results = [];
    try {
      for (const device of ["mobile", "tablet", "desktop"] as PreviewDevice[]) for (const type of ["color", "texture", "color-texture"] as const) for (const fit of ["cover", "contain", "repeat"] as const) for (const edges of [false, true]) {
        state.setPreviewDevice(device);
        state.updateElement(section.id, { backgroundType: type, textureId: "canvas", textureOpacity: type === "color-texture" ? 1 : .6, textureScale: 1, textureFit: fit });
        state.updateElementLayout(section.id, { topEdge: { enabled: edges, style: edges ? "wave" : "none", height: 24 }, bottomEdge: { enabled: edges, style: edges ? "tear" : "none", height: 36 } });
        await tick(); await tick(); results.push(await compare());
      }
      state.setPreviewDevice("mobile");
      for (const preset of SECTION_TEXTURES) {
        state.updateElement(section.id, { backgroundType: "color-texture", textureId: preset.id, textureOpacity: 1, textureFit: "repeat" });
        await tick(); await tick(); results.push(await compare());
      }
      for (const device of ["mobile", "tablet", "desktop"] as PreviewDevice[]) {
        state.setPreviewDevice(device);
        for (const textureId of ["organic", "wet-paper"]) for (const textureOpacity of [0, .25, .5, 1]) {
          state.updateElement(section.id, { textureId, textureOpacity });
          await tick(); await tick(); results.push(await compare());
        }
        state.updateElement(section.id, { background: { type: "color", color: "#85855F80" }, textureOpacity: 1 });
        await tick(); await tick(); results.push(await compare());
        state.updateElement(section.id, { background: { type: "color", color: "#85855F" } });
      }
      setResult(results);
    } catch (error) { setResult({ error: String(error), results }); } finally { setBusy(false); }
  };
  return <main style={{ padding: 16 }}><h1 style={{ fontSize: 22 }}>Matières de section — vérification locale</h1>
    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>{(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{device}</button>)}
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Rendu {mode}</button>
      <button disabled={busy} onClick={() => void audit()}>Auditer les textures</button>
      <button onClick={() => void compare().then(setResult).catch((error) => setResult(String(error)))}>Comparer</button>
      <button onClick={() => { state.setProject(JSON.parse(JSON.stringify(state.project))); state.selectElement(section.id); }}>Recharger JSON</button>
    </div>
    <pre id="texture-results" style={{ fontSize: 10, maxHeight: 65, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(result)}</pre>
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(350px, 1fr) minmax(350px, 1fr)", gap: 12 }}>
      <div style={{ height: 640, overflow: "auto" }}><PropertiesPanel onPreviewOpening={() => {}} /></div>
      <div><h2 style={{ fontSize: 16 }}>Éditeur Konva</h2><div style={{ height: 640, display: "flex", overflow: "auto" }}><EditorCanvas /></div></div>
      <div id="dom-view"><h2 style={{ fontSize: 16 }}>Renderer {mode}</h2><WeddingRenderer project={state.project!} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
    </div>
  </main>;
}
const root = createRoot(document.getElementById("root")!); root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
