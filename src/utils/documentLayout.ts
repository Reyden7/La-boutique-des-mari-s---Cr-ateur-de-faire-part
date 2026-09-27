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

export const getDocumentHeight = (
  page: WeddingPage,
  device: PreviewDevice,
  rsvp?: RsvpFormConfig | null,
) => {
  return getDocumentContentHeight(page, device) + getRsvpBlockHeight(rsvp, device);
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
