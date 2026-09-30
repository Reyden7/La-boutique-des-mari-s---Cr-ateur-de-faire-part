import test from "node:test";
import assert from "node:assert/strict";
import { getHierarchyRows, moveHierarchyElement } from "../src/utils/hierarchyOrder.ts";
import { getRsvpLayerZIndex } from "../src/features/rsvp/rsvpEditorElement.ts";

const elements = () => [
  { id: "section-a", type: "section", zIndex: 1, x: 0, y: 100 },
  { id: "text-a", type: "text", sectionId: "section-a", zIndex: 2, x: 40, y: 140, locked: true },
  { id: "section-b", type: "section", zIndex: 3, x: 0, y: 800 },
  { id: "text-b", type: "text", zIndex: 4, x: 60, y: 860 },
];

test("reparenting preserves geometry and lock state", () => {
  const moved = moveHierarchyElement(elements(), "text-a", "section-b", "inside");
  const text = moved.find((item) => item.id === "text-a");
  assert.equal(text.sectionId, "section-b");
  assert.deepEqual([text.x, text.y, text.locked], [40, 140, true]);
  assert.deepEqual(getHierarchyRows(moved).map((item) => item.id), ["text-b", "section-b", "text-a", "section-a"]);
});

test("root drop records an explicit null parent", () => {
  const moved = moveHierarchyElement(elements(), "text-a", null, "after");
  assert.equal(moved.find((item) => item.id === "text-a").sectionId, null);
});

test("children can be reordered without changing their coordinates", () => {
  const input = [...elements(), { id: "text-c", type: "text", sectionId: "section-a", zIndex: 2.5, x: 99, y: 180 }];
  const moved = moveHierarchyElement(input, "text-a", "text-c", "before");
  assert.deepEqual(getHierarchyRows(moved).filter((item) => item.sectionId === "section-a").map((item) => item.id), ["text-a", "text-c"]);
  assert.equal(moved.find((item) => item.id === "text-a").y, 140);
});

test("sections reorder as groups and never nest", () => {
  const original = elements();
  assert.equal(moveHierarchyElement(original, "section-a", "section-b", "inside"), original);
  const moved = moveHierarchyElement(original, "section-a", "section-b", "before");
  assert.deepEqual(getHierarchyRows(moved).map((item) => item.id), ["text-b", "section-a", "text-a", "section-b"]);
  assert.ok(moved.find((item) => item.id === "text-a").zIndex > moved.find((item) => item.id === "section-a").zIndex);
});

test("a section-owned form remains above its children but below higher root layers", () => {
  const data = elements();
  assert.equal(getRsvpLayerZIndex({ sectionId: "section-a" }, data), 2.5);
  assert.equal(getRsvpLayerZIndex({}, data), 5);
});
