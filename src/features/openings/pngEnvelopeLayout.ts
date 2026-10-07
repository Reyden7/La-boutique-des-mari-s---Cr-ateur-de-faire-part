import type { EnvelopeConfig, EnvelopeDeviceSettings, EnvelopeOffset } from "../../types/editor";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices.ts";

export const ENVELOPE_DEVICE_LAYOUT = {
  mobile: { orientation: "portrait" },
  tablet: { orientation: "landscape" },
  desktop: { orientation: "landscape" },
} as const;

/** Keep legacy Smartphone settings intact; never inherit them on Tablet/PC. */
export function resolveEnvelopeDeviceSettings(envelope: EnvelopeConfig | undefined, device: PreviewDevice): EnvelopeDeviceSettings {
  const legacy = device === "mobile" ? {
    baseClosedOffset: envelope?.baseClosedOffset, flapClosedOffset: envelope?.flapClosedOffset,
    sealClosedOffset: envelope?.sealClosedOffset, sealScale: envelope?.sealScale,
  } : {};
  return { ...legacy, ...envelope?.responsive?.[device] };
}

export function updateEnvelopeDeviceSettings(envelope: EnvelopeConfig | undefined, device: PreviewDevice, patch: Partial<EnvelopeDeviceSettings>): EnvelopeConfig {
  return { ...envelope, responsive: { ...envelope?.responsive, [device]: { ...resolveEnvelopeDeviceSettings(envelope, device), ...patch } } };
}

export const ENVELOPE_OFFSET_FIELDS = { base: "baseClosedOffset", flap: "flapClosedOffset", seal: "sealClosedOffset" } as const;

export function resolveEnvelopeOffset(value?: Partial<EnvelopeOffset> | null): EnvelopeOffset {
  const axis = (input: unknown) => typeof input === "number" && Number.isFinite(input) ? Math.max(-50, Math.min(50, input)) : 0;
  return { x: axis(value?.x), y: axis(value?.y) };
}

export function resolveEnvelopeSealScale(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(.5, Math.min(2, value)) : 1;
}

/** Original PNG dimensions and alpha bounds. No modification of source pixels. */
export const PNG_ENVELOPE_ASSETS = {
  base: "/assets/openings/envelope/base1.png",
  flap: "/assets/openings/envelope/rabat1.png",
  seal: "/assets/openings/envelope/cachet1.png",
} as const;

export function getPngEnvelopeDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= .9 && value <= 1.2 ? value : 1.1;
}

export function getPngEnvelopeLayout(width: number, height: number) {
  const w = Number.isFinite(width) && width > 0 ? width : 390;
  const h = Number.isFinite(height) && height > 0 ? height : 844;
  // Uniform scales preserve ratios/alpha. Transparent margins and paper bleed
  // sit outside the viewport, not inside an artificial small envelope frame.
  // The base has a concave edge: cover its narrowest exposed strip, not its
  // rectangular file bounds, to avoid a slit into the invitation when closed.
  const baseScale = Math.max(h / 1586, w / 395);
  const flapScale = h / 1618;
  const base = { x: -62 * baseScale, y: (h - 1586 * baseScale) / 2 - 42 * baseScale, width: 941 * baseScale, height: 1672 * baseScale };
  const flap = { x: w * .48 - 400 * flapScale, y: -18 * flapScale, width: 941 * flapScale, height: 1672 * flapScale };
  // Visible seal center on the flap's pointed junction, allowing for the wax
  // asset's transparent padding. These coordinates belong to the flap group.
  const sealScale = w * .22 / 914;
  const seal = { x: 400 * flapScale - 645 * sealScale, y: 830 * flapScale - 623 * sealScale, width: 1254 * sealScale, height: 1254 * sealScale };
  return { width: w, height: h, base, flap, seal, leftTravel: -(base.x + base.width + 2), rightTravel: w - flap.x + seal.width + 2 };
}

/** Compose local closed positions with the original, unchanged animation deltas.
 * Flap and seal offsets are siblings inside the moving group, not group offsets.
 */
export function getPngEnvelopeClosedLayout(width: number, height: number, envelope?: EnvelopeDeviceSettings) {
  const layout = getPngEnvelopeLayout(width, height);
  const shift = (part: keyof typeof ENVELOPE_OFFSET_FIELDS) => {
    const offset = resolveEnvelopeOffset(envelope?.[ENVELOPE_OFFSET_FIELDS[part]]);
    return { x: layout.width * offset.x / 100, y: layout.height * offset.y / 100 };
  };
  const base = shift("base"), flap = shift("flap"), seal = shift("seal");
  const scale = resolveEnvelopeSealScale(envelope?.sealScale);
  const sealWidth = layout.seal.width * scale, sealHeight = layout.seal.height * scale;
  return {
    ...layout,
    base: { ...layout.base, x: layout.base.x + base.x, y: layout.base.y + base.y },
    flapImage: { ...flap, width: layout.flap.width, height: layout.flap.height },
    // Resize only the seal's local box around its center. The moving group's
    // origin and opening distances still come from the original geometry.
    seal: {
      x: layout.seal.x + seal.x + (layout.seal.width - sealWidth) / 2,
      y: layout.seal.y + seal.y + (layout.seal.height - sealHeight) / 2,
      width: sealWidth, height: sealHeight,
    },
  };
}

type EnvelopeBox = { x: number; y: number; width: number; height: number };

/** Rotate the paper geometry -90° once; user offsets remain screen-axis values. */
const landscapeBox = (box: EnvelopeBox, portraitWidth: number): EnvelopeBox => ({
  x: box.y, y: portraitWidth - box.x - box.width, width: box.height, height: box.width,
});

export function getPngEnvelopeDeviceLayout(width: number, height: number, envelope?: EnvelopeConfig, device: PreviewDevice = "mobile") {
  const settings = resolveEnvelopeDeviceSettings(envelope, device);
  if (ENVELOPE_DEVICE_LAYOUT[device].orientation === "portrait") {
    const layout = getPngEnvelopeClosedLayout(width, height, settings);
    return { ...layout, frame: { x: 0, y: 0, width: layout.width, height: layout.height }, landscape: false,
      baseMotion: { x: layout.leftTravel, y: 0 }, flapMotion: { x: layout.rightTravel, y: 0 } };
  }
  const w = Number.isFinite(width) && width > 0 ? width : PREVIEW_DEVICES[device].width;
  const h = Number.isFinite(height) && height > 0 ? height : PREVIEW_DEVICES[device].height;
  // Cover the physical introduction viewport with ONE uniform composition scale.
  // No per-device width caps: any excess paper is cropped symmetrically by frame.
  const referenceWidth = PREVIEW_DEVICES.mobile.height;
  const referenceHeight = PREVIEW_DEVICES.mobile.width;
  const coverScale = Math.max(w / referenceWidth, h / referenceHeight);
  const compositionWidth = referenceWidth * coverScale;
  const compositionHeight = referenceHeight * coverScale;
  const frame = { x: 0, y: 0, width: w, height: h };
  const composition = { x: (w - compositionWidth) / 2, y: (h - compositionHeight) / 2, width: compositionWidth, height: compositionHeight };
  const portrait = getPngEnvelopeClosedLayout(compositionHeight, compositionWidth);
  const shift = (part: keyof typeof ENVELOPE_OFFSET_FIELDS) => {
    const offset = resolveEnvelopeOffset(settings[ENVELOPE_OFFSET_FIELDS[part]]);
    return { x: compositionWidth * offset.x / 100, y: compositionHeight * offset.y / 100 };
  };
  const baseShift = shift("base"), flapShift = shift("flap"), sealShift = shift("seal");
  const baseBox = landscapeBox(portrait.base, compositionHeight);
  const base = { ...baseBox, x: baseBox.x + baseShift.x, y: baseBox.y + baseShift.y };
  const flap = landscapeBox(portrait.flap, compositionHeight);
  const flapImage = { x: flapShift.x, y: flapShift.y, width: flap.width, height: flap.height };
  const sealBox = landscapeBox(portrait.seal, portrait.flap.width);
  const scale = resolveEnvelopeSealScale(settings.sealScale);
  const sealWidth = sealBox.width * scale, sealHeight = sealBox.height * scale;
  const seal = { x: sealBox.x + sealShift.x + (sealBox.width - sealWidth) / 2,
    y: sealBox.y + sealShift.y + (sealBox.height - sealHeight) / 2, width: sealWidth, height: sealHeight };
  // Include user offsets and the enlarged seal in exit distances. All paper
  // must leave the viewport, including its centered cover crop and user offsets.
  const downTravel = Math.max(h - composition.y - base.y, base.height) * 1.05;
  const upTravel = -Math.max(flap.height, composition.y + flap.y + Math.max(flapImage.y + flapImage.height, seal.y + seal.height)) * 1.05;
  return { width: w, height: h, base, flap, flapImage, seal, frame, composition, landscape: true,
    leftTravel: 0, rightTravel: 0, baseMotion: { x: 0, y: downTravel }, flapMotion: { x: 0, y: upTravel } };
}

/** Intrinsic portrait PNG, rotated inside its landscape bounding box without stretching. */
export function getLandscapePaperStyle(box: EnvelopeBox) {
  return { position: "absolute" as const, left: box.x + (box.width - box.height) / 2,
    top: box.y + (box.height - box.width) / 2, width: box.height, height: box.width,
    transform: "rotate(-90deg)", transformOrigin: "center center" };
}
