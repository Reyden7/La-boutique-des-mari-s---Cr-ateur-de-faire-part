import test from "node:test";
import assert from "node:assert/strict";
import { resolveProgramStepIcon, getProgramIconUrl } from "../src/features/elements/programIconModel.ts";
import { getProgramIconFileInfo, MAX_PROGRAM_ICON_BYTES } from "../supabase/functions/_shared/programIconFormats.ts";
import { getScheduleLayout } from "../src/utils/scheduleLayout.ts";
import { getElementLayout, materializeElementLayouts } from "../src/utils/responsiveLayout.ts";
import { getImageRenderLayout } from "../src/utils/imageLayout.ts";
import { SCHEDULE_ICONS } from "../src/config/scheduleIcons.ts";

const custom = { type: "custom", url: "https://example.invalid/storage/v1/object/public/wedding-assets/u/p/program-icons/r2.png", assetId: "asset-r2", name: "R2-D2.png" };
const make = (changes = {}) => ({ id: "s", type: "schedule", x: 0, y: 100, width: 310, height: 300, opacity: 1, rotation: 0, visible: true, zIndex: 1, displayStyle: "timeline", textColor: "#333", backgroundColor: "#ffffff00", accentColor: "#c90", lineColor: "#999", timeColor: "#333", stepGap: 7, items: [
  { id: "a", time: "16:00", title: "Accueil", description: "Bienvenue", icon: custom, customIcon: custom },
  { id: "b", time: "17:00", title: "Cérémonie", icon: { type: "preset", name: "wedding-rings" } },
  { id: "c", time: "20:00", title: "Dîner", icon: "utensils" },
  { id: "d", time: "23:00", title: "Soirée", icon: null },
], responsive: { tablet: { width: 700, height: 310 }, desktop: { width: 1200, height: 310 } }, ...changes });

test("the small catalogue has 16 real vectors, including all requested event choices", () => {
  assert.equal(SCHEDULE_ICONS.length, 16);
  for (const name of ["wedding-rings", "wine", "camera", "utensils", "cake", "church", "heart", "music", "dance", "car", "house", "gift", "flower", "star", "clock"]) assert.deepEqual(resolveProgramStepIcon({ type: "preset", name }), { type: "preset", name });
  assert.equal(new Set(SCHEDULE_ICONS.map((icon) => icon.id)).size, SCHEDULE_ICONS.length);
});

test("legacy strings, explicit presets, custom and global URLs normalize without mutating input", () => {
  assert.deepEqual(resolveProgramStepIcon("wine"), { type: "preset", name: "wine" });
  const before = JSON.stringify(custom);
  assert.deepEqual(resolveProgramStepIcon(custom), custom);
  assert.equal(JSON.stringify(custom), before);
  assert.equal(resolveProgramStepIcon({ ...custom, globalAssetId: "global" }).globalAssetId, "global");
  for (const icon of [null, undefined, "obsolete", { type: "preset", name: "obsolete" }, { url: custom.url }, {}]) assert.equal(resolveProgramStepIcon(icon), undefined);
});

test("unsafe URLs are rejected, including SVG and HTML data URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>x</script>", "data:image/svg+xml,<svg/>", "file:///private/file.png", "blob:untrusted", "not a url"]) {
    assert.equal(getProgramIconUrl(url), undefined);
    assert.equal(resolveProgramStepIcon({ type: "custom", url }), undefined);
  }
  assert.ok(getProgramIconUrl("data:image/png;base64,AA=="));
});

test("raster extension, MIME and 5 MiB size limit are validated together", () => {
  for (const [extension, type] of [["png", "image/png"], ["webp", "image/webp"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"]]) {
    for (const mime of [type, "", "application/octet-stream"]) assert.equal(getProgramIconFileInfo({ name: `Icon.${extension.toUpperCase()}`, type: mime, size: MAX_PROGRAM_ICON_BYTES }).mimeType, type);
  }
  for (const name of ["icon.svg", "icon.exe", "icon.png.exe", "icon.gif", "__proto__", "icon.avif"]) assert.throws(() => getProgramIconFileInfo({ name, type: "image/png", size: 1 }));
  for (const type of ["image/svg+xml", "text/html", "image/webp"]) assert.throws(() => getProgramIconFileInfo({ name: "icon.png", type, size: 1 }));
  for (const size of [0, -1, NaN, Infinity, MAX_PROGRAM_ICON_BYTES + 1]) assert.throws(() => getProgramIconFileInfo({ name: "icon.png", type: "image/png", size }));
});

for (const orientation of ["vertical", "horizontal"]) for (const device of ["mobile", "tablet", "desktop"]) test(`${orientation}/${device}: mixed custom/preset/None stay bounded and aligned`, () => {
  const element = make({ orientation, iconSize: 40 });
  const before = JSON.stringify(element);
  const layout = getScheduleLayout(element, getElementLayout(element, device));
  assert.equal(layout.steps[0].icon.source.type, "custom");
  assert.equal(layout.steps[1].icon.source.type, "preset");
  assert.equal(layout.steps[2].icon.source.type, "preset");
  assert.equal(layout.steps[3].icon, undefined);
  if (orientation === "horizontal") {
    assert.equal(layout.columns, 4);
    assert.equal(new Set(layout.steps.map((step) => step.y)).size, 1);
  }
  for (const step of layout.steps) {
    const icon = step.icon, time = step.text.find((box) => box.role === "time");
    if (!icon) continue;
    assert.ok(icon.x >= 0 && icon.y >= 0 && icon.x + icon.size <= layout.width);
    assert.ok(orientation === "vertical" ? icon.x + icon.size <= time.x : icon.y + icon.size <= time.y);
  }
  assert.equal(JSON.stringify(element), before);
});

test("custom images use contain, preserve ratio and never crop horizontal or vertical source images", () => {
  for (const [width, height] of [[1200, 500], [300, 1000], [800, 800]]) {
    const box = getImageRenderLayout(width, height, 32, 32, "contain");
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 32 && box.y + box.height <= 32);
    assert.ok(Math.abs(box.width / box.height - width / height) < .00001);
  }
});

test("selecting presets/None, replacing or removing an import changes no step content", () => {
  const element = make();
  const { time, title, description } = element.items[0];
  for (const icon of [null, { type: "preset", name: "wine" }, custom, { ...custom, url: custom.url.replace("r2.png", "planet.webp"), name: "planet.webp" }]) {
    element.items[0] = { ...element.items[0], icon };
    assert.deepEqual(((item) => ({ time: item.time, title: item.title, description: item.description }))(element.items[0]), { time, title, description });
  }
  element.items[0] = { ...element.items[0], icon: null, customIcon: undefined };
  assert.equal(element.items[1].icon.name, "wedding-rings");
});

test("project JSON, duplication and cached per-step imports keep independent snapshots", () => {
  const element = materializeElementLayouts(make());
  const duplicate = JSON.parse(JSON.stringify(element));
  assert.deepEqual(duplicate.items, element.items);
  duplicate.items[0].icon.name = "Copy";
  assert.equal(element.items[0].icon.name, "R2-D2.png");
  element.items[0].icon = { type: "preset", name: "cake" };
  assert.equal(element.items[0].customIcon.url, custom.url);
  assert.deepEqual(JSON.parse(JSON.stringify(element)).items[0].customIcon, custom);
});
