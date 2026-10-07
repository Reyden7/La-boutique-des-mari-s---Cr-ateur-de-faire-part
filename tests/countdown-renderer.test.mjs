import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const url=new URL("../src/features/elements/CountdownRenderer.tsx",import.meta.url);
const compiled='import React from "react";\n'+(await transformWithOxc(readFileSync(url,"utf8"),fileURLToPath(url))).code;
const hooks=registerHooks({
  resolve(specifier,context,next){
    if(specifier.startsWith(".")&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes("/src/")) {
      for(const ext of [".ts",".tsx"]) if(existsSync(new URL(specifier+ext,context.parentURL))) return next(specifier+ext,context);
    }return next(specifier,context);
  },
  load(path,context,next){if(path===url.href)return{format:"module",shortCircuit:true,source:compiled};return next(path,context);},
});
const {CountdownRenderer}=await import(url.href);
const {makeCountdownElement}=await import("../src/features/elements/elementFactories.ts");
const {getCountdownDays}=await import("../src/utils/countdownDate.ts");
test("actual shared DOM renderer computes the date on render and never exposes editorName",()=>{
  const element={...makeCountdownElement(),targetDate:"2027-08-15",editorName:"PRIVATE EDITOR LABEL",fontFamily:"STARWARS",numberColor:"#00000080",labelColor:"#12345640"};
  for(const device of ["mobile","tablet","desktop"]) {
    const html=renderToStaticMarkup(createElement(CountdownRenderer,{element,device}));
    assert.ok(html.includes(`data-countdown-days="${getCountdownDays(element.targetDate)}"`));
    assert.ok(html.includes('data-countdown-date="2027-08-15"'));assert.ok(html.includes('font-family:STARWARS'));
    assert.ok(html.includes('color:#00000080'));assert.ok(html.includes('color:#12345640'));
    assert.ok(!html.includes("PRIVATE EDITOR LABEL"));assert.ok(!html.includes('opacity:'));
  }
});
test("public render of a past date stays zero and label is escaped as plain content",()=>{
  const html=renderToStaticMarkup(createElement(CountdownRenderer,{element:{...makeCountdownElement(),targetDate:"2000-01-01",label:"<img src=x> & jours"},device:"mobile"}));
  assert.match(html,/data-countdown-days="0"/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});
test.after(()=>hooks.deregister());
