import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { OpeningProperties } from "../src/features/openings/OpeningProperties";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { InvitationExperience } from "../src/features/music/InvitationExperience";
import { DoorsOpening } from "../src/features/openings/animations/DoorsOpening";
import { TextEntrance } from "../src/components/renderer/TextEntrance";
import { AnimatedElement } from "../src/components/renderer/AnimatedElement";
import { AnimationProperties } from "../src/components/properties/AnimationProperties";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { EditorWorkspace } from "../src/components/editor/EditorWorkspace";
import { AdminAssetsPage } from "../src/pages/AdminAssetsPage";
import { useEditorStore, makeTextElement } from "../src/stores/editorStore";
import { createBlankProject } from "../src/templates/templates";
import { normalizeProject, upsertProject, getProject } from "../src/utils/storage";
import { getOpeningDefinition } from "../src/features/openings/registry/openingRegistry";
import { DOOR_PARTS, DOOR_PRESETS } from "../src/features/openings/doorAssets";
import { TEXT_ANIMATIONS } from "../src/utils/textAnimation";
import { PREVIEW_DEVICES } from "../src/config/previewDevices";
import type { AnimationConfig } from "../src/types/editor";
import "../src/styles.css";

const project = normalizeProject(createBlankProject())!;
project.name = "Emma & Lucas"; project.introductionMode = "classic";
project.opening = getOpeningDefinition("doors").defaultSettings;
project.audio.enabled = project.particles.enabled = false; project.rsvp!.enabled = false;
project.pages[0].background = { type: "color", color: "#85855f" };
project.pages[0].height = 1800;
project.pages[0].elements = TEXT_ANIMATIONS.map((type, index) => {
  const element = { ...makeTextElement(), text: `${type} — Emma & Lucas\nÉté 2027 👩‍❤️‍👨`, fontFamily: "Georgia", fontSize: 24, color: "#fff", x: 24, y: 60 + index * 220, width: 342, height: 150, animation: { type, duration: 2, delay: .3 } };
  element.responsive = Object.fromEntries((["tablet","desktop"] as const).map((device) => {
    const scale = PREVIEW_DEVICES[device].width / 390;
    return [device, { x: element.x*scale, y: element.y*scale, width: element.width*scale, height: element.height*scale, fontSize: element.fontSize*scale }];
  }));
  return element;
});
useEditorStore.setState({ project, currentPageId: project.pages[0].id, previewDevice: "mobile", sidebarView: "introduction", past: [], future: [] });

function Fixture() {
  const current = useEditorStore((state) => state.project)!;
  const device = useEditorStore((state) => state.previewDevice);
  const [mode,setMode] = useState("configuration"), [key,setKey] = useState(0);
  const [counts,setCounts] = useState({start:0,complete:0,action:0});
  const [report,setReport] = useState("");
  const [animation,setAnimation] = useState<AnimationConfig>({type:"typewriter",duration:6,delay:1,showCursor:true});
  const state = useEditorStore.getState();
  useEffect(() => { (window as any).__qaEnvelopeProject = current; }, [current]);
  const replay = () => setKey((value)=>value+1);
  const back = () => setMode("configuration");
  if (mode === "preview") return <PreviewMode key={key} project={current} device={device} onClose={back} allowDeviceSwitching />;
  if (mode === "public") return <><button onClick={back}>Retour au test</button><button onClick={replay}>Rejouer Public</button><div key={key} className="public-invite"><InvitationExperience project={current} device={device} mode="public" /></div></>;
  const style: React.CSSProperties = { width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia",fontSize:32,fontStyle:"italic",fontWeight:400,letterSpacing:.4,lineHeight:1.3,textAlign:"center",whiteSpace:"pre-wrap",color:"#40332a" };
  return <main style={{padding:16}}>
    <h1>Portes et effets texte — test local isolé</h1>
    <nav style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {(["mobile","tablet","desktop"] as const).map((value)=><button key={value} onClick={()=>{state.setPreviewDevice(value);replay();}}>{PREVIEW_DEVICES[value].label}</button>)}
      <button onClick={()=>setMode("configuration")}>Réglages</button><button onClick={()=>setMode("preview")}>Aperçu complet</button>
      <button onClick={()=>setMode("public")}>Public</button><button onClick={()=>{state.setSidebarView("introduction");setMode("editor");}}>Canvas fermé</button>
      <button onClick={()=>setMode("direct")}>Contrôle ouverture</button><button onClick={()=>setMode("texts")}>Contrôle textes</button>
      <button onClick={()=>setMode("admin")}>Bibliothèque admin</button><button onClick={replay}>Rejouer le test</button>
      <button onClick={()=>{upsertProject(current);const reloaded=getProject(current.id)!;state.setProject(reloaded);setReport(JSON.stringify(reloaded.opening.doors));}}>Sauver / recharger</button>
      <button onClick={()=>{state.updateOpening({...current.opening,doors:{...current.opening.doors,leftAsset:{type:"custom",id:"missing",url:`${location.origin}/missing-door.png`}}});replay();}}>PNG inaccessible</button>
    </nav>
    <label>Paire de portes<select aria-label="Paire de portes" value="choose" onChange={(event)=>{
      const index=Number(event.target.value);if(!Number.isFinite(index))return;
      state.updateOpening({...current.opening,doors:{...current.opening.doors,...Object.fromEntries(DOOR_PARTS.map(part=>[`${part}Asset`,DOOR_PRESETS[part][index]]))}});replay();
    }}><option value="choose">Choisir une paire</option>{DOOR_PRESETS.left.map((item,index)=><option key={item.id} value={index}>{item.name}</option>)}</select></label>
    <output id="qa-counts">{JSON.stringify(counts)}</output><pre id="qa-report">{report}</pre>
    {mode==="configuration" && <OpeningProperties onPreview={()=>setMode("preview")} />}
    {mode==="editor" && <div style={{display:"grid",gridTemplateColumns:"minmax(400px,1fr) 320px",height:900}}><EditorWorkspace pageName="Introduction"><EditorCanvas /></EditorWorkspace><OpeningProperties onPreview={()=>setMode("preview")} /></div>}
    {mode==="admin" && <AdminAssetsPage />}
    {mode==="direct" && <div key={key} style={{width:PREVIEW_DEVICES[device].width,"--preview-device-height":`${PREVIEW_DEVICES[device].height}px`} as React.CSSProperties}>
      <DoorsOpening device={device} config={current.opening} couple={current.name} onInteract={()=>setCounts(c=>({...c,start:c.start+1}))} onComplete={()=>setCounts(c=>({...c,complete:c.complete+1}))}>
        <div style={{height:1600,background:"#85855f",padding:24}}><h2>Vrai contenu derrière</h2><input aria-label="État conservé" defaultValue="Même nœud pendant l’ouverture" /><button onClick={()=>setCounts(c=>({...c,action:c.action+1}))}>Action du faire-part</button></div>
      </DoorsOpening>
    </div>}
    {mode==="texts" && <><div style={{width:320}}><AnimationProperties text animation={animation} onChange={(value)=>{setAnimation(value);replay();}} /></div>
      <div key={key} id="qa-text" style={{width:360,height:170,border:"1px solid #af8f65",marginTop:16}}>
        <AnimatedElement animation={animation} opacity={.8} style={{width:"100%",height:"100%"}} rotation={0}><TextEntrance text={"Emma & Lucas\nÉté 2027 👩‍❤️‍👨"} animation={animation} style={style} /></AnimatedElement>
      </div>
      <div id="qa-static-text" style={{width:360,height:170,marginTop:12}}><div style={style}>{"Emma & Lucas\nÉté 2027 👩‍❤️‍👨"}</div></div>
      <div style={{height:1000}}>Zone de défilement</div><div id="qa-offscreen-text" style={{width:360,height:170}}><TextEntrance key={key} text="Apparition au scroll" animation={animation} style={style} /></div>
    </>}
  </main>;
}
const rootElement = document.getElementById("root")! as HTMLElement & { doorsQaRoot?: ReturnType<typeof createRoot> };
rootElement.doorsQaRoot ??= createRoot(rootElement);
rootElement.doorsQaRoot.render(<BrowserRouter><Fixture /></BrowserRouter>);
