import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
  return next(specifier, context);
} });
const { resolveImageAppearance, normalizeImageAppearance, resolveImageFade, setImageAppearanceForDevice, hasImageAppearance, getImageFadeAlpha, getImageFadeProgress, getImageAppearanceBounds, getImageCompositeSize } = await import("../src/utils/imageAppearance.ts");
const { resolveImageTransform, setImageTransformForDevice, DEFAULT_IMAGE_TRANSFORM } = await import("../src/utils/imageLayout.ts");
const { getSectionShape, SECTION_EDGE_PRESETS } = await import("../src/utils/sectionEdges.ts");
const image = { id: "image", type: "image", src: "source.png", width: 300, height: 180, imageStyle: { transform: { cropX: .2, cropY: .8, cropScale: 2 }, responsive: { tablet: { flipX: true }, desktop: { flipY: true } } } };
const wave = { enabled: true, style: "wave", height: 32, intensity: .7, inverted: false };
test("legacy images and new absent configs have no edges/fades; activated defaults are subtle", () => {
  for (const device of ["mobile", "tablet", "desktop"]) {
    const appearance = resolveImageAppearance(image, device);
    assert.equal(hasImageAppearance(appearance), false);
    assert.equal(appearance.topEdge.enabled, false); assert.equal(appearance.bottomEdge.enabled, false);
    assert.equal(appearance.topFade.enabled, false); assert.equal(appearance.bottomFade.enabled, false);
    assert.equal(appearance.topFade.height, 80); assert.equal(appearance.topFade.blur, 6);
    assert.equal(appearance.topFade.opacity, 0); assert.equal(appearance.topFade.intensity, .65);
  }
});
test("invalid fade data is normalized without NaNs or unbounded buffers", () => {
  assert.deepEqual(resolveImageFade({ enabled: true, height: -4, blur: 100, intensity: NaN, opacity: 8 }), { enabled: true, height: 0, blur: 24, intensity: .65, opacity: 1 });
  assert.equal(resolveImageFade({ height: Infinity }).height, 80);
});
for (const device of ["mobile", "tablet", "desktop"]) test(`appearance edits on ${device} leave both siblings and crop untouched`, () => {
  const before = structuredClone(image);
  const changed = { ...image, ...setImageAppearanceForDevice(image, device, { topEdge: wave, bottomFade: resolveImageFade({ enabled: true }) }) };
  assert.equal(resolveImageAppearance(changed, device).topEdge.style, "wave");
  assert.equal(resolveImageAppearance(changed, device).bottomFade.enabled, true);
  for (const sibling of ["mobile", "tablet", "desktop"]) {
    assert.deepEqual(resolveImageTransform(changed, sibling), resolveImageTransform(image, sibling));
    if (sibling !== device) assert.deepEqual(resolveImageAppearance(changed, sibling), resolveImageAppearance(image, sibling));
  }
  assert.deepEqual(image, before);
});
test("subsequent mobile edits preserve existing tablet appearance and both edge sides", () => {
  let changed = { ...image, ...setImageAppearanceForDevice(image, "tablet", { topEdge: wave }) };
  changed = { ...changed, ...setImageAppearanceForDevice(changed, "mobile", { bottomEdge: { ...wave, style: "tear" } }) };
  changed = { ...changed, ...setImageAppearanceForDevice(changed, "mobile", { topFade: resolveImageFade({ enabled: true, blur: 12 }) }) };
  assert.equal(resolveImageAppearance(changed, "tablet").topEdge.style, "wave");
  assert.equal(resolveImageAppearance(changed, "tablet").bottomEdge.enabled, false);
  assert.equal(resolveImageAppearance(changed, "mobile").bottomEdge.style, "tear");
  assert.equal(resolveImageAppearance(changed, "mobile").topFade.blur, 12);
  assert.equal(resolveImageAppearance(changed, "desktop").topFade.enabled, false);
});
test("crop/flip edits do not erase responsive appearance and JSON roundtrip retains everything", () => {
  let changed = { ...image, ...setImageAppearanceForDevice(image, "desktop", { topEdge: wave }) };
  changed = { ...changed, ...setImageTransformForDevice(changed, "desktop", { cropX: .9, flipX: true }) };
  const restored = JSON.parse(JSON.stringify(changed));
  assert.deepEqual(resolveImageAppearance(restored, "desktop"), resolveImageAppearance(changed, "desktop"));
  assert.equal(resolveImageAppearance(restored, "desktop").topEdge.style, "wave");
  assert.equal(resolveImageTransform(restored, "desktop").cropX, .9);
  assert.equal(resolveImageTransform(restored, "desktop").flipY, true);
});
for (const side of ["top", "bottom"]) for (const style of SECTION_EDGE_PRESETS) test(`${side} image edge ${style.id} reuses the exact Section silhouette`, () => {
  const appearance = normalizeImageAppearance({ [`${side}Edge`]: { ...wave, style: style.id } });
  const shape = getSectionShape(300, 180, appearance.topEdge, appearance.bottomEdge);
  const expected = getSectionShape(300, 180, side === "top" ? { ...wave, style: style.id } : undefined, side === "bottom" ? { ...wave, style: style.id } : undefined);
  assert.deepEqual(shape.points, expected.points);
  assert.ok(shape.points.every(([x, y]) => x >= 0 && x <= 300 && y >= 0 && y <= 180));
});
test("fade is progressive, respects final opacity, and zero strength/disabled preserve pixels", () => {
  const fade = resolveImageFade({ enabled: true, opacity: .25 });
  assert.equal(getImageFadeAlpha(fade, 0), 1); assert.equal(getImageFadeAlpha(fade, 1), .25);
  let previous = 1;
  for (let i = 0; i <= 100; i++) { const alpha = getImageFadeAlpha(fade, i / 100); assert.ok(alpha <= previous); previous = alpha; }
  assert.equal(getImageFadeAlpha({ ...fade, intensity: 0 }, 1), 1);
  assert.equal(getImageFadeProgress({ ...fade, enabled: false }, .8), 0);
  assert.equal(hasImageAppearance(normalizeImageAppearance({ topFade: { ...fade, intensity: 0 } })), false);
  assert.equal(hasImageAppearance(normalizeImageAppearance({ topFade: { ...fade, blur: 0, opacity: 1 } })), false);
});
test("contain applies edges to the actual visible photo; cover/crop stay within the logical box", () => {
  assert.deepEqual(getImageAppearanceBounds(1200, 500, 300, 300, "contain", DEFAULT_IMAGE_TRANSFORM), { x: 0, y: 87.5, width: 300, height: 125 });
  assert.deepEqual(getImageAppearanceBounds(500, 1200, 300, 300, "contain", DEFAULT_IMAGE_TRANSFORM), { x: 87.5, y: 0, width: 125, height: 300 });
  for (const fit of ["contain", "cover"]) for (const cropScale of [1, 2, 4]) {
    const bounds = getImageAppearanceBounds(1200, 500, 300, 180, fit, { ...DEFAULT_IMAGE_TRANSFORM, cropScale, cropX: .2, cropY: .7, flipX: true, flipY: true });
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 300 && bounds.y + bounds.height <= 180);
  }
});
test("compositing resolution is bounded for extreme images but sharp at common editor sizes", () => {
  assert.deepEqual(getImageCompositeSize(300, 180), { width: 600, height: 360 });
  for (const [w, h] of [[10000, 10000], [50000, 20], [20, 50000], [1440, 900], [1, 1]]) {
    const size = getImageCompositeSize(w, h); assert.ok(size.width <= 4096 && size.height <= 4096); assert.ok(size.width * size.height <= 2_000_000);
  }
});
