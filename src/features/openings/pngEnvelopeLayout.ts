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
