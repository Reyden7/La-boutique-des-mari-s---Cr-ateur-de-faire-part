import test from "node:test";
import assert from "node:assert/strict";
import { getElementComposition, getHierarchyRows, isCompositionVisible, moveHierarchyElement } from "../src/utils/hierarchyOrder.ts";
import { getSectionRenderGroups } from "../src/utils/sectionRenderGroups.ts";
import { getElementLayout, materializeElementLayouts, resetElementLayoutForDevice, setElementLayoutForDevice } from "../src/utils/responsiveLayout.ts";
import { reorderSections } from "../src/utils/sectionLayout.ts";
import { getDocumentContentHeight, resetRsvpPositionForDevice } from "../src/utils/documentLayout.ts";

const element = (id, type, zIndex, sectionId = null) => ({
  id, type, name: id, x: 0, y: 100, width: 390, height: 200,
  rotation: 0, opacity: 1, zIndex, visible: true, sectionId,
});
const fixture = () => [
  element("section-a", "section", 1),
  element("section-b", "section", 3),
  element("image", "image", 2, "section-a"),
  element("text", "text", 4, "section-b"),
].map((item) => ({
  ...item,
  responsive: {
    tablet: { zIndex: item.zIndex, sectionId: item.sectionId, visible: true },
    desktop: { zIndex: item.zIndex, sectionId: item.sectionId, visible: true },
  },
}));

test("legacy values are the fallback; explicit null parent stays outside sections", () => {
  const old = element("image", "image", 2, "section-a");
  assert.deepEqual(getElementComposition(old, "tablet"), { visible: true, zIndex: 2, sectionId: "section-a" });
  old.responsive = { tablet: { sectionId: null, visible: false, zIndex: 19 } };
  assert.deepEqual(getElementComposition(old, "tablet"), { visible: false, zIndex: 19, sectionId: null });
  assert.deepEqual(getElementComposition(old, "mobile"), { visible: true, zIndex: 2, sectionId: "section-a" });
});

test("materialization freezes inherited geometry and composition on all three devices", () => {
  const original = materializeElementLayouts(element("image", "image", 2));
  const changed = setElementLayoutForDevice(original, "mobile", { x: 90, visible: false, zIndex: 20, sectionId: "section-a" });
  assert.deepEqual([getElementLayout(changed, "mobile").x, getElementLayout(changed, "mobile").visible], [90, false]);
  assert.deepEqual([getElementLayout(changed, "tablet").x, getElementLayout(changed, "tablet").visible], [0, true]);
  assert.deepEqual([getElementLayout(changed, "desktop").zIndex, getElementLayout(changed, "desktop").sectionId], [2, null]);
  const tablet = setElementLayoutForDevice(changed, "tablet", { x: 120, sectionId: "section-b" });
  const reset = resetElementLayoutForDevice(tablet, "tablet");
  assert.equal(getElementLayout(reset, "tablet").x, 90);
  assert.equal(getElementLayout(reset, "tablet").sectionId, "section-b");
  assert.equal(getElementLayout(reset, "desktop").x, 0);
});

test("tablet reparenting changes neither mobile nor desktop", () => {
  const before = fixture();
  const tablet = moveHierarchyElement(before, "image", "section-b", "inside", "tablet");
  const image = tablet.find((item) => item.id === "image");
  assert.equal(getElementComposition(image, "tablet").sectionId, "section-b");
  assert.equal(getElementComposition(image, "mobile").sectionId, "section-a");
  assert.equal(getElementComposition(image, "desktop").sectionId, "section-a");
  assert.deepEqual(getSectionRenderGroups(tablet, "tablet").childrenBySection.get("section-b").map((item) => item.id).sort(), ["image", "text"]);
  assert.deepEqual(getSectionRenderGroups(tablet, "mobile").childrenBySection.get("section-a").map((item) => item.id), ["image"]);
});

test("hiding a section hides its child only on that device", () => {
  const items = fixture();
  items.find((item) => item.id === "section-a").responsive.tablet.visible = false;
  const child = items.find((item) => item.id === "image");
  assert.equal(isCompositionVisible(child, items, "tablet"), false);
  assert.equal(isCompositionVisible(child, items, "mobile"), true);
  assert.equal(isCompositionVisible(child, items, "desktop"), true);
  items.find((item) => item.id === "section-a").responsive.tablet.y = 2000;
  items.find((item) => item.id === "image").responsive.tablet.y = 2050;
  const page = { elements: items, backgroundSections: [] };
  const visiblePage = { elements: items.map((item) => item.id === "section-a" ? { ...item, responsive: { ...item.responsive, tablet: { ...item.responsive.tablet, visible: true } } } : item), backgroundSections: [] };
  assert.ok(getDocumentContentHeight(page, "tablet") < getDocumentContentHeight(visiblePage, "tablet"));
});

test("section reorder moves its children only in the active device", () => {
  const items = fixture().map((item) => {
    const y = item.id === "section-a" ? 100 : item.id === "section-b" ? 650 : item.id === "image" ? 150 : 700;
    return materializeElementLayouts({ ...item, y, height: item.type === "section" ? 300 : 100, responsive: undefined });
  });
  const reordered = reorderSections(items, "section-b", -1, "tablet");
  const byId = (items, id, device) => getElementLayout(items.find((item) => item.id === id), device).y;
  assert.equal(byId(reordered, "section-b", "tablet"), 100);
  assert.equal(byId(reordered, "text", "tablet"), 150);
  for (const device of ["mobile", "desktop"]) for (const id of ["section-a", "section-b", "image", "text"]) {
    assert.equal(byId(reordered, id, device), byId(items, id, device));
  }
});

test("layer order can differ on all three devices", () => {
  const original = fixture();
  const tablet = moveHierarchyElement(original, "image", "text", "before", "tablet");
  const desktop = moveHierarchyElement(tablet, "section-a", "section-b", "before", "desktop");
  assert.deepEqual(getHierarchyRows(desktop, "mobile").map((item) => item.id), ["section-b", "text", "section-a", "image"]);
  assert.deepEqual(getHierarchyRows(desktop, "tablet").map((item) => item.id), ["section-b", "image", "text", "section-a"]);
  assert.deepEqual(getHierarchyRows(desktop, "desktop").map((item) => item.id), ["section-a", "image", "section-b", "text"]);
});

test("JSON save and reload retains three independent compositions", () => {
  let items = fixture();
  items = moveHierarchyElement(items, "image", "section-b", "inside", "tablet");
  items = moveHierarchyElement(items, "section-a", "section-b", "before", "desktop");
  items.find((item) => item.id === "section-b").responsive.tablet.visible = false;
  const reloaded = JSON.parse(JSON.stringify({ pages: [{ elements: items }] })).pages[0].elements;
  const image = reloaded.find((item) => item.id === "image");
  assert.equal(getElementComposition(image, "mobile").sectionId, "section-a");
  assert.equal(getElementComposition(image, "tablet").sectionId, "section-b");
  assert.equal(getElementComposition(image, "desktop").sectionId, "section-a");
  assert.equal(getElementComposition(reloaded.find((item) => item.id === "section-b"), "tablet").visible, false);
  assert.equal(getElementComposition(reloaded.find((item) => item.id === "section-b"), "mobile").visible, true);
});

test("resetting form geometry does not erase device-specific section ownership", () => {
  const form = { enabled: true, purchased: false, responsive: { tablet: { x: 20, y: 400, width: 600, sectionId: "section-b" } } };
  const reset = resetRsvpPositionForDevice(form, "tablet");
  assert.equal(reset.responsive.tablet.sectionId, "section-b");
  assert.equal(reset.responsive.tablet.y, undefined);
});
