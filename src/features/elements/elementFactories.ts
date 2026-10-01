import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import type { EditorElement, ElementType, WeddingPage } from "../../types/editor";
import { getElementLayout, isElementVisibleOnDevice } from "../../utils/responsiveLayout";

export const NEW_SECTION_MARGIN = 40;

const getPageBottom = (page: WeddingPage, device: PreviewDevice) => {
  const elementsBottom = page.elements.reduce((bottom, element) => {
    if (!isElementVisibleOnDevice(element, page.elements, device)) return bottom;
    const layout = getElementLayout(element, device);
    return Math.max(bottom, layout.y + layout.height);
  }, 0);
  const backgroundsBottom = (page.backgroundSections ?? []).reduce(
    (bottom, section) => Math.max(bottom, section.y + section.height),
    0,
  );

  return Math.max(PREVIEW_DEVICES[device].height, elementsBottom, backgroundsBottom);
};

const base = (type: ElementType, name: string, y = 420, width = 310, height = 220) => ({
  id: crypto.randomUUID(), type, name, x: 40, y, width, height, rotation: 0,
  opacity: 1, zIndex: Date.now(), visible: true, locked: false,
  animation: { type: "none" as const, duration: 0.8, delay: 0 },
});

export const makeScratchElement = (): EditorElement => ({
  ...base("scratch", "Zone à gratter", 420, 210, 150), type: "scratch",
  content: "18 · 06 · 2027", shape: "rounded-rectangle", surfaceStyle: "champagne",
  surfaceColor: "#c8aa8d", revealedBackgroundColor: "#fffaf5", contentColor: "#4d3e34", textColor: "#4d3e34",
  fontSize: 42, fontFamily: "Cormorant Garamond", fontWeight: 600,
  textAlign: "center", textOffsetX: 0, textOffsetY: 0, hint: "Grattez pour découvrir",
  scratchIndicator: {
    enabled: false, type: "finger-text", text: "Grattez ici", color: "#fffaf2",
    opacity: 0.92, size: 34, x: 0, y: 0, animated: true,
    fontFamily: "Montserrat", fontWeight: 600,
  },
});

export const makeCarouselElement = (): EditorElement => ({
  ...base("carousel", "Carrousel photos", 420, 310, 260), type: "carousel", images: [],
  showArrows: true, showDots: true, autoplay: false, interval: 4,
  transition: "slide", cornerRadius: 18, imageFit: "cover",
});

export const makeLocationElement = (): EditorElement => ({
  ...base("location", "Lieu / Carte", 420, 310, 330), type: "location",
  venueName: "Domaine de la Roseraie", address: "12 chemin des Fleurs, Dijon",
  details: "Nous vous attendons pour célébrer cette journée.", buttonLabel: "Voir l’itinéraire",
  backgroundColor: "#f7f1eb", textColor: "#493f39", accentColor: "#9a6d51",
});

export const makeScheduleElement = (): EditorElement => ({
  ...base("schedule", "Programme", 420, 310, 390), type: "schedule", displayStyle: "timeline",
  items: [
    { id: crypto.randomUUID(), time: "16:00", title: "Accueil", description: "Bienvenue au domaine" },
    { id: crypto.randomUUID(), time: "17:00", title: "Cérémonie" },
    { id: crypto.randomUUID(), time: "20:00", title: "Dîner" },
    { id: crypto.randomUUID(), time: "23:00", title: "Soirée" },
  ],
  backgroundColor: "#fffaf5", textColor: "#493f39", timeColor: "#9a6d51",
  lineColor: "#d9c4b4", accentColor: "#a9775a", titleColor: "#493f39", descriptionColor: "#493f39",
  timeFontSize: 12, titleFontSize: 17, descriptionFontSize: 11,
});

export const makeButtonElement = (): EditorElement => ({
  ...base("button", "Bouton", 420, 250, 58), type: "button", label: "Découvrir",
  url: "https://", target: "new", backgroundColor: "#795746", textColor: "#ffffff",
  borderColor: "#795746", borderWidth: 0, borderRadius: 12, textAlign: "center", fontFamily: "Montserrat", fontSize: 13, fontWeight: 700,
});

export const makeSectionElement = (page?: WeddingPage): EditorElement => {
  const mobileY = page ? getPageBottom(page, "mobile") + NEW_SECTION_MARGIN : 420;
  const tabletY = page ? getPageBottom(page, "tablet") + NEW_SECTION_MARGIN : mobileY;
  const desktopY = page ? getPageBottom(page, "desktop") + NEW_SECTION_MARGIN : mobileY;

  return {
    ...base("section", "Section", mobileY, PREVIEW_DEVICES.mobile.width, 500),
    x: 0,
    zIndex: 0,
    type: "section",
    locked: false,
    responsive: {
      tablet: { x: 0, y: tabletY, width: PREVIEW_DEVICES.tablet.width, height: 500, rotation: 0 },
      desktop: { x: 0, y: desktopY, width: PREVIEW_DEVICES.desktop.width, height: 500, rotation: 0 },
    },
    background: { type: "color", color: "#f7f1eb" },
    padding: 30,
    cornerRadius: 0,
  };
};
