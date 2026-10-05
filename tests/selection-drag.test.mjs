import test from "node:test";
import assert from "node:assert/strict";
import { getLogicalCanvasPointer, getPointerDragDelta } from "../src/utils/selectionDrag.ts";

test("the pointer delta preserves any grabbed point at every editor zoom", () => {
  for (const zoom of [.5, .75, 1, 1.25, 1.5]) {
    for (const origin of [{ x: 21, y: 101 }, { x: 150, y: 300 }, { x: 319, y: 549 }]) {
      let pointer = { x: origin.x * zoom, y: origin.y * zoom };
      const stage = {
        getPointerPosition: () => pointer,
        getAbsoluteTransform: () => ({ copy: () => ({ invert: () => ({ point: (p) => ({ x: p.x / zoom, y: p.y / zoom }) }) }) }),
      };
      const start = getLogicalCanvasPointer(stage);
      pointer = { x: pointer.x + 1, y: pointer.y + 1 };
      const delta = getPointerDragDelta(start, getLogicalCanvasPointer(stage));
      assert.ok(Math.abs(delta.deltaX * zoom - 1) < 1e-10);
      assert.ok(Math.abs(delta.deltaY * zoom - 1) < 1e-10);
    }
  }
});

test("pointer conversion uses the inverse stage transform, not screen or bounding-box coordinates", () => {
  const stage = {
    getPointerPosition: () => ({ x: 80, y: 120 }),
    getAbsoluteTransform: () => ({ copy: () => ({ invert: () => ({ point: ({ x, y }) => ({ x: (x - 20) / .5, y: (y - 30) / .5 }) }) }) }),
  };
  assert.deepEqual(getLogicalCanvasPointer(stage), { x: 120, y: 180 });
  assert.equal(getLogicalCanvasPointer({ ...stage, getPointerPosition: () => null }), null);
});

test("long drags always use the original pointer, never accumulate frame deltas", () => {
  const start = { x: 37.25, y: 2200.5 };
  for (let frame = 1; frame <= 1000; frame++) {
    assert.deepEqual(getPointerDragDelta(start, { x: start.x + frame / 4, y: start.y - frame / 2 }), {
      deltaX: frame / 4, deltaY: -frame / 2,
    });
  }
});
