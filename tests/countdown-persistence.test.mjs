import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const hooks=registerHooks({
  resolve(specifier,context,next) {
    if(specifier==="../lib/supabase") return {url:"countdown:no-network",shortCircuit:true};
    if(specifier.startsWith(".")&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes("/src/")) return next(`${specifier}.ts`,context);
    return next(specifier,context);
  },
  load(url,context,next) {
    if(url==="countdown:no-network") return {format:"module",source:"export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};",shortCircuit:true};
    return next(url,context);
  },
});
const {makeCountdownElement}=await import("../src/features/elements/elementFactories.ts");
const {useEditorStore}=await import("../src/stores/editorStore.ts");
const {getElementLayout}=await import("../src/utils/responsiveLayout.ts");
const {getEditorElementLabel}=await import("../src/utils/editorNames.ts");
const {upsertProject,getProject}=await import("../src/utils/storage.ts");
const {sanitizeProjectForTemplate,instantiateProjectFromTemplate}=await import("../src/utils/templateSnapshot.ts");
const {transferMobileLayouts}=await import("../src/utils/responsiveTransfer.ts");
const {resolveElementVisualStyle}=await import("../src/utils/responsiveVisualStyle.ts");
const {getCountdownDays}=await import("../src/utils/countdownDate.ts");
const {PREVIEW_DEVICES}=await import("../src/config/previewDevices.ts");
const memory=new Map();globalThis.localStorage={getItem:(key)=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const section={id:"section",type:"section",name:"Section",x:0,y:100,width:390,height:180,rotation:0,opacity:1,visible:true,locked:false,zIndex:1,padding:20,cornerRadius:0,background:{type:"color",color:"#fff"}};
const reset=(selected=false)=>{
  useEditorStore.getState().setProject({id:"countdown-project",ownerId:"owner",name:"Compte à rebours",pages:[{id:"page",name:"Document",background:{type:"color",color:"#fff"},elements:[structuredClone(section)]}]});
  useEditorStore.setState({currentPageId:"page",selectedElementId:selected?section.id:null,selectedElementIds:selected?[section.id]:[],previewDevice:"mobile",sidebarView:"elements",past:[],future:[]});
};
const current=()=>useEditorStore.getState().project.pages[0].elements.find(e=>e.type==="countdown");
test("countdown factory and common insertion create a selected, unlocked, unanimated Section child",()=>{
  reset(true);const element=makeCountdownElement();useEditorStore.getState().addElement(element);
  assert.equal(element.name,"Compte à rebours");assert.equal(element.animation.type,"none");assert.equal(element.opacity,1);assert.equal(element.locked,false);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(element.targetDate));assert.ok([365,366].includes(getCountdownDays(element.targetDate)));
  assert.equal(useEditorStore.getState().selectedElementId,element.id);assert.equal(getElementLayout(current(),"mobile").sectionId,"section");
  assert.equal(getElementLayout(current(),"tablet").sectionId,null);assert.equal("daysRemaining" in element,false);
});
test("lock, responsive geometry and Section movement use the existing generic pipeline",()=>{
  reset(true);const store=useEditorStore.getState();store.addElement(makeCountdownElement());const id=current().id;
  const original=getElementLayout(current(),"mobile");store.setElementsLocked([id],true);
  store.updateElementLayout(id,{x:999,y:999,width:999,height:999,rotation:45});assert.deepEqual(getElementLayout(current(),"mobile"),original);
  store.updateElement(id,{targetDate:"2027-08-15",label:"jours avant notre mariage",fontFamily:"STARWARS"});assert.equal(current().targetDate,"2027-08-15");
  store.updateElementLayout("section",{y:300});assert.equal(getElementLayout(current(),"mobile").y,original.y+200);
  store.setElementsLocked([id],false);store.setPreviewDevice("desktop");store.updateElementLayout(id,{width:500,height:180,x:320,rotation:-45});
  assert.equal(getElementLayout(current(),"desktop").width,500);assert.equal(getElementLayout(current(),"mobile").width,original.width);
  store.setElementVisibility(id,false);assert.equal(getElementLayout(current(),"desktop").visible,false);assert.equal(getElementLayout(current(),"mobile").visible,true);
});
test("rename, duplication, undo/redo, local reload and templates retain date/style but never a cached count",()=>{
  reset();const store=useEditorStore.getState();store.addElement(makeCountdownElement());const id=current().id;
  const data={targetDate:"2027-08-15",label:"JOURS AVANT\nLE GRAND JOUR",fontFamily:"STARWARS",layout:"horizontal",numberFontSize:72,labelFontSize:22,numberColor:"#85855F80",labelColor:"#ffffff40",backgroundColor:"#00000000",gap:12,animation:{type:"fade",duration:1.2,delay:.5}};
  store.updateElement(id,data);store.renameElement(id,"Notre décompte");assert.equal(getEditorElementLabel(current()),"Notre décompte");
  store.duplicateElement(id);const copy=useEditorStore.getState().project.pages[0].elements.find(e=>e.type==="countdown"&&e.id!==id);assert.ok(copy);
  for(const key of Object.keys(data)) assert.deepEqual(copy[key],data[key]);assert.notEqual(copy.id,id);
  store.removeElement(copy.id);store.undo();assert.ok(useEditorStore.getState().project.pages[0].elements.some(e=>e.id===copy.id));store.redo();
  upsertProject(useEditorStore.getState().project);const loaded=getProject("countdown-project","owner");
  const template={name:"Modèle",templateData:sanitizeProjectForTemplate(loaded)},instance=instantiateProjectFromTemplate(template,"other");
  for(const project of [loaded,instance]) {
    const restored=project.pages[0].elements.find(e=>e.id===id);for(const key of Object.keys(data)) assert.deepEqual(restored[key],data[key]);
    assert.equal(restored.editorName,"Notre décompte");assert.equal("daysRemaining" in restored,false);
    assert.equal(getCountdownDays(restored.targetDate,"2026-10-07"),312);assert.equal(getCountdownDays(restored.targetDate,"2026-10-08"),311);
  }
  instance.pages[0].elements.find(e=>e.id===id).targetDate="2028-01-01";assert.equal(template.templateData.pages[0].elements.find(e=>e.id===id).targetDate,"2027-08-15");
});
test("transfer scales geometry/typography/gap, not content or Smartphone, and manual generated typography remains device-local",()=>{
  reset();useEditorStore.getState().addElement(makeCountdownElement());const source=structuredClone(useEditorStore.getState().project),id=current().id;
  const transferred=transferMobileLayouts(source,["tablet","desktop"]),element=transferred.pages[0].elements.find(e=>e.id===id),original=source.pages[0].elements.find(e=>e.id===id);
  for(const device of ["tablet","desktop"]) {
    const ratio=PREVIEW_DEVICES[device].width/390,layout=getElementLayout(element,device),style=resolveElementVisualStyle(element,device);
    assert.equal(layout.width,original.width*ratio);assert.equal(layout.height,original.height*ratio);
    assert.equal(style.numberFontSize,original.numberFontSize*ratio);assert.equal(style.labelFontSize,original.labelFontSize*ratio);assert.equal(style.gap,original.gap*ratio);
    assert.equal(style.targetDate,original.targetDate);assert.equal(style.fontFamily,original.fontFamily);
  }
  for(const key of Object.keys(original).filter(key=>key!=="responsive")) assert.deepEqual(element[key],original[key]);
  useEditorStore.getState().setProject(transferred);useEditorStore.setState({currentPageId:"page",previewDevice:"desktop"});
  useEditorStore.getState().updateElement(id,{numberFontSize:117,labelFontSize:33,gap:17});
  assert.equal(resolveElementVisualStyle(current(),"desktop").numberFontSize,117);assert.equal(current().numberFontSize,original.numberFontSize);
  assert.equal(resolveElementVisualStyle(current(),"tablet").numberFontSize,original.numberFontSize*PREVIEW_DEVICES.tablet.width/390);
});
test("hierarchy reparenting and reordering preserve countdown geometry and content",()=>{
  reset();const store=useEditorStore.getState();store.addElement(makeCountdownElement());const id=current().id;
  store.addElement(makeCountdownElement());const second=useEditorStore.getState().selectedElementId;
  const original=structuredClone(current());
  store.moveHierarchyItem(id,"section","inside");assert.equal(getElementLayout(current(),"mobile").sectionId,"section");
  for(const key of ["x","y","width","height","targetDate","label"]) assert.equal(current()[key],original[key]);
  store.moveHierarchyItem(id,second,"before");assert.equal(getElementLayout(current(),"mobile").sectionId,null);
  let sibling=useEditorStore.getState().project.pages[0].elements.find(e=>e.id===second);
  assert.ok(current().zIndex>sibling.zIndex);
  store.moveHierarchyItem(id,second,"after");sibling=useEditorStore.getState().project.pages[0].elements.find(e=>e.id===second);
  assert.ok(current().zIndex<sibling.zIndex);
  for(const key of ["x","y","width","height","targetDate","label"]) assert.equal(current()[key],original[key]);
});
test.after(()=>{hooks.deregister();delete globalThis.localStorage;});
