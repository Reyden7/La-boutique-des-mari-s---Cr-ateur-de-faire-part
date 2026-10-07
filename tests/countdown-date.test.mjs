import test from "node:test";
import assert from "node:assert/strict";
import { COUNTDOWN_TIME_ZONE, parseCountdownDate, getCountdownDays, getCountdownToday, getDefaultCountdownDate, getNextCountdownDayDelay } from "../src/utils/countdownDate.ts";

test("calendar days clamp past/today and never depend on a manually saved count", () => {
  assert.equal(getCountdownDays("2027-08-15", "2026-10-07"), 312);
  assert.equal(getCountdownDays("2026-10-07", "2026-10-07"), 0);
  assert.equal(getCountdownDays("2026-10-06", "2026-10-07"), 0);
  assert.equal(getCountdownDays("2026-10-08", "2026-10-07"), 1);
  assert.equal(getCountdownDays("2027-08-15", "2026-10-08"), 311);
});
test("strict date parsing handles leap centuries, early years and invalid persisted dates", () => {
  assert.ok(parseCountdownDate("2024-02-29")); assert.ok(parseCountdownDate("2000-02-29"));
  for (const value of ["", "2027-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-1", "0000-01-01", "2027-08-15T00:00:00Z", "not-a-date"]) {
    assert.equal(parseCountdownDate(value), null); assert.equal(getCountdownDays(value, "2026-10-07"), 0);
  }
  assert.equal(getCountdownDays("0099-01-02", "0099-01-01"), 1);
  assert.equal(getCountdownDays("0001-01-02", "0001-01-01"), 1);
});
test("Paris calendar reference gives every visitor the same day at midnight", () => {
  assert.equal(COUNTDOWN_TIME_ZONE, "Europe/Paris");
  const before=new Date("2027-08-14T21:59:59.999Z"), after=new Date("2027-08-14T22:00:00Z");
  assert.equal(getCountdownToday(before), "2027-08-14"); assert.equal(getCountdownToday(after), "2027-08-15");
  assert.equal(getCountdownDays("2027-08-15", before), 1); assert.equal(getCountdownDays("2027-08-15", after), 0);
  for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo", "Pacific/Honolulu"]) {
    const old=process.env.TZ; process.env.TZ=tz;
    try { assert.equal(getCountdownToday(after), "2027-08-15"); assert.equal(getCountdownDays("2027-08-15", after), 0); }
    finally { if(old===undefined) delete process.env.TZ; else process.env.TZ=old; }
  }
});
test("DST changes never add or remove a calendar day", () => {
  assert.equal(getCountdownDays("2026-03-30", new Date("2026-03-28T23:00:00Z")), 1);
  assert.equal(getCountdownDays("2026-10-26", new Date("2026-10-24T22:00:00Z")), 1);
  assert.equal(getCountdownDays("2026-03-30", "2026-03-28"), 2);
  assert.equal(getCountdownDays("2026-10-26", "2026-10-24"), 2);
});
test("one-year default clamps leap day instead of rolling into March", () => {
  assert.equal(getDefaultCountdownDate(new Date("2026-10-07T12:00:00Z")), "2027-10-07");
  assert.equal(getDefaultCountdownDate(new Date("2024-02-29T12:00:00Z")), "2025-02-28");
  assert.equal(getDefaultCountdownDate(new Date("2023-02-28T12:00:00Z")), "2024-02-28");
});
test("midnight scheduler handles normal, 23-hour, 25-hour and last millisecond days", () => {
  for (const [iso,hours] of [["2026-10-06T22:00:00Z",24],["2026-03-28T23:00:00Z",23],["2026-10-24T22:00:00Z",25]]) {
    const now=new Date(iso),delay=getNextCountdownDayDelay(now);
    assert.equal(delay,hours*3600000);
    assert.equal(getCountdownToday(new Date(now.getTime()+delay-1)),getCountdownToday(now));
    assert.notEqual(getCountdownToday(new Date(now.getTime()+delay)),getCountdownToday(now));
  }
  assert.equal(getNextCountdownDayDelay(new Date("2027-08-14T21:59:59.999Z")),1);
  assert.equal(getCountdownDays("2027-08-15", new Date(NaN)),0);
});
