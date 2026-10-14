import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';import {registerHooks} from 'node:module';import {fileURLToPath} from 'node:url';
import {transformWithOxc} from 'vite';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const root=new URL('../src/',import.meta.url),compiled=new Map(await Promise.all(readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.tsx')).map(async p=>{const url=new URL(p.replaceAll('\\','/'),root);return [url.href,'import React from "react";\n'+(await transformWithOxc(readFileSync(url,'utf8'),fileURLToPath(url))).code];})));
registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('/lib/supabase'))return{url:'entrance:no-cloud',shortCircuit:true};
  if(specifier.endsWith('/useRsvpBlockLayout'))return{url:'entrance:form-measurement',shortCircuit:true};
  if(specifier.endsWith('.css'))return{url:'entrance:css',shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes('/src/'))for(const ext of ['.ts','.tsx'])if(existsSync(new URL(specifier+ext,context.parentURL)))return next(specifier+ext,context);
  return next(specifier,context);
},load(url,context,next){
  if(url==='entrance:no-cloud')return{format:'module',source:'export const supabase=null; export const isSupabaseConfigured=false; export const requireSupabaseSession=async()=>{throw new Error("No cloud")};',shortCircuit:true};
  if(url==='entrance:css')return{format:'module',source:'',shortCircuit:true};
  if(url==='entrance:form-measurement')return{format:'module',source:'export const useRsvpBlockLayout=()=>({height:300,measurement:null});',shortCircuit:true};
  if(compiled.has(url))return{format:'module',source:compiled.get(url),shortCircuit:true};return next(url,context);
}});
const {RenderElement,WeddingRenderer}=await import('../src/components/renderer/WeddingRenderer.tsx');
const factories=await import('../src/features/elements/elementFactories.ts');
const {createBlankProject}=await import('../src/templates/templates.ts');const {normalizeProject,upsertProject,getProject,syncProject}=await import('../src/utils/storage.ts');
const {AnimationHistoryContext}=await import('../src/components/renderer/useEntranceVisibility.ts');
const base={id:'test',name:'Test',x:30,y:50,width:300,height:120,rotation:23,opacity:.6,zIndex:1,visible:true,locked:false,animation:{type:'fade',duration:.8,delay:99}};
const text={...base,type:'text',text:'Emma & Lucas',fontFamily:'Georgia',fontSize:32,fontWeight:400,color:'#85855f',textAlign:'center',lineHeight:1.2,letterSpacing:0,italic:false,underline:false};

test('all element kinds share waiting entrances on all devices; normal opacity/rotation and geometry are retained',()=>{
  const elements=[text,{...base,type:'image',src:'/example.png',alt:'Photo',fit:'contain'}, {...base,type:'shape',shape:'rectangle',fill:'#85855f',stroke:'#fff',strokeWidth:1}, {...base,type:'icon',icon:'♥',fontSize:50,color:'#85855f'},
    ...Object.entries(factories).filter(([name,fn])=>name.startsWith('make')&&typeof fn==='function').map(([,fn])=>fn()).map(e=>({...e,animation:base.animation}))];
  for(const device of ['mobile','tablet','desktop'])for(const element of elements){
    const html=renderToStaticMarkup(createElement(RenderElement,{element,device,documentHeight:3000,playAnimation:false}));
    assert.match(html,/data-entrance-state="waiting"/);assert.ok(html.includes(`data-entrance-id="${element.id}"`));
    if(element.id==='test')assert.match(html,/rotate\(23deg\)/);
  }
});
test('a played section/child remounted after responsive layout changes is final, not hidden or restarted',()=>{
  for(const type of ['fade','typewriter','handwriting','letter-by-letter','word-by-word','draw-underline']){
    const html=renderToStaticMarkup(createElement(AnimationHistoryContext.Provider,{value:new Set(['test'])},createElement(RenderElement,{element:{...text,animation:{type,duration:.8}},device:'desktop',documentHeight:3000})));
    assert.match(html,/data-entrance-state="started"/);assert.doesNotMatch(html,/visibility:hidden|opacity:0(?:;|")/);
    assert.match(html,/opacity:0.6/);if(type!=='fade')assert.match(html,/data-text-complete="true"/);
  }
});
test('forms use the same gated wrapper; saving/reloading/snapshot legacy delay cleanup is non-destructive',async()=>{
  const p=normalizeProject(createBlankProject());p.id='entrance-save';p.ownerId='owner';p.pages[0].elements=[text];p.rsvp={...p.rsvp,enabled:true,purchased:true,animation:base.animation};
  const html=renderToStaticMarkup(createElement(WeddingRenderer,{project:p,device:'mobile',mode:'preview',playAnimations:false}));assert.match(html,/data-entrance-id="document-rsvp" data-entrance-state="waiting"/);
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  upsertProject(p);const loaded=getProject(p.id,'owner');assert.deepEqual(loaded.pages[0].elements[0].animation,{type:'fade',duration:.8});assert.deepEqual(loaded.rsvp.animation,{type:'fade',duration:.8});
  const saved=await syncProject(p);assert.equal(saved.pages[0].elements[0].animation.delay,undefined);assert.equal(p.pages[0].elements[0].animation.delay,99);
});
