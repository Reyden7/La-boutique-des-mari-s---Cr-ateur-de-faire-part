import test from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_DEVICES } from "../src/config/previewDevices.ts";
import { DOCUMENT_BOTTOM_MARGIN, LAST_SECTION_BOTTOM_GAP, getDocumentContentHeight, getDocumentHeight, getRsvpAutomaticHeight, getRsvpBlockHeight, getRsvpWidth, getRsvpPositionY, hasRsvpPositionOverride, resetRsvpPositionForDevice, setRsvpLayoutForDevice } from "../src/utils/documentLayout.ts";
import { getElementLayout, materializeElementLayouts, setElementLayoutForDevice } from "../src/utils/responsiveLayout.ts";
import { clearLastSectionFlags, reorderSections, setLastSectionForDevice } from "../src/utils/sectionLayout.ts";

const devices = ["mobile", "tablet", "desktop"];
const section = (id, y = 1000) => ({ id, type: "section", name: id, x: 0, y, width: 390, height: 300, rotation: 0, opacity: 1, zIndex: 1, visible: true, padding: 30, cornerRadius: 0, background: { type: "color", color: "#ffffff" } });
const page = (elements = [section("a"), section("b", 1500)]) => ({ id: "page", elements, background: { type: "color", color: "#ffffff" } });
const form = () => ({ enabled: true, purchased: false, title: "Présence", submitLabel: "Envoyer", fields: [{ id: "name", label: "Prénom", type: "short_text", required: true }] });

for (const device of devices) {
  test(`form height is independent on ${device}`, () => {
    const original = form();
    const baseline = Object.fromEntries(devices.map((d) => [d, getRsvpBlockHeight(original, d)]));
    const changed = setRsvpLayoutForDevice(original, device, { height: 2500 });
    assert.equal(getRsvpBlockHeight(changed, device), 2500);
    assert.equal(getRsvpWidth(changed, device), getRsvpWidth(original, device));
    for (const other of devices.filter((d) => d !== device)) assert.equal(getRsvpBlockHeight(changed, other), baseline[other]);
    assert.ok(hasRsvpPositionOverride(changed, device));
    assert.equal(getRsvpBlockHeight(resetRsvpPositionForDevice(changed, device), device), baseline[device]);
    assert.equal(getRsvpBlockHeight(JSON.parse(JSON.stringify(changed)), device), 2500);
  });
  test(`form never shrinks below its safe or measured content minimum on ${device}`, () => {
    const changed = setRsvpLayoutForDevice(form(), device, { height: 12 });
    assert.equal(getRsvpBlockHeight(changed, device), getRsvpAutomaticHeight(changed, device));
    assert.equal(getRsvpBlockHeight(changed, device, 3000), 3000);
    assert.equal(getRsvpBlockHeight({ ...changed, enabled: false }, device, 3000), 0);
  });
  test(`a single last section is selected only on ${device}, including legacy projects`, () => {
    let elements = page().elements;
    elements = setLastSectionForDevice(elements, "a", device, true);
    elements = setLastSectionForDevice(elements, "b", device, true);
    assert.equal(getElementLayout(elements[0], device).isLastSection, false);
    assert.equal(getElementLayout(elements[1], device).isLastSection, true);
    for (const other of devices.filter((d) => d !== device)) for (const item of elements) assert.equal(getElementLayout(item, other).isLastSection, false);
    const changed = page(elements);
    assert.equal(getDocumentContentHeight(changed, device), 1800 + LAST_SECTION_BOTTOM_GAP);
    for (const other of devices.filter((d) => d !== device)) assert.equal(getDocumentContentHeight(changed, other), 1800 + DOCUMENT_BOTTOM_MARGIN);
    assert.equal(getDocumentContentHeight(page(setLastSectionForDevice(elements, "b", device, false)), device), 1920);
  });
  test(`hidden and deleted last sections fall back on ${device}`, () => {
    const elements = setLastSectionForDevice(page().elements, "b", device, true);
    const hidden = elements.map((item) => item.id === "b" ? setElementLayoutForDevice(item, device, { visible: false }) : item);
    assert.equal(getDocumentContentHeight(page(hidden), device), 1420);
    assert.equal(getDocumentContentHeight(page(elements.filter((item) => item.id !== "b")), device), 1420);
    for (const other of devices.filter((d) => d !== device)) assert.equal(getDocumentContentHeight(page(hidden), other), 1920);
  });
  test(`last section ends flush with fractional dimensions and a contained form on ${device}`, () => {
    const last = { ...section("last", 2500), x: -12, width: 405.91898, height: 650.42505, padding: 0 };
    const marked = page(setLastSectionForDevice([last], "last", device, true));
    const bottom = last.y + last.height;
    const config = { ...form(), positionY: 2510, sectionId: "last" };
    assert.equal(LAST_SECTION_BOTTOM_GAP, 0);
    assert.equal(getDocumentContentHeight(marked, device), bottom);
    assert.equal(getDocumentHeight(marked, device, config, 620), bottom);
    assert.equal(getDocumentHeight(marked, device, config, 700), 3210);
    for (const other of devices.filter((d) => d !== device)) {
      assert.equal(getDocumentContentHeight(marked, other), bottom + DOCUMENT_BOTTOM_MARGIN);
    }
  });
}

test("no marker keeps legacy document height and background sections", () => {
  assert.equal(getDocumentContentHeight(page([section("a", 100)]), "mobile"), PREVIEW_DEVICES.mobile.height);
  const migrated = { ...page(), backgroundSections: [{ id: "legacy", y: 2000, height: 200 }] };
  assert.equal(getDocumentContentHeight(migrated, "mobile"), 2200);
  assert.equal(getDocumentContentHeight(page(setLastSectionForDevice(migrated.elements, "b", "mobile", true)), "mobile"), 1800);
  assert.equal(getDocumentContentHeight({ ...migrated, elements: setLastSectionForDevice(migrated.elements, "b", "mobile", true) }, "mobile"), 1800);
});

test("protruding children, lower root content and rotated images are not cut", () => {
  const a = section("a");
  const child = { ...a, id: "child", type: "text", y: 1250, height: 100, sectionId: "a" };
  let elements = setLastSectionForDevice([a, child], "a", "mobile", true);
  assert.equal(getDocumentContentHeight(page(elements), "mobile"), 1350 + 30);
  elements.push({ ...a, id: "root", type: "image", y: 1800, width: 400, height: 100, rotation: 90 });
  assert.equal(getDocumentContentHeight(page(elements), "mobile"), 2050);
});

test("last marker survives reorder; duplication and paste clear every device", () => {
  let elements = setLastSectionForDevice(page().elements, "b", "mobile", true);
  elements = setLastSectionForDevice(elements, "b", "tablet", true);
  elements = reorderSections(elements, "b", -1, "mobile");
  const b = elements.find((item) => item.id === "b");
  assert.equal(getElementLayout(b, "mobile").isLastSection, true);
  assert.equal(getDocumentContentHeight(page(elements), "mobile"), Math.max(...elements.map((item) => getElementLayout(item, "mobile").y + 300)));
  const copy = clearLastSectionFlags({ ...structuredClone(b), id: "copy" });
  for (const d of devices) assert.equal(getElementLayout(copy, d).isLastSection, false);
  assert.equal(getElementLayout(b, "tablet").isLastSection, true);
});

test("positioned and automatic forms have no external final margin and respect measured height", () => {
  const marked = page(setLastSectionForDevice([section("a")], "a", "mobile", true));
  const config = { ...form(), positionY: 1400, height: 1000, sectionId: "a" };
  assert.equal(getDocumentHeight(marked, "mobile", config), 1400 + 1000 + 30);
  assert.equal(getDocumentHeight(marked, "mobile", config, 2100), 1400 + 2100 + 30);
  const auto = form();
  assert.equal(getDocumentHeight(marked, "mobile", auto), getRsvpPositionY(marked, auto, "mobile") + getRsvpBlockHeight(auto));
});

test("JSON snapshots preserve form height and last section flags on every device", () => {
  let elements = page().elements.map(materializeElementLayouts);
  elements = setLastSectionForDevice(elements, "b", "mobile", true);
  elements = setLastSectionForDevice(elements, "a", "desktop", true);
  let config = setRsvpLayoutForDevice(form(), "mobile", { height: 1000 });
  config = setRsvpLayoutForDevice(config, "desktop", { height: 2200 });
  const snapshot = JSON.parse(JSON.stringify({ pages: [page(elements)], rsvp: config }));
  assert.equal(snapshot.rsvp.height, 1000);
  assert.equal(snapshot.rsvp.responsive.desktop.height, 2200);
  assert.equal(getElementLayout(snapshot.pages[0].elements[1], "mobile").isLastSection, true);
  assert.equal(getElementLayout(snapshot.pages[0].elements[0], "desktop").isLastSection, true);
  assert.equal(getElementLayout(snapshot.pages[0].elements[0], "tablet").isLastSection, false);
});
