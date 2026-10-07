import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCountdownLayout } from "../src/utils/countdownLayout.ts";
const element={type:"countdown",targetDate:"2027-08-15",label:"jours",layout:"vertical",fontFamily:"STARWARS",numberFontSize:64,labelFontSize:20,numberColor:"#12345680",labelColor:"#abcdef40",textAlign:"center",gap:6,padding:8,backgroundColor:"#12345600",borderColor:"#fedcba80",borderWidth:2,borderRadius:12};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
for(const layout of ["vertical","horizontal"]) for(const textAlign of ["left","center","right"]) test(`${layout}/${textAlign} uses a single bounded scene, full label and original font alias`,()=>{
  const source={...element,layout,textAlign,label:"JOURS AVANT\nLE GRAND JOUR"},saved=JSON.stringify(source);
  for(const [width,height] of [[260,140],[500,400],[100,80],[20,12],[1000,200]]) {
    const scene=getCountdownLayout(source,{width,height},"2026-10-07");
    assert.equal(scene.days,312); assert.equal(scene.text[0].text,"312");
    assert.equal(scene.text[1].text.replace(/\s/g,""),"JOURSAVANTLEGRANDJOUR");
    assert.equal(scene.backgroundColor,"#12345600");
    for(const text of scene.text) {
      assert.equal(text.fontFamily,"STARWARS");
      assert.ok(scene.offsetX+text.x*scene.scale>=-.001);
      assert.ok(scene.offsetY+text.y*scene.scale>=-.001);
      assert.ok(scene.offsetX+(text.x+text.width)*scene.scale<=width+.001);
      assert.ok(scene.offsetY+(text.y+text.height)*scene.scale<=height+.001);
    }
    assert.equal(scene.text[0].color,"#12345680");assert.equal(scene.text[1].color,"#abcdef40");
  }
  assert.equal(JSON.stringify(source),saved);
});
test("horizontal number and label form a compact centered group with the requested gap",()=>{
  const scene=getCountdownLayout({...element,layout:"horizontal",borderWidth:0},{width:500,height:140},"2026-10-07");
  const [number,label]=scene.text;
  near(label.x-(number.x+number.width),6);
  near(scene.offsetX+(label.x+label.width)*scene.scale/2,250);
  assert.equal(scene.scale,1); assert.equal(label.text,"jours");
});
test("date changes, blank label, malformed date and huge fonts render safely without changing saved dimensions",()=>{
  const current=getCountdownLayout(element,{width:260,height:140},"2027-08-15");assert.equal(current.days,0);
  const blank=getCountdownLayout({...element,label:"",layout:"horizontal"},{width:260,height:140},"2026-10-07"); assert.equal(blank.text.length,1);
  for(const targetDate of ["", "bogus", "2026-10-01"]) assert.equal(getCountdownLayout({...element,targetDate},{width:260,height:140},"2026-10-07").days,0);
  const tiny=getCountdownLayout({...element,numberFontSize:400,labelFontSize:200,gap:120},{width:12,height:12},"2026-10-07");
  assert.equal(tiny.width,12);assert.equal(tiny.height,12);assert.ok(tiny.scale>0&&tiny.scale<1);
});
test("midnight hook is shared, reschedules once per day and cleans timer/wake listeners",()=>{
  const read=(file)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
  const hook=read("src/hooks/useCountdownDay.ts");
  assert.match(hook,/setTimeout\(refresh, getNextCountdownDayDelay\(now\)\)/);
  assert.doesNotMatch(hook,/setInterval/);
  for(const event of ["visibilitychange","focus","pageshow"]) {assert.ok(hook.includes(`addEventListener("${event}"`));assert.ok(hook.includes(`removeEventListener("${event}"`));}
  for(const renderer of ["CountdownCanvasContent","CountdownRenderer"]) {
    const source=read(`src/features/elements/${renderer}.tsx`);assert.match(source,/getCountdownLayout\(/);assert.match(source,/useCountdownDay\(\)/);assert.match(source,/useProjectFontRevision\(\)/);assert.doesNotMatch(source,/opacity=/);
  }
});
