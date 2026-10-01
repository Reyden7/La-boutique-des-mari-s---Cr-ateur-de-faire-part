/** Stable editor-only selection id. It is never persisted as a document element. */
export const RSVP_EDITOR_ELEMENT_ID = "__rsvp-form__";

import type { EditorElement, RsvpFormConfig } from "../../types/editor";

/** A section-owned form sits above that section's children, but below higher root groups. */
export function getRsvpLayerZIndex(config: RsvpFormConfig | undefined, elements: EditorElement[]) {
  const section = elements.find((element) => element.type === "section" && element.id === config?.sectionId);
  if (!section) return Math.max(0, ...elements.map((element) => element.zIndex)) + 1;
  return Math.max(section.zIndex, ...elements.filter((element) => element.sectionId === section.id).map((element) => element.zIndex)) + 0.5;
}

/** Appearance edits must not unmount the selected RSVP properties panel. */
export function selectionAfterRsvpUpdate(enabled: boolean, selectedId: string | null, selectedIds: string[]) {
  if (enabled) return { selectedId, selectedIds };
  return {
    selectedId: selectedId === RSVP_EDITOR_ELEMENT_ID ? null : selectedId,
    selectedIds: selectedIds.filter((id) => id !== RSVP_EDITOR_ELEMENT_ID),
  };
}
