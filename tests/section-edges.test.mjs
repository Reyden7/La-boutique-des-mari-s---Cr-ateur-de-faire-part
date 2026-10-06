import test from "node:test";
import assert from "node:assert/strict";
import { getSectionShape, getSectionContentInsets, getSectionBackgroundPaint, resolveSectionEdge, SECTION_EDGE_PRESETS } from "../src/utils/sectionEdges.ts";
import { getElementLayout, materializeElementLayouts, setElementLayoutForDevice, resetElementLayoutForDevice } from "../src/utils/responsiveLayout.ts";
import { insertElementInSection } from "../src/utils/sectionLayout.ts";
import { getDocumentHeight } from "../src/utils/documentLayout.ts";

const edge = (style, changes = {}) => ({ enabled: true, style, height: 40, inverted: false, intensity: 1, ...changes });
const make = (changes = {}) => ({ id: "section", type: "section", name: "Section", x: 0, y: 0, width: 390, height: 300, rotation: 0, opacity: 1, visible: true, zIndex: 1, padding: 20, cornerRadius: 12, background: { type: "color", color: "#abc" }, ...changes });

test("legacy, disabled, None and zero amplitude keep a rectangular outline", () => {
  const expected = "M0 0 L390 0 L390 300 L0 300 Z";
  for (const config of [undefined, edge("none"), edge("tear", { enabled: false }), edge("wave", { height: 0 }), edge("wave", { intensity: 0 })]) assert.equal(getSectionShape(390, 300, config, config).path, expected);
  assert.deepEqual(resolveSectionEdge(), { enabled: false, style: "none", height: 32, inverted: false, intensity: 1 });
});
test("malformed saved values resolve safely without mutating the project", () => {
  const input = { enabled: true, style: "unknown", height: NaN, intensity: Infinity };
  assert.deepEqual(resolveSectionEdge(input), { enabled: true, style: "none", height: 32, inverted: false, intensity: 1 });
  assert.equal(input.style, "unknown");
  assert.equal(resolveSectionEdge(edge("wave", { height: 1000, intensity: -3 })).height, 240);
});
for (const width of [390, 768, 1440]) for (const preset of SECTION_EDGE_PRESETS.filter((x) => x.id !== "none")) test(`${preset.id}, width ${width}: deterministic bounded shape shared by both renderers`, () => {
  const shape = getSectionShape(width, 300, edge(preset.id), edge(preset.id));
  assert.equal(shape.path, getSectionShape(width, 300, edge(preset.id), edge(preset.id)).path);
  assert.equal(shape.topInset, 40); assert.equal(shape.bottomInset, 40);
  for (const [x, y] of shape.points) assert.ok(x >= 0 && x <= width && y >= 0 && y <= 300);
  const top = shape.points.filter(([, y]) => y < 100), bottom = shape.points.filter(([, y]) => y > 200);
  assert.ok(new Set(top.map((p) => p[1])).size > 1);
  assert.ok(new Set(bottom.map((p) => p[1])).size > 1);
});
test("top and bottom are independent; inversion and amplitude affect only the chosen edge", () => {
  const a = getSectionShape(390, 300, edge("wave"), edge("tear"));
  const b = getSectionShape(390, 300, edge("wave", { inverted: true, intensity: .5 }), edge("tear"));
  assert.deepEqual(a.points.filter(([, y]) => y > 200), b.points.filter(([, y]) => y > 200));
  assert.notDeepEqual(a.points.filter(([, y]) => y < 100), b.points.filter(([, y]) => y < 100));
  const inverted = getSectionShape(390, 300, edge("wave", { inverted: true }), edge("tear"));
  a.points.filter(([, y]) => y < 100).forEach(([x, y], index) => assert.ok(Math.abs(y + inverted.points[index][1] - 40) < .001));
});
test("large decorations in tiny sections retain an interior and add no external margin", () => {
  const shape = getSectionShape(50, 12, edge("tear", { height: 240 }), edge("scallop", { height: 240 }));
  assert.ok(shape.topInset + shape.bottomInset < 12);
  const page = { id: "page", elements: [make({ isLastSection: true })] };
  const before = getDocumentHeight(page, "mobile");
  page.elements[0] = { ...page.elements[0], topEdge: edge("wave"), bottomEdge: edge("tear") };
  assert.equal(getDocumentHeight(page, "mobile"), before);
});
test("responsive edits and reset preserve independent configurations", () => {
  let section = materializeElementLayouts(make({ topEdge: edge("wave"), bottomEdge: edge("tear") }));
  section = setElementLayoutForDevice(section, "tablet", { topEdge: edge("diagonal", { height: 24 }) });
  assert.equal(getElementLayout(section, "mobile").topEdge.style, "wave");
  assert.equal(getElementLayout(section, "desktop").topEdge.style, "wave");
  assert.equal(getElementLayout(section, "tablet").topEdge.style, "diagonal");
  section = setElementLayoutForDevice(section, "mobile", { bottomEdge: edge("zigzag") });
  assert.equal(getElementLayout(section, "tablet").bottomEdge.style, "tear");
  assert.equal(getElementLayout(section, "desktop").bottomEdge.style, "tear");
  section = resetElementLayoutForDevice(section, "tablet");
  assert.equal(getElementLayout(section, "tablet").bottomEdge.style, "zigzag");
});
test("new text/image content respects decorative bands and grows its section on the active device only", () => {
  for (const device of ["mobile", "tablet", "desktop"]) for (const type of ["text", "image"]) {
    const section = materializeElementLayouts(make({ height: 30, topEdge: edge("wave"), bottomEdge: edge("tear") }));
    const child = materializeElementLayouts({ ...make(), id: "child", type, width: 100, height: 90 });
    const result = insertElementInSection([section], child, section, device);
    const childLayout = getElementLayout(result.element, device), sectionLayout = getElementLayout(result.section, device);
    const insets = getSectionContentInsets(section.padding, sectionLayout.topEdge, sectionLayout.bottomEdge);
    assert.ok(childLayout.y >= sectionLayout.y + insets.top);
    assert.ok(sectionLayout.height >= childLayout.y + childLayout.height + insets.bottom);
    assert.equal(childLayout.sectionId, section.id);
    for (const other of ["mobile", "tablet", "desktop"].filter((x) => x !== device)) assert.equal(getElementLayout(result.section, other).height, 30);
  }
});
test("linear gradient uses the same CSS-angle geometry in Konva and SVG", () => {
  const paint = getSectionBackgroundPaint({ type: "gradient", gradient: { angle: 90 } }, 390, 300);
  assert.ok(Math.abs(paint.start.x) < .001 && Math.abs(paint.end.x - 390) < .001);
  assert.ok(Math.abs(paint.start.y - 150) < .001 && Math.abs(paint.end.y - 150) < .001);
});
