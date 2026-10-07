// Isolated real controls/Konva/DOM; no EditorPage, remote save or production data.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Konva from "konva";
import { LeftSidebar } from "../src/components/sidebar/LeftSidebar";
import { PropertiesPanel } from "../src/components/properties/PropertiesPanel";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { makeCountdownElement } from "../src/features/elements/elementFactories";
import { useEditorStore } from "../src/stores/editorStore";
import { usePropertyPanelStore } from "../src/stores/propertyPanelStore";
import { getElementLayout } from "../src/utils/responsiveLayout";
import { resolveElementVisualStyle } from "../src/utils/responsiveVisualStyle";
import { getCountdownLayout } from "../src/utils/countdownLayout";
import { getCountdownDays, getCountdownToday, getNextCountdownDayDelay } from "../src/utils/countdownDate";
import { PREVIEW_DEVICES, type PreviewDevice } from "../src/config/previewDevices";
import type { CountdownElement, WeddingProject } from "../src/types/editor";
import "../src/styles.css";
const element={...makeCountdownElement(),id:"countdown",x:40,y:70,targetDate:"2027-08-15",responsive:{tablet:{x:60,y:70,width:420,height:180},desktop:{x:90,y:70,width:600,height:240}}};
const project={id:"countdown-local",name:"Décompte local",status:"draft",paymentStatus:"unpaid",introductionMode:"none",customFonts:[],pages:[{id:"page",name:"Document",background:{type:"color",color:"#e7ddd3"},elements:[element]}]} as WeddingProject;
useEditorStore.getState().setProject(project);
useEditorStore.setState({currentPageId:"page",selectedElementId:element.id,selectedElementIds:[element.id],previewDevice:"mobile",sidebarView:"elements",zoom:.8,past:[],future:[]});
usePropertyPanelStore.setState({propertySectionOpenState:{disposition:true,date:true,police:true,apparence:true}});
const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const current=()=>useEditorStore.getState().project!.pages[0].elements.find(e=>e.id==="countdown") as CountdownElement;
async function compare() {
  await document.fonts.ready;await tick();
  const state=useEditorStore.getState(),resolved=resolveElementVisualStyle(current(),state.previewDevice),layout=getElementLayout(resolved,state.previewDevice),scene=getCountdownLayout(resolved,layout,getCountdownToday());
  const group=Konva.stages.at(-1)!.findOne("#countdown")!;
  const texts=group.find("Text"),domTexts=[...document.querySelectorAll<HTMLElement>("#countdown-dom [data-countdown-role]")];
  if(texts.length!==scene.text.length||domTexts.length!==scene.text.length) throw new Error("Missing countdown text");
  for(const [index,node] of texts.entries()) {
    const expected=scene.text[index],dom=domTexts[index];
    if(node.getAttr("text")!==expected.text||dom.textContent!==expected.text) throw new Error("Text/count differs");
    if(node.getAttr("fontFamily")!==expected.fontFamily||dom.style.fontFamily.replaceAll('"','')!==expected.fontFamily) throw new Error("Font alias differs");
    if(Math.abs(node.x()-expected.x)>.01||Math.abs(node.y()-expected.y)>.01) throw new Error("Konva position differs");
    const actualFont=parseFloat(getComputedStyle(dom).fontSize),rendererWidth=document.querySelector("#countdown-dom .renderer-document")!.getBoundingClientRect().width;
    const expectedFont=expected.fontSize*scene.scale/PREVIEW_DEVICES[state.previewDevice].width*rendererWidth;
    if(Math.abs(actualFont-expectedFont)>.1) throw new Error(`Font size differs ${actualFont}/${expectedFont}`);
  }
  if(scene.days!==getCountdownDays(current().targetDate)) throw new Error("Wrong calendar days");
  const bounds=group.getClientRect({skipTransform:true});if(Math.abs(bounds.width-layout.width)>1||Math.abs(bounds.height-layout.height)>1) throw new Error("Selection bounds differ");
  return {device:state.previewDevice,layout:resolved.layout,align:resolved.textAlign,days:scene.days,passed:true};
}
// Synthetic clock only inside this disposable localhost fixture.
const NativeDate=Date;let testInstant:number|null=null;
function testClock(instant:number|null) {
  testInstant=instant;
  window.Date=class extends NativeDate { constructor(...args:[]|[string|number]) { if(args.length) super(args[0]);else super(testInstant??NativeDate.now()); } static now(){return testInstant??NativeDate.now();} } as DateConstructor;
  document.dispatchEvent(new Event("visibilitychange"));
}
function Fixture() {
  const state=useEditorStore(),[mode,setMode]=useState<"preview"|"public">("preview"),[results,setResults]=useState<unknown>(null),[busy,setBusy]=useState(false);
  const audit=async()=>{setBusy(true);const values=[];try {
    for(const device of ["mobile","tablet","desktop"] as PreviewDevice[]) {
      state.setPreviewDevice(device);
      for(const layout of ["vertical","horizontal"] as const) for(const textAlign of ["left","center","right"] as const) {
        state.updateElement("countdown",{layout,textAlign,label:"JOURS AVANT\nLE GRAND JOUR"});await tick();values.push(await compare());
      }
    }
    setResults(values);
  } catch(error){setResults({error:String(error),completed:values.length});}finally{setBusy(false);}};
  const simulateMidnight=async()=>{
    const start=new NativeDate("2027-08-14T21:59:59.999Z").getTime();state.updateElement("countdown",{targetDate:"2027-08-15"});testClock(start);await tick();const before=await compare();
    testClock(start+getNextCountdownDayDelay(new NativeDate(start)));await tick();const after=await compare();
    setResults({midnight:before.days===1&&after.days===0,before,after});
  };
  return <div style={{padding:16}}><h1 style={{fontSize:22}}>Compte à rebours — validation locale</h1>
    <nav style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>{(["mobile","tablet","desktop"] as const).map(device=><button key={device} onClick={()=>state.setPreviewDevice(device)}>{PREVIEW_DEVICES[device].label}</button>)}
      <button onClick={()=>setMode(mode==="preview"?"public":"preview")}>Rendu {mode}</button><button disabled={busy} onClick={()=>void audit()}>Auditer 18 configurations</button>
      <button onClick={()=>void compare().then(setResults).catch(e=>setResults(String(e)))}>Comparer</button>
      <button onClick={()=>void simulateMidnight()}>Simuler minuit</button><button onClick={()=>{testClock(null);setResults(null);}}>Horloge réelle</button>
      <button onClick={()=>{state.setProject(JSON.parse(JSON.stringify(state.project)));state.selectElement("countdown");}}>Recharger JSON</button>
    </nav><pre id="countdown-results" style={{maxHeight:60,overflow:"auto",fontSize:10}}>{JSON.stringify(results)}</pre>
    <div style={{display:"grid",gridTemplateColumns:"210px 270px minmax(300px,1fr) minmax(300px,1fr)",gap:10,alignItems:"start"}}>
      <div style={{height:650,overflow:"auto"}}><LeftSidebar onPreviewOpening={()=>{}} /></div><div style={{height:650,overflow:"auto"}}><PropertiesPanel onPreviewOpening={()=>{}} /></div>
      <div><h2 style={{fontSize:16}}>Editor Konva</h2><div style={{height:650,display:"flex",overflow:"auto"}}><EditorCanvas /></div></div>
      <div id="countdown-dom"><h2 style={{fontSize:16}}>Renderer {mode}</h2><WeddingRenderer project={state.project!} device={state.previewDevice} mode={mode} playAnimations={false} /></div>
    </div>
  </div>;
}
const root=createRoot(document.getElementById("root")!);root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if(import.meta.hot) import.meta.hot.dispose(()=>{root.unmount();window.Date=NativeDate;});
