import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPreviewScrollEngine,clampScrollSpeed} from '../src/components/preview/previewScrollEngine.ts';

function fixture({position=0,maximum=2000,ratio=1,round=false}={}) {
  let id=0;const frames=new Map(),states=[];
  const surface={position:()=>position,maximum:()=>maximum,ratio:()=>ratio,write:value=>{position=round?Math.round(value):value;}};
  const engine=createPreviewScrollEngine(surface,{request:callback=>{frames.set(++id,callback);return id;},cancel:key=>frames.delete(key)},state=>states.push(state));
  return {engine,frames,states,surface,step(time){const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(time));},get position(){return position;}};
}
for(const hz of [60,90,120]) test(`constant 35 logical px/s at ${hz} Hz, fractional state despite integer DOM`,()=>{
  const f=fixture({round:true});f.engine.start();for(let n=0;n<=hz*10;n++)f.step(n*1000/hz);
  assert.equal(f.position,350);assert.equal(f.frames.size,1);f.engine.dispose();assert.equal(f.frames.size,0);
});
test('current position, pause/resume, live speed, stop and top without jumps',()=>{
  const f=fixture({position:400});f.engine.start();f.step(0);f.step(20);assert.equal(f.position,400.7);
  f.engine.pause();assert.equal(f.frames.size,0);f.engine.speed(100);f.engine.start();f.step(5000);assert.equal(f.position,400.7);
  f.step(5020);assert.equal(f.position,402.7);f.engine.stop();assert.equal(f.position,402.7);assert.equal(f.frames.size,0);
  f.engine.start();f.engine.start();assert.equal(f.frames.size,1);f.engine.top();assert.equal(f.position,0);assert.equal(f.frames.size,0);
});
test('real DOM boundary; starting at bottom/no overflow stops; external/manual scrolling pauses',()=>{
  const f=fixture({position:99,maximum:100});f.engine.start();f.step(0);f.step(50);assert.equal(f.position,100);assert.equal(f.states.at(-1),'idle');assert.equal(f.frames.size,0);
  f.engine.start();f.step(100);assert.equal(f.frames.size,0);
  const g=fixture({maximum:0});g.engine.start();g.step(0);assert.equal(g.position,0);assert.equal(g.frames.size,0);
  const h=fixture();h.engine.start();h.step(0);h.surface.write(200);h.engine.externalScroll();assert.equal(h.states.at(-1),'paused');assert.equal(h.frames.size,0);
});
test('layout ratio converts logical to DOM px; outer CSS frame zoom is not part of ratio',()=>{
  const f=fixture({ratio:.5});f.engine.speed(100);f.engine.start();for(let n=0;n<=60;n++)f.step(n*1000/60);assert.ok(Math.abs(f.position-50)<1e-7);
});
test('tab inactivity clamps delta and speed validation; disposal leaves no residual callback',()=>{
  assert.equal(clampScrollSpeed(0),10);assert.equal(clampScrollSpeed(200),150);assert.equal(clampScrollSpeed(NaN),35);
  const f=fixture();f.engine.start();f.step(0);f.step(500000);assert.equal(f.position,1.75);f.engine.dispose();assert.equal(f.frames.size,0);f.step(900000);assert.equal(f.position,1.75);
});
test('Preview-only surfaces preserve fields, scope native image dragging and pause on input intent',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const integration=read('src/components/preview/PreviewScroll.tsx'),css=read('src/components/preview/previewScroll.css');
  for(const event of ['wheel','touchstart','pointerdown','keydown','scroll','dragstart']){assert.ok(integration.includes(`addEventListener("${event}"`));assert.ok(integration.includes(`removeEventListener("${event}"`));}
  assert.match(integration,/visibilitychange/);assert.match(integration,/offsetWidth/);assert.match(integration,/event.target.matches\("img"\)/);
  assert.match(css,/\.preview-scroll-surface/);assert.match(css,/user-select: none/);assert.match(css,/input, textarea, select, \[contenteditable\]/);assert.match(css,/user-select: text/);assert.match(css,/scroll-behavior: auto !important/);
  assert.match(read('src/features/viewer/InvitationViewer.tsx'),/mode === "preview" \? " preview-scroll-surface" : ""/);
  assert.doesNotMatch(integration,/project_data|localStorage|window.scrollTo|setInterval/);
});
test('real introduction completion gates controls; replay/device/project revision reset the session',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.match(read('src/features/music/InvitationExperience.tsx'),/onDocumentReady\?\.\(documentAnimationReady\)/);
 const preview=read('src/components/preview/PreviewMode.tsx');
 assert.match(preview,/props.project.updatedAt/);assert.match(preview,/project.id\}-\$\{replayKey\}-\$\{activeDevice/);
 assert.match(read('src/components/preview/PreviewScroll.tsx'),/if \(ready\) engine.current\?\.start/);
});
