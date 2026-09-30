import type { EditorElement } from "../types/editor";

export type HierarchyPlacement = "before" | "after" | "inside";

/** The hierarchy is grouped by section, while coordinates always remain document-absolute. */
export function getHierarchyRows(elements: EditorElement[]) {
  const ordered = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  const sectionIds = new Set(ordered.filter((element) => element.type === "section").map((element) => element.id));
  return ordered.filter((element) => !element.sectionId || !sectionIds.has(element.sectionId)).flatMap((element) =>
    element.type === "section"
      ? [element, ...ordered.filter((child) => child.sectionId === element.id)]
      : [element]);
}

export function moveHierarchyElement(elements: EditorElement[], sourceId: string, targetId: string | null, placement: HierarchyPlacement) {
  const source = elements.find((element) => element.id === sourceId);
  const target = targetId ? elements.find((element) => element.id === targetId) : undefined;
  if (!source || (targetId && !target) || sourceId === targetId) return elements;
  if (placement === "inside" && (!target || target.type !== "section" || source.type === "section")) return elements;

  const parentId = placement === "inside" ? target!.id : target?.sectionId ?? null;
  if (source.type === "section" && parentId) return elements;
  const updated = elements.map((element) => element.id === sourceId
    ? { ...element, sectionId: source.type === "section" ? null : parentId }
    : element) as EditorElement[];
  const siblings = (parent: string | null) => updated
    .filter((element) => (element.sectionId ?? null) === parent)
    .sort((a, b) => b.zIndex - a.zIndex);
  const roots = siblings(null).filter((element) => element.id !== sourceId);
  const children = new Map(updated.filter((element) => element.type === "section").map((section) =>
    [section.id, siblings(section.id).filter((element) => element.id !== sourceId)]));
  const destination = parentId ? children.get(parentId) : roots;
  if (!destination) return elements;
  const anchor = placement === "inside" ? undefined : target;
  const anchorIndex = anchor ? destination.findIndex((element) => element.id === anchor.id) : -1;
  destination.splice(anchorIndex < 0 ? destination.length : anchorIndex + (placement === "after" ? 1 : 0), 0, updated.find((element) => element.id === sourceId)!);

  // Lowest z-index first: section backgrounds precede their children.
  const bottomToTop = roots.slice().reverse().flatMap((element) => element.type === "section"
    ? [element, ...(children.get(element.id) ?? []).slice().reverse()]
    : [element]);
  const order = new Map(bottomToTop.map((element, index) => [element.id, index + 1]));
  return updated.map((element) => ({ ...element, zIndex: order.get(element.id) ?? element.zIndex })) as EditorElement[];
}
