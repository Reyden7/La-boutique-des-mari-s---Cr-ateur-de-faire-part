// Real application renderers; an in-memory project without remote autosave.
import React, { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OpeningProperties } from "../src/features/openings/OpeningProperties";
import { OpeningPreview } from "../src/features/openings/OpeningPreview";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { InvitationExperience } from "../src/features/music/InvitationExperience";
import { ResponsiveEnvelopeOpening as VerticalEnvelopeOpening } from "../src/features/openings/animations/ResponsiveEnvelopeOpening";
import { getEnvelopeTimeline } from "../src/features/openings/envelopeSettings";
import { useEditorStore, makeTextElement } from "../src/stores/editorStore";
import { createBlankProject } from "../src/templates/templates";
import { normalizeProject } from "../src/utils/storage";
import { getOpeningDefinition } from "../src/features/openings/registry/openingRegistry";
import { PREVIEW_DEVICES, type PreviewDevice } from "../src/config/previewDevices";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { EditorWorkspace } from "../src/components/editor/EditorWorkspace";
import { upsertProject, getProject } from "../src/utils/storage";
import "../src/styles.css";

const project = normalizeProject(createBlankProject())!;
project.name = "Mariage — Emma & Lucas";
project.introductionMode = "classic";
project.opening = getOpeningDefinition("envelope").defaultSettings;
project.audio.enabled = false;
project.particles.enabled = false;
project.rsvp!.enabled = false;
project.pages[0].height = 1400;
project.pages[0].background = { type: "image", imageUrl: "/assets/welcome/backgrounds/wheat-field.png" };
const heading = { ...makeTextElement(), text: "Emma\n& Lucas", x: 25, y: 180, width: 340, height: 180, fontSize: 52, color: "#fff", animation: { type: "none" as const, duration: 0, delay: 0 } };
const sub = { ...heading, id: crypto.randomUUID(), text: "Nous nous marions\n18 juin 2027", y: 460, height: 100, fontSize: 22 };
const footer = { ...heading, id: crypto.randomUUID(), text: "La suite du faire-part", y: 1080, height: 70, fontSize: 22 };
for (const element of [heading, sub, footer]) {
  element.responsive = Object.fromEntries((["tablet", "desktop"] as const).map((device) => {
    const ratio = PREVIEW_DEVICES[device].width / 390;
    return [device, { x: element.x * ratio, y: element.y * ratio, width: element.width * ratio, height: element.height * ratio, fontSize: element.fontSize * ratio }];
  }));
}
project.pages[0].elements = [heading, sub, footer];
useEditorStore.setState({ project, currentPageId: project.pages[0].id, previewDevice: "mobile", past: [], future: [] });

function customSeal() {
  const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 120;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ae373b"; ctx.beginPath(); ctx.arc(60,60,50,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#eed19c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(60,60,40,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle = "#fff0cb"; ctx.font = "25px Georgia"; ctx.textAlign = "center"; ctx.fillText("E & L",60,69);
  return canvas.toDataURL("image/png");
}

function Fixture() {
  const state = useEditorStore();
  const [mode, setMode] = useState("configuration");
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  const [key, setKey] = useState(0);
  const [report, setReport] = useState("");
  const [counts, setCounts] = useState({ interact: 0, complete: 0, action: 0 });
  const [inspecting, setInspecting] = useState(false);
  const [step, setStep] = useState("Fermée");
  const started = useRef(0);
  const current = state.project!;
  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".envelope-trigger, .png-envelope-trigger") || document.querySelector("[data-envelope-phase]")?.getAttribute("data-envelope-phase") !== "closed") return;
      started.current = performance.now(); setInspecting(true);
    };
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, []);
  useEffect(() => {
    if (!inspecting) return;
    const node = document.querySelector(".envelope-invitation, .png-envelope-content");
    if (!node) return;
    const initialWidth = (node as HTMLElement).clientWidth; const samples: unknown[] = [];
    const initialTop = node.getBoundingClientRect().top;
    const png = Boolean(document.querySelector(".png-envelope-stage"));
    const initialSeal = document.querySelector(".png-envelope-seal")?.getBoundingClientRect();
    const initialFlap = document.querySelector(".png-envelope-right-group")?.getBoundingClientRect();
    const timeline = getEnvelopeTimeline(current.opening.duration);
    let request = 0;
    const inspect = () => {
      const phase = document.querySelector("[data-envelope-phase]")?.getAttribute("data-envelope-phase");
      const rect = node.getBoundingClientRect();
      const elapsed = (performance.now()-started.current)/1000;
      setStep(phase === "complete" ? "Terminée" : elapsed >= timeline.handoff.delay ? "Transition" : elapsed >= timeline.bottom.delay ? "Bas" : elapsed >= timeline.left.delay ? "Côtés" : elapsed >= timeline.top.delay ? "Rabat" : "Cachet");
      const panels = Array.from(document.querySelectorAll<HTMLElement>(".envelope-panel, .png-envelope-base, .png-envelope-right-group")).map((p)=>{
        const matrix = new DOMMatrixReadOnly(getComputedStyle(p).transform);
        return {id:p.className,x:matrix.m41,y:matrix.m42,rotation3D:matrix.m13!==0||matrix.m23!==0,opacity:getComputedStyle(p).opacity};
      });
      const seal = document.querySelector(".png-envelope-seal")?.getBoundingClientRect();
      const flap = document.querySelector(".png-envelope-right-group")?.getBoundingClientRect();
      const sealAttached = !seal || !flap || !initialSeal || !initialFlap || Math.abs((seal.left-flap.left)-(initialSeal.left-initialFlap.left)) < .1;
      samples.push({ phase, time: Math.round(performance.now()-started.current), width: rect.width, top: rect.top, panels, sealAttached, sameNode: document.querySelector(".envelope-invitation, .png-envelope-content") === node, naturalWidthStable: (node as HTMLElement).clientWidth === initialWidth });
      if (phase === "complete") {
        const rows = samples as Array<{time:number;sameNode:boolean;naturalWidthStable:boolean;sealAttached:boolean;top:number;panels:Array<{id:string;x:number;y:number;rotation3D:boolean;opacity:string}>}>;
        const panels = rows.flatMap(r=>r.panels);
        setReport(JSON.stringify({png,samples:rows.length,elapsed:rows.at(-1)?.time,sameNode:rows.every((s)=>s.sameNode),naturalWidthStable:rows.every((s)=>s.naturalWidthStable),stationaryDocument:rows.every(s=>Math.abs(s.top-initialTop)<.1),sealAttached:rows.every(s=>s.sealAttached),horizontalOnly:panels.every(p=>p.y===0&&!p.rotation3D),hingedTop:panels.some(p=>p.id.includes("envelope-top")&&p.rotation3D),sidesMoveOut:panels.some(p=>(p.id.includes("envelope-left")||p.id.includes("png-envelope-base"))&&p.x<0)&&panels.some(p=>p.id.includes("envelope-right")&&p.x>0),bottomMovesDown:panels.some(p=>p.id.includes("envelope-bottom")&&p.y>0),noOverlay:!document.querySelector(".envelope-overlay, .png-envelope-overlay")})); setInspecting(false);
      }
      else request = requestAnimationFrame(inspect);
    };
    request = requestAnimationFrame(inspect);
    return () => cancelAnimationFrame(request);
  }, [inspecting]);
  const replay = () => { setKey((v) => v+1); setCounts({interact:0,complete:0,action:0}); setReport(""); setStep("Fermée"); };
  const inspection = <><output id="qa-step" style={{position:"fixed",top:2,left:2,zIndex:200,color:"#ddd",fontSize:10,pointerEvents:"none"}}>{step}</output><pre id="qa-report" style={{display:"none"}}>{report}</pre></>;
  if (mode === "preview" || mode === "opening-preview") {
    const close = () => setMode("configuration");
    return <>{inspection}{mode === "preview" ? <PreviewMode key={key} project={current} device={device} onClose={close} /> : <OpeningPreview key={key} project={current} type="envelope" device={device} onClose={close} onUse={(opening) => state.updateOpening(opening)} />}</>;
  }
  if (mode === "public") return <>
    {inspection}
    <div style={{position:"fixed",top:8,right:8,zIndex:100,display:"flex",gap:8}}><button onClick={()=>setMode("configuration")}>Retour au test</button><button onClick={replay}>Rejouer Public</button></div>
    <div className="public-invite" key={key}><InvitationExperience project={current} mode="public" /></div>
  </>;
  return <main style={{ padding: 12 }}>
    <h1>Enveloppe verticale — test local</h1><p>Projet temporaire : aucune publication ni sauvegarde distante.</p>
    <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {(["mobile","tablet","desktop"] as const).map((d) => <button key={d} onClick={() => { setDevice(d); state.setPreviewDevice(d); replay(); }}>{PREVIEW_DEVICES[d].label}</button>)}
      <button onClick={() => setMode("preview")}>Aperçu complet</button><button onClick={() => setMode("opening-preview")}>Aperçu de l’ouverture</button>
      <button onClick={() => { state.setSidebarView("introduction"); setMode("editor"); }}>Réglages dans le canvas</button>
      <button onClick={() => { setMode("public"); replay(); }}>Public responsive</button>
      <button onClick={() => { setMode("test"); replay(); }}>Contrôle des clics</button>
      <button onClick={() => { state.updateOpening({ ...current.opening, customSettings: { ...current.opening.customSettings, sealImageUrl: customSeal(), sealImageName: "cachet-alpha.png" } }); replay(); }}>Cachet PNG transparent</button>
      <button onClick={() => { state.updateOpening({ ...current.opening, colors: ["#85855F", "#d7dec3", "#8e663f"], customSettings: { ...current.opening.customSettings, flapColor: "#85855F" } }); replay(); }}>Papier olive</button>
      <button onClick={() => { state.updateOpening({ ...current.opening, envelope: { ...current.opening.envelope, baseAsset: { type: "custom", id: "missing-base", name: "Base indisponible", url: `${location.origin}/__qa-envelope-assets/missing-base` } } }); replay(); }}>Tester base inaccessible</button>
      <button onClick={() => {
        // Synthetic bitmap solely to test WebP decoding/alpha; no user artwork edited.
        const canvas = document.createElement("canvas"); canvas.width = 180; canvas.height = 180;
        const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#be363b"; ctx.beginPath(); ctx.arc(90,90,70,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = "#ffe5a6"; ctx.font = "32px Georgia"; ctx.textAlign = "center"; ctx.fillText("QA",90,101);
        canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "envelope-qa-transparent.webp"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, "image/webp");
      }}>Télécharger WebP de test</button>
      <button onClick={() => { state.setProject({...current,pages:current.pages.map((page)=>({...page,elements:page.elements.map((element)=>({...element,animation:{type:"fade",duration:1,delay:0}}))}))}); replay(); }}>Activer les fondus du contenu</button>
      <button onClick={() => { upsertProject(current); const restored = getProject(current.id)!; state.setProject(restored); setReport(JSON.stringify(restored.opening.envelope ?? restored.opening.customSettings)); }}>Sauver et recharger localement</button>
      <button onClick={replay}>Réinitialiser</button>
    </nav>
    <output id="qa-counts">{JSON.stringify(counts)}</output><output id="qa-step">{step}</output><pre id="qa-report">{report}</pre>
    {mode === "configuration" && <OpeningProperties onPreview={() => setMode("opening-preview")} />}
    {mode === "editor" && <div style={{display:"grid",gridTemplateColumns:"minmax(450px, 1fr) 300px",height:900}}>
      <EditorWorkspace pageName="Introduction"><EditorCanvas /></EditorWorkspace>
      <div style={{overflow:"auto"}}><OpeningProperties onPreview={() => setMode("opening-preview")} /></div>
    </div>}
    {mode === "public" && <div className="public-invite" key={`${device}-${key}`}><InvitationExperience project={current} mode="public" /></div>}
    {mode === "test" && <div style={{width: PREVIEW_DEVICES[device].width, "--preview-device-height": `${PREVIEW_DEVICES[device].height}px`} as React.CSSProperties} key={`${device}-${key}`}>
      <VerticalEnvelopeOpening device={device} config={current.opening} couple="Emma & Lucas" onInteract={() => { started.current=performance.now(); setInspecting(true); setCounts((c)=>({...c,interact:c.interact+1})); }} onComplete={() => setCounts((c)=>({...c,complete:c.complete+1}))}>
        <div style={{height:1400,background:"#597362",padding:30}}><h2>Contenu déjà monté</h2><button onClick={()=>setCounts((c)=>({...c,action:c.action+1}))}>Action du faire-part</button><input defaultValue="État conservé" /></div>
      </VerticalEnvelopeOpening>
    </div>}
  </main>;
}
const rootElement = document.getElementById("root")! as HTMLElement & { envelopeQaRoot?: Root };
rootElement.envelopeQaRoot ??= createRoot(rootElement);
rootElement.envelopeQaRoot.render(<Fixture />);
