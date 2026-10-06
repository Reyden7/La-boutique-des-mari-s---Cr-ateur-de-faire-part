import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../lib/supabase") return { url: "transfer-qa:no-network", shortCircuit: true };
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "transfer-qa:no-network") return { format: "module", source: "export const isSupabaseConfigured=false; export const supabase=null; export const requireSupabaseSession=()=>{throw new Error('Network disabled')};", shortCircuit: true };
    return next(url, context);
  },
});
const { transferFixture } = await import("./responsive-transfer.fixture.ts");
const { transferMobileLayouts, getCustomizedTransferTargets } = await import("../src/utils/responsiveTransfer.ts");
const { getElementLayout, materializeElementLayouts } = await import("../src/utils/responsiveLayout.ts");
const { resolveElementVisualStyle, resolveRsvpTypography } = await import("../src/utils/responsiveVisualStyle.ts");
const { getDocumentHeight, getRsvpBlockHeight } = await import("../src/utils/documentLayout.ts");
const { getScheduleLayout } = await import("../src/utils/scheduleLayout.ts");
const { getCalendarLayout } = await import("../src/utils/calendarLayout.ts");
const { resolveImageTransform } = await import("../src/utils/imageLayout.ts");
const { useEditorStore } = await import("../src/stores/editorStore.ts");
const { upsertProject, getProject } = await import("../src/utils/storage.ts");
const { sanitizeProjectForTemplate, instantiateProjectFromTemplate } = await import("../src/utils/templateSnapshot.ts");
const memory = new Map(); globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const mobileData = (project) => JSON.parse(JSON.stringify(project, (key, value) => key === "responsive" || key === "visibilityByDevice" ? undefined : value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001, `${actual} ≠ ${expected}`);
for (const [target, width] of [["tablet", 768], ["desktop", 1440]]) {
  test(`${target}: all content types uniformly adapted, Smartphone and content unchanged`, () => {
    const source = transferFixture(), before = structuredClone(source), result = transferMobileLayouts(source, [target]), scale = width / 390;
    assert.deepEqual(source, before); assert.deepEqual(mobileData(result), mobileData(source));
    for (const element of result.pages[0].elements) {
      const mobile = getElementLayout(element, "mobile"), current = getElementLayout(element, target);
      near(current.x, mobile.x * scale); near(current.y, mobile.y * scale); near(current.width, mobile.width * scale); near(current.height, mobile.height * scale);
      assert.equal(current.visible, mobile.visible); assert.equal(current.sectionId, mobile.sectionId); assert.equal(current.zIndex, mobile.zIndex); assert.equal(current.rotation, mobile.rotation);
      assert.equal(element.responsive[target === "tablet" ? "desktop" : "tablet"], undefined);
    }
    const image = result.pages[0].elements.find((e) => e.type === "image");
    assert.deepEqual(resolveImageTransform(image, target), resolveImageTransform(image, "mobile"));
    near(resolveRsvpTypography(result.rsvp, target).titleFontSize, Math.min(96, 34 * scale));
    near(result.rsvp.responsive[target].height, 700 * scale);
    assert.ok(getRsvpBlockHeight(result.rsvp, target, 9000) >= 9000);
    assert.ok(getDocumentHeight(result.pages[0], target, result.rsvp) > getDocumentHeight(source.pages[0], "mobile", source.rsvp));
  });
}
test("effective customized layouts and visibility require confirmation, inherited normalization does not", () => {
  const source = transferFixture(); source.pages[0].elements = source.pages[0].elements.map(materializeElementLayouts);
  assert.deepEqual(getCustomizedTransferTargets(source, ["tablet", "desktop"]), []);
  source.pages[0].elements[1].responsive.tablet.visible = false;
  assert.deepEqual(getCustomizedTransferTargets(source, ["tablet", "desktop"]), ["tablet"]);
  const result = transferMobileLayouts(source, ["tablet"]);
  assert.deepEqual(getCustomizedTransferTargets(result, ["tablet", "desktop"]), ["tablet"]);
});
test("image-only crop or decorative appearance customization also warns", () => {
  const project = transferFixture(), image = project.pages[0].elements.find((e) => e.type === "image");
  image.imageStyle.responsive = { desktop: { flipX: false } };
  assert.deepEqual(getCustomizedTransferTargets(project, ["tablet", "desktop"]), ["desktop"]);
});
test("guardrails keep wide/tall/negative boxes in view without changing their ratio", () => {
  const source = transferFixture(), photo = source.pages[0].elements.find((e) => e.type === "image");
  Object.assign(photo, { x: -500, y: -20, width: 1200, height: 500 });
  const result = transferMobileLayouts(source, ["desktop"]), box = getElementLayout(result.pages[0].elements.find((e) => e.type === "image"), "desktop");
  assert.equal(box.x, 0); assert.equal(box.y, 0); assert.equal(box.width, 1440); near(box.width / box.height, 1200 / 500);
});
test("capped text and icons, per-device padding, edge, scratch indicator, schedule and calendar", () => {
  const source = transferFixture(); source.pages[0].elements.find((e) => e.id === "title").fontSize = 150;
  const result = transferMobileLayouts(source, ["desktop"]), elements = result.pages[0].elements, scale = 1440 / 390;
  assert.equal(getElementLayout(elements.find((e) => e.id === "title"), "desktop").fontSize, 128);
  const section = resolveElementVisualStyle(elements[0], "desktop"); near(section.padding, 20 * scale); near(getElementLayout(section, "desktop").bottomEdge.height, 24 * scale);
  const scratch = resolveElementVisualStyle(elements.find((e) => e.id === "scratch"), "desktop"); near(scratch.scratchIndicator.x, 3 * scale); assert.equal(scratch.fontSize, 48);
  const schedule = resolveElementVisualStyle(elements.find((e) => e.id === "schedule"), "desktop"), layout = getScheduleLayout(schedule, getElementLayout(schedule, "desktop"));
  assert.equal(layout.orientation, "horizontal"); assert.equal(layout.columns, 2); near(schedule.iconSize, 22 * scale);
  const calendar = resolveElementVisualStyle(elements.find((e) => e.id === "calendar"), "desktop");
  const scene = getCalendarLayout(calendar, getElementLayout(calendar, "desktop"));
  assert.ok(scene.text.every((box) => box.fontSize * scene.scale <= 128));
  assert.deepEqual(resolveElementVisualStyle(scratch, "desktop"), scratch); // No double scaling.
});
test("one atomic store action, refuses unconfirmed overwrite, undo/redo restores exact layouts", () => {
  const store = useEditorStore.getState(); store.setProject(transferFixture());
  useEditorStore.setState({ previewDevice: "desktop", currentPageId: "page", sidebarView: "elements", past: [], future: [] });
  const before = structuredClone(useEditorStore.getState().project);
  assert.equal(store.transferResponsiveLayouts(["tablet", "desktop"]), true);
  const after = structuredClone(useEditorStore.getState().project);
  assert.equal(useEditorStore.getState().past.length, 1);
  assert.equal(store.transferResponsiveLayouts(["tablet"]), false); assert.deepEqual(useEditorStore.getState().project, after);
  store.undo(); assert.deepEqual(useEditorStore.getState().project, before);
  store.redo(); assert.deepEqual(useEditorStore.getState().project, after);
  assert.equal(store.transferResponsiveLayouts(["mobile"]), false);
  assert.equal(store.transferResponsiveLayouts([]), false);
});
test("manual edits after transfer and persistence/templates retain independent overrides", () => {
  const store = useEditorStore.getState(); store.setProject(transferFixture());
  useEditorStore.setState({ previewDevice: "tablet", currentPageId: "page", sidebarView: "elements", past: [], future: [] });
  store.transferResponsiveLayouts(["tablet", "desktop"]);
  const before = structuredClone(useEditorStore.getState().project), originalScratch = before.pages[0].elements.find((e) => e.id === "scratch");
  store.updateElement("scratch", { fontSize: 27 }); store.updateElementLayout("scratch", { x: 80, width: 300 });
  const project = useEditorStore.getState().project, scratch = project.pages[0].elements.find((e) => e.id === "scratch");
  assert.equal(resolveElementVisualStyle(scratch, "tablet").fontSize, 27);
  assert.deepEqual(getElementLayout(scratch, "mobile"), getElementLayout(originalScratch, "mobile"));
  assert.deepEqual(getElementLayout(scratch, "desktop"), getElementLayout(originalScratch, "desktop"));
  upsertProject(project); const restored = getProject(project.id, "local-owner"); store.setProject(restored);
  assert.deepEqual(useEditorStore.getState().project.pages[0].elements.map((e) => getElementLayout(e, "tablet")), project.pages[0].elements.map((e) => getElementLayout(e, "tablet")));
  const snapshot = sanitizeProjectForTemplate(project), instance = instantiateProjectFromTemplate({ name: "Transfer", templateData: snapshot }, "other-owner");
  for (const device of ["mobile", "tablet", "desktop"]) assert.deepEqual(getElementLayout(instance.pages[0].elements[1], device), getElementLayout(project.pages[0].elements[1], device));
  assert.equal(instance.paymentStatus, "unpaid"); assert.equal(instance.rsvp.purchased, false);
});

test("manual image-frame correction cannot overwrite the Smartphone frame", () => {
  const source = transferFixture(), image = source.pages[0].elements.find((e) => e.type === "image");
  image.imageStyle.frame = { enabled: true, type: "simple", color: "#ddd", width: 4, radius: 8, opacity: 1, borderStyle: "solid", shadowEnabled: false, shadowBlur: 6, shadowOpacity: .2, shadowDistance: 2 };
  const store = useEditorStore.getState(); store.setProject(source);
  useEditorStore.setState({ previewDevice: "tablet", currentPageId: "page", sidebarView: "elements", past: [], future: [] });
  store.transferResponsiveLayouts(["tablet", "desktop"]);
  const current = useEditorStore.getState().project.pages[0].elements.find((e) => e.type === "image"), resolved = resolveElementVisualStyle(current, "tablet");
  store.updateElement(current.id, { imageStyle: { ...resolved.imageStyle, frame: { ...resolved.imageStyle.frame, width: 17 } } });
  const edited = useEditorStore.getState().project.pages[0].elements.find((e) => e.type === "image");
  assert.deepEqual(edited.imageStyle.frame, image.imageStyle.frame);
  assert.equal(resolveElementVisualStyle(edited, "tablet").imageStyle.frame.width, 17);
  near(resolveElementVisualStyle(edited, "desktop").imageStyle.frame.width, 4 * 1440 / 390);
});
test("active welcome elements transfer without touching source assets, order or inactive targets", () => {
  const project = transferFixture(); project.introductionMode = "welcome";
  project.welcomePage = { elements: [structuredClone(project.pages[0].elements[1])], archId: "arch", backgroundId: "landscape", background: { x: 1, y: 2, scale: 1.1 }, arch: { x: 4, y: 3, width: 390 } };
  const result = transferMobileLayouts(project, ["tablet"]), element = result.welcomePage.elements[0], target = getElementLayout(element, "tablet");
  assert.deepEqual(mobileData(result), mobileData(project));
  assert.deepEqual(getElementLayout(element, "mobile"), getElementLayout(project.welcomePage.elements[0], "mobile"));
  assert.equal(element.responsive.desktop, undefined);
  assert.ok(target.x >= 0 && target.y >= 0 && target.x + target.width <= 768 && target.y + target.height <= 1024);
});
test("undersized source RSVP retains the content minimum and commercial rights", () => {
  const project = transferFixture(); project.rsvp.height = 12;
  project.status = "published"; project.paymentStatus = "paid"; project.publicId = "existing-public-id";
  project.purchasedGuestCapacity = 54; project.purchasedExtraBlocks = 2; project.publicationLicenseId = "existing-license"; project.rsvp.purchased = true;
  const adapted = transferMobileLayouts(project, ["desktop"]);
  assert.deepEqual(mobileData(adapted), mobileData(project));
  assert.ok(adapted.rsvp.responsive.desktop.height >= getRsvpBlockHeight(project.rsvp, "mobile") * 1440 / 390);
});
