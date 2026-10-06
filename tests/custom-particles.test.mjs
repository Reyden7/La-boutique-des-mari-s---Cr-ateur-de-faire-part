import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const rendererUrl = new URL("../src/features/particles/ParticleRenderer.tsx", import.meta.url);
const compiledRenderer = await transformWithOxc(readFileSync(rendererUrl, "utf8"), fileURLToPath(rendererUrl));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) {
      const candidate = new URL(specifier, context.parentURL);
      for (const suffix of [".tsx", ".ts"]) if (existsSync(fileURLToPath(candidate) + suffix)) return next(`${specifier}${suffix}`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== rendererUrl.href) return next(url, context);
    return { format: "module", shortCircuit: true, source: 'import React from "react";\n' + compiledRenderer.code };
  },
});
const { ParticleRenderer } = await import("../src/features/particles/ParticleRenderer.tsx");
const base = { enabled: true, shape: "custom", customImageUrl: "/floral.png", direction: "down", speed: 0, quantity: 3, colors: ["#ff0000"], minSize: 40, maxSize: 40, opacity: 0.7, layer: "front" };
const render = (changes = {}) => renderToStaticMarkup(createElement(ParticleRenderer, { config: { ...base, ...changes } }));

test("custom PNG and WebP particles render the unmodified image source, not a mask", () => {
  for (const customImageUrl of ["/floral.png", "/illustration.png", "/transparent.webp", "/details.png"]) {
    const html = render({ customImageUrl });
    assert.equal((html.match(/<img /g) ?? []).length, 3);
    assert.equal((html.match(new RegExp(`src="${customImageUrl.replaceAll(".", "\\.")}"`, "g")) ?? []).length, 3);
    assert.match(html, /class="custom-particle-image"/);
    assert.doesNotMatch(html, /mask-image|background-color|color:#ff0000/);
    assert.match(html, /draggable="false"/);
  }
});
test("image particles preserve size, opacity, quantity and both movement modes", () => {
  for (const speed of [0, 70]) {
    const html = render({ speed, quantity: 8, direction: "up-left" });
    assert.equal((html.match(/<img /g) ?? []).length, 8);
    assert.match(html, /font-size:40px/);
    assert.match(html, /opacity:0\.7/);
    assert.match(html, speed === 0 ? /wedding-particle-floating/ : /wedding-particle-travelling/);
    assert.match(html, /animation-duration:/);
    if (speed !== 0) assert.match(html, /--particle-from-x:/);
  }
});
test("preset particles still use their configured colors and never the saved custom image", () => {
  for (const shape of ["heart", "circle", "star", "petal", "sparkle", "diamond"]) {
    const html = render({ shape });
    assert.doesNotMatch(html, /<img |mask-image/);
    assert.match(html, /color:#ff0000/);
  }
});
test("disabled, zero-quantity and missing custom image remain safe", () => {
  assert.equal(render({ enabled: false }), "");
  assert.equal(render({ quantity: 0 }), "");
  assert.doesNotMatch(render({ customImageUrl: undefined }), /<img |mask-image/);
});
test("custom image CSS contains the full bitmap and applies no tint/mask/filter", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const rule = css.match(/\.custom-particle-image\s*\{([^}]+)\}/)[1];
  assert.match(rule, /width:\s*1em/);
  assert.match(rule, /height:\s*1em/);
  assert.match(rule, /object-fit:\s*contain/);
  assert.doesNotMatch(rule, /mask|background|filter|blend/);
  assert.match(rule, /pointer-events:\s*none/);
});
test("Editor and Preview/Public all use the corrected shared ParticleRenderer", () => {
  for (const path of ["../src/components/editor/EditorCanvas.tsx", "../src/features/music/InvitationExperience.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /import \{ ParticleRenderer \}/);
    assert.match(source, /<ParticleRenderer/);
  }
  const preview = readFileSync(new URL("../src/components/preview/PreviewMode.tsx", import.meta.url), "utf8");
  assert.match(preview, /<InvitationExperience/);
});
