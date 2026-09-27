import { PREVIEW_DEVICES, type PreviewDevice } from "../config/previewDevices";
import type { BackgroundSection, RsvpField, RsvpFormConfig, WeddingPage } from "../types/editor";
import { getElementLayout } from "./responsiveLayout";

export const DOCUMENT_BOTTOM_MARGIN = 120;
export const RSVP_BLOCK_MIN_HEIGHT = 620;

const getRsvpFieldHeight = (field: RsvpField) => {
  if (field.type === "long_text") return 128;
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return 52 + Math.max(1, field.options?.length ?? 0) * 42;
  }
  return 84;
};

export const getRsvpBlockHeight = (config?: RsvpFormConfig | null, device: PreviewDevice = "mobile") => {
  if (!config?.enabled) return 0;
  const fieldsHeight = config.fields.reduce(
    (height, field) => height + getRsvpFieldHeight(field),
    0,
  );
  const deviceFactor = device === "desktop" ? 2.2 : device === "tablet" ? 1.35 : 1;
  return Math.ceil(Math.max(RSVP_BLOCK_MIN_HEIGHT, 330 + fieldsHeight) * deviceFactor);
};

export const getDocumentContentHeight = (
  page: WeddingPage,
  device: PreviewDevice,
) => {
  const contentBottom = page.elements.reduce((maximum, element) => {
    if (!element.visible) return maximum;
    const layout = getElementLayout(element, device);
    return Math.max(maximum, layout.y + layout.height);
  }, 0);
  const sectionBottom = (page.backgroundSections ?? []).reduce(
    (maximum, section) => Math.max(maximum, section.y + section.height),
    0,
  );
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
  ? Number.isFinite(config?.positionY)
  : Number.isFinite(config?.responsive?.[device]?.y);

export const hasExplicitRsvpPosition = (
  config: RsvpFormConfig | null | undefined,
  device: PreviewDevice,
) => Number.isFinite(config?.positionY) || hasRsvpPositionOverride(config, device);

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

export const setRsvpPositionForDevice = (
  config: RsvpFormConfig,
  device: PreviewDevice,
  positionY: number,
): RsvpFormConfig => {
  const y = normalizePosition(positionY);
  if (device === "mobile") return { ...config, positionY: y };

  return {
    ...config,
    responsive: {
      ...config.responsive,
      [device]: {
        ...config.responsive?.[device],
        y,
      },
    },
  };
};

export const resetRsvpPositionForDevice = (
  config: RsvpFormConfig,
  device: PreviewDevice,
): RsvpFormConfig => {
  if (device === "mobile") {
    const next = { ...config };
    delete next.positionY;
    return next;
  }

  if (!config.responsive) return config;
  const responsive = { ...config.responsive };
  delete responsive[device];
  const next: RsvpFormConfig = { ...config, responsive };
  if (!responsive.tablet && !responsive.desktop) delete next.responsive;
  return next;
};

export const getDocumentHeight = (
  page: WeddingPage,
  device: PreviewDevice,
  rsvp?: RsvpFormConfig | null,
) => {
  const contentHeight = getDocumentContentHeight(page, device);
  const rsvpHeight = getRsvpBlockHeight(rsvp, device);
  if (!rsvpHeight) return contentHeight;

  // A legacy project without an explicit position keeps the exact former
  // behavior: the form starts after the content and extends the document.
  if (!hasExplicitRsvpPosition(rsvp, device)) return contentHeight + rsvpHeight;

  const formBottom = getRsvpPositionY(page, rsvp, device) + rsvpHeight;
  return Math.max(contentHeight, formBottom + DOCUMENT_BOTTOM_MARGIN);
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
