import test from "node:test";
import assert from "node:assert/strict";
import { getHierarchyRows, getVisibleHierarchyRows, moveHierarchyElement } from "../src/utils/hierarchyOrder.ts";
import { useHierarchyUiStore } from "../src/stores/hierarchyUiStore.ts";

const elements = () => [
  { id: "a", type: "section", editorName: "Header", zIndex: 1, visible: true },
  { id: "text-a", type: "text", sectionId: "a", zIndex: 2, visible: true, responsive: { tablet: { sectionId: "b" } } },
  { id: "b", type: "section", editorName: "Programme", zIndex: 3, visible: false },
  { id: "text-b", type: "text", sectionId: "b", zIndex: 4, visible: true, responsive: { tablet: { sectionId: "a" } } },
  { id: "root", type: "image", sectionId: null, zIndex: 5, visible: true },
];
const ids = (rows) => rows.map((item) => item.id);
const reset = () => useHierarchyUiStore.setState({ collapsedSectionsByProject: {} });

test("new sections default open; collapsing changes only the visible hierarchy rows", () => {
  reset();
  const original = elements(); const snapshot = structuredClone(original);
  assert.deepEqual(ids(getVisibleHierarchyRows(original, "mobile", {})), ids(getHierarchyRows(original)));
  useHierarchyUiStore.getState().setSectionCollapsed("project", "a", true);
  const collapsed = useHierarchyUiStore.getState().collapsedSectionsByProject.project;
  assert.deepEqual(ids(getVisibleHierarchyRows(original, "mobile", collapsed)), ["root", "b", "text-b", "a"]);
  assert.deepEqual(original, snapshot);
  assert.equal(original[1].visible, true);
  useHierarchyUiStore.getState().setSectionCollapsed("project", "a", false);
  assert.deepEqual(ids(getVisibleHierarchyRows(original, "mobile", useHierarchyUiStore.getState().collapsedSectionsByProject.project)), ids(getHierarchyRows(original)));
});
test("the same section keeps its state while its children follow the active device", () => {
  const collapsed = { a: true };
  assert.deepEqual(ids(getVisibleHierarchyRows(elements(), "mobile", collapsed)), ["root", "b", "text-b", "a"]);
  assert.deepEqual(ids(getVisibleHierarchyRows(elements(), "tablet", collapsed)), ["root", "b", "text-a", "a"]);
  assert.deepEqual(ids(getVisibleHierarchyRows(elements(), "desktop", collapsed)), ["root", "b", "text-b", "a"]);
});
test("several hidden or visible sections can be folded at once and expanded together", () => {
  reset();
  const store = useHierarchyUiStore.getState();
  store.setAllSectionsCollapsed("project", ["a", "b"], true);
  assert.deepEqual(ids(getVisibleHierarchyRows(elements(), "mobile", useHierarchyUiStore.getState().collapsedSectionsByProject.project)), ["root", "b", "a"]);
  store.setAllSectionsCollapsed("project", ["a", "b"], false);
  assert.deepEqual(ids(getVisibleHierarchyRows(elements(), "mobile", useHierarchyUiStore.getState().collapsedSectionsByProject.project)), ids(getHierarchyRows(elements())));
});
test("projects with shared template IDs have independent session choices; a copy defaults open", () => {
  reset();
  const store = useHierarchyUiStore.getState();
  store.setSectionCollapsed("source", "a", true);
  store.setSectionCollapsed("other", "b", true);
  assert.equal(useHierarchyUiStore.getState().collapsedSectionsByProject.other.a ?? false, false);
  assert.equal(useHierarchyUiStore.getState().collapsedSectionsByProject.source.copy ?? false, false);
  store.pruneSections("source", ["b"]);
  assert.deepEqual(useHierarchyUiStore.getState().collapsedSectionsByProject.source, {});
  assert.deepEqual(useHierarchyUiStore.getState().collapsedSectionsByProject.other, { b: true });
});
test("deleted sections cannot hide orphaned children and pruning retains inactive sections", () => {
  const rows = getVisibleHierarchyRows(elements().filter((item) => item.id !== "a"), "mobile", { a: true });
  assert.ok(rows.some((item) => item.id === "text-a"));
  reset();
  const store = useHierarchyUiStore.getState();
  store.setAllSectionsCollapsed("project", ["a", "b", "other-page"], true);
  store.pruneSections("project", ["a", "b", "other-page"]);
  assert.equal(useHierarchyUiStore.getState().collapsedSectionsByProject.project["other-page"], true);
});
test("folded sections stay valid drop targets without changing positions or visibility", () => {
  reset();
  const store = useHierarchyUiStore.getState();
  store.setSectionCollapsed("project", "a", true);
  const original = elements();
  const moved = moveHierarchyElement(original, "root", "a", "inside", "mobile");
  assert.equal(moved.find((item) => item.id === "root").sectionId, "a");
  assert.equal(moved.find((item) => item.id === "root").visible, true);
  assert.equal(getVisibleHierarchyRows(moved, "mobile", { a: true }).some((item) => item.id === "root"), false);
  store.setSectionCollapsed("project", "a", false);
  assert.ok(getVisibleHierarchyRows(moved, "mobile", useHierarchyUiStore.getState().collapsedSectionsByProject.project).some((item) => item.id === "root"));
  const movedSection = moveHierarchyElement(original, "a", "b", "before");
  assert.equal(movedSection.find((item) => item.id === "text-a").sectionId, "a");
});
test("bulk actions and pruning no-ops do not cause needless UI updates", () => {
  reset();
  const store = useHierarchyUiStore.getState();
  let changes = 0;
  const unsubscribe = useHierarchyUiStore.subscribe(() => changes++);
  store.setAllSectionsCollapsed("project", [], true);
  store.setSectionCollapsed("project", "a", false);
  assert.equal(changes, 0);
  store.setSectionCollapsed("project", "a", true);
  store.pruneSections("project", ["a"]);
  store.setSectionCollapsed("project", "a", true);
  assert.equal(changes, 1);
  unsubscribe();
});
