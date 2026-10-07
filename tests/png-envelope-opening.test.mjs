import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PNG_ENVELOPE_ASSETS, getPngEnvelopeLayout, getPngEnvelopeDuration, getPngEnvelopeClosedLayout, resolveEnvelopeOffset } from "../src/features/openings/pngEnvelopeLayout.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/features/openings/animations/PngEnvelopeOpening.tsx");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) {
      for (const ext of [".ts", ".tsx"]) if (existsSync(new URL(specifier + ext, context.parentURL))) return next(specifier + ext, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".tsx")) {
      // Vite transform is asynchronous; use the precompiled sources below.
      if (compiledSources.has(url)) return {format:"module",shortCircuit:true,source:compiledSources.get(url)};
    }
    return next(url, context);
  },
});
const compiledSources = new Map();
for (const name of ["PngEnvelopeOpening", "ResponsiveEnvelopeOpening", "VerticalEnvelopeOpening"]) {
  const url = new URL(`../src/features/openings/animations/${name}.tsx`,import.meta.url);
  compiledSources.set(url.href, 'import React from "react";\n' + (await transformWithOxc(readFileSync(url,"utf8"),fileURLToPath(url))).code);
}
const { PngEnvelopeOpening } = await import("../src/features/openings/animations/PngEnvelopeOpening.tsx");
const { ResponsiveEnvelopeOpening } = await import("../src/features/openings/animations/ResponsiveEnvelopeOpening.tsx");
const config = {type:"envelope",duration:1.5,customSettings:{hintText:"Touchez pour ouvrir"}};
const render = (component, device) => renderToStaticMarkup(createElement(component,{config,device,couple:"Emma & Lucas"},createElement("button",{},"Vrai contenu")));

// Decode original RGBA PNGs solely for coverage assertions, never for rendering.
function pngAlpha(path) {
  const bytes=readFileSync(new URL(`../public${path}`,import.meta.url));
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),chunks=[];
  for(let pos=8;pos<bytes.length;) { const size=bytes.readUInt32BE(pos); if(bytes.toString("ascii",pos+4,pos+8)==="IDAT") chunks.push(bytes.subarray(pos+8,pos+8+size)); pos+=size+12; }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=new Uint8Array(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)],offset=y*stride;
    for(let x=0;x<stride;x++) {
      const a=x>=4?pixels[offset+x-4]:0,b=y?pixels[offset+x-stride]:0,c=y&&x>=4?pixels[offset+x-stride-4]:0;
      pixels[offset+x]=(raw[y*(stride+1)+1+x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
    }
  }
  return (x,y)=>x<0||y<0||x>=width||y>=height?0:pixels[(Math.floor(y)*width+Math.floor(x))*4+3];
}

test("supplied artwork is copied byte-for-byte, with original PNG alpha channels", () => {
  const hashes = {base:"41E4BDC0B87659C4535094159BD0BB92105F65784AF243DE952DCD42FC9ED23D",seal:"EB25F0B83C788AC1B465800892B7DE23B8BBDBDAF097499A1594E7493B7EDFD9",flap:"E8E4D57E17D0FFA807C025D88F43FF4CB8EACADB20DCABC775A157B208A69A19"};
  for(const [key,path] of Object.entries(PNG_ENVELOPE_ASSETS)) {
    const bytes = readFileSync(new URL(`../public${path}`,import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(),hashes[key]);
    assert.equal(bytes[25],6,"PNG RGBA color type");
  }
});
test("physical viewport geometry preserves each PNG ratio and sends all artwork outside", () => {
  for(const [w,h] of [[390,844],[320,568],[375,812],[430,932],[599,900]]) {
    const l = getPngEnvelopeLayout(w,h);
    for(const part of [l.base,l.flap]) assert.ok(Math.abs(part.width/part.height-941/1672)<1e-12);
    assert.equal(l.seal.width,l.seal.height);
    assert.ok(l.base.x+l.base.width+l.leftTravel<0);
    assert.ok(l.flap.x+l.rightTravel+l.seal.x>w);
    assert.ok(Math.abs(l.flap.x+l.seal.x+l.seal.width*645/1254-w*.48)<1e-8);
  }
  assert.deepEqual(getPngEnvelopeLayout(NaN,-2),getPngEnvelopeLayout(390,844));
});
test("closed PNGs cover the invitation without a slit at common Smartphone sizes", () => {
  const baseAlpha=pngAlpha(PNG_ENVELOPE_ASSETS.base),flapAlpha=pngAlpha(PNG_ENVELOPE_ASSETS.flap);
  for(const [w,h] of [[320,568],[375,812],[390,844],[430,932]]) {
    const l=getPngEnvelopeLayout(w,h);
    const alpha=(sample,box,x,y)=>sample((x-box.x)*941/box.width,(y-box.y)*1672/box.height);
    for(let y=4;y<h-4;y+=8) for(let x=4;x<w-4;x+=8) {
      assert.ok(Math.max(alpha(baseAlpha,l.base,x,y),alpha(flapAlpha,l.flap,x,y))>=220,`Uncovered paper at ${w}x${h}: ${x},${y}`);
    }
  }
});
test("mobile duration is isolated from legacy desktop duration", () => {
  for(const value of [.9,1,1.1,1.2]) assert.equal(getPngEnvelopeDuration(value),value);
  for(const value of [undefined,null,NaN,Infinity,1.5,5]) assert.equal(getPngEnvelopeDuration(value),1.1);
  assert.match(source,/config.customSettings\?\.mobilePngDuration/);
  assert.doesNotMatch(source,/config.duration/);
});
test("seal is an ordinary image inside the single moving flap group, no old mechanism", () => {
  const html = render(PngEnvelopeOpening,"mobile");
  assert.match(html,/png-envelope-right-group[\s\S]*?png-envelope-flap[\s\S]*?png-envelope-seal[\s\S]*?<\/div>/);
  assert.equal((html.match(/<img /g)||[]).length,3);
  assert.equal((source.match(/\{children\}/g)||[]).length,1);
  assert.doesNotMatch(source,/rotateX|rotateY|clipPath|maskImage|filter:|motion.img|opacity:|scale:/);
  assert.match(html,/class="png-envelope-content" inert="" aria-hidden="true">/);
  assert.match(source,/if \(startedRef.current/);
  assert.match(source,/if \(!startedRef.current \|\| completedRef.current\) return/);
  assert.match(source,/phase !== "complete" &&/);
  assert.match(source,/onAnimationComplete/);
});
test("forced Smartphone Preview chooses PNGs, Tablet and PC retain old renderer", () => {
  assert.match(render(ResponsiveEnvelopeOpening,"mobile"),/png-envelope-stage/);
  for(const device of ["tablet","desktop"]) {
    const html=render(ResponsiveEnvelopeOpening,device);
    assert.match(html,/portrait-envelope-stage/);
    assert.doesNotMatch(html,/png-envelope-stage/);
  }
  assert.match(read("src/features/music/InvitationExperience.tsx"),/<OpeningRenderer[\s\S]*?device=\{activeDevice\}/);
  assert.match(read("src/features/openings/OpeningRenderer.tsx"),/device=\{device\}/);
});
test("CSS clips only physical viewport and releases scroll after opening", () => {
  const css=read("src/styles.css");
  assert.match(css,/\.png-envelope-stage \{[^}]*var\(--preview-device-height, 100dvh\)/);
  assert.match(css,/\.png-envelope-stage.is-opened \{ height: auto; overflow: visible/);
  assert.match(css,/\.png-envelope-content \{[^}]*z-index: 10/);
  assert.match(css,/\.png-envelope-right-group \{ z-index: 30/);
  assert.match(css,/\.png-envelope-seal \{[^}]*z-index: 40/);
  assert.match(css,/\.png-envelope-overlay \{[^}]*pointer-events: none/);
  assert.doesNotMatch(css.slice(css.indexOf("/* Smartphone: original PNG")),/mix-blend|mask-image|rotate|perspective/);
});

const offsets = { baseClosedOffset: {x:-4,y:2}, flapClosedOffset: {x:3,y:-1}, sealClosedOffset: {x:-6,y:4} };
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
test("old projects and zero offsets retain exactly the validated geometry and travel", () => {
  for (const [w,h] of [[390,844],[320,568],[430,932]]) {
    const original = getPngEnvelopeLayout(w,h);
    for (const settings of [undefined,{}, {baseClosedOffset:{x:0,y:0},flapClosedOffset:{x:0,y:0},sealClosedOffset:{x:0,y:0}}]) {
      const adjusted = getPngEnvelopeClosedLayout(w,h,settings);
      for (const part of ["base","flap","seal"]) assert.deepEqual(adjusted[part],original[part]);
      assert.deepEqual(adjusted.flapImage,{x:0,y:0,width:original.flap.width,height:original.flap.height});
      assert.equal(adjusted.leftTravel,original.leftTravel); assert.equal(adjusted.rightTravel,original.rightTravel);
    }
  }
});
test("requested offsets scale with viewport axes, not PNG bounds or screen zoom", () => {
  for (const [w,h] of [[390,844],[320,568],[430,932]]) {
    const base = getPngEnvelopeLayout(w,h), next = getPngEnvelopeClosedLayout(w,h,offsets);
    near(next.base.x-base.base.x,-.04*w); near(next.base.y-base.base.y,.02*h);
    near(next.flapImage.x,.03*w); near(next.flapImage.y,-.01*h);
    near(next.seal.x-base.seal.x,-.06*w); near(next.seal.y-base.seal.y,.04*h);
    assert.deepEqual(next.flap,base.flap,"moving group's origin never changes");
    assert.equal(next.leftTravel,base.leftTravel); assert.equal(next.rightTravel,base.rightTravel);
    for (const progress of [0,.001,.25,.5,1]) {
      near((next.base.x+next.leftTravel*progress)-(base.base.x+base.leftTravel*progress),-.04*w);
      near((next.flap.x+next.seal.x+next.rightTravel*progress)-(base.flap.x+base.seal.x+base.rightTravel*progress),-.06*w);
    }
  }
});
test("flap and seal local offsets are independent, finite and safely bounded", () => {
  assert.deepEqual(resolveEnvelopeOffset(),{x:0,y:0});
  assert.deepEqual(resolveEnvelopeOffset({x:NaN,y:Infinity}),{x:0,y:0});
  assert.deepEqual(resolveEnvelopeOffset({x:-99,y:70}),{x:-50,y:50});
  assert.deepEqual(resolveEnvelopeOffset({x:"5",y:null}),{x:0,y:0});
  const base=getPngEnvelopeClosedLayout(390,844), flap=getPngEnvelopeClosedLayout(390,844,{flapClosedOffset:{x:7,y:-3}});
  assert.deepEqual(flap.seal,base.seal); assert.deepEqual(flap.base,base.base); assert.deepEqual(flap.flap,base.flap);
  const seal=getPngEnvelopeClosedLayout(390,844,{sealClosedOffset:{x:-9,y:8}});
  assert.deepEqual(seal.flapImage,base.flapImage); assert.deepEqual(seal.flap,base.flap); assert.deepEqual(seal.base,base.base);
});
test("actual renderer places offsets on local boxes, keeps seal inside group and locks editor preview", () => {
  const html=renderToStaticMarkup(createElement(PngEnvelopeOpening,{config:{...config,envelope:offsets},closedPreview:true},null));
  const l=getPngEnvelopeClosedLayout(390,844,offsets);
  for (const [part,rect] of [["base",l.base],["flap",l.flapImage],["seal",l.seal]]) {
    assert.match(html,new RegExp(`class="png-envelope-${part}"[^>]*style="left:${rect.x}px;top:${rect.y}px;`));
  }
  assert.doesNotMatch(html,/png-envelope-trigger/);
  assert.match(source,/closedPreview \? "Position fermée/);
  assert.match(source,/animate=\{\{ x: opening \? layout.leftTravel : 0 \}\}/);
  assert.match(source,/animate=\{\{ x: opening \? layout.rightTravel : 0 \}\}/);
  assert.match(source,/duration: duration - delay, delay: opening \? delay : 0, ease: "easeInOut"/);
});
test("Smartphone offsets never change Tablet or PC renderer output", () => {
  for (const device of ["tablet","desktop"]) {
    const withOffsets=renderToStaticMarkup(createElement(ResponsiveEnvelopeOpening,{config:{...config,envelope:offsets},device,couple:"Emma & Lucas"},createElement("button",{},"Vrai contenu")));
    assert.equal(withOffsets,render(ResponsiveEnvelopeOpening,device));
  }
});

test("position UI follows each asset picker and editor closed overlay is Smartphone introduction only", () => {
  const controls=read("src/features/openings/EnvelopePositionControls.tsx");
  assert.match(controls,/ENVELOPE_OFFSET_FIELDS\[part\]/);
  assert.match(controls,/Position horizontale/); assert.match(controls,/Position verticale/);
  assert.match(controls,/type="range"[\s\S]*min=\{-50\} max=\{50\} step=\{1\}/);
  assert.match(controls,/<DimensionInput/); assert.match(controls,/Réinitialiser la position/);
  assert.match(controls,/\.\.\.opening.envelope/);
  const picker=read("src/features/openings/EnvelopeAssetControls.tsx");
  assert.ok(picker.indexOf('<EnvelopePositionControls part={part}')>picker.indexOf('Télécharger le modèle'));
  const canvas=read("src/components/editor/EditorCanvas.tsx");
  assert.match(canvas,/const isEnvelopeEditing = sidebarView === "introduction" && project\?\.introductionMode === "classic" && project.opening.type === "envelope" && previewDevice === "mobile"/);
  assert.match(canvas,/<PngEnvelopeOpening config=\{project.opening\} couple=\{project.name\} closedPreview>/);
  assert.match(canvas,/height: \(isEnvelopeEditing \? viewport.height : documentHeight\) \* zoom/);
});
