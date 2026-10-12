import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const paths = ["src/features/music/InvitationExperience.tsx", "src/features/openings/OpeningRenderer.tsx", "src/features/openings/animations/NoneOpening.tsx", "src/features/openings/OpeningSelector.tsx", "src/features/introduction/IntroductionPanel.tsx"];
const compiled = new Map(await Promise.all(paths.map(async path => {
  const url = new URL(`../${path}`, import.meta.url);
  return [url.href, 'import React from "react";\n' + (await transformWithOxc(read(path), fileURLToPath(url))).code];
})));
// Isolate cloud and unrelated renderers. Test the real registry, selector,
// introduction routing, animation-ready gate and store/parser/template paths.
const mocks = {
  "WeddingRenderer": 'import React from "react"; export const WeddingRenderer=({playAnimations,mode})=>React.createElement("p",{"data-ready":String(playAnimations),"data-mode":mode},"Invitation visible");',
  "ParticleRenderer": 'export const ParticleRenderer=()=>null;',
  "WelcomePageRenderer": 'export const WelcomePageRenderer=()=>null;',
  "WelcomePageEditor": 'export const WelcomePageEditor=()=>null;',
  "useResponsiveDevice": 'export const useResponsiveDevice=(device)=>device??"mobile";',
  "DoorsOpening": 'import React from "react"; export const DoorsOpening=({children})=>React.createElement("div",{"data-opening":"doors"},children);',
  "ResponsiveEnvelopeOpening": 'import React from "react"; export const ResponsiveEnvelopeOpening=({children})=>React.createElement("div",{"data-opening":"envelope"},children);',
  "supabase": 'export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error("No cloud")};',
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith('retired:')) return next(specifier,{...context,parentURL:import.meta.url});
    const name = specifier.split("/").at(-1);
    if (context.parentURL?.includes('/src/') && mocks[name]) return {url:`retired:${name}`,shortCircuit:true};
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes('/src/')) {
      for (const ext of ['.ts','.tsx']) if (existsSync(new URL(specifier+ext,context.parentURL))) return next(specifier+ext,context);
    }
    return next(specifier,context);
  },
  load(url,context,next) {
    if (url.startsWith('retired:')) return {format:'module',source:mocks[url.slice(8)],shortCircuit:true};
    if (compiled.has(url)) return {format:'module',source:compiled.get(url),shortCircuit:true};
    return next(url,context);
  },
});
const { normalizeRetiredOpening } = await import('../src/features/openings/legacyOpening.ts');
const { normalizeProject, upsertProject, getProject } = await import('../src/utils/storage.ts');
const { createBlankProject } = await import('../src/templates/templates.ts');
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import('../src/utils/templateSnapshot.ts');
const { useEditorStore } = await import('../src/stores/editorStore.ts');
const { openingRegistry, getOpeningDefinition } = await import('../src/features/openings/registry/openingRegistry.ts');
const { IntroductionPanel } = await import('../src/features/introduction/IntroductionPanel.tsx');
const { OpeningSelector } = await import('../src/features/openings/OpeningSelector.tsx');
const { InvitationExperience } = await import('../src/features/music/InvitationExperience.tsx');
const { OpeningRenderer } = await import('../src/features/openings/OpeningRenderer.tsx');
const aliases = ['curtain','curtains','rideau','rideaux',' CURTAINS '];
const memory = new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const base = normalizeProject({...createBlankProject(),id:'retired-qa',ownerId:'owner'});
const oldOpening = type => ({...structuredClone(base),opening:{type,duration:2.2,colors:['#7a2330'],variant:'velvet',customSettings:{unused:'keep'}},introductionMode:'classic'});

test('all retired identifiers in opening, introductionMode and oldest openingAnimation become none without mutating data',()=>{
  for(const alias of aliases) {
    const variants = [oldOpening(alias), {...structuredClone(base),introductionMode:alias}, {...structuredClone(base),opening:undefined,openingAnimation:alias,introductionMode:undefined}];
    for(const value of variants) {
      const before=structuredClone(value), actual=normalizeProject(value);
      assert.equal(actual.opening.type,'none'); assert.equal(actual.introductionMode,'none'); assert.equal(actual.opening.duration,0);
      assert.deepEqual(value,before); assert.deepEqual(actual.pages,base.pages);
      assert.equal(normalizeProject(actual).opening.type,'none');
    }
    assert.deepEqual(normalizeProject(oldOpening(alias)).opening.customSettings,{unused:'keep'});
  }
});
test('other modes, all current/future opening types and explicit welcome pages are preserved',()=>{
  for(const type of ['none','envelope','doors','scroll','book','veil','floral-gates']) {
    const project=oldOpening(type); assert.equal(normalizeRetiredOpening(project),project);
    assert.equal(normalizeProject(project).opening.type,type);
    const stale={...project,openingAnimation:'curtains'}; assert.equal(normalizeRetiredOpening(stale),stale);
  }
  for(const mode of ['none','welcome','classic']) assert.equal(normalizeProject({...base,introductionMode:mode}).introductionMode,mode);
  const welcome={...oldOpening('curtains'),introductionMode:'welcome',welcomePage:{...base.welcomePage,enabled:true}};
  assert.equal(normalizeProject(welcome).introductionMode,'welcome'); assert.equal(normalizeProject(welcome).welcomePage.enabled,true);
  assert.equal(normalizeProject({...welcome,introductionMode:undefined}).introductionMode,'welcome');
});
test('real editor store, save/reload and legacy templates do not revive the removed opening',()=>{
  for(const alias of aliases) {
    const project=oldOpening(alias);
    useEditorStore.getState().setProject(project);
    assert.equal(useEditorStore.getState().project.opening.type,'none'); assert.equal(useEditorStore.getState().project.introductionMode,'none');
    upsertProject(project); const reloaded=getProject(project.id,'owner');
    assert.equal(reloaded.opening.type,'none'); assert.equal(reloaded.introductionMode,'none');
    const template=sanitizeProjectForTemplate(project), instance=instantiateProjectFromTemplate({name:'Ancien modèle',templateData:template},'new-owner');
    assert.equal(instance.opening.type,'none'); assert.equal(instance.introductionMode,'none'); assert.equal(instance.pages.length,project.pages.length);
  }
});
test('actual UI registry/selector/panel expose no removed option; only none, envelope and doors remain',()=>{
  assert.deepEqual(openingRegistry.map(item=>item.id),['none','envelope','doors']);
  for(const alias of aliases) assert.equal(getOpeningDefinition(alias).id,'none');
  useEditorStore.getState().setProject(oldOpening('curtains'));
  // Zustand SSR reads its initial snapshot, unlike the client hook. Supply the
  // actual normalized store state as this test-only hydration snapshot.
  Object.assign(useEditorStore.getInitialState(),useEditorStore.getState());
  const selector=renderToStaticMarkup(createElement(OpeningSelector,{onPreview:()=>{}}));
  assert.match(selector,/Sans animation/); assert.match(selector,/Enveloppe/); assert.match(selector,/Porte/); assert.doesNotMatch(selector,/rideau|curtain|velvet/i);
  const panel=renderToStaticMarkup(createElement(IntroductionPanel,{onPreview:()=>{}}));
  assert.match(panel,/Aucune introduction/); assert.doesNotMatch(panel,/rideau|curtain/i);
  assert.ok(!existsSync(new URL('../src/features/openings/animations/CurtainsOpening.tsx',import.meta.url)));
  assert.doesNotMatch(read('src/styles.css'),/\.curtain|\.opening-(glyph|property-hero)\.curtains/);
  assert.doesNotMatch(read('src/types/editor.ts').match(/export type OpeningAnimationType =[^;]+;/)[0],/curtain/);
});
test('raw and normalized legacy projects immediately expose animated content in Preview/Public on every device',()=>{
  for(const alias of aliases) for(const mode of ['preview','public']) for(const device of ['mobile','tablet','desktop']) {
    const raw=oldOpening(alias);
    for(const project of [raw,normalizeProject(raw),{...base,introductionMode:alias}]) {
      const html=renderToStaticMarkup(createElement(InvitationExperience,{project,mode,device}));
      assert.match(html,/Invitation visible/); assert.match(html,/data-ready="true"/); assert.match(html,new RegExp(`data-mode="${mode}"`));
      assert.doesNotMatch(html,/curtain|rideau|data-opening|opening-stage/i);
    }
    const html=renderToStaticMarkup(createElement(OpeningRenderer,{config:raw.opening,couple:'QA'},createElement('p',null,'Document direct')));
    assert.equal(html,'<p>Document direct</p>');
  }
});
