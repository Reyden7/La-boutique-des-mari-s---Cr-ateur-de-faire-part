import test from "node:test";
import assert from "node:assert/strict";
import { animationOpacityPlacement, elementAnimationFrames, parseAnimationSeconds, resolveElementAnimation } from "../src/utils/elementAnimation.ts";
import { getSectionRenderGroups } from "../src/utils/sectionRenderGroups.ts";

test("French decimal seconds and legacy string values resolve without NaN", () => {
  assert.equal(parseAnimationSeconds("0,8", 1), 0.8);
  assert.equal(parseAnimationSeconds("0.8", 1), 0.8);
  assert.equal(parseAnimationSeconds(0.8, 1), 0.8);
  assert.equal(parseAnimationSeconds("0,5", 1), 0.5);
  assert.equal(parseAnimationSeconds("invalid", 1), 1);
  assert.deepEqual(resolveElementAnimation({ type: "fade", duration: "0,8", delay: "1" }), { type: "fade", duration: 0.8, delay: 1 });
  assert.equal(resolveElementAnimation({ type: "none", duration: 1, delay: 2 }), null);
});

test("all effects end at the user's opacity and neutral visual offsets", () => {
  for (const type of ["fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom", "rotate"]) {
    const { hidden, visible } = elementAnimationFrames(type, 0.6);
    assert.equal(hidden.opacity, 0, type);
    assert.deepEqual(visible, { opacity: 0.6, x: 0, y: 0, scale: 1, rotate: 0 }, type);
  }
  assert.equal(elementAnimationFrames("slide-left", 1).hidden.x, -42);
  assert.equal(elementAnimationFrames("slide-right", 1).hidden.x, 42);
  assert.equal(elementAnimationFrames("slide-up", 1).hidden.y, -42);
  assert.equal(elementAnimationFrames("slide-down", 1).hidden.y, 42);
  assert.equal(elementAnimationFrames("zoom", 1).hidden.scale, 0.85);
  assert.equal(elementAnimationFrames("rotate", 1).hidden.rotate, -20);
});

test("a section and its children render as one group; orphaned children stay visible", () => {
  const section = { id: "section", type: "section", zIndex: 1 };
  const child = { id: "child", type: "text", sectionId: "section", animation: { type: "zoom", duration: 0.8, delay: 0 } };
  const orphan = { id: "orphan", type: "text", sectionId: "missing" };
  const groups = getSectionRenderGroups([section, child, orphan]);
  assert.deepEqual(groups.roots.map((element) => element.id), ["section", "orphan"]);
  assert.deepEqual(groups.childrenBySection.get("section"), [child]);
  assert.deepEqual(child.animation, { type: "zoom", duration: 0.8, delay: 0 });
});

test("section opacity applies to its surface once, not to the form or other children", () => {
  assert.deepEqual(animationOpacityPlacement(0.4, true), { motionOpacity: 1, contentOpacity: 0.4 });
  assert.deepEqual(animationOpacityPlacement(0.4, false), { motionOpacity: 0.4, contentOpacity: 1 });
  assert.deepEqual(animationOpacityPlacement(undefined, true), { motionOpacity: 1, contentOpacity: 1 });
  assert.deepEqual(animationOpacityPlacement(undefined, false), { motionOpacity: 1, contentOpacity: 1 });
  assert.equal(elementAnimationFrames("fade", animationOpacityPlacement(0.4, true).motionOpacity).visible.opacity, 1);
});
