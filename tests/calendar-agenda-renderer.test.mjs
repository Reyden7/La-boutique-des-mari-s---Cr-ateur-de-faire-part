import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// Precompile JSX for the synchronous Node module hooks.
const urls=[new URL("../src/features/elements/CalendarRenderer.tsx",import.meta.url),new URL("../src/features/elements/CalendarAgendaMenu.tsx",import.meta.url)];
const compiled=new Map(await Promise.all(urls.map(async url=>[url.href,'import React from "react";\n'+(await transformWithOxc(readFileSync(url,"utf8"),fileURLToPath(url))).code])));
const active=registerHooks({resolve(specifier,context,next){if(specifier.startsWith(".")&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes("/src/"))for(const ext of [".ts",".tsx"])if(existsSync(new URL(specifier+ext,context.parentURL)))return next(specifier+ext,context);return next(specifier,context);},load(url,context,next){if(compiled.has(url))return{format:"module",shortCircuit:true,source:compiled.get(url)};return next(url,context);}});
const {CalendarRenderer}=await import(urls[0].href);
const {makeCalendarElement}=await import("../src/features/elements/elementFactories.ts");
test("actual DOM render includes the styled agenda button on all devices and disables invalid dates",()=>{
  const e={...makeCalendarElement(),editorName:"PRIVATE LAYER NAME",calendarEvent:{enabled:true,buttonLabel:"Ajouter <agenda> & mariage",buttonFontFamily:"STARWARS",buttonTextColor:"#12345680"}};
  for(const device of ["mobile","tablet","desktop"]){const html=renderToStaticMarkup(createElement(CalendarRenderer,{element:e,device}));assert.match(html,/calendar-agenda-button/);assert.match(html,/font-family:STARWARS/);assert.match(html,/#12345680/);assert.match(html,/&lt;agenda&gt;/);assert.ok(!html.includes("PRIVATE LAYER NAME"));assert.ok(!html.includes('opacity:'));}
  const html=renderToStaticMarkup(createElement(CalendarRenderer,{element:{...e,highlightedDay:null},device:"mobile"}));assert.match(html,/disabled=""/);assert.match(html,/Choisissez un jour/);
});
test("old/disabled calendars hide the button; Konva has no navigation and menu is local only",()=>{
  const e=makeCalendarElement();delete e.calendarEvent;assert.ok(!renderToStaticMarkup(createElement(CalendarRenderer,{element:e,device:"mobile"})).includes("calendar-agenda-button"));
  e.calendarEvent={enabled:false};assert.ok(!renderToStaticMarkup(createElement(CalendarRenderer,{element:e,device:"mobile"})).includes("calendar-agenda-button"));
  const canvas=readFileSync(new URL("../src/features/elements/CalendarCanvasContent.tsx",import.meta.url),"utf8"),menu=readFileSync(urls[1],"utf8");
  assert.ok(!canvas.includes("window.open")&&!canvas.includes("href="));assert.match(menu,/target="_blank" rel="noopener noreferrer"/);assert.match(menu,/text\/calendar;charset=utf-8/);assert.match(menu,/createPortal/);assert.ok(!menu.includes("supabase")&&!menu.includes("OAuth"));
});
test.after(()=>active.deregister());
