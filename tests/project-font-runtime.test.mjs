import test from "node:test";
import assert from "node:assert/strict";
import { loadProjectFont } from "../src/features/fonts/projectFontRuntime.ts";

test("FontFace load, registration and fonts.ready finish before the runtime resolves", async () => {
  const previousDocument = globalThis.document;
  const previousFontFace = globalThis.FontFace;
  const events = [];
  let ready;
  const loaded = {};
  globalThis.document = { fonts: {
    add: (font) => { assert.equal(font, loaded); events.push("add"); },
    ready: new Promise((resolve) => { ready = resolve; }),
  } };
  globalThis.FontFace = class {
    constructor(family, source) { events.push([family, source]); }
    async load() { events.push("load"); return loaded; }
  };
  try {
    const font = { id: "font-test", family: "STARWARS", name: "STARWARS", format: "ttf", url: "https://example.invalid/STARWARS.ttf" };
    let resolved = false;
    const loading = loadProjectFont(font).then((value) => { resolved = true; return value; });
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(events, [["STARWARS", 'url("https://example.invalid/STARWARS.ttf") format("truetype")'], "load", "add"]);
    assert.equal(resolved, false);
    ready();
    assert.equal(await loading, loaded);
    assert.equal(await loadProjectFont(font), loaded);
    assert.equal(events.filter((event) => event === "load").length, 1);
  } finally {
    globalThis.document = previousDocument;
    globalThis.FontFace = previousFontFace;
  }
});
