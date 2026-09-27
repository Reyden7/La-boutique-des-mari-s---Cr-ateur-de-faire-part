import { PREVIEW_DEVICES, type PreviewDevice } from "../config/previewDevices";
import type { BackgroundSection, WeddingPage } from "../types/editor";
import { getElementLayout } from "./responsiveLayout";

export const DOCUMENT_BOTTOM_MARGIN = 120;
export const RSVP_BLOCK_HEIGHT = 620;

export const getDocumentHeight = (
  page: WeddingPage,
  device: PreviewDevice,
  includeRsvp = false,
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
  const base = Math.max(
    PREVIEW_DEVICES[device].height,
    contentBottom + DOCUMENT_BOTTOM_MARGIN,
    sectionBottom,
  );
  return base + (includeRsvp ? RSVP_BLOCK_HEIGHT : 0);
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
