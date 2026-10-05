import { PREVIEW_DEVICES, type PreviewDevice } from "../config/previewDevices.ts";
import type { BackgroundSection, RsvpField, RsvpFormConfig, WeddingPage } from "../types/editor";
import { getElementLayout, isElementVisibleOnDevice } from "./responsiveLayout.ts";

export const DOCUMENT_BOTTOM_MARGIN = 120;
// An explicit last section ends flush; its own padding still protects its content.
export const LAST_SECTION_BOTTOM_GAP = 0;
export const RSVP_BLOCK_MIN_HEIGHT = 620;

const getRsvpFieldHeight = (field: RsvpField) => {
  if (field.type === "long_text") return 128;
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return 52 + Math.max(1, field.options?.length ?? 0) * 42;
  }
  return 84;
};

export const getRsvpAutomaticHeight = (config?: RsvpFormConfig | null, device: PreviewDevice = "mobile") => {
  if (!config?.enabled) return 0;
  const fieldsHeight = config.fields.reduce(
    (height, field) => height + getRsvpFieldHeight(field),
    0,
  );
  const typographyExtra = Math.max(0, (config.typography?.titleFontSize ?? 34) - 34) * 2.3
    + Math.max(0, (config.typography?.labelFontSize ?? 11) - 11) * config.fields.length * 1.4
    + Math.max(0, (config.typography?.fieldFontSize ?? 13) - 13) * config.fields.length * 1.4;
  const deviceFactor = device === "desktop" ? 2.2 : device === "tablet" ? 1.35 : 1;
  return Math.ceil(Math.max(RSVP_BLOCK_MIN_HEIGHT, 330 + fieldsHeight + typographyExtra) * deviceFactor);
};

export const getRsvpRequestedHeight = (config: RsvpFormConfig | null | undefined, device: PreviewDevice) =>
  device === "mobile" ? config?.height : config?.responsive?.[device]?.height;

/** measuredMinimum is the natural DOM content height in logical device pixels. */
export const getRsvpBlockHeight = (config?: RsvpFormConfig | null, device: PreviewDevice = "mobile", measuredMinimum?: number) => {
  if (!config?.enabled) return 0;
  const automatic = getRsvpAutomaticHeight(config, device);
  const requested = getRsvpRequestedHeight(config, device);
  const minimum = Number.isFinite(measuredMinimum) ? Math.max(12, measuredMinimum!) : automatic;
  return Math.ceil(Math.max(minimum, Number.isFinite(requested) ? Math.max(12, requested!) : automatic));
};

export const hasVisibleLastSection = (page: WeddingPage, device: PreviewDevice) => page.elements.some((element) =>
  element.type === "section" && getElementLayout(element, device).isLastSection && isElementVisibleOnDevice(element, page.elements, device));

const getContentBottom = (page: WeddingPage, device: PreviewDevice, includeOverflow: boolean) => page.elements.reduce((maximum, element) => {
  if (!isElementVisibleOnDevice(element, page.elements, device)) return maximum;
  const layout = getElementLayout(element, device);
  if (!includeOverflow) return Math.max(maximum, layout.y + layout.height);
  // A protruding child belongs to its section's content and needs bottom padding too.
  const parent = page.elements.find((candidate) => candidate.type === "section" && candidate.id === layout.sectionId);
  const padding = parent?.type === "section" ? Math.max(0, parent.padding ?? 0) : 0;
  const radians = layout.rotation * Math.PI / 180;
  const rotatedBottom = element.type === "image"
    ? layout.y + layout.height / 2 + (Math.abs(Math.sin(radians)) * layout.width + Math.abs(Math.cos(radians)) * layout.height) / 2
    : layout.y + Math.max(0, Math.sin(radians) * layout.width) + Math.max(0, Math.cos(radians) * layout.height);
  return Math.max(maximum, layout.y + layout.height + padding, rotatedBottom + padding);
}, 0);

export const getDocumentContentHeight = (
  page: WeddingPage,
  device: PreviewDevice,
) => {
  const lastSection = hasVisibleLastSection(page, device);
  const contentBottom = getContentBottom(page, device, lastSection);
  const sectionBottom = (page.backgroundSections ?? []).reduce(
    (maximum, section) => Math.max(maximum, section.y + section.height),
    0,
  );
  // Legacy background slices are decoration, not content. An explicit ending
  // may trim their empty tail without shortening any visible element.
  if (lastSection) return contentBottom + LAST_SECTION_BOTTOM_GAP;
  return Math.max(
    PREVIEW_DEVICES[device].height,
    contentBottom + DOCUMENT_BOTTOM_MARGIN,
    sectionBottom,
  );
};

const normalizePosition = (value: number) => Math.max(0, Math.round(value));

export const hasRsvpPositionOverride = (
  config: RsvpFormConfig | null | undefined,
  device: PreviewDevice,
) => device === "mobile"
  ? Number.isFinite(config?.positionX) || Number.isFinite(config?.positionY) || Number.isFinite(config?.width) || Number.isFinite(config?.height)
  : Boolean(config?.responsive?.[device] && (
      Number.isFinite(config.responsive[device]?.x)
      || Number.isFinite(config.responsive[device]?.y)
      || Number.isFinite(config.responsive[device]?.width)
      || Number.isFinite(config.responsive[device]?.height)
    ));

export const hasExplicitRsvpPosition = (
  config: RsvpFormConfig | null | undefined,
  device: PreviewDevice,
) => Number.isFinite(config?.positionY) || (device !== "mobile" && Number.isFinite(config?.responsive?.[device]?.y));

export const getRsvpPositionY = (
  page: WeddingPage,
  config: RsvpFormConfig | null | undefined,
  device: PreviewDevice,
) => {
  const automaticPosition = getDocumentContentHeight(page, device);
  const basePosition = Number.isFinite(config?.positionY)
    ? config!.positionY!
    : automaticPosition;
  const responsivePosition = device === "mobile"
    ? undefined
    : config?.responsive?.[device]?.y;

  return normalizePosition(Number.isFinite(responsivePosition) ? responsivePosition! : basePosition);
};

export const getRsvpPositionX = (
  config: RsvpFormConfig | null | undefined,
  device: PreviewDevice,
) => normalizePosition(device === "mobile"
  ? config?.positionX ?? 0
  : config?.responsive?.[device]?.x ?? config?.positionX ?? 0);

export const getRsvpWidth = (
  config: RsvpFormConfig | null | undefined,
  device: PreviewDevice,
) => Math.max(120, Math.round(device === "mobile"
  ? config?.width ?? PREVIEW_DEVICES.mobile.width
  : config?.responsive?.[device]?.width ?? config?.width ?? PREVIEW_DEVICES[device].width));

export const setRsvpLayoutForDevice = (
  config: RsvpFormConfig,
  device: PreviewDevice,
  layout: { x?: number; y?: number; width?: number; height?: number },
): RsvpFormConfig => {
  const updates = {
    ...(layout.x !== undefined ? { x: normalizePosition(layout.x) } : {}),
    ...(layout.y !== undefined ? { y: normalizePosition(layout.y) } : {}),
    ...(layout.width !== undefined ? { width: Math.max(120, Math.round(layout.width)) } : {}),
    ...(layout.height !== undefined && Number.isFinite(layout.height) ? { height: Math.max(12, Math.round(layout.height)) } : {}),
  };
  if (device === "mobile") return {
    ...config,
    ...(updates.x !== undefined ? { positionX: updates.x } : {}),
    ...(updates.y !== undefined ? { positionY: updates.y } : {}),
    ...(updates.width !== undefined ? { width: updates.width } : {}),
    ...(updates.height !== undefined ? { height: updates.height } : {}),
  };
  return { ...config, responsive: { ...config.responsive, [device]: { ...config.responsive?.[device], ...updates } } };
};

export const setRsvpSectionForDevice = (config: RsvpFormConfig, device: PreviewDevice, sectionId: string | null): RsvpFormConfig => device === "mobile"
  ? { ...config, sectionId }
  : { ...config, responsive: { ...config.responsive, [device]: { ...config.responsive?.[device], sectionId } } };

export const setRsvpPositionForDevice = (
  config: RsvpFormConfig,
  device: PreviewDevice,
  positionY: number,
): RsvpFormConfig => {
  return setRsvpLayoutForDevice(config, device, { y: positionY });
};

export const resetRsvpPositionForDevice = (
  config: RsvpFormConfig,
  device: PreviewDevice,
): RsvpFormConfig => {
  if (device === "mobile") {
    const next = { ...config };
    delete next.positionY;
    delete next.positionX;
    delete next.width;
    delete next.height;
    return next;
  }

  if (!config.responsive) return config;
  const responsive = { ...config.responsive };
  const layout = { ...responsive[device] };
  delete layout.x;
  delete layout.y;
  delete layout.width;
  delete layout.height;
  if (Object.keys(layout).length) responsive[device] = layout;
  else delete responsive[device];
  const next: RsvpFormConfig = { ...config, responsive };
  if (!responsive.tablet && !responsive.desktop) delete next.responsive;
  return next;
};

export const getDocumentHeight = (
  page: WeddingPage,
  device: PreviewDevice,
  rsvp?: RsvpFormConfig | null,
  resolvedRsvpHeight?: number,
) => {
  const contentHeight = getDocumentContentHeight(page, device);
  const rsvpHeight = resolvedRsvpHeight ?? getRsvpBlockHeight(rsvp, device);
  if (!rsvpHeight) return contentHeight;

  // A legacy project without an explicit position keeps the exact former
  // behavior: the form starts after the content and extends the document.
  if (!hasExplicitRsvpPosition(rsvp, device)) return contentHeight + rsvpHeight + (hasVisibleLastSection(page, device) ? LAST_SECTION_BOTTOM_GAP : 0);

  const formBottom = getRsvpPositionY(page, rsvp, device) + rsvpHeight;
  const sectionId = device === "mobile" ? rsvp?.sectionId : rsvp?.responsive?.[device]?.sectionId !== undefined ? rsvp.responsive[device]!.sectionId : rsvp?.sectionId;
  const parent = page.elements.find((element) => element.type === "section" && element.id === sectionId);
  const padding = hasVisibleLastSection(page, device) && parent?.type === "section" ? Math.max(0, parent.padding ?? 0) : 0;
  return Math.max(contentHeight, formBottom + padding + (hasVisibleLastSection(page, device) ? LAST_SECTION_BOTTOM_GAP : DOCUMENT_BOTTOM_MARGIN));
};

export const migratePagesToScrollableDocument = (pages: WeddingPage[]): WeddingPage[] => {
  if (pages.length <= 1) return pages;

  const sections: BackgroundSection[] = [];
  const elements = pages.flatMap((page, pageIndex) => {
    const mobileOffset = pageIndex * PREVIEW_DEVICES.mobile.height;
    const tabletOffset = pageIndex * PREVIEW_DEVICES.tablet.height;
    const desktopOffset = pageIndex * PREVIEW_DEVICES.desktop.height;
    sections.push({
      id: page.id,
      y: mobileOffset,
      height: PREVIEW_DEVICES.mobile.height,
      background: page.background,
    });
    return page.elements.map((element) => ({
      ...element,
      y: element.y + mobileOffset,
      responsive: {
        ...element.responsive,
        ...(element.responsive?.tablet
          ? { tablet: { ...element.responsive.tablet, y: (element.responsive.tablet.y ?? element.y) + tabletOffset } }
          : {}),
        ...(element.responsive?.desktop
          ? { desktop: { ...element.responsive.desktop, y: (element.responsive.desktop.y ?? element.y) + desktopOffset } }
          : {}),
      },
    }));
  });

  return [{
    ...pages[0],
    name: "Faire-part",
    elements,
    backgroundSections: sections,
  }];
};
