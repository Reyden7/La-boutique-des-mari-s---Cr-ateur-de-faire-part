// Real EditorCanvas and InvitationExperience, on an in-memory project without autosave.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/contexts/AuthContext";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { InvitationExperience } from "../src/features/music/InvitationExperience";
import { ParticlePanel } from "../src/features/particles/ParticlePanel";
import { useEditorStore } from "../src/stores/editorStore";
import { createBlankProject } from "../src/templates/templates";
import { normalizeProject } from "../src/utils/storage";
import "../src/styles.css";

function illustration(type: "image/png" | "image/webp", detailed = false) {
  const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 100;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#2a9d8f"; context.fillRect(20, 35, 110, 40);
  context.fillStyle = "#e76f51"; context.beginPath(); context.arc(80, 35, 22, Math.PI, 0); context.fill();
  context.fillStyle = "#e9c46a"; context.fillRect(38, 48, 28, 16);
  context.fillStyle = "#264653"; context.beginPath(); context.arc(45, 75, 12, 0, Math.PI * 2); context.arc(112, 75, 12, 0, Math.PI * 2); context.fill();
  if (detailed) {
    for (let y = 35; y < 73; y += 3) for (let x = 70; x < 127; x += 3) {
      context.fillStyle = `hsl(${x * 3 + y}, 85%, 55%)`; context.fillRect(x, y, 1, 1);
    }
    context.strokeStyle = "#fff"; context.lineWidth = 1; context.strokeRect(19, 34, 112, 42);
  }
  return canvas.toDataURL(type);
}
const samples = [
  { name: "Arche florale PNG", url: "/assets/welcome/arches/floral-columns.png" },
  { name: "Illustration colorée PNG", url: illustration("image/png") },
  { name: "Illustration transparente WebP", url: illustration("image/webp") },
  { name: "Image détaillée PNG", url: illustration("image/png", true) },
];
const project = normalizeProject(createBlankProject())!;
project.name = "Particules — test local";
project.pages[0].elements = [];
project.pages[0].background = { type: "color", color: "#f3e9e2" };
project.introductionMode = "none";
project.rsvp!.enabled = false;
project.particles = { enabled: true, shape: "custom", customImageUrl: samples[0].url, customImageName: samples[0].name, direction: "down", speed: 0, quantity: 12, minSize: 96, maxSize: 96, opacity: .85, colors: ["#ff0000"], layer: "front" };
useEditorStore.setState({ project, currentPageId: project.pages[0].id, selectedElementId: null, selectedElementIds: [], previewDevice: "mobile", sidebarView: "elements", past: [], future: [], zoom: .6 });

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState<"editor" | "preview" | "public">("editor");
  const [sample, setSample] = useState(samples[0].name);
  const [loaded, setLoaded] = useState(false);
  const particles = state.project!.particles;
  const update = (changes: Partial<typeof particles>) => state.updateParticles({ ...particles, ...changes });
  return <main style={{ padding: 12 }}>
    <h1>Particules — couleurs originales</h1><p>Test local isolé, sans upload ni sauvegarde distante.</p>
    <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      {(["editor", "preview", "public"] as const).map((value) => <button key={value} onClick={() => setMode(value)}>{value}</button>)}
      {samples.map((item) => <button key={item.name} onClick={() => { setSample(item.name); if (item.url !== particles.customImageUrl) setLoaded(false); update({ shape: "custom", customImageUrl: item.url, customImageName: item.name }); }}>{item.name}</button>)}
      <button onClick={() => update({ colors: particles.colors[0] === "#ff0000" ? ["#0000ff"] : ["#ff0000"] })}>Changer la palette sans teinter</button>
      <button onClick={() => update({ shape: particles.shape === "custom" ? "heart" : "custom" })}>Basculer preset / image</button>
      <button onClick={() => update({ speed: particles.speed === 0 ? 65 : 0 })}>Basculer vitesse</button>
      <button onClick={() => update({ opacity: particles.opacity === .85 ? .35 : .85 })}>Basculer opacité</button>
      <button onClick={() => update({ minSize: particles.minSize === 96 ? 48 : 96, maxSize: particles.maxSize === 96 ? 48 : 96 })}>Basculer taille</button>
      <button onClick={() => update({ quantity: particles.quantity === 12 ? 6 : 12 })}>Basculer quantité</button>
      <button onClick={() => update({ direction: particles.direction === "down" ? "up-left" : "down" })}>Basculer direction</button>
    </nav>
    <pre id="settings">{JSON.stringify({ mode, sample, sourceLoaded: loaded, shape: particles.shape, colors: particles.colors, opacity: particles.opacity, size: particles.minSize, quantity: particles.quantity, speed: particles.speed, direction: particles.direction })}</pre>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <figure style={{ width: 150, margin: 0 }}>Source originale<img style={{ width: 150, height: 160, objectFit: "contain", background: "#eee" }} src={particles.customImageUrl} alt="Source du motif" onLoad={() => setLoaded(true)} /></figure>
      <div id="rendered" style={{ position: "relative", width: mode === "editor" ? 580 : 390, height: 480, overflow: "hidden", transform: "translateZ(0)", border: "1px solid #c8aa8d" }}>
        {mode === "editor" ? <EditorCanvas /> : <InvitationExperience project={state.project!} device="mobile" mode={mode} />}
      </div>
      <aside id="particle-options" style={{ width: 260, maxHeight: 480, overflow: "auto" }}><ParticlePanel /></aside>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><AuthProvider><Fixture /></AuthProvider></MemoryRouter>);
