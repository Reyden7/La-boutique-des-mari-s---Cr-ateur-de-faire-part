import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { InvitationViewer } from "../src/features/viewer/InvitationViewer";
import { createBlankProject } from "../src/templates/templates";
import { normalizeProject } from "../src/utils/storage";
import { makeTextElement } from "../src/stores/editorStore";
import { getOpeningDefinition } from "../src/features/openings/registry/openingRegistry";
import type { WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const initial=normalizeProject(createBlankProject())!;
initial.name="Emma & Lucas"; initial.introductionMode="none"; initial.opening.type="none";
initial.audio.enabled=initial.particles.enabled=false; initial.rsvp!.enabled=false;
initial.pages[0].background={type:"color",color:"#85855f"};
initial.pages[0].elements=[0,1,2,3].map((index)=>({...makeTextElement(),id:`text-${index}`,text:index===0?"Emma & Lucas":index===3?"Fin du faire-part":"Notre mariage\n15 août 2027",fontFamily:"Georgia",fontSize:32,color:"#fffaf4",x:25,y:80+index*800,width:340,height:160,animation:{type:"fade",duration:.3,delay:0},responsive:{tablet:{x:45,y:80+index*800,width:675,height:160,fontSize:44},desktop:{x:80,y:80+index*800,width:1280,height:200,fontSize:70}}}));
function Fixture(){
  const [mode,setMode]=useState("configuration"),[project,setProject]=useState<WeddingProject>(initial);
  const back=()=>setMode("configuration");
  if(mode==="preview")return <PreviewMode project={project} device="mobile" onClose={back} actions={<button onClick={()=>setMode("public")}>Public de test</button>}/>;
  if(mode==="public")return <InvitationViewer project={project}/>;
  return <div style={{minHeight:1800}}><header style={{padding:32,background:"#2f332e",color:"white"}}>Habillage du site — ne doit pas apparaître dans le viewer</header><main style={{padding:20}}>
    <h1>Viewer immersif — test local</h1>
    <button onClick={()=>setMode("preview")}>Aperçu mobile</button><button onClick={()=>setMode("public")}>Public mobile</button>
    <label>Ouverture<select aria-label="Ouverture" value={project.opening.type} onChange={event=>setProject(p=>({...p,introductionMode:event.target.value==="none"?"none":"classic",opening:getOpeningDefinition(event.target.value).defaultSettings}))}>
      <option value="none">Aucune</option><option value="envelope">Enveloppe</option><option value="doors">Porte</option></select></label>
    <button onClick={()=>setProject(p=>({...p,welcomePage:{...p.welcomePage!,enabled:true},introductionMode:"welcome"}))}>Page d’accueil</button>
    <p>Faire-part long : 4 titres, animations au scroll, dernière ligne à 2 480 px.</p>
    <footer>Footer du site — reste derrière le viewer</footer>
  </main></div>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture/></BrowserRouter>);
