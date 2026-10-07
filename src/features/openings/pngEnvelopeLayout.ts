import type { EnvelopeConfig, EnvelopeOffset } from "../../types/editor";

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
export function getPngEnvelopeClosedLayout(width: number, height: number, envelope?: EnvelopeConfig) {
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
