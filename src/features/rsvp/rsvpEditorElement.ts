/** Stable editor-only selection id. It is never persisted as a document element. */
export const RSVP_EDITOR_ELEMENT_ID = "__rsvp-form__";

import type { EditorElement, RsvpFormConfig } from "../../types/editor";
import type { PreviewDevice } from "../../config/previewDevices";

export const getRsvpSectionId = (config: RsvpFormConfig | undefined, device: PreviewDevice) => device === "mobile"
  ? config?.sectionId ?? null
  : config?.responsive?.[device]?.sectionId !== undefined ? config.responsive[device]!.sectionId : config?.sectionId ?? null;

export const isRsvpVisibleOnDevice = (config: RsvpFormConfig | undefined, device: PreviewDevice) =>
  Boolean(config?.enabled && (config.visibilityByDevice?.[device] ?? (device === "mobile" ? true : config.responsive?.[device]?.visible ?? true)));

export const materializeRsvpComposition = (config: RsvpFormConfig): RsvpFormConfig => ({
  ...config,
  responsive: {
    tablet: { ...config.responsive?.tablet, sectionId: getRsvpSectionId(config, "tablet") },
    desktop: { ...config.responsive?.desktop, sectionId: getRsvpSectionId(config, "desktop") },
  },
  visibilityByDevice: {
    mobile: config.visibilityByDevice?.mobile ?? true,
    tablet: config.visibilityByDevice?.tablet ?? config.responsive?.tablet?.visible ?? true,
    desktop: config.visibilityByDevice?.desktop ?? config.responsive?.desktop?.visible ?? true,
  },
});

/** A section-owned form sits above that section's children, but below higher root groups. */
export function getRsvpLayerZIndex(config: RsvpFormConfig | undefined, elements: EditorElement[], device: PreviewDevice = "mobile") {
  const composition = (element: EditorElement) => ({
    zIndex: device === "mobile" ? element.zIndex : element.responsive?.[device]?.zIndex ?? element.zIndex,
    sectionId: device === "mobile" ? element.sectionId : element.responsive?.[device]?.sectionId !== undefined ? element.responsive[device]!.sectionId : element.sectionId,
  });
  const section = elements.find((element) => element.type === "section" && element.id === getRsvpSectionId(config, device));
  if (!section) return Math.max(0, ...elements.map((element) => composition(element).zIndex)) + 1;
  return Math.max(composition(section).zIndex, ...elements.filter((element) => composition(element).sectionId === section.id).map((element) => composition(element).zIndex)) + 0.5;
}

/** Appearance edits must not unmount the selected RSVP properties panel. */
export function selectionAfterRsvpUpdate(enabled: boolean, selectedId: string | null, selectedIds: string[]) {
  if (enabled) return { selectedId, selectedIds };
  return {
    selectedId: selectedId === RSVP_EDITOR_ELEMENT_ID ? null : selectedId,
    selectedIds: selectedIds.filter((id) => id !== RSVP_EDITOR_ELEMENT_ID),
  };
}
