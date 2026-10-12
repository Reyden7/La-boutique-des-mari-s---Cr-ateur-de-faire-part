import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Stage, Layer } from "react-konva";
import { BrowserRouter } from "react-router-dom";
import { CurvedTextCanvas } from "../src/features/text/CurvedTextCanvas";
import { CurvedTextRenderer } from "../src/features/text/CurvedTextRenderer";
import { curvedTextOptions } from "../src/features/text/curvedTextLayout";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { EditorWorkspace } from "../src/components/editor/EditorWorkspace";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { InvitationExperience } from "../src/features/music/InvitationExperience";
import { AnimatedElement } from "../src/components/renderer/AnimatedElement";
import { ProjectFontLoader } from "../src/features/fonts/ProjectFontLoader";
import { useEditorStore, makeTextElement } from "../src/stores/editorStore";
import { normalizeProject, upsertProject, getProject } from "../src/utils/storage";
import { createBlankProject } from "../src/templates/templates";
import { PREVIEW_DEVICES } from "../src/config/previewDevices";
import { getElementLayout } from "../src/utils/responsiveLayout";
import type { TextElement } from "../src/types/editor";
import "../src/styles.css";

const project=normalizeProject(createBlankProject())!;
project.name="Courbure QA";project.introductionMode="none";project.opening.type="none";
project.rsvp!.enabled=project.audio.enabled=project.particles.enabled=false;project.pages[0].height=1000;
project.customFonts=[{id:"local-font",name:"QA script.ttf",family:"QA Curved Imported",url:"/__qa-curve-font.ttf",format:"ttf"}];
const element={...makeTextElement(),text:"SAVE THE DATE",x:25,y:100,width:340,height:200,fontSize:32,fontFamily:"Georgia",curve:{enabled:true,amount:50,direction:"up" as const}};
element.responsive={tablet:{x:40,y:100,width:650,height:260,fontSize:46},desktop:{x:100,y:100,width:1100,height:350,fontSize:70}};
project.pages[0].elements=[element];
useEditorStore.setState({project,currentPageId:project.pages[0].id,selectedElementId:element.id,selectedElementIds:[element.id],sidebarView:"content",previewDevice:"mobile",past:[],future:[]});

function Fixture(){
  const current=useEditorStore(s=>s.project)!,device=useEditorStore(s=>s.previewDevice);
  const state=useEditorStore.getState(),text=current.pages[0].elements[0] as TextElement;
  const layout=getElementLayout(text,device),options=curvedTextOptions(text,layout.width,layout.height,layout.fontSize??text.fontSize);
  const stage=useRef<ReturnType<typeof Stage>>(null);
  const [mode,setMode]=useState("compare"),[key,setKey]=useState(0),[report,setReport]=useState("");
  if(mode==="preview")return <PreviewMode key={key} project={current} device={device} onClose={()=>setMode("compare")} allowDeviceSwitching />;
  return <main style={{padding:12}}>
    <h1>Texte courbé — QA locale</h1><ProjectFontLoader project={current} />
    <nav style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {(["mobile","tablet","desktop"] as const).map(d=><button key={d} onClick={()=>state.setPreviewDevice(d)}>{PREVIEW_DEVICES[d].label}</button>)}
      <button onClick={()=>setMode("compare")}>Comparer les renderers</button><button onClick={()=>setMode("editor")}>Éditeur complet</button>
      <button onClick={()=>setMode("preview")}>Aperçu</button><button onClick={()=>setMode("public")}>Public</button><button onClick={()=>setKey(k=>k+1)}>Rejouer</button>
      <button onClick={()=>state.updateElement(text.id,{fontFamily:"Georgia"})}>Police classique</button>
      <button onClick={()=>state.updateElement(text.id,{fontFamily:"Great Vibes"})}>Police manuscrite</button>
      <button onClick={()=>state.updateElement(text.id,{fontFamily:"QA Curved Imported"})}>Police importée</button>
      <button onClick={()=>{upsertProject(current);state.setProject(getProject(current.id)!);state.selectElement(text.id);setReport(JSON.stringify(getProject(current.id)!.pages[0].elements[0]));}}>Sauver / recharger</button>
      <button onClick={()=>state.undo()}>Annuler</button><button onClick={()=>state.redo()}>Rétablir</button>
      <button onClick={()=>{
        const konva=(stage.current as any)?.findOne('Shape')?.toCanvas({pixelRatio:1}),web=document.querySelector('#qa-web canvas') as HTMLCanvasElement;
        if(!konva||!web){setReport("Renderers non disponibles");return;}
        const a=konva.getContext('2d').getImageData(0,0,konva.width,konva.height).data;
        const b=web.getContext('2d')!.getImageData(0,0,web.width,web.height).data;
        let difference=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])difference++;
        setReport(JSON.stringify({konva:[konva.width,konva.height],web:[web.width,web.height],difference,bytes:a.length,curve:text.curve}));
      }}>Comparer les pixels</button>
    </nav>
    <pre id="qa-report">{report}</pre>
    {mode==="public"&&<div key={key} className="public-invite"><InvitationExperience project={current} device={device} mode="public" /></div>}
    {mode!=="public"&&<div style={{display:"grid",gridTemplateColumns:"minmax(400px,1fr) 310px",gap:16,height:900}}>
      <div style={{overflow:"auto"}}>
        {mode==="editor"?<EditorWorkspace pageName="Document"><EditorCanvas /></EditorWorkspace>:<div key={key}>
          <h2>Canvas Konva</h2><div style={{background:"#fffdf9",width:layout.width,height:layout.height,border:"1px solid #dccbb7",boxSizing:"content-box"}}><Stage ref={stage as any} width={layout.width} height={layout.height}><Layer><CurvedTextCanvas options={options} color={text.color} width={layout.width} height={layout.height}/></Layer></Stage></div>
          <h2>Aperçu / Public — même tracé</h2><div id="qa-web" style={{width:layout.width,height:layout.height,background:"#fffdf9",border:"1px solid #dccbb7",boxSizing:"content-box"}}><AnimatedElement animation={text.animation} opacity={text.opacity} rotation={layout.rotation} style={{width:"100%",height:"100%"}}><CurvedTextRenderer options={options} color={text.color} animation={text.animation} /></AnimatedElement></div>
        </div>}
      </div><PropertiesPanel onPreviewOpening={()=>{}} />
    </div>}
  </main>;
}
const root=document.getElementById("root")! as HTMLElement & {curveRoot?:ReturnType<typeof createRoot>};
root.curveRoot??=createRoot(root);root.curveRoot.render(<BrowserRouter><Fixture /></BrowserRouter>);
