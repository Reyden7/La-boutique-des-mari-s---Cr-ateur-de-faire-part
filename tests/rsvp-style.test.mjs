import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RSVP_STYLE, resolveRsvpStyle } from "../src/config/rsvpStyle.ts";
import { parseColorWithAlpha, toHex8 } from "../src/utils/color.ts";

test("every RSVP palette color accepts and preserves an alpha channel", () => {
  const translucent = Object.fromEntries(Object.keys(DEFAULT_RSVP_STYLE).map((key) => [key, "#12345680"]));
  const resolved = resolveRsvpStyle(translucent);
  for (const key of Object.keys(DEFAULT_RSVP_STYLE)) {
    assert.equal(resolved[key], "#12345680", key);
    assert.equal(parseColorWithAlpha(resolved[key]).alpha, 128 / 255, key);
  }
});

test("legacy opaque colors and missing RSVP style values retain their defaults", () => {
  const resolved = resolveRsvpStyle({ backgroundColor: "#abcdef" });
  assert.deepEqual(parseColorWithAlpha(resolved.backgroundColor), { hex: "#abcdef", alpha: 1 });
  for (const key of Object.keys(DEFAULT_RSVP_STYLE).filter((key) => key !== "backgroundColor")) {
    assert.equal(resolved[key], DEFAULT_RSVP_STYLE[key], key);
  }
  assert.deepEqual(resolveRsvpStyle(undefined), DEFAULT_RSVP_STYLE);
});

test("alpha can be changed independently without losing the base color", () => {
  assert.equal(toHex8("#795746", 0), "#79574600");
  assert.equal(toHex8("#795746", 1), "#795746ff");
  assert.equal(parseColorWithAlpha("#79574600").alpha, 0);
});

test("opaque, translucent and transparent RSVP CSS colors keep their intended alpha", () => {
  assert.equal(parseColorWithAlpha("#000000FF").alpha, 1);
  assert.equal(parseColorWithAlpha("#FFFFFF").alpha, 1);
  assert.equal(parseColorWithAlpha("#FF000080").alpha, 128 / 255);
  assert.equal(parseColorWithAlpha("transparent").alpha, 0);
});
