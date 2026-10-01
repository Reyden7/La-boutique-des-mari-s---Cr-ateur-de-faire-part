import type { EditorElement } from "../types/editor";
import type { PreviewDevice } from "../config/previewDevices";

/** Sections own their children in the rendered DOM so the section's motion affects the whole group. */
export function getSectionRenderGroups(elements: EditorElement[], device: PreviewDevice = "mobile") {
  const parentId = (element: EditorElement) => device === "mobile"
    ? element.sectionId ?? null
    : element.responsive?.[device]?.sectionId !== undefined ? element.responsive[device]!.sectionId : element.sectionId ?? null;
  const sections = new Set(elements.filter((element) => element.type === "section").map((element) => element.id));
  const roots = elements.filter((element) => !parentId(element) || !sections.has(parentId(element)!));
  const childrenBySection = new Map<string, EditorElement[]>();
  for (const element of elements) {
    const parent = parentId(element);
    if (!parent || !sections.has(parent)) continue;
    const children = childrenBySection.get(parent) ?? [];
    children.push(element);
    childrenBySection.set(parent, children);
  }
  return { roots, childrenBySection };
}
