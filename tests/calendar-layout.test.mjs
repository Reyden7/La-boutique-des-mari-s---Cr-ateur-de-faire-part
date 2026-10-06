import test from "node:test";
import assert from "node:assert/strict";
import { getCalendarMonth, getCalendarLayout, CALENDAR_STYLES, CALENDAR_DECORATIONS } from "../src/utils/calendarLayout.ts";
const element = { type: "calendar", title: "Save the date", month: 8, year: 2026, highlightedDay: 15, style: "elegant", titleFontFamily: "Cormorant Garamond", titleFontSize: 32, titleColor: "#12345680", titleAlign: "center", numbersFontFamily: "Lora", numbersFontSize: 17, numbersColor: "#234567", weekdaysFontFamily: "Montserrat", weekdaysFontSize: 10, weekdaysColor: "#456789", accentColor: "#987654", backgroundColor: "#fffaf580", borderColor: "#abcdef", decorationStyle: "none", decorationColor: "#fedcba", showWeekdays: true, showMonthLabel: true, showYearLabel: true };
test("French Monday-first grid aligns a known wedding date and contains every day once", () => {
  const grid = getCalendarMonth(8, 2026, 15);
  assert.equal(grid.offset, 5); assert.equal(grid.rows, 6); assert.equal(grid.days, 31);
  assert.deepEqual(grid.cells.filter(Boolean), Array.from({ length: 31 }, (_, i) => i + 1));
  assert.equal(grid.cells[19], 15); assert.equal(grid.highlightedDay, 15);
});
test("leap years, century exception and short months never display impossible dates", () => {
  for (const [year, days] of [[2024, 29], [2026, 28], [2000, 29], [1900, 28], [2100, 28]]) assert.equal(getCalendarMonth(2, year).days, days);
  assert.equal(getCalendarMonth(4, 2026).days, 30);
  assert.equal(getCalendarMonth(2, 2026, 29).highlightedDay, null);
  assert.equal(getCalendarMonth(2, 2024, 29).highlightedDay, 29);
  for (const day of [null, 0, 32, NaN, 1.5]) assert.equal(getCalendarMonth(8, 2026, day).highlightedDay, null);
});
test("UTC date generation is stable for early years and malformed input", () => {
  assert.equal(getCalendarMonth(1, 1).year, 1); assert.equal(getCalendarMonth(1, 1).offset, 0);
  assert.equal(getCalendarMonth(2, 99).days, 28);
  assert.equal(getCalendarMonth(Infinity, NaN).month, 8);
  assert.equal(getCalendarMonth(-2, 12000).year, 9999);
  const february = getCalendarMonth(2, 2021); assert.equal(february.rows, 4); assert.equal(february.offset, 0);
});
for (const style of CALENDAR_STYLES) for (const decoration of CALENDAR_DECORATIONS) test(`calendar ${style.id} / ${decoration.id}: stable fit and real grid on all supports`, () => {
  const source = { ...element, style: style.id, decorationStyle: decoration.id };
  const saved = JSON.stringify(source);
  for (const [width, height] of [[280, 340], [500, 400], [700, 600], [50, 40], [600, 90]]) {
    const layout = getCalendarLayout(source, { width, height });
    assert.ok(layout.designWidth * layout.scale <= width + .0001);
    assert.ok(layout.designHeight * layout.scale <= height + .0001);
    assert.equal(layout.text.filter((x) => x.role === "day").length, 31);
    assert.equal(layout.text.filter((x) => x.role === "weekday").length, 7);
    assert.equal(layout.text.filter((x) => x.bold && x.day === 15).length, 1);
    assert.equal(layout.text.find((x) => x.role === "title").fontFamily, source.titleFontFamily);
    for (const text of layout.text) {
      assert.ok(text.x >= 0 && text.y >= 0 && text.x + text.width <= layout.designWidth + .01 && text.y + text.height <= layout.designHeight + .01);
      assert.ok(Number.isFinite(text.fontSize));
    }
    assert.deepEqual(layout, getCalendarLayout(source, { width, height }));
  }
  assert.equal(JSON.stringify(source), saved);
});
test("independent typography, alpha colours, optional labels and no selected day", () => {
  const layout = getCalendarLayout({ ...element, title: "", showWeekdays: false, showMonthLabel: false, showYearLabel: false, highlightedDay: null }, { width: 310, height: 360 });
  assert.ok(layout.text.every((text) => text.role === "day" && !text.bold));
  const full = getCalendarLayout(element, { width: 310, height: 360 });
  assert.equal(full.text.find((x) => x.role === "title").color, "#12345680");
  assert.equal(full.shapes[0].fill, "#fffaf580");
  assert.equal(full.text.find((x) => x.role === "weekday").fontFamily, "Montserrat");
  assert.equal(full.text.find((x) => x.role === "day").fontFamily, "Lora");
});
test("multiline title and large requested fonts keep all date cells inside the box", () => {
  const layout = getCalendarLayout({ ...element, title: "Notre très belle journée de mariage\nSave the date", titleFontSize: 70, numbersFontSize: 96, weekdaysFontSize: 64 }, { width: 110, height: 190 });
  assert.ok(layout.text.find((x) => x.role === "title").text.includes("\n"));
  assert.ok(layout.text.filter((x) => x.role === "day").every((x) => x.fontSize < 96));
  assert.ok(layout.offsetX >= 0 && layout.offsetY >= 0);
});
