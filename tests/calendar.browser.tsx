// Actual shared controls/renderers, local store only: no EditorPage/autosave.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Konva from "konva";
import { LeftSidebar } from "../src/components/sidebar/LeftSidebar";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { makeCalendarElement } from "../src/features/elements/elementFactories";
import { useEditorStore } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { getElementLayout } from "../src/utils/responsiveLayout";
import { getCalendarLayout, CALENDAR_STYLES, CALENDAR_DECORATIONS } from "../src/utils/calendarLayout";
import { PREVIEW_DEVICES, type PreviewDevice } from "../src/config/previewDevices";
import type { CalendarElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";
const element = { ...makeCalendarElement(), id: "calendar", x: 40, y: 70, height: 360, responsive: { tablet: { x: 60, y: 70, width: 500, height: 440 }, desktop: { x: 90, y: 70, width: 650, height: 550 } } };
const project = { id: "calendar-local", name: "Calendrier local", status: "draft", paymentStatus: "unpaid", introductionMode: "none", customFonts: [], pages: [{ id: "page", name: "Document", background: { type: "color", color: "#e7ddd3" }, elements: [element] }] } as WeddingProject;
useEditorStore.getState().setProject(project);
useEditorStore.setState({ currentPageId: "page", selectedElementId: element.id, selectedElementIds: [element.id], previewDevice: "mobile", sidebarView: "elements", zoom: .7, past: [], future: [] });
usePropertyPanelStore.setState({ propertySectionOpenState: { disposition: true, contenu: true, titre: false, chiffres: false, decoration: true, apparence: true } });
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function compare() {
  await document.fonts.ready; await tick();
  const state = useEditorStore.getState(); const current = state.project!.pages[0].elements.find((x) => x.type === "calendar") as CalendarElement;
  const layout = getElementLayout(current, state.previewDevice); const scene = getCalendarLayout(current, layout);
  const group = Konva.stages.at(-1)!.findOne(`#${current.id}`)!;
  const texts = group.find("Text"); const domTexts = [...document.querySelectorAll<HTMLElement>("#calendar-dom [data-calendar-role]")];
  if (texts.length !== scene.text.length || domTexts.length !== scene.text.length) throw new Error("Missing calendar text/cells");
  for (const [index, node] of texts.entries()) {
    const expected = scene.text[index], dom = domTexts[index];
    if (node.getAttr("text") !== expected.text || dom.textContent !== expected.text) throw new Error("Text differs");
    if (node.getAttr("fontFamily") !== expected.fontFamily || dom.style.fontFamily.replaceAll('"', '') !== expected.fontFamily) throw new Error("Font alias differs");
    if (Math.abs(node.x() - expected.x) > .01 || Math.abs(node.y() - expected.y) > .01) throw new Error("Konva coordinates differ");
    const actualFont = parseFloat(getComputedStyle(dom).fontSize), rendererWidth = document.querySelector("#calendar-dom .renderer-document")!.getBoundingClientRect().width;
    const expectedFont = expected.fontSize * scene.scale / PREVIEW_DEVICES[state.previewDevice].width * rendererWidth;
    if (Math.abs(actualFont - expectedFont) > .1) throw new Error(`Font size differs ${actualFont}/${expectedFont}`);
  }
  const bounds = group.getClientRect({ skipTransform: true });
  if (Math.abs(bounds.width - layout.width) > 1 || Math.abs(bounds.height - layout.height) > 1) throw new Error("Transformer bounds differ");
  const highlighted = document.querySelector<HTMLElement>("#calendar-dom [aria-current=date]");
  if ((highlighted?.textContent ?? null) !== (scene.highlightedDay === null ? null : String(scene.highlightedDay))) throw new Error("Wrong highlighted cell");
  return { device: state.previewDevice, style: scene.style, decoration: scene.decoration, rows: scene.rows, cells: scene.days, passed: true };
}
function Fixture() {
  const state = useEditorStore(); const [mode, setMode] = useState<"preview" | "public">("preview"); const [busy, setBusy] = useState(false); const [results, setResults] = useState<unknown>(null);
  const current = state.project!.pages[0].elements.find((x) => x.type === "calendar") as CalendarElement | undefined;
  const audit = async () => {
    setBusy(true); const values = [];
    try {
      for (const device of ["mobile", "tablet", "desktop"] as PreviewDevice[]) {
        state.setPreviewDevice(device);
        for (const style of CALENDAR_STYLES) for (const decoration of CALENDAR_DECORATIONS) {
          state.updateElement("calendar", { style: style.id, decorationStyle: decoration.id }); await tick(); values.push(await compare());
        }
      }
      setResults(values);
    } catch (error) { setResults({ error: String(error), completed: values.length }); } finally { setBusy(false); }
  };
  return <div style={{ padding: 16 }}><h1 style={{ fontSize: 22 }}>Calendrier Save the date — validation locale</h1>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>{(["mobile", "tablet", "desktop"] as const).map((device) => <button key={device} onClick={() => state.setPreviewDevice(device)}>{PREVIEW_DEVICES[device].label}</button>)}
      <button onClick={() => setMode(mode === "preview" ? "public" : "preview")}>Rendu {mode}</button><button disabled={busy} onClick={() => void audit()}>Auditer 105 configurations</button>
      <button onClick={() => void compare().then(setResults).catch((error) => setResults(String(error)))}>Comparer</button>
      <button onClick={() => { state.setProject(JSON.parse(JSON.stringify(state.project))); state.selectElement(current?.id ?? null); }}>Recharger JSON</button>
    </div><pre id="calendar-state" style={{ maxHeight: 35, overflow: "auto", fontSize: 10 }}>{JSON.stringify(current)}</pre><pre id="calendar-results" style={{ maxHeight: 35, overflow: "auto", fontSize: 10 }}>{JSON.stringify(results)}</pre>
    <div style={{ display: "grid", gridTemplateColumns: "260px 240px minmax(300px,1fr) minmax(300px,1fr)", gap: 10, alignItems: "start" }}>
      <div style={{ height: 600, overflow: "auto" }}><LeftSidebar onPreviewOpening={() => {}} /></div><div style={{ height: 600, overflow: "auto" }}><PropertiesPanel onPreviewOpening={() => {}} /></div>
      <div><h2 style={{ fontSize: 16 }}>Editor Konva</h2><div style={{ height: 600, display: "flex", overflow: "auto" }}><EditorCanvas /></div></div>
      <div id="calendar-dom"><h2 style={{ fontSize: 16 }}>Renderer {mode}</h2><WeddingRenderer project={state.project!} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
    </div>
  </div>;
}
const root = createRoot(document.getElementById("root")!); root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
