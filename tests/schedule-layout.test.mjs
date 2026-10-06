import test from "node:test";
import assert from "node:assert/strict";
import { getScheduleLayout, resolveScheduleOrientation, wrapScheduleText } from "../src/utils/scheduleLayout.ts";
import { getScheduleIcon, SCHEDULE_ICONS } from "../src/config/scheduleIcons.ts";
import { getElementLayout, materializeElementLayouts, setElementLayoutForDevice, resetElementLayoutForDevice } from "../src/utils/responsiveLayout.ts";
import { getDocumentHeight } from "../src/utils/documentLayout.ts";

const make = (changes = {}) => ({
  id: "programme", type: "schedule", name: "Programme", x: 20, y: 100, width: 310, height: 310,
  opacity: 1, rotation: 0, zIndex: 1, visible: true, displayStyle: "timeline", textColor: "#493f39",
  backgroundColor: "#fffaf5", timeColor: "#9a6d51", accentColor: "#a9775a", lineColor: "#d9c4b4",
  items: ["Accueil", "Cérémonie", "Repas", "Soirée"].map((title, index) => ({ id: `step-${index}`, time: `${16 + index}:00`, title, description: index === 0 ? "Bienvenue au domaine" : undefined })),
  responsive: { tablet: { width: 620, height: 310 }, desktop: { width: 900, height: 310 } }, ...changes,
});

test("legacy programmes default to vertical, without inventing icons or changing a safe height", () => {
  const element = make();
  assert.equal(resolveScheduleOrientation(element), "vertical");
  assert.equal(resolveScheduleOrientation({ orientation: "invalid" }), "vertical");
  const layout = getScheduleLayout(element, getElementLayout(element, "mobile"));
  assert.equal(layout.height, 310);
  assert.equal(layout.columns, 1);
  assert.ok(layout.steps.every((step) => !step.icon));
  assert.equal(getScheduleIcon("not-a-real-icon"), undefined);
});

for (const orientation of ["vertical", "horizontal"]) {
  for (const displayStyle of ["list", "timeline", "elegant"]) {
    for (const device of ["mobile", "tablet", "desktop"]) {
      test(`${orientation}, ${displayStyle}, ${device}: shared rows and text are bounded and do not overlap`, () => {
        const element = make({ orientation, displayStyle });
        element.items[0].icon = "wedding-rings";
        element.items[2].icon = "utensils";
        const before = JSON.stringify(element);
        const resolved = getElementLayout(element, device);
        const layout = getScheduleLayout(element, resolved);
        assert.equal(layout.height, resolved.height);
        assert.equal(layout.orientation, orientation);
        assert.equal(layout.steps.length, 4);
        assert.equal(layout.lines.length > 0, displayStyle !== "list");
        for (const step of layout.steps) {
          for (const box of step.text) {
            assert.ok(box.x >= 0 && box.y >= 0);
            assert.ok(box.x + box.width <= resolved.width + .01);
            assert.ok(box.y + box.height <= resolved.height + .01);
          }
          const title = step.text.find((box) => box.role === "title");
          const description = step.text.find((box) => box.role === "description");
          if (description) assert.ok(description.y >= title.y + title.height);
          const time = step.text.find((box) => box.role === "time");
          if (step.icon) assert.ok(orientation === "vertical" ? step.icon.x + step.icon.size <= time.x : step.icon.y + step.icon.size <= time.y);
        }
        for (let index = 1; index < layout.steps.length; index++) {
          const previous = layout.steps[index - 1], current = layout.steps[index];
          assert.ok(current.y >= previous.y + previous.height || current.x >= previous.x + previous.width);
        }
        assert.equal(JSON.stringify(element), before);
      });
    }
  }
}

test("horizontal only wraps when explicitly enabled; final partial row is centred", () => {
  const element = make({ orientation: "horizontal", wrapSteps: true });
  assert.equal(getScheduleLayout(element, getElementLayout(element, "mobile")).columns, 2);
  assert.equal(getScheduleLayout(element, getElementLayout(element, "tablet")).columns, 4);
  element.items.pop();
  const last = getScheduleLayout(element, getElementLayout(element, "mobile")).steps.at(-1);
  assert.equal(last.x + last.width / 2, element.width / 2);
});

test("horizontal defaults to one row on every device, including Smartphone", () => {
  for (const wrapSteps of [undefined, false]) for (const device of ["mobile", "tablet", "desktop"]) {
    const element = make({ orientation: "horizontal", wrapSteps });
    const layout = getScheduleLayout(element, getElementLayout(element, device));
    assert.equal(layout.columns, element.items.length);
    assert.equal(new Set(layout.steps.map((step) => step.y)).size, 1);
  }
});

for (const orientation of ["horizontal", "vertical"]) test(`${orientation}: configured spacing remains exact instead of redistributing unused box space`, () => {
  for (const stepGap of [0, 7, 20]) {
    const element = make({ orientation, stepGap, height: 800 });
    const layout = getScheduleLayout(element, getElementLayout(element, "mobile"));
    for (let index = 1; index < layout.steps.length; index++) {
      const a = layout.steps[index - 1], b = layout.steps[index];
      const gap = orientation === "horizontal" ? b.x - a.x - a.width : b.y - a.y - a.height;
      assert.ok(Math.abs(gap - stepGap) < .00001);
    }
  }
});

test("oversized horizontal gaps are capped; narrow boxes and many stages never overflow or wrap implicitly", () => {
  for (const width of [12, 50, 310]) {
    const element = make({ orientation: "horizontal", width, stepGap: 5000 });
    const layout = getScheduleLayout(element, getElementLayout(element, "mobile"));
    assert.equal(layout.columns, element.items.length);
    assert.ok(layout.stepGap < element.stepGap);
    assert.ok(layout.steps.every((step) => step.width > 0 && step.x + step.width <= width + .001));
    assert.equal(new Set(layout.steps.map((step) => step.y)).size, 1);
  }
});

test("spacing freezes across responsive devices, survives JSON reload and supports layout reset", () => {
  let element = materializeElementLayouts(make({ orientation: "horizontal" }));
  const desktop = getElementLayout(element, "desktop");
  element = setElementLayoutForDevice(element, "mobile", { stepGap: 0 });
  element = setElementLayoutForDevice(element, "tablet", { stepGap: 28 });
  element = JSON.parse(JSON.stringify(element));
  assert.equal(getElementLayout(element, "mobile").stepGap, 0);
  assert.equal(getElementLayout(element, "tablet").stepGap, 28);
  assert.deepEqual(getElementLayout(element, "desktop"), desktop);
  element = resetElementLayoutForDevice(element, "tablet");
  assert.equal(getElementLayout(element, "tablet").stepGap, 0);
});

test("a capped horizontal gap keeps its requested value after move, resize and save/reload", () => {
  let element = materializeElementLayouts(make({ orientation: "horizontal", stepGap: 100 }));
  assert.ok(getScheduleLayout(element, getElementLayout(element, "mobile")).stepGap < 100);
  element = setElementLayoutForDevice(element, "tablet", { x: 50, width: 310 });
  element = JSON.parse(JSON.stringify(materializeElementLayouts(element)));
  assert.equal(element.stepGap, 100);
  assert.equal(element.responsive.tablet.stepGap, 100);
  element = setElementLayoutForDevice(element, "tablet", { width: 1200 });
  assert.equal(getScheduleLayout(element, getElementLayout(element, "tablet")).stepGap, 100);
});

test("long descriptions and many stages grow the computed minimum without mutating responsive layouts", () => {
  const element = make({ orientation: "horizontal", height: 50, items: Array.from({ length: 12 }, (_, index) => ({ id: String(index), time: "16:00", title: "Une très longue étape du programme", description: "Une description qui doit rester intégralement visible et ne chevaucher aucune autre étape.", icon: "church" })) });
  const snapshot = JSON.stringify(element);
  const layout = getElementLayout(element, "mobile");
  assert.ok(layout.height > 50);
  const page = { id: "p", name: "Faire-part", background: {}, elements: [element] };
  assert.ok(getDocumentHeight(page, "mobile") >= element.y + layout.height);
  assert.equal(JSON.stringify(element), snapshot);
});

test("unknown icons have no reserved icon space; all catalogue IDs resolve to actual vector data", () => {
  for (const icon of SCHEDULE_ICONS) { assert.ok(getScheduleIcon(icon.id).nodes.length); }
  const unknown = make({ displayStyle: "list" });
  unknown.items[0].icon = "obsolete";
  const none = make({ displayStyle: "list" });
  assert.deepEqual(getScheduleLayout(unknown, getElementLayout(unknown, "mobile")), getScheduleLayout(none, getElementLayout(none, "mobile")));
});

test("saved JSON, reorder, add, delete and duplication retain each stage's icon and orientation", () => {
  const element = materializeElementLayouts(make({ orientation: "horizontal" }));
  element.items[0].icon = "wedding-rings";
  element.items.reverse();
  element.items.push({ id: "new", time: "23:00", title: "Photos", icon: "camera" });
  element.items.splice(1, 1);
  const reload = JSON.parse(JSON.stringify(element));
  assert.equal(reload.orientation, "horizontal");
  assert.equal(reload.items.find((item) => item.id === "step-0").icon, "wedding-rings");
  assert.equal(reload.items.at(-1).icon, "camera");
  assert.deepEqual(getScheduleLayout(reload, getElementLayout(reload, "mobile")), getScheduleLayout(element, getElementLayout(element, "mobile")));
});

test("explicit wraps preserve paragraph breaks and split long words", () => {
  assert.ok(wrapScheduleText("TrèslongmotSansEspaces\nDeux mots", 25, 12, "Lora", false).split("\n").length > 3);
});

test("layout remains safe for an empty or incomplete legacy programme", () => {
  for (const items of [undefined, null, []]) {
    const element = make({ items });
    assert.equal(getScheduleLayout(element, getElementLayout(element, "mobile")).steps.length, 0);
  }
});
