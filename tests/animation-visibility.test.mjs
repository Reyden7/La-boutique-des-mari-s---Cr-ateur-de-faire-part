import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {entranceVisibilityThreshold,observeEntrance} from '../src/utils/animationVisibility.ts';
import {withoutProjectAnimationDelays} from '../src/utils/animationData.ts';

function environment(t){
  const original={window:globalThis.window,IntersectionObserver:globalThis.IntersectionObserver,ResizeObserver:globalThis.ResizeObserver},observers=[],resizers=[],listeners=new Map();
  globalThis.window={innerWidth:400,innerHeight:800,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
  globalThis.IntersectionObserver=class{constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}observe(node){this.node=node;queueMicrotask(()=>this.emit(node.ratio??0));}disconnect(){this.disconnected=true;}emit(ratio){this.callback([{target:this.node,isIntersecting:ratio>0,intersectionRatio:ratio}]);}};
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;resizers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  t.after(()=>Object.assign(globalThis,original));
  const node={ratio:1,getBoundingClientRect:()=>({width:300,height:80})},root={getBoundingClientRect:()=>({width:400,height:800})};
  return {node,root,observers,resizers,listeners};
}

test('initial observation starts a visible element without any scroll event, exactly once',async t=>{
  const e=environment(t);let starts=0;observeEntrance(e.node,e.root,()=>starts++);await Promise.resolve();
  assert.equal(starts,1);assert.equal(e.observers[0].options.root,e.root);assert.equal(e.observers[0].disconnected,true);assert.equal(e.listeners.size,0);
  e.observers[0].emit(1);assert.equal(starts,1);
});
test('offscreen entrances wait for 18%, then stay played when scrolled out and back',async t=>{
  const e=environment(t);e.node.ratio=0;let starts=0;const cancel=observeEntrance(e.node,e.root,()=>starts++);await Promise.resolve();
  e.observers[0].emit(.17);assert.equal(starts,0);e.observers[0].emit(.18);assert.equal(starts,1);
  e.observers[0].emit(0);e.observers[0].emit(1);assert.equal(starts,1);cancel();assert.ok(e.resizers[0].disconnected);
});
test('very large sections use viewport-relative thresholds; Preview scale does not change the ratio',()=>{
  assert.equal(entranceVisibilityThreshold({width:400,height:80},{width:400,height:800}),.18);
  assert.equal(entranceVisibilityThreshold({width:400,height:8000},{width:400,height:800}),.018);
  assert.equal(entranceVisibilityThreshold({width:200,height:4000},{width:200,height:400}),.018);
  assert.equal(entranceVisibilityThreshold({width:0,height:0},{width:0,height:0}),.18);
});
test('resize re-observes pending layouts and ignores stale callbacks; cancellation cleans everything',async t=>{
  const e=environment(t);e.node.ratio=0;let starts=0;const cancel=observeEntrance(e.node,e.root,()=>starts++);await Promise.resolve();
  e.node.getBoundingClientRect=()=>({width:400,height:8000});e.resizers[0].callback();
  assert.equal(e.observers[1].options.threshold,.018);e.observers[0].emit(1);assert.equal(starts,0);
  cancel();await Promise.resolve();e.observers[1].emit(1);assert.equal(starts,0);assert.equal(e.listeners.size,0);assert.ok(e.observers.every(o=>o.disconnected));
});
test('unsupported visibility API safely shows the final state',t=>{
  const e=environment(t);globalThis.IntersectionObserver=undefined;let starts=0;observeEntrance(e.node,null,()=>starts++);assert.equal(starts,1);assert.equal(e.listeners.size,0);
});
test('legacy delays are removed only from element/form animations, without changing openings or mutating input',()=>{
  const animation={type:'typewriter',duration:.8,delay:99,showCursor:false},element={id:'text',animation,text:'Emma & Lucas',rotation:30,opacity:.6};
  const project={pages:[{elements:[element]}],rsvp:{animation},welcomePage:{elements:[element]},opening:{type:'envelope',customSettings:{delay:.08}}},snapshot=structuredClone(project);
  const clean=withoutProjectAnimationDelays(project);
  for(const config of [clean.pages[0].elements[0].animation,clean.rsvp.animation,clean.welcomePage.elements[0].animation])assert.deepEqual(config,{type:'typewriter',duration:.8,showCursor:false});
  assert.deepEqual(project,snapshot);assert.deepEqual(clean.opening,project.opening);assert.equal(clean.pages[0].elements[0].rotation,30);assert.equal(clean.pages[0].elements[0].opacity,.6);
  assert.doesNotThrow(()=>withoutProjectAnimationDelays({welcomePage:{enabled:true}}));
});
test('content gating, hierarchy, history, replay, reduced motion and UI are wired through the shared entrance system',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const experience=read('src/features/music/InvitationExperience.tsx'),interaction=experience.slice(experience.indexOf('const onInteract'),experience.indexOf('const enterWelcome'));
  assert.doesNotMatch(interaction,/setDocumentAnimationReady/);assert.match(experience,/onComplete=\{\(\) => setDocumentAnimationReady\(true\)\}/);assert.match(experience,/onExitComplete/);
  const element=read('src/components/renderer/AnimatedElement.tsx');assert.match(element,/hasEntrance && play && parentReady/);assert.match(element,/ElementEntranceContext.Provider/);assert.match(element,/!reducedMotion/);assert.doesNotMatch(element,/whileInView|resolved.delay/);
  for(const file of ['src/components/renderer/TextEntrance.tsx','src/features/text/CurvedTextRenderer.tsx']){assert.match(read(file),/useElementEntrance/);assert.doesNotMatch(read(file),/useInView|animation\?\.delay/);}
  assert.match(read('src/components/renderer/useEntranceVisibility.ts'),/history\?\.add/);
  assert.match(read('src/components/preview/PreviewMode.tsx'),/key=\{`\$\{replayKey\}-\$\{activeDevice\}`\}/);
  assert.match(read('src/features/viewer/InvitationViewer.tsx'),/scrollTop = 0/);
  assert.doesNotMatch(read('src/components/properties/AnimationProperties.tsx'),/Délai|\.delay/);
  assert.doesNotMatch(read('src/components/editor/EditorCanvas.tsx'),/whileInView|useEntranceVisibility/);
});
