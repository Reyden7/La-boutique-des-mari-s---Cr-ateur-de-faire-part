import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { createHash } from "node:crypto";
import { decodeRgba } from "../scripts/generate-envelope-templates.mjs";
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
  return next(specifier, context);
}});
const { DOOR_PRESETS, resolveDoorAsset, removeDoorCustom, globalDoorChoices, resolveDoorOffset, updateDoorDeviceSettings, resolveDoorDeviceScale, resolveDoorScale } = await import("../src/features/openings/doorAssets.ts");
const { getDoorAlphaMetrics, getDoorRenderBox, getScaledDoorTravel } = await import("../src/features/openings/doorLayout.ts");
const { textRevealSegments, textRevealTiming, isTextAnimation } = await import("../src/utils/textAnimation.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

test("six independent original PNG pairs preserve alpha, dimensions and unique left/right bytes", () => {
  for (let index = 1; index <= 6; index++) {
    const hashes = [];
    for (const part of ["left","right"]) {
      const asset = DOOR_PRESETS[part][index], bytes = read(`public${asset.url}`);
      const image = decodeRgba(bytes);
      assert.equal(image.width,asset.width); assert.equal(image.height,asset.height);
      assert.ok(image.pixels.some((value,i) => i%4===3 && value===0));
      hashes.push(createHash("sha256").update(bytes).digest("hex"));
      const metrics = getDoorAlphaMetrics(image.width,image.height,image.pixels);
      for (const [w,h] of [[320,568],[390,844],[768,1024],[1440,900]]) {
        for (const offset of [{x:0,y:0},{x:50,y:-50},{x:-50,y:50}]) {
          const box = getDoorRenderBox(w,h,metrics,part,offset);
          assert.ok(Math.abs(box.width/box.height-image.width/image.height)<1e-10);
          assert.ok(box.height >= h);
          if(part==="left") assert.ok(box.x+box.width+box.travel<=-1);
          else assert.ok(box.x+box.travel>=w+1);
          const zero=getDoorRenderBox(w,h,metrics,part);
          assert.ok(Math.abs(box.x-zero.x-w*offset.x/100)<1e-7);
          assert.ok(Math.abs(box.y-zero.y-h*offset.y/100)<1e-7);
          for (const scale of [.5,.75,1,1.25,1.5]) {
            const travel=getScaledDoorTravel(box,w,part,scale);
            if(scale===1) assert.ok(Math.abs(travel-box.travel)<1e-7);
            const renderedLeft=w/2+scale*(box.x+travel-w/2);
            const renderedRight=renderedLeft+box.width*scale;
            if(part==="left") assert.ok(renderedRight<=-1.999999);
            else assert.ok(renderedLeft>=w+1.999999);
          }
        }
      }
    }
    assert.notEqual(hashes[0],hashes[1]);
  }
});
test("door references, fallbacks and deletion are independent; offsets isolate all three supports", () => {
  const config={leftAsset:DOOR_PRESETS.left[2],rightAsset:{type:"custom",id:"mine",url:"https://example.invalid/r.png"},customRights:[{type:"custom",id:"mine",url:"https://example.invalid/r.png"}]};
  assert.deepEqual(resolveDoorAsset(undefined,"left"),DOOR_PRESETS.left[0]);
  assert.deepEqual(resolveDoorAsset({leftAsset:{type:"custom",url:"javascript:alert(1)"}},"left"),DOOR_PRESETS.left[0]);
  const removed=removeDoorCustom(config,"right","mine");assert.deepEqual(removed.leftAsset,config.leftAsset);assert.deepEqual(removed.rightAsset,DOOR_PRESETS.right[0]);assert.equal(removed.customRights.length,0);
  let responsive=config;
  for(const device of ["mobile","tablet","desktop"]) responsive=updateDoorDeviceSettings(responsive,device,{leftClosedOffset:{x:7,y:-8},rightClosedOffset:{x:-12,y:15}});
  const changed=updateDoorDeviceSettings(responsive,"tablet",{leftClosedOffset:{x:10,y:20}});
  for(const device of ["mobile","desktop"]) assert.deepEqual(resolveDoorOffset(changed,"left",device),{x:7,y:-8});
  assert.deepEqual(resolveDoorOffset(changed,"right","tablet"),{x:-12,y:15});
  assert.deepEqual(JSON.parse(JSON.stringify(changed)),changed);
});
test("global door choices exclude drafts and other parts; keep deterministic IDs and URLs", () => {
  const row=(id,type,published=true)=>({id,type,isPublished:published,name:id,url:`https://example.invalid/${id}.png`,sortOrder:1,createdAt:"2026"});
  const choices=globalDoorChoices([row("z","door_left"),row("a","door_left"),row("r","door_right"),row("draft","door_left",false),row("a","door_left")],"left");
  assert.deepEqual(choices.map(item=>item.id),["a","z"]); assert.ok(choices.every(item=>item.type==="global"));
});
test("uniform door size defaults to 100%, clamps invalid values and isolates device overrides/reset", () => {
  for(const value of [undefined,null,NaN,Infinity,"1.2"]) assert.equal(resolveDoorScale(value),1);
  assert.equal(resolveDoorScale(.2),.5);assert.equal(resolveDoorScale(3),1.5);
  const original={doorScale:1.25,responsive:{tablet:{scale:1.5,rightClosedOffset:{x:12,y:8}},desktop:{scale:.75}}};
  assert.equal(resolveDoorDeviceScale(undefined,"mobile"),1);assert.equal(resolveDoorDeviceScale(original,"mobile"),1.25);
  const reset=updateDoorDeviceSettings(original,"tablet",{scale:1});
  assert.equal(resolveDoorDeviceScale(reset,"mobile"),1.25);assert.equal(resolveDoorDeviceScale(reset,"desktop"),.75);
  assert.deepEqual(reset.responsive.tablet.rightClosedOffset,{x:12,y:8});
  const source=read("src/features/openings/animations/DoorsOpening.tsx").toString();
  assert.match(source,/png-door-group.*transform: `scale/);assert.match(source,/Cliquer pour ouvrir les portes/);
  assert.doesNotMatch(source,/\{couple\}|\{project.name\}|\{config.name\}/);
  assert.match(source,/transition=\{\{ duration: \.2 \}\}/);
});
test("Unicode text reveal preserves UTF-16 ranges, emoji, accents, whitespace and full duration/delay", () => {
  const text="Éléonore e\u0301 👩‍❤️‍👨\n& Lucas";
  const letters=textRevealSegments(text);assert.ok(letters.some(item=>item.text==="e\u0301"));assert.ok(letters.some(item=>item.text==="👩‍❤️‍👨"));
  for(const part of letters) assert.equal(text.slice(part.start,part.end),part.text);
  assert.deepEqual(textRevealSegments("Emma  &\nLucas",true).map(item=>item.text),["Emma","&","Lucas"]);
  assert.equal(isTextAnimation("fade"),false);assert.equal(isTextAnimation("handwriting"),true);
  for(const stepped of [true,false]) { const timing=textRevealTiming(9,10,2,.5,stepped);assert.equal(timing.delay+timing.duration,2.5); }
});
test("text rendering keeps one original text node, separate opacity, shared viewport and reduced motion", () => {
  const source=read("src/components/renderer/TextEntrance.tsx").toString();
  assert.match(source,/\{text\}<\/motion.div>/);assert.doesNotMatch(source,/units.map.*span/);
  assert.match(source,/useAnimationViewport/);assert.match(source,/!reducedMotion/);assert.match(source,/document.fonts.ready/);
  const doors=read("src/features/openings/animations/DoorsOpening.tsx").toString();
  assert.doesNotMatch(doors,/rotateY|perspective/);assert.match(doors,/inert=\{phase !== "complete"\}/);
  assert.match(doors,/started.current \|\| !settled/);assert.match(doors,/completed.current/);
});
