import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { decodeRgba } from "../scripts/generate-envelope-templates.mjs";
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes('/src/')) return next(`${specifier}.ts`,context);
  return next(specifier,context);
}});
const {getViewerDevice,getViewerViewport,createViewerPageLock,IMMERSIVE_VIEWER_QUERY}=await import('../src/features/viewer/viewerViewport.ts');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('portrait/landscape touch devices retain the same authored layout; desktop stays width-responsive',()=>{
  for(const [w,h,expected] of [[390,844,'mobile'],[844,390,'mobile'],[768,1024,'tablet'],[1024,768,'tablet'],[820,1180,'tablet'],[1180,820,'tablet']])assert.equal(getViewerDevice(w,h,true),expected);
  assert.equal(getViewerDevice(1440,900,false),'desktop'); assert.equal(getViewerDevice(390,844,false),'mobile');
  assert.match(IMMERSIVE_VIEWER_QUERY,/1023px/); assert.match(IMMERSIVE_VIEWER_QUERY,/pointer: coarse/);
});
test('visible viewport follows keyboard/browser bars but preserves layout size while pinch zooming',()=>{
  assert.deepEqual(getViewerViewport({innerWidth:390,innerHeight:844,visualViewport:null}),{width:390,height:844,top:0});
  assert.deepEqual(getViewerViewport({innerWidth:390,innerHeight:844,visualViewport:{height:480,offsetTop:120,scale:1}}),{width:390,height:480,top:120});
  assert.deepEqual(getViewerViewport({innerWidth:390,innerHeight:844,visualViewport:{height:422,offsetTop:120,scale:2}}),{width:390,height:844,top:0});
});
test('reader body/root locking is reference-counted, idempotent and restores the previous site position',()=>{
  const root=new Set(),body=new Set(),changes=[],siteRoot={inert:false};
  const list=set=>({add:value=>set.add(value),remove:value=>set.delete(value)});
  const lock=createViewerPageLock({documentElement:{classList:list(root)},body:{classList:list(body)},getElementById:()=>siteRoot},{scrollX:3,scrollY:420,scrollTo:(x,y)=>changes.push([x,y])});
  const releaseA=lock(),releaseB=lock(); assert.ok(root.has('invitation-viewer-open')); assert.ok(body.has('invitation-viewer-open'));assert.equal(siteRoot.inert,true);
  releaseA();releaseA();assert.equal(changes.length,0);assert.equal(root.size,1);
  releaseB();assert.equal(root.size,0);assert.equal(body.size,0);assert.deepEqual(changes,[[3,420]]);assert.equal(siteRoot.inert,false);
});
test('Preview/Public share the dedicated portal viewer; desktop preview retains its existing simulator and actions',()=>{
  for(const path of ['src/components/preview/PreviewMode.tsx','src/pages/PublicInvitePage.tsx'])assert.match(read(path),/InvitationViewer/);
  const preview=read('src/components/preview/PreviewMode.tsx');assert.match(preview,/readerViewport.immersive/);assert.match(preview,/Contrôles de l’aperçu/);assert.match(preview,/preview-device-shell/);assert.match(preview,/\{actions\}/);
  const publicPage=read('src/pages/PublicInvitePage.tsx');assert.match(publicPage,/loadPublicProject\(publicId\)/);assert.match(publicPage,/normalizeProject\(value\)/);assert.match(publicPage,/project.expiresAt/);assert.match(publicPage,/if \(immersive\) return <InvitationViewer/);
  const viewer=read('src/features/viewer/InvitationViewer.tsx');assert.match(viewer,/createPortal\(viewer, document.body\)/);assert.match(viewer,/AnimationViewportProvider root=\{scrollRef\}/);assert.match(viewer,/mode=\{mode\}/);
  assert.ok(!viewer.includes('requestFullscreen')); // no brittle automatic fullscreen request
});
test('CSS locks the site and leaves one internal scroller, edge-to-edge paper and full-height openings',()=>{
  const css=read('src/features/viewer/invitationViewer.css');
  assert.match(css,/html.invitation-viewer-open[^}]+overflow: hidden/);assert.match(css,/body.invitation-viewer-open[^}]+position: fixed/);
  assert.match(css,/#root[^}]+overflow: hidden/);assert.match(css,/height: 100dvh/);assert.match(css,/\.invitation-viewer-scroll[^}]+overflow-y: auto/);
  assert.match(css,/pinch-zoom/);assert.match(css,/\.renderer-document[^}]+border-radius: 0; box-shadow: none/);
  for(const name of ['welcome-page','png-envelope-stage','png-doors-stage','immersive-envelope-stage'])assert.match(css,new RegExp(`:has\\(\\.${name}`));
  assert.match(css,/env\(safe-area-inset-top\)/);assert.match(css,/calendar-agenda-menu \{ z-index: 2100/);
});
test('standalone manifest/metas and original-brand PNG icons are ready without private offline caching',()=>{
  const manifest=JSON.parse(read('public/manifest.webmanifest')),html=read('index.html');
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.ok(manifest.theme_color);assert.equal(manifest.start_url,undefined); // install document URL fallback, not the dashboard
  assert.match(html,/viewport-fit=cover/);assert.ok(!html.includes('user-scalable=no'));assert.match(html,/apple-mobile-web-app-capable/);assert.match(html,/rel="manifest"/);assert.match(html,/apple-touch-icon/);
  for(const icon of manifest.icons){const [size]=icon.sizes.split('x').map(Number),image=decodeRgba(readFileSync(new URL(`../public${icon.src}`,import.meta.url)));assert.equal(image.width,size);assert.equal(image.height,size);assert.ok(image.pixels.every((v,i)=>i%4!==3||v===255));}
  const apple=decodeRgba(readFileSync(new URL('../public/icons/apple-touch-icon.png',import.meta.url)));assert.equal(apple.width,180);
  assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
});
