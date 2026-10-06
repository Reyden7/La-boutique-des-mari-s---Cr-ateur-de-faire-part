import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ENVELOPE_PORTRAIT_RATIO, getEnvelopeFrame, getEnvelopeDuration, getEnvelopeTimeline, resolveEnvelopeSettings, validateSealImage } from "../src/features/openings/envelopeSettings.ts";

const url = new URL("../src/features/openings/animations/VerticalEnvelopeOpening.tsx", import.meta.url);
const source = readFileSync(url, "utf8");
const compiled = await transformWithOxc(source, fileURLToPath(url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "envelope:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(path, context, next) {
    if (path === "envelope:no-network") return { format: "module", shortCircuit: true, source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('No network')};" };
    if (path === url.href) return { format: "module", shortCircuit: true, source: 'import React from "react";\n' + compiled.code };
    return next(path, context);
  },
});
const { VerticalEnvelopeOpening } = await import("../src/features/openings/animations/VerticalEnvelopeOpening.tsx");
const { normalizeProject, upsertProject, getProject } = await import("../src/utils/storage.ts");
const { createBlankProject } = await import("../src/templates/templates.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const config = { type: "envelope", duration: 1.5, colors: ["#85855F", "#d7dec3", "#8e663f"] };
const render = (changes = {}) => renderToStaticMarkup(createElement(VerticalEnvelopeOpening, { config: { ...config, ...changes }, couple: "Emma & Lucas" }, createElement("button", {}, "Contenu déjà monté")));

test("portrait duration and legacy fallback stay in the requested 1.3–1.6 second range", () => {
  for (const value of [undefined, NaN, Infinity, 0, 1, 1.2, 1.8, 3.4, 5.2]) assert.equal(getEnvelopeDuration(value), 1.5);
  for (const value of [1.3, 1.4, 1.5, 1.6]) assert.equal(getEnvelopeDuration(value), value);
});
test("seal, hinged top, sides, bottom, letter and handoff form a single ordered clock", () => {
  for (const duration of [1.3, 1.5, 1.6]) {
    const t = getEnvelopeTimeline(duration);
    assert.ok(t.seal.duration >= .2 && t.seal.duration <= .35);
    assert.ok(t.top.delay < t.seal.duration);
    assert.ok(t.top.delay < t.left.delay && t.left.delay < t.right.delay && t.right.delay < t.bottom.delay);
    assert.ok(t.letter.delay > t.left.delay && t.letter.delay < t.bottom.delay);
    assert.ok(Math.abs(t.bottom.delay + t.bottom.duration - t.handoff.delay) < .00001);
    assert.ok(Math.abs(t.letter.delay + t.letter.duration - duration) < .00001);
    assert.ok(Math.abs(t.handoff.delay + t.handoff.duration - duration) < .00001);
    assert.equal(t.total, duration);
  }
});
test("envelope and letter stay portrait, centered and contained on all viewport shapes", () => {
  for(const [w,h] of [[390,844],[768,1024],[1440,900],[1920,1080],[844,390],[200,120]]){
    const f=getEnvelopeFrame(w,h);
    assert.ok(Math.abs(f.width/f.height-ENVELOPE_PORTRAIT_RATIO)<1e-10);
    assert.ok(Math.abs(f.letterWidth/f.letterHeight-ENVELOPE_PORTRAIT_RATIO)<1e-10);
    assert.ok(f.width<f.height && f.width<=w*.92+.001 && f.height<=h*.82+.001);
    assert.ok(f.x>=0&&f.y>=0&&f.x+f.width<=w&&f.y+f.height<=h);
    assert.equal(f.letterScale,f.letterWidth/w);
    assert.ok(Math.abs(f.letterClipHeight*f.letterScale-f.letterHeight)<1e-10);
    assert.ok(f.letterLift<=12 && f.letterY+f.letterLift+f.letterHeight<=f.y+f.height+.001);
  }
  const mobile=getEnvelopeFrame(390,844);
  assert.equal(mobile.width/390,.92);
  assert.ok(mobile.height/844>=.7&&mobile.height/844<=.9);
  assert.deepEqual(getEnvelopeFrame(NaN,-1),getEnvelopeFrame(390,844));
});
test("reduced motion is one short fade, without delay", () => {
  const t = getEnvelopeTimeline(1.5, true);
  assert.equal(t.total, .18);
  for (const key of ["seal","top","left","right","bottom","inside","letter","handoff"]) assert.deepEqual(t[key], { delay: 0, duration: .18 });
  assert.match(source, /rotateX: opening && !reduceMotion \? -110 : 0/);
  assert.match(source, /rotateY: reduceMotion \? 0 : -58/);
});
test("old colors, settings, labels and missing configs remain supported", () => {
  const fallback = resolveEnvelopeSettings({ type: "envelope", duration: 3.4 });
  assert.equal(fallback.envelope, "#E7D2C3"); assert.equal(fallback.hint, "Touchez pour ouvrir");
  const legacy = resolveEnvelopeSettings({type: "envelope",duration:3.4,customSettings:{envelopeColor:"#111111",envelopeInnerColor:"#222222",sealColor:"#333333",label:"Ouvrez",flapColor:"#444444"}});
  assert.equal(legacy.envelope,"#111111"); assert.equal(legacy.flap,"#444444"); assert.equal(legacy.hint,"Ouvrez");
  assert.equal(resolveEnvelopeSettings({...config,customSettings:{envelopeColor:"#000",hintText:""}}).envelope,"#85855F");
});
test("invitation exists behind the envelope from first render; strict isolated layers", () => {
  const html = render();
  assert.match(html,/class="envelope-invitation" inert="" aria-hidden="true"/);
  let position = -1;
  for (const name of ["envelope-invitation","envelope-inside","envelope-bottom","envelope-left","envelope-right","envelope-top","envelope-seal-position","envelope-trigger"]) {
    const next = html.indexOf(name, html.indexOf("data-envelope-phase")); assert.ok(next > position); position = next;
  }
  assert.match(html,/Contenu déjà monté/);
  assert.doesNotMatch(html,/vertical-invitation-card|card-rising|vertical-envelope-scene/);
  const css = readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.match(css,/\.envelope-invitation \{[^}]*z-index: 0; isolation: isolate/);
  assert.match(css,/\.envelope-overlay \{[^}]*z-index: 5/);
  assert.match(css,/\.envelope-seal-position \{[^}]*z-index: 10; left: 50%; top: 50%/);
  for(const [part,z] of [["inside",2],["bottom",3],["left",4],["right",5],["top",6]]) assert.match(css,new RegExp(`\\.envelope-${part} \\{[^}]*z-index: ${z}`));
  assert.match(css,/\.envelope-top \{[^}]*transform-origin: 50% 0/);
  assert.match(css,/\.envelope-top \.envelope-paper \{[^}]*backface-visibility: hidden/);
  assert.match(css,/\.envelope-flap-inside \{[^}]*rotateX\(180deg\)/);
  assert.match(css,/\.is-opened \.envelope-invitation \{[^}]*background: transparent/);
  assert.doesNotMatch(source,/top-left|bottom-right|104%|ENVELOPE_PANELS/);
  assert.doesNotMatch(css,/\.vertical-envelope-scene/);
});
test("paper uses the shared neutral tinted material, not a beige overlay", () => {
  assert.match(source,/resolveSectionTexture/);
  assert.match(source,/backgroundType: "color-texture"/);
  assert.match(render(),/--opening-primary:#85855F/);
  assert.match(render(),/--envelope-paper:url\(/);
});
test("imported seal renders the original URL as an image, not an alpha mask", () => {
  const html = render({customSettings:{sealImageUrl:"https://example.test/red-seal.png",sealImageName:"red-seal.png"}});
  assert.match(html,/envelope-wax-seal is-custom/);
  assert.match(html,/<img src="https:\/\/example.test\/red-seal.png" alt="" draggable="false"/);
  const css = readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.match(css,/\.envelope-wax-seal img \{[^}]*object-fit: contain/);
  assert.match(render(),/<svg viewBox="0 0 80 80"/);
  assert.doesNotMatch(render(),/♥/);
});
test("file validator accepts PNG WebP JPEG and rejects mismatched MIME, scripts, oversized files", () => {
  for (const [name,type] of [["seal.PNG","image/png"],["seal.webp","image/webp"],["seal.jpg","image/jpeg"],["seal.jpeg","image/jpeg"]]) assert.doesNotThrow(()=>validateSealImage({name,type,size:1024}));
  for (const [name,type] of [["seal.svg","image/svg+xml"],["seal.png","text/html"],["seal.png",""]]) assert.throws(()=>validateSealImage({name,type,size:1024}),/PNG, WebP ou JPEG/);
  assert.throws(()=>validateSealImage({name:"big.png",type:"image/png",size:10*1024*1024+1}),/10 Mo/);
});
test("one live invitation, uniform scale and subtle lift, guards one interaction and completion", () => {
  assert.match(source,/if \(startedRef.current\) return/);
  assert.match(source,/if \(!startedRef.current \|\| completedRef.current\) return/);
  assert.match(source,/phase !== "complete" && <div className="envelope-overlay"/);
  assert.doesNotMatch(source,/setTimeout|scale: 0\.68|cardVariants|key=\{phase\}/);
  assert.match(source,/onAnimationComplete=\{\(\) => \{ if \(opening\) finish\(\); \}\}/);
  assert.equal((source.match(/\{children\}/g)||[]).length,1);
  assert.match(source,/new ResizeObserver/);
  assert.match(source,/return \(\) => observer.disconnect\(\)/);
  assert.match(source,/entry.contentRect.width, entry.contentRect.height/);
  assert.doesNotMatch(source,/getBoundingClientRect|scaleX|scaleY/);
  assert.match(source,/phase === "complete" \? "auto" : frame.letterClipHeight/);
});
test("opening preview reuses the actual fixed device viewport and whole invitation experience", () => {
  const preview = readFileSync(new URL("../src/features/openings/OpeningPreview.tsx",import.meta.url),"utf8");
  assert.match(preview,/<PreviewMode/); assert.match(preview,/introductionMode: "classic"/); assert.match(preview,/device=\{device\}/);
  assert.doesNotMatch(preview,/<WeddingRenderer|<OpeningRenderer/);
  const experience = readFileSync(new URL("../src/features/music/InvitationExperience.tsx",import.meta.url),"utf8");
  assert.match(experience,/const onInteract = \(\) => \{[\s\S]*?project.opening.type === "envelope"\) setDocumentAnimationReady\(true\)/);
});
test("saved project and independent template keep custom seal config unchanged", () => {
  const project = normalizeProject(createBlankProject());
  project.opening = {...config,customSettings:{sealImageUrl:"https://backend.test/storage/v1/object/public/wedding-assets/u/p/images/seal.png",sealImageName:"seal.png",sealAssetId:"asset"}};
  upsertProject(project); assert.deepEqual(getProject(project.id).opening,project.opening);
  const snapshot = sanitizeProjectForTemplate(project);
  const copy = instantiateProjectFromTemplate({name:"Modèle",templateData:snapshot},"new-owner");
  assert.deepEqual(copy.opening,project.opening);
  copy.opening.customSettings.sealImageName="changed";
  assert.equal(snapshot.opening.customSettings.sealImageName,"seal.png");
});
test("existing template asset collector discovers and rewrites nested seal URL", async () => {
  const functionSource = readFileSync(new URL("../supabase/functions/publish-template/index.ts",import.meta.url),"utf8");
  const chunk = functionSource.slice(functionSource.indexOf("const collectWeddingAssetPaths"),functionSource.indexOf("Deno.serve")) + "\nexport {collectWeddingAssetPaths,replaceAssetUrls};";
  const compiled = await transformWithOxc(chunk,"asset-helpers.ts");
  const {collectWeddingAssetPaths,replaceAssetUrls} = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
  const src = "https://backend.test/storage/v1/object/public/wedding-assets/u/p/images/seal.png";
  const snapshot = {opening:{customSettings:{sealImageUrl:src}}};
  assert.deepEqual([...collectWeddingAssetPaths(snapshot)],["u/p/images/seal.png"]);
  const dst = "https://backend.test/storage/v1/object/public/template-assets/templates/t/seal.png";
  assert.equal(replaceAssetUrls(snapshot,new Map([["u/p/images/seal.png",dst]])).opening.customSettings.sealImageUrl,dst);
});
