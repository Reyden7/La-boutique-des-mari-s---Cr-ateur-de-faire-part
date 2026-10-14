import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
registerHooks({resolve(specifier,context,next){
  if(specifier==='../../lib/supabase'||specifier==='../lib/supabase')return{url:'curve:no-cloud',shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes('/src/'))return next(`${specifier}.ts`,context);
  return next(specifier,context);
},load(url,context,next){if(url==='curve:no-cloud')return{format:'module',source:'export const isSupabaseConfigured=false;export const supabase=null;export const requireSupabaseSession=async()=>{throw new Error("No cloud")};',shortCircuit:true};return next(url,context);}});
const {DEFAULT_TEXT_CURVE,resolveTextCurve,hasTextCurve,layoutCurvedText,paintCurvedText}=await import('../src/features/text/curvedTextLayout.ts');
const {curvedTextAnimationFrame}=await import('../src/features/text/curvedTextAnimation.ts');
const {normalizeProject,upsertProject,getProject}=await import('../src/utils/storage.ts');
const {useEditorStore,makeTextElement}=await import('../src/stores/editorStore.ts');
const {sanitizeProjectForTemplate,instantiateProjectFromTemplate}=await import('../src/utils/templateSnapshot.ts');
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const options={text:"SAVE THE DATE",width:340,height:180,fontFamily:"Georgia",fontSize:32,fontWeight:400,italic:false,underline:false,letterSpacing:1,lineHeight:1.2,align:"center",curve:{enabled:true,amount:50,direction:"up"}};
const measure=text=>({width:[...new Intl.Segmenter('fr',{granularity:'grapheme'}).segment(text)].length*18,left:0,right:text.length*18,ascent:25,descent:7});
const glyphMeasure=text=>({...measure(text),right:measure(text).width});
const make=(patch={})=>layoutCurvedText({...options,...patch},glyphMeasure);

test('legacy/disabled/zero curvature uses straight branch; defaults and reset stay safe',()=>{
  for(const value of [undefined,null,{}, {enabled:false,amount:100}, {enabled:true,amount:0}])assert.equal(hasTextCurve(value),false);
  assert.deepEqual(resolveTextCurve(),DEFAULT_TEXT_CURVE);assert.equal(resolveTextCurve({enabled:true,amount:Infinity}).amount,0);
  assert.equal(resolveTextCurve({enabled:true,amount:200,direction:'bad'}).amount,100);assert.equal(resolveTextCurve({amount:-1}).amount,0);
  for(const path of ['src/components/editor/EditorCanvas.tsx','src/components/renderer/WeddingRenderer.tsx']) {
    const source=readFileSync(new URL(`../${path}`,import.meta.url),'utf8');assert.match(source,/hasTextCurve\(element.curve\)/);
    assert.ok(source.indexOf('hasTextCurve(element.curve)')<source.indexOf('if (element.type === "text") return'));
  }
});
test('up/down arcs are symmetric; stronger curves increase rotation and reach a semicircle for a long title',()=>{
  const up=make(),down=make({curve:{enabled:true,amount:50,direction:'down'}});
  assert.equal(up.glyphs.length,down.glyphs.length);
  for(let i=0;i<up.glyphs.length;i++){assert.ok(Math.abs(up.glyphs[i].x-down.glyphs[i].x)<1e-7);assert.equal(up.glyphs[i].angle,-down.glyphs[i].angle);}
  const slight=make({curve:{enabled:true,amount:25,direction:'up'}}),strong=make({curve:{enabled:true,amount:100,direction:'up'}});
  assert.ok(Math.abs(slight.glyphs[0].angle)<Math.abs(up.glyphs[0].angle));
  assert.ok(Math.abs(up.glyphs[0].angle)<Math.abs(strong.glyphs[0].angle));
  assert.ok(strong.glyphs.at(-1).angle>1.3);
});
test('glyph ink fits the selection rectangle at every amount/direction, width/height, alignment and font size',()=>{
  for(const amount of [1,25,50,75,100])for(const direction of ['up','down'])for(const align of ['left','center','right'])
    for(const width of [12,60,140,340,700])for(const height of [12,40,180])for(const fontSize of [12,32,100]) {
      const layout=make({width,height,fontSize,align,curve:{enabled:true,amount,direction}});
      assert.ok(layout.scale>0&&layout.scale<=1);
      for(const glyph of layout.glyphs)for(const p of glyph.corners){assert.ok(p.x>=-1e-8&&p.x<=width+1e-8);assert.ok(p.y>=-1e-8&&p.y<=height+1e-8);}
    }
});
test('Unicode graphemes, multiline content, letter spacing and arbitrary font aliases are preserved',()=>{
  const layout=make({text:"Éléonore e\u0301 👩‍❤️‍👨\n& Lucas",fontFamily:"Imported Font"});
  assert.ok(layout.glyphs.some(g=>g.text==="e\u0301"));assert.ok(layout.glyphs.some(g=>g.text==="👩‍❤️‍👨"));
  assert.ok(layout.glyphs.some(g=>g.line===1));assert.match(layout.font,/"Imported Font"/);
  const compact=make({letterSpacing:0}),spaced=make({letterSpacing:8});
  assert.ok(spaced.glyphs.at(-1).x-spaced.glyphs[0].x>compact.glyphs.at(-1).x-compact.glyphs[0].x);
  const wide=make({width:700,height:500});assert.equal(wide.scale,1);assert.equal(wide.fontSize,32);
});
test('painter used by BOTH renderers preserves inherited alpha and does not alter logical geometry',()=>{
  const layout=make(),snapshot=structuredClone(layout),calls=[];
  let alpha=.4;const stack=[];
  const context={get globalAlpha(){return alpha},set globalAlpha(v){alpha=v},save(){stack.push(alpha)},restore(){alpha=stack.pop()},translate(x,y){calls.push(['translate',x,y])},rotate(a){calls.push(['rotate',a])},fillText(t){calls.push(['glyph',t,alpha])},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  paintCurvedText(context,layout,{color:'#85855FFF',underline:true,glyphOpacity:()=>.5});
  assert.equal(alpha,.4);assert.ok(calls.filter(c=>c[0]==='glyph').every(c=>c[2]===.2));assert.deepEqual(layout,snapshot);
  for(const path of ['src/features/text/CurvedTextCanvas.tsx','src/features/text/CurvedTextRenderer.tsx'])assert.match(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),/paintCurvedText/);
});
test('all text effects ignore legacy delay, preserve progressive visibility and completion/reduced motion without moving glyphs',()=>{
  const layout=make(),snapshot=structuredClone(layout);
  for(const type of ['typewriter','handwriting','letter-by-letter','word-by-word','draw-underline']) {
    const animation={type,duration:2,delay:1};
    assert.ok(layout.glyphs.every(g=>curvedTextAnimationFrame(layout,animation,0).glyphOpacity(g)===0));
    assert.ok(layout.glyphs.every(g=>curvedTextAnimationFrame(layout,animation,3).glyphOpacity(g)===1));
    assert.ok(layout.glyphs.every(g=>curvedTextAnimationFrame(layout,animation,0,true).glyphOpacity(g)===1));
    const halfway=curvedTextAnimationFrame(layout,animation,1);
    if(type!=='draw-underline'){assert.ok(layout.glyphs.some(g=>halfway.glyphOpacity(g)>0));assert.ok(layout.glyphs.some(g=>halfway.glyphOpacity(g)===0));}
    assert.deepEqual(layout,snapshot);
  }
  for(const type of ['fade','slide-up','zoom'])assert.equal(curvedTextAnimationFrame(layout,{type,duration:2,delay:1},0).progress,1);
});
test('real store/save/reload/undo/templates keep global curvature and leave every device geometry untouched',()=>{
  const element={...makeTextElement(),text:"Save the date",responsive:{tablet:{x:50,width:500,fontSize:40},desktop:{x:100,width:900,fontSize:60}}};
  const project=normalizeProject({id:"curve-test",ownerId:"owner",name:"Curve QA",pages:[{id:"p",name:"Document",background:{type:"color",color:"#fff"},elements:[element]}]});
  const originalResponsive=structuredClone(project.pages[0].elements[0].responsive);
  useEditorStore.setState({project,currentPageId:"p",sidebarView:"content",previewDevice:"tablet",past:[],future:[]});
  useEditorStore.getState().updateElement(element.id,{curve:{enabled:true,amount:75,direction:"down"}});
  const changed=useEditorStore.getState().project;
  assert.deepEqual(changed.pages[0].elements[0].responsive,originalResponsive);assert.equal(changed.pages[0].elements[0].curve.amount,75);
  useEditorStore.getState().undo();assert.equal(useEditorStore.getState().project.pages[0].elements[0].curve,undefined);
  useEditorStore.getState().redo();upsertProject(useEditorStore.getState().project);
  const reloaded=getProject("curve-test","owner");assert.equal(reloaded.pages[0].elements[0].curve.direction,"down");
  const instance=instantiateProjectFromTemplate({name:"Curve template",templateData:sanitizeProjectForTemplate(reloaded)},"other");
  assert.deepEqual(instance.pages[0].elements[0].curve,reloaded.pages[0].elements[0].curve);
  assert.deepEqual(instance.pages[0].elements[0].responsive,originalResponsive);
});
