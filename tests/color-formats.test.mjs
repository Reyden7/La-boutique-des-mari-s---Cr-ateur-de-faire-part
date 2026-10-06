import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { COLOR_FORMATS, formatColor, parseColorInput, hexToHsv, hsvToHex } from "../src/utils/colorFormats.ts";
import { parseColorWithAlpha, toHex8 } from "../src/utils/color.ts";

test("format order is HEX / RGB / RGBA / HSL / HSLA", () => {
  assert.deepEqual(COLOR_FORMATS, ["HEX", "RGB", "RGBA", "HSL", "HSLA"]);
});
test("formatting is pure and displays alpha only when needed in HEX", () => {
  const color = { hex: "#3e3e1d", alpha: 128 / 255 };
  const before = structuredClone(color);
  assert.equal(formatColor(color, "HEX"), "#3E3E1D80");
  assert.equal(formatColor(color, "RGB"), "rgb(62, 62, 29)");
  assert.equal(formatColor(color, "RGBA"), "rgba(62, 62, 29, 0.502)");
  for (const format of COLOR_FORMATS) formatColor(color, format);
  assert.deepEqual(color, before);
  assert.equal(formatColor({ ...color, alpha: 1 }, "HEX"), "#3E3E1D");
  assert.equal(formatColor({ ...color, alpha: 0 }, "HEX"), "#3E3E1D00");
});
test("all four HEX lengths are accepted, malformed drafts rejected", () => {
  for (const [input, expected] of [["#123", "#112233ff"], ["#1238", "#11223388"], ["#123456", "#123456ff"], ["#12345680", "#12345680"]]) {
    const parsed = parseColorInput(input);
    assert.equal(toHex8(parsed.hex, parsed.alpha), expected);
  }
  for (const input of ["", "#", "#12", "#12345", "#1234567", "#GGGGGG", "123456", "rgba(0,0,0,2)", "rgb(256,0,0)", "hsl(0,101%,50%)", "hsl(0,1,1)", "hsla(0,50%,50%,)", "rgb(,0,0)"]) assert.equal(parseColorInput(input), null, input);
});
test("RGB and HSL editing preserves alpha, RGBA and HSLA explicitly change it", () => {
  assert.deepEqual(parseColorInput("rgb(255, 0, 0)", 0.4), { hex: "#ff0000", alpha: 0.4 });
  assert.deepEqual(parseColorInput("hsl(120, 100%, 50%)", 0.4), { hex: "#00ff00", alpha: 0.4 });
  assert.deepEqual(parseColorInput("rgba(255, 0, 0, 0)", 0.4), { hex: "#ff0000", alpha: 0 });
  assert.deepEqual(parseColorInput("hsla(-120, 100%, 50%, 1)", 0.4), { hex: "#0000ff", alpha: 1 });
});
test("HSV/HSL conversions round-trip saturated, grayscale and mixed colors", () => {
  for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#3e3e1d", "#123456", "#808080", "#abcdef"]) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
    for (const format of COLOR_FORMATS) {
      const color = { hex, alpha: 128 / 255 };
      const parsed = parseColorInput(formatColor(color, format), color.alpha);
      assert.equal(parsed.hex.toLowerCase(), hex);
      assert.ok(Math.abs(parsed.alpha - color.alpha) < 0.001);
    }
  }
});
test("legacy six-digit / short / rgba / transparent values keep their interpretation", () => {
  for (const input of ["#123456", "#123", "#1234", "rgba(62,62,29,0.5)", "transparent"]) {
    const color = parseColorWithAlpha(input);
    const display = formatColor(color, "HEX");
    const parsed = parseColorInput(display);
    assert.equal(toHex8(parsed.hex, parsed.alpha).toLowerCase(), toHex8(color.hex, color.alpha).toLowerCase());
  }
});
test("every picker uses the shared application palette; none delegates formats to the browser", () => {
  const root = new URL("../src/", import.meta.url);
  function visit(url) {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      if (entry.isDirectory()) visit(child);
      else if (entry.name.endsWith(".tsx")) assert.doesNotMatch(readFileSync(child, "utf8"), /type\s*=\s*["']color["']/);
    }
  }
  visit(root);
  for (const path of ["features/backgrounds/BackgroundPanel.tsx", "features/particles/ParticlePanel.tsx", "features/welcome/WelcomePageEditor.tsx", "features/openings/OpeningProperties.tsx"]) assert.match(readFileSync(new URL(path, root), "utf8"), /StableColorInput/);
  for (const path of ["components/properties/PropertiesPanel.tsx", "features/elements/RichElementProperties.tsx", "features/elements/CalendarProperties.tsx", "features/rsvp/RsvpFormEditor.tsx", "features/images/ImageFrameProperties.tsx"]) assert.match(readFileSync(new URL(path, root), "utf8"), /ColorAlphaInput/);
});
