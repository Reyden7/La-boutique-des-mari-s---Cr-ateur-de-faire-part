import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleCalendarUrl, buildIcsEvent, getCalendarEventData, getCalendarEventError, getCalendarEventConfig, getIcsFilename, foldIcsLine } from "../src/utils/calendarEvent.ts";
import { getCalendarLayout } from "../src/utils/calendarLayout.ts";
const element = () => ({ id: "agenda-test", type:"calendar", title:"Save the date", month: 8, year: 2027, highlightedDay: 15, calendarEvent: { enabled: true, buttonLabel: "Ajouter à mon agenda", title: "Mariage d’Emma & Lucas", location: "Château de l'Été, Paris; France", description: "Bienvenue !\nNous avons hâte & sommes ravis.", timezone: "Europe/Paris" } });
const timed = (startTime, endTime, timezone="Europe/Paris") => { const e=element();e.calendarEvent={...e.calendarEvent,startTime,endTime,timezone};return e; };
const stamp=new Date("2026-10-07T12:34:56Z");
test("all-day Google/ICS use the highlighted date and exclusive next day without UTC",()=>{
  const e=element(), event=getCalendarEventData(e),url=new URL(buildGoogleCalendarUrl(e)),ics=buildIcsEvent(e,stamp);
  assert.equal(event.start,"20270815");assert.equal(event.end,"20270816");assert.equal(event.allDay,true);
  assert.equal(url.origin,"https://calendar.google.com");assert.equal(url.pathname,"/calendar/render");assert.equal(url.searchParams.get("action"),"TEMPLATE");
  assert.equal(url.searchParams.get("dates"),"20270815/20270816");assert.equal(url.searchParams.has("ctz"),false);
  assert.match(ics,/DTSTART;VALUE=DATE:20270815\r\nDTEND;VALUE=DATE:20270816/);assert.match(ics,/DTSTAMP:20261007T123456Z/);
});
test("accents, ampersands, apostrophes and multiline descriptions round-trip in Google URL",()=>{
  const e=element(),url=new URL(buildGoogleCalendarUrl(e));
  assert.equal(url.searchParams.get("text"),e.calendarEvent.title);assert.equal(url.searchParams.get("details"),e.calendarEvent.description);assert.equal(url.searchParams.get("location"),e.calendarEvent.location);
  assert.equal(url.searchParams.has("access_token"),false);assert.equal(url.searchParams.has("scope"),false);
});
test("ICS escapes delimiters, backslashes, newlines and prevents property injection",()=>{
  const e=element();e.calendarEvent.description="Une \\ note; amis, famille\r\nEND:VEVENT\r\nBEGIN:VEVENT";
  const ics=buildIcsEvent(e,stamp);assert.match(ics,/DESCRIPTION:Une \\\\ note\\; amis\\, famille\\nEND:VEVENT\\nBEGIN:VEVENT/);
  assert.equal(ics.match(/(?:^|\r\n)BEGIN:VEVENT/g).length,1);assert.equal(ics.match(/(?:^|\r\n)END:VEVENT/g).length,1);
  assert.match(ics,/LOCATION:Château de l'Été\\, Paris\\; France/);assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
test("folding respects 75 UTF-8 octets and preserves multibyte text when unfolded",()=>{
  const line="DESCRIPTION:"+"Mariés 💚 été éà;".repeat(60),folded=foldIcsLine(line);
  assert.equal(folded.replace(/\r\n /g,""),line);for(const physical of folded.split("\r\n"))assert.ok(Buffer.byteLength(physical,"utf8")<=75);
});
test("Paris summer timed event exports the same UTC instants to Google and ICS",()=>{
  const e=timed("14:00","23:59"),event=getCalendarEventData(e),url=new URL(buildGoogleCalendarUrl(e));
  assert.equal(event.start,"20270815T120000Z");assert.equal(event.end,"20270815T215900Z");assert.equal(url.searchParams.get("ctz"),"Europe/Paris");
  assert.equal(url.searchParams.get("dates"),`${event.start}/${event.end}`);assert.match(buildIcsEvent(e,stamp),/DTSTART:20270815T120000Z\r\nDTEND:20270815T215900Z/);
});
test("winter timezone, default two-hour duration and overnight end are explicit",()=>{
  const winter=timed("14:00");winter.month=1;assert.equal(getCalendarEventData(winter).start,"20270115T130000Z");assert.equal(getCalendarEventData(winter).end,"20270115T150000Z");
  const overnight=getCalendarEventData(timed("23:00","01:30"));assert.equal(overnight.start,"20270815T210000Z");assert.equal(overnight.end,"20270815T233000Z");
  assert.equal(getCalendarEventData(timed("14:00","14:00")).end,"20270816T120000Z");
});
test("IANA timezone supports non-hour offsets and is independent of the visitor zone",()=>{
  const previous=process.env.TZ;
  try{for(const tz of ["UTC","America/Los_Angeles","Asia/Tokyo"]){process.env.TZ=tz;assert.equal(getCalendarEventData(timed("14:00",undefined,"Asia/Kolkata")).start,"20270815T083000Z");}}
  finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test("spring DST gap is rejected, autumn ambiguity consistently selects first occurrence",()=>{
  const gap=timed("02:30");gap.month=3;gap.highlightedDay=28;assert.match(getCalendarEventError(gap),/n’existe pas/);
  const overlap=timed("02:30");overlap.month=10;overlap.highlightedDay=31;assert.equal(getCalendarEventData(overlap).start,"20271031T003000Z");
  const across=timed("01:30","04:30");across.month=3;across.highlightedDay=28;assert.equal(getCalendarEventData(across).start,"20270328T003000Z");assert.equal(getCalendarEventData(across).end,"20270328T023000Z");
});
test("all-day end survives month/year/leap boundaries; no selected day cannot invent a date",()=>{
  const e=element();e.month=12;e.highlightedDay=31;assert.equal(getCalendarEventData(e).end,"20280101");
  e.year=2028;e.month=2;e.highlightedDay=29;assert.equal(getCalendarEventData(e).end,"20280301");
  e.year=2027;assert.match(getCalendarEventError(e),/jour mis en avant/);e.highlightedDay=null;assert.ok(getCalendarEventError(e));
  e.year=9999;e.month=12;e.highlightedDay=31;assert.match(getCalendarEventError(e),/9999/);
});
test("bad times/zones rejected; no start means all-day even if end is present",()=>{
  for(const time of ["25:00","12:99","2:00","14:00\r\nX:evil"])assert.ok(getCalendarEventError(timed(time)));
  assert.match(getCalendarEventError(timed("14:00",undefined,"bad-zone")),/fuseau/);
  assert.equal(getCalendarEventData(timed(undefined,"23:00")).allDay,true);
});
test("safe filename and stable UID; legacy calendars hide the button",()=>{
  const e=element();assert.equal(getIcsFilename(e),"mariage-d-emma-lucas.ics");e.calendarEvent.title="../../💚";assert.equal(getIcsFilename(e),"mariage.ics");
  assert.match(buildIcsEvent(e,stamp),/UID:agenda-test@laboutiquedesmaries.fr/);delete e.calendarEvent;
  assert.equal(getCalendarEventConfig(e).enabled,false);assert.equal(getCalendarLayout(e,{width:310,height:360}).button,null);
});
test("button typography, alpha, spacing and responsive fit use one scene without modifying source",()=>{
  const e=element();e.calendarEvent={...e.calendarEvent,buttonLabel:"Ajouter notre mariage\nà mon agenda",buttonFontFamily:"STARWARS",buttonTextColor:"#12345680",buttonBackgroundColor:"#789abc40",buttonBorderColor:"#abcdef00",buttonFontSize:24,buttonGap:20,buttonRadius:12};
  const original=JSON.stringify(e);
  for(const box of [{width:260,height:340},{width:500,height:440},{width:650,height:550},{width:20,height:12}]){
    const scene=getCalendarLayout(e,box);assert.ok(scene.button);assert.ok(scene.designHeight*scene.scale<=box.height+.01);assert.ok(scene.designWidth*scene.scale<=box.width+.01);
    assert.equal(scene.button.text.fontFamily,"STARWARS");assert.equal(scene.button.text.color,"#12345680");assert.ok(scene.shapes.some(s=>s.fill==="#789abc40"));assert.ok(scene.button.y+scene.button.height<=scene.designHeight);
  }assert.equal(JSON.stringify(e),original);
});
