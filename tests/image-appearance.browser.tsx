// Real components, local fixture only: no editor page/autosave, remote upload or payment.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Konva from "konva";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { useEditorStore } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { resolveImageAppearance, setImageAppearanceForDevice, resolveImageFade, normalizeImageAppearance, composeImageAppearance } from "../src/utils/imageAppearance";
import { getElementLayout } from "../src/utils/responsiveLayout";
import { setImageTransformForDevice, DEFAULT_IMAGE_TRANSFORM } from "../src/utils/imageLayout";
import { applyImageFramePreset, resolveImageFrame } from "../src/config/imageFrames";
import { PREVIEW_DEVICES, type PreviewDevice } from "../src/config/previewDevices";
import type { ImageElement, ImageAppearanceConfig, WeddingProject, SectionEdgeStyle } from "../src/types/editor";
import "../src/styles.css";

const source = document.createElement("canvas"); source.width = 600; source.height = 300;
const paint = source.getContext("2d")!;
for (let x = 0; x < 600; x += 12) { paint.fillStyle = x % 24 ? "#d2b093" : "#355754"; paint.fillRect(x, 0, 12, 300); }
paint.clearRect(230, 100, 100, 100); // transparent hole must survive mask + blur
paint.fillStyle = "#e74732"; paint.fillRect(0, 0, 80, 60);
const sourceUrl = source.toDataURL("image/png");
const image: ImageElement = { id: "image-qa", type: "image", name: "Photo", src: "/assets/welcome/backgrounds/sea-view.png", alt: "Image locale de démonstration", x: 30, y: 50, width: 330, height: 320, fit: "cover", opacity: 1, rotation: 0, visible: true, zIndex: 1, locked: false, animation: { type: "none", duration: .8, delay: 0 }, responsive: { tablet: { x: 70, y: 50, width: 500, height: 370 }, desktop: { x: 240, y: 50, width: 720, height: 420 } } };
const project = { id: "image-local-qa", name: "Finitions photo", status: "draft", paymentStatus: "unpaid", introductionMode: "none", customFonts: [], pages: [{ id: "page", name: "Document", background: { type: "color", color: "#f4e9dd" }, elements: [image] }] } as WeddingProject;
useEditorStore.getState().setProject(project);
useEditorStore.setState({ currentPageId: "page", selectedElementId: image.id, selectedElementIds: [image.id], sidebarView: "elements", previewDevice: "mobile", zoom: .8, past: [], future: [] });
usePropertyPanelStore.setState({ propertySectionOpenState: { apparence: true, disposition: false, ajustement: false } });
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const edge = (style: SectionEdgeStyle) => ({ enabled: style !== "none", style, height: 34, intensity: .85, inverted: false });
const cases: ImageAppearanceConfig[] = [
  { bottomEdge: edge("tear") }, { topEdge: edge("wave") }, { topEdge: edge("scallop"), bottomEdge: edge("diagonal") },
  { topEdge: { ...edge("zigzag"), inverted: true }, bottomEdge: edge("cloud") }, { bottomEdge: edge("paper-cut") },
  { topFade: resolveImageFade({ enabled: true }) }, { bottomFade: resolveImageFade({ enabled: true, height: 130, blur: 12, opacity: .2 }) },
  { topEdge: edge("wave"), bottomEdge: edge("tear"), topFade: resolveImageFade({ enabled: true, height: 100, blur: 3 }), bottomFade: resolveImageFade({ enabled: true, height: 100, blur: 9 }) },
];
const current = () => useEditorStore.getState().project!.pages[0].elements[0] as ImageElement;

async function auditPixels() {
  const img = await new Promise<HTMLImageElement>((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = sourceUrl; });
  const make = (value: ImageAppearanceConfig) => composeImageAppearance(img, 600, 300, "contain", DEFAULT_IMAGE_TRANSFORM, normalizeImageAppearance(value));
  const original = make({}), faded = make({ bottomFade: resolveImageFade({ enabled: true, height: 80, blur: 12 }) });
  const a = original.getContext("2d", { willReadFrequently: true })!, b = faded.getContext("2d", { willReadFrequently: true })!;
  const alpha = (ctx: CanvasRenderingContext2D, x: number, y: number) => ctx.getImageData(x * 2, y * 2, 1, 1).data[3];
  if (alpha(b, 50, 299) >= 10 || alpha(b, 50, 230) < 240 || alpha(b, 50, 260) <= 30) throw new Error("Fade is not progressive");
  if (alpha(b, 260, 150) !== 0) throw new Error("Transparent PNG hole was filled");
  // Blur with alpha held at 1 must visibly reduce the contrast of the stripes in the bottom strip.
  const blur = make({ bottomFade: resolveImageFade({ enabled: true, height: 100, blur: 12, opacity: 1, intensity: 1 }) }).getContext("2d", { willReadFrequently: true })!;
  const contrast = (ctx: CanvasRenderingContext2D) => Math.abs(ctx.getImageData(4 * 2, 290 * 2, 1, 1).data[0] - ctx.getImageData(16 * 2, 290 * 2, 1, 1).data[0]);
  if (contrast(blur) >= contrast(a) * .75) throw new Error("Blur did not soften the details");
  const same = b.getImageData(0, 150 * 2, 100, 1).data, before = a.getImageData(0, 150 * 2, 100, 1).data;
  if (same.some((v, i) => v !== before[i])) throw new Error("Fade changed the unaffected middle");
  return { progressive: true, transparentHole: true, trueBlur: true, unaffectedMiddle: true };
}

async function compare() {
  const state = useEditorStore.getState(), element = current(), layout = getElementLayout(element, state.previewDevice);
  const group = Konva.stages.at(-1)!.findOne(`#${image.id}`)! as Konva.Group;
  const node = group.findOne("Image") as Konva.Image;
  const canvas = node?.image() as HTMLCanvasElement;
  const dom = document.querySelector<HTMLCanvasElement>("#dom-view .image-appearance-canvas");
  if (!canvas?.getContext || !dom) throw new Error("A renderer did not use the shared compositor");
  if (canvas.width !== dom.width || canvas.height !== dom.height) throw new Error("Compositing sizes differ");
  // DOM copies the composed canvas into its visible canvas; normalize Konva with that same draw.
  // This avoids comparing raw premultiplied storage against one extra browser draw at alpha edges.
  const output = document.createElement("canvas"); output.width = canvas.width; output.height = canvas.height;
  const ctx = output.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(canvas, 0, 0);
  const a = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const b = dom.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, dom.width, dom.height).data;
  let differing = 0, maximumDifference = 0;
  const samples = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { differing++; maximumDifference = Math.max(maximumDifference, Math.abs(a[i] - b[i])); if (samples.length < 12) samples.push([i, a[i], b[i]]); }
  // CPU/GPU color readback can round a handful of channels by 1/255 after drawImage.
  if (maximumDifference > 1 || differing > a.length * .005) throw new Error(`Compositor pixels differ: ${JSON.stringify({ differing, maximumDifference, samples })}`);
  if (group.opacity() !== element.opacity || group.rotation() !== layout.rotation) throw new Error("Outer transform changed");
  if (group.width() !== layout.width || group.height() !== layout.height) throw new Error("Selection bounds changed");
  return { device: state.previewDevice, fit: element.fit, rotation: layout.rotation, opacity: element.opacity, appearance: resolveImageAppearance(element, state.previewDevice), differing, maximumDifference, comparedChannels: a.length, passed: true };
}

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"preview" | "public">("preview"), [result, setResult] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const audit = async () => {
    setBusy(true); const results = [];
    try {
      const pixels = await auditPixels();
      state.updateElement(image.id, { src: sourceUrl, imageStyle: {} }); await tick(); await tick();
      for (const device of ["mobile", "tablet", "desktop"] as PreviewDevice[]) {
        state.setPreviewDevice(device);
        for (const appearance of cases) for (const fit of ["contain", "cover"] as const) {
          const element = current(); state.updateElement(image.id, { fit, ...setImageAppearanceForDevice(element, device, normalizeImageAppearance(appearance)) });
          state.updateElement(image.id, setImageTransformForDevice(current(), device, { cropX: .3, cropY: .7, cropScale: fit === "cover" ? 1.4 : 1, flipX: fit === "cover", flipY: fit === "contain" }));
          state.updateElementLayout(image.id, { rotation: fit === "cover" ? -25 : 45 }); state.updateElement(image.id, { opacity: .65 });
          await tick(); await tick(); results.push(await compare());
        }
      }
      setResult({ passed: true, mode, count: results.length, pixels, results });
    } catch (error) { setResult({ error: String(error), results }); } finally { setBusy(false); }
  };
  const demo = () => {
    state.setPreviewDevice("mobile"); state.updateElement(image.id, { src: image.src, opacity: 1, fit: "cover", imageStyle: { appearance: cases[7] } }); state.updateElementLayout(image.id, { rotation: 0, x: 30, y: 50, width: 330, height: 320 });
  };
  return <div style={{ padding: 16 }}><h1 style={{ fontSize: 22 }}>Finitions Image — contrôle local</h1>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
      {(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{PREVIEW_DEVICES[device].label}</button>)}
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Rendu {mode}</button>
      <button disabled={busy} onClick={() => void audit()}>Auditer 48 configurations</button>
      <button onClick={() => void compare().then(setResult).catch((e) => setResult(String(e)))}>Comparer</button>
      <button onClick={demo}>Photo démo</button>
      <button onClick={() => state.updateElement(image.id, { imageStyle: { ...current().imageStyle, frame: applyImageFramePreset(resolveImageFrame(undefined), "polaroid") } })}>Cadre Polaroid</button>
      <button onClick={() => { state.setProject(JSON.parse(JSON.stringify(state.project))); state.selectElement(image.id); }}>Recharger JSON</button>
    </div>
    <pre id="image-results" style={{ fontSize: 10, maxHeight: 45, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(result, (key, value) => key === "results" && Array.isArray(value) ? { completed: value.length, maximumDifference: Math.max(...value.map((x) => x.maximumDifference ?? 0)) } : value)}</pre>
    <pre id="image-state" style={{ fontSize: 10, maxHeight: 35, overflow: "auto" }}>{JSON.stringify({ device: state.previewDevice, element: { ...current(), src: current().src.startsWith("data:") ? "local-transparent-test.png" : current().src } })}</pre>
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(350px,1fr) minmax(350px,1fr)", gap: 12, alignItems: "start" }}>
      <div style={{ height: 650, overflow: "auto" }}><PropertiesPanel onPreviewOpening={() => {}} /></div>
      <div><h2 style={{ fontSize: 16 }}>Editor Konva</h2><div style={{ height: 650, display: "flex", overflow: "auto" }}><EditorCanvas /></div></div>
      <div id="dom-view"><h2 style={{ fontSize: 16 }}>Renderer {mode}</h2><WeddingRenderer project={state.project!} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
    </div>
  </div>;
}
const root = createRoot(document.getElementById("root")!); root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
