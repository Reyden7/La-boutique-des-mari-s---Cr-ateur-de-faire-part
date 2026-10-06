import type { EditorElement, WeddingProject } from "../src/types/editor";
import { makeButtonElement, makeCalendarElement, makeCarouselElement, makeLocationElement, makeScheduleElement, makeScratchElement } from "../src/features/elements/elementFactories.ts";

export function transferFixture(): WeddingProject {
  const common = { x: 35, y: 30, width: 320, height: 70, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, sectionId: "section", animation: { type: "none" as const, duration: .8, delay: 0 } };
  const text = (id: string, y: number, size: number): EditorElement => ({ ...common, id, y, type: "text", name: id, text: id === "title" ? "Emma & Lucas" : "Un jour, une histoire", fontFamily: "Cormorant Garamond", fontSize: size, fontWeight: 400, color: "#493f39", textAlign: "center", lineHeight: 1.2, letterSpacing: 0, italic: false, underline: false });
  const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect x="10" y="40" width="380" height="80" rx="40" fill="#a9775a"/><circle cx="200" cy="80" r="60" fill="#f3d8c9"/></svg>')}`;
  const elements: EditorElement[] = [
    { ...common, id: "section", name: "Section", sectionId: null, type: "section", x: 0, y: 0, width: 390, height: 3700, padding: 20, cornerRadius: 0, isLastSection: true, background: { type: "color", color: "#fffaf5" }, bottomEdge: { enabled: true, style: "tear", height: 24 } },
    text("title", 30, 38), text("subtitle", 130, 18), text("detail", 230, 12),
    { ...common, type: "image", id: "image", name: "Image", y: 340, height: 128, src: photo, alt: "Illustration entière", fit: "contain", rotation: 15, imageStyle: { transform: { cropX: .3, cropY: .6, cropScale: 1.1, flipX: true, flipY: false }, appearance: { bottomEdge: { enabled: true, style: "wave", height: 20 } } } },
    { ...makeScheduleElement(), id: "schedule", sectionId: "section", y: 580, width: 320, height: 230, orientation: "horizontal", stepGap: 4, iconSize: 22, items: [{ id: "step1", time: "16h", title: "Oui", icon: { type: "preset", name: "rings" } }, { id: "step2", time: "20h", title: "Dîner" }] },
    { ...makeScratchElement(), id: "scratch", sectionId: "section", y: 870, width: 240, height: 170, scratchIndicator: { enabled: true, type: "finger-text", text: "Grattez ici", color: "#493f39", opacity: .9, size: 28, x: 3, y: -2, animated: false } },
    { ...makeCalendarElement(), id: "calendar", sectionId: "section", y: 1120, width: 310, height: 360 },
    { ...makeCarouselElement(), id: "carousel", sectionId: "section", y: 1530, images: [{ id: "photo", url: photo, alt: "Photo" }] },
    { ...makeLocationElement(), id: "location", sectionId: "section", y: 1860 },
    { ...makeButtonElement(), id: "button", sectionId: "section", y: 2270 },
    { ...common, id: "shape", name: "Forme", type: "shape", y: 2370, width: 140, height: 60, shape: "rounded-rectangle", fill: "#cfa78d", stroke: "#795746", strokeWidth: 2, cornerRadius: 12 },
    { ...common, id: "heart", name: "Cœur", type: "icon", y: 2470, width: 90, height: 90, icon: "heart", color: "#af6b76", fontSize: 80, heartStyle: "filled" },
    { ...common, id: "decoration", name: "Décoration", type: "icon", y: 2470, x: 230, width: 90, height: 90, icon: "✦", color: "#a9775a", fontSize: 70, visible: false },
  ];
  return { id: "local-transfer-qa", ownerId: "local-owner", name: "Emma & Lucas — QA", createdAt: "2026-10-06", updatedAt: "2026-10-06", status: "draft", paymentStatus: "unpaid", introductionMode: "none",
    pages: [{ id: "page", name: "Faire-part", background: { type: "color", color: "#e5dcd3" }, elements }],
    opening: { type: "none", duration: 1 }, audio: { enabled: false, source: null, volume: .5, loop: false, startMode: "manual" },
    particles: { enabled: false, shape: "heart", direction: "down", speed: 1, quantity: 10, colors: ["#fff"], minSize: 4, maxSize: 12, opacity: .5, layer: "front" },
    rsvp: { enabled: true, purchased: false, title: "Confirmez votre présence", description: "Merci de nous répondre", submitLabel: "Envoyer", sectionId: "section", positionX: 35, positionY: 2700, width: 320, height: 700, fields: [{ id: "presence", label: "Présence", type: "short_text", required: true }], typography: { fontFamily: "Lora", titleFontSize: 34, labelFontSize: 11, fieldFontSize: 13 } },
  };
}
