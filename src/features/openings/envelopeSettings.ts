import type { EnvelopeOpeningSettings, OpeningAnimationConfig } from "../../types/editor";

/** One duration for the seal, articulated paper and transition into the document. */
export function getEnvelopeDuration(value: number | undefined) {
  return Number.isFinite(value) && value! >= 1.3 && value! <= 1.6 ? value! : 1.5;
}

export const ENVELOPE_PORTRAIT_RATIO = .52;

/** Logical dimensions, never a screen-space bounding rect affected by Preview zoom.
 * The envelope is always portrait; the document keeps its selected device layout. */
export function getEnvelopeFrame(viewportWidth: number, viewportHeight: number) {
  const vw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 390;
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 844;
  const width = Math.min(vw * .92, vh * .82 * ENVELOPE_PORTRAIT_RATIO, 440);
  const height = width / ENVELOPE_PORTRAIT_RATIO;
  const letterWidth = width * .94;
  const letterHeight = height * .94;
  const letterScale = letterWidth / vw;
  return { viewportWidth: vw, viewportHeight: vh, width, height, x: (vw - width) / 2, y: (vh - height) / 2,
    letterWidth, letterHeight, letterScale, letterX: (vw - letterWidth) / 2, letterY: (vh - letterHeight) / 2,
    letterClipHeight: letterHeight / letterScale, letterLift: Math.min(12, height * .02) };
}

export function resolveEnvelopeSettings(config: OpeningAnimationConfig) {
  const settings = (config.customSettings ?? {}) as Partial<EnvelopeOpeningSettings>;
  const [envelope, inner, seal] = config.colors ?? [];
  return {
    envelope: envelope ?? settings.envelopeColor ?? "#E7D2C3",
    inner: inner ?? settings.envelopeInnerColor ?? "#F5E9DF",
    flap: settings.flapColor ?? envelope ?? settings.envelopeColor ?? "#DFC4B1",
    seal: seal ?? settings.sealColor ?? "#B58A62",
    background: settings.backgroundColor ?? "#F5EFEA",
    hint: settings.hintText ?? (typeof config.customSettings?.label === "string" ? config.customSettings.label : "Touchez pour ouvrir"),
    sealImageUrl: settings.sealImageUrl,
    sealImageName: settings.sealImageName,
    duration: getEnvelopeDuration(config.duration),
  };
}

/** Natural sequence, followed by a small handoff into the full-size document. */
export function getEnvelopeTimeline(duration: number, reducedMotion = false) {
  if (reducedMotion) return { total: .18, seal: { delay: 0, duration: .18 }, top: { delay: 0, duration: .18 }, left: { delay: 0, duration: .18 }, right: { delay: 0, duration: .18 }, bottom: { delay: 0, duration: .18 }, inside: { delay: 0, duration: .18 }, letter: { delay: 0, duration: .18 }, handoff: { delay: 0, duration: .18 } };
  const total = getEnvelopeDuration(duration);
  const unit = total / 1.5;
  return { total, seal: { delay: 0, duration: .25 * unit }, top: { delay: .20 * unit, duration: .50 * unit }, left: { delay: .50 * unit, duration: .50 * unit }, right: { delay: .54 * unit, duration: .50 * unit }, bottom: { delay: .80 * unit, duration: .40 * unit }, inside: { delay: .35 * unit, duration: .35 * unit }, letter: { delay: .70 * unit, duration: .80 * unit }, handoff: { delay: 1.20 * unit, duration: .30 * unit } };
}

export function validateSealImage(file: Pick<File, "name" | "type" | "size">) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Le cachet doit peser au maximum 10 Mo.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[extension ?? ""];
  if (!mime || file.type !== mime) throw new Error("Utilisez une image PNG, WebP ou JPEG pour le cachet.");
}
