import test from "node:test";
import assert from "node:assert/strict";
import { analyzeScratchMaskPixels, getScratchMaskPlacement, isScratchMaskPointActive, paintScratchModelSurface } from "../src/features/elements/scratchMask.ts";

const rgba = (width, height, color) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(color, i * 4);
  return pixels;
};

test("transparent PNG/WebP alpha remains the exact scratch silhouette", () => {
  const pixels = rgba(4, 4, [255, 200, 0, 0]);
  for (const i of [5, 6, 9, 10]) pixels.set([80, 40, 10, 255], i * 4);
  const result = analyzeScratchMaskPixels(pixels, 4, 4);
  assert.equal(result.source, "alpha");
  assert.equal(result.coverage, .25);
  assert.equal(result.alpha[0], 0);
  assert.equal(result.alpha[5], 255);
});

test("opaque JPG with a uniform border extracts the central subject", () => {
  const pixels = rgba(5, 5, [245, 242, 235, 255]);
  for (const i of [7, 11, 12, 13, 17]) pixels.set([35, 45, 65, 255], i * 4);
  const result = analyzeScratchMaskPixels(pixels, 5, 5);
  assert.equal(result.source, "background");
  assert.equal(result.coverage, .2);
  assert.equal(result.alpha[0], 0);
  assert.equal(result.alpha[12], 255);
});

test("mask stays centred and hit testing ignores transparent letterboxing", () => {
  const mask = { width: 4, height: 2, alpha: Uint8ClampedArray.from([0, 255, 255, 0, 0, 255, 255, 0]) };
  assert.deepEqual(getScratchMaskPlacement(mask, 200, 200), { x: 0, y: 50, width: 200, height: 100 });
  assert.equal(isScratchMaskPointActive(mask, 100, 25, 200, 200), false);
  assert.equal(isScratchMaskPointActive(mask, 100, 100, 200, 200), true);
  assert.equal(isScratchMaskPointActive(mask, 10, 100, 200, 200), false);
});

test("the unscratched surface draws the original full-colour image, not the silhouette canvas", () => {
  const image = { naturalWidth: 400, naturalHeight: 200 };
  const mask = { image, canvas: {}, width: 400, height: 200 };
  const draws = [];
  paintScratchModelSurface({ drawImage: (...args) => draws.push(args) }, mask, 200, 200);
  assert.deepEqual(draws, [[image, 0, 50, 200, 100]]);
});

test("a custom scratch model survives project JSON save and element duplication", () => {
  const element = {
    id: "scratch-a", type: "scratch", shape: "custom",
    scratchModel: { url: "https://example.test/storage/v1/object/public/wedding-assets/user/project/images/model.png", name: "model.png", assetId: "asset-a" },
    responsive: { tablet: { x: 40, y: 90 }, desktop: { x: 120, y: 200 } },
  };
  const copy = structuredClone(element);
  copy.id = "scratch-b";
  assert.deepEqual(copy.scratchModel, element.scratchModel);
  assert.deepEqual(JSON.parse(JSON.stringify({ elements: [element, copy] })).elements.map((item) => item.scratchModel), [element.scratchModel, element.scratchModel]);
});
