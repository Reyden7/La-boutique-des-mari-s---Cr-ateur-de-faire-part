import type { EditorElement } from "../types/editor";

/** Sections own their children in the rendered DOM so the section's motion affects the whole group. */
export function getSectionRenderGroups(elements: EditorElement[]) {
  const sections = new Set(elements.filter((element) => element.type === "section").map((element) => element.id));
  const roots = elements.filter((element) => !element.sectionId || !sections.has(element.sectionId));
  const childrenBySection = new Map<string, EditorElement[]>();
  for (const element of elements) {
    if (!element.sectionId || !sections.has(element.sectionId)) continue;
    const children = childrenBySection.get(element.sectionId) ?? [];
    children.push(element);
    childrenBySection.set(element.sectionId, children);
  }
  return { roots, childrenBySection };
}
