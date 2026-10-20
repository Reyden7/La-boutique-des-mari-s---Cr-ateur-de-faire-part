import React, { useEffect, useState } from "react";
import {createRoot} from "react-dom/client";
import {PreviewMode} from "../src/components/preview/PreviewMode";
import {InvitationViewer} from "../src/features/viewer/InvitationViewer";
import {createBlankProject} from "../src/templates/templates";
import {normalizeProject} from "../src/utils/storage";
import {getOpeningDefinition} from "../src/features/openings/registry/openingRegistry";
import "../src/styles.css";

const initial=normalizeProject(createBlankProject())!;
initial.introductionMode="none";initial.audio.enabled=false;initial.particles.enabled=false;
if(initial.rsvp)initial.rsvp.enabled=true;
initial.pages[0].height=4500;
initial.pages[0].elements=initial.pages[0].elements.map((element,index)=>({...element,y:100+index*700,animation:{type:"fade",duration:.5,delay:0}}));
function Fixture(){
 const [project,setProject]=useState(initial),[mode,setMode]=useState("setup"),[metrics,setMetrics]=useState(""),[diagnostics,setDiagnostics]=useState(true);
 useEffect(()=>{const timer=setInterval(()=>{
  const root=document.querySelector<HTMLElement>(".preview-scroll-surface,.invitation-viewer-scroll");
  const text=root?.querySelector<HTMLElement>(".text-entrance"),input=root?.querySelector<HTMLInputElement>("input");
  setMetrics(JSON.stringify({top:root?.scrollTop,max:root?root.scrollHeight-root.clientHeight:0,selection:text?getComputedStyle(text).userSelect:null,inputSelection:input?getComputedStyle(input).userSelect:null,window:window.scrollY}));
 },250);return()=>clearInterval(timer);},[]);
 const action=(fraction:number)=>{const root=document.querySelector<HTMLElement>(".preview-scroll-surface");if(root)root.scrollTop=(root.scrollHeight-root.clientHeight)*fraction;};
 const actions=<><button onClick={()=>action(.5)}>QA milieu</button><button onClick={()=>action(1)}>QA bas</button><output style={{fontSize:9,maxWidth:180}}>{metrics}</output></>;
 if(mode==="preview")return <PreviewMode project={project} device="mobile" allowDeviceSwitching onClose={()=>setMode("setup")} actions={diagnostics?actions:undefined}/>;
 if(mode==="public")return <InvitationViewer project={project} mode="public" controls={<button style={{position:"absolute",top:0,zIndex:200}} onClick={()=>setMode("setup")}>Retour test</button>}/>;
 return <main><h1>Test local défilement</h1><button onClick={()=>setMode("preview")}>Ouvrir Aperçu</button><button onClick={()=>setMode("public")}>Ouvrir Public</button><button onClick={()=>setDiagnostics(!diagnostics)}>{diagnostics?"Masquer":"Afficher"} les mesures de test</button>{["none","doors","envelope"].map(type=><button key={type} onClick={()=>setProject({...initial,opening:getOpeningDefinition(type).defaultSettings,introductionMode:type==="none"?"none":"classic"})}>Introduction {type}</button>)}</main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
