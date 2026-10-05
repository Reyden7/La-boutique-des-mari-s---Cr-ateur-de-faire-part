import type { EditorElement } from "../types/editor";
import type { PreviewDevice } from "../config/previewDevices";

export type HierarchyPlacement = "before" | "after" | "inside";

export const getElementComposition = (element: EditorElement, device: PreviewDevice) => {
  const override = device === "mobile" ? undefined : element.responsive?.[device];
  return {
    visible: override?.visible ?? element.visible ?? true,
    zIndex: override?.zIndex ?? element.zIndex,
    sectionId: override?.sectionId !== undefined ? override.sectionId : element.sectionId ?? null,
  };
};

export const isCompositionVisible = (element: EditorElement, elements: EditorElement[], device: PreviewDevice) => {
  const { visible, sectionId } = getElementComposition(element, device);
  if (!visible) return false;
  if (!sectionId) return true;
  const parent = elements.find((candidate) => candidate.type === "section" && candidate.id === sectionId);
  return !parent || getElementComposition(parent, device).visible;
};

const setComposition = (element: EditorElement, device: PreviewDevice, changes: { zIndex?: number; sectionId?: string | null }): EditorElement => device === "mobile"
  ? { ...element, ...changes } as EditorElement
  : { ...element, responsive: { ...element.responsive, [device]: { ...element.responsive?.[device], ...changes } } } as EditorElement;

/** The hierarchy is grouped by section, while coordinates always remain document-absolute. */
export function getHierarchyRows(elements: EditorElement[], device: PreviewDevice = "mobile") {
  const ordered = [...elements].sort((a, b) => getElementComposition(b, device).zIndex - getElementComposition(a, device).zIndex);
  const sectionIds = new Set(ordered.filter((element) => element.type === "section").map((element) => element.id));
  return ordered.filter((element) => !getElementComposition(element, device).sectionId || !sectionIds.has(getElementComposition(element, device).sectionId!)).flatMap((element) =>
    element.type === "section"
      ? [element, ...ordered.filter((child) => getElementComposition(child, device).sectionId === element.id)]
      : [element]);
}

/** UI filtering only; renderers and ordering mutations keep using the complete hierarchy. */
export function getVisibleHierarchyRows(elements: EditorElement[], device: PreviewDevice, collapsedSections: Readonly<Record<string, boolean>>) {
  const sections = new Set(elements.filter((element) => element.type === "section").map((element) => element.id));
  return getHierarchyRows(elements, device).filter((element) => {
    const parent = getElementComposition(element, device).sectionId;
    return !parent || !sections.has(parent) || !collapsedSections[parent];
  });
}

export function moveHierarchyElement(elements: EditorElement[], sourceId: string, targetId: string | null, placement: HierarchyPlacement, device: PreviewDevice = "mobile") {
  const source = elements.find((element) => element.id === sourceId);
  const target = targetId ? elements.find((element) => element.id === targetId) : undefined;
  if (!source || (targetId && !target) || sourceId === targetId) return elements;
  if (placement === "inside" && (!target || target.type !== "section" || source.type === "section")) return elements;

  const parentId = placement === "inside" ? target!.id : target ? getElementComposition(target, device).sectionId : null;
  if (source.type === "section" && parentId) return elements;
  const updated = elements.map((element) => element.id === sourceId
    ? setComposition(element, device, { sectionId: source.type === "section" ? null : parentId })
    : element);
  const siblings = (parent: string | null) => updated
    .filter((element) => getElementComposition(element, device).sectionId === parent)
    .sort((a, b) => getElementComposition(b, device).zIndex - getElementComposition(a, device).zIndex);
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
  return updated.map((element) => setComposition(element, device, { zIndex: order.get(element.id) ?? getElementComposition(element, device).zIndex }));
}
