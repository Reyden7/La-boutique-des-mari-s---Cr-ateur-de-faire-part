import test from "node:test";
import assert from "node:assert/strict";
import { getElementLayout, getImageRotationFrame, setElementLayoutForDevice } from "../src/utils/responsiveLayout.ts";

const image = {
  id: "image", type: "image", x: 100, y: 200, width: 300, height: 150,
  rotation: 0, zIndex: 1, visible: true,
  responsive: {
    tablet: { x: 60, y: 80, width: 240, height: 400, rotation: 0 },
    desktop: { x: 400, y: 100, width: 600, height: 300, rotation: 0 },
  },
};

test("image rotation uses its geometric centre without changing logical x/y or dimensions", () => {
  for (const angle of [0, 45, 90, -45, 180]) {
    const rotated = setElementLayoutForDevice(image, "mobile", { rotation: angle });
    const layout = getElementLayout(rotated, "mobile");
    const frame = getImageRotationFrame(layout);
    assert.deepEqual([layout.x, layout.y, layout.width, layout.height], [100, 200, 300, 150]);
    assert.deepEqual([frame.x, frame.y, frame.offsetX, frame.offsetY], [250, 275, 150, 75]);
    assert.equal(frame.transformOrigin, "center center");
    assert.equal(frame.x - frame.offsetX, layout.x);
    assert.equal(frame.y - frame.offsetY, layout.y);
  }
});

test("rotation changes only the selected responsive layout", () => {
  const rotated = setElementLayoutForDevice(image, "tablet", { rotation: 45 });
  assert.equal(getElementLayout(rotated, "mobile").rotation, 0);
  assert.equal(getElementLayout(rotated, "tablet").rotation, 45);
  assert.equal(getElementLayout(rotated, "desktop").rotation, 0);
  assert.deepEqual(getImageRotationFrame(getElementLayout(rotated, "tablet")), {
    x: 180, y: 280, offsetX: 120, offsetY: 200, transformOrigin: "center center",
  });
});
