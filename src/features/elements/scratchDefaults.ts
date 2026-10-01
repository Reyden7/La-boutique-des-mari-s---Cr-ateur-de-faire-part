import type { ScratchElement, ScratchIndicatorConfig } from "../../types/editor";

export type ScratchSurfacePalette = { light: string; base: string; dark: string };

export function paintScratchSurface(context: CanvasRenderingContext2D, width: number, height: number, palette: ScratchSurfacePalette) {
  const surface = context.createRadialGradient(width * .3, height * .24, 0, width * .52, height * .55, Math.max(width, height) * .82);
  surface.addColorStop(0, palette.light);
  surface.addColorStop(.48, palette.base);
  surface.addColorStop(1, palette.dark);
  context.fillStyle = surface;
  context.fillRect(0, 0, width, height);
}

const SCRATCH_SURFACES: Record<Exclude<ScratchElement["surfaceStyle"], "custom">, ScratchSurfacePalette> = {
  gold: { light: "#ead58e", base: "#c5a452", dark: "#98752f" },
  silver: { light: "#f0f2f3", base: "#bfc3c8", dark: "#888e95" },
  champagne: { light: "#ead9c2", base: "#c8aa8d", dark: "#9f7f64" },
  beige: { light: "#e9e0d5", base: "#cbbba8", dark: "#a08f7b" },
  rose: { light: "#eac8cc", base: "#c99398", dark: "#a56d75" },
};

const blendHex = (source: string, target: "#ffffff" | "#000000", amount: number) => {
  const normalized = /^#[0-9a-f]{6}$/i.test(source) ? source : "#c8aa8d";
  const from = [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
  const to = target === "#ffffff" ? 255 : 0;
  return `#${from.map((channel) => Math.round(channel + (to - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
};

export const getScratchSurfacePalette = (element: ScratchElement): ScratchSurfacePalette => element.surfaceStyle === "custom"
  ? { light: blendHex(element.surfaceColor, "#ffffff", .28), base: element.surfaceColor, dark: blendHex(element.surfaceColor, "#000000", .22) }
  : SCRATCH_SURFACES[element.surfaceStyle];

export const DEFAULT_SCRATCH_INDICATOR: ScratchIndicatorConfig = {
  enabled: false,
  type: "finger-text",
  text: "Grattez ici",
  color: "#fffaf2",
  opacity: 0.92,
  size: 34,
  x: 0,
  y: 0,
  animated: true,
  fontFamily: "Montserrat",
  fontWeight: 600,
};

export const resolveScratchIndicator = (
  indicator?: Partial<ScratchIndicatorConfig>,
): ScratchIndicatorConfig => ({
  ...DEFAULT_SCRATCH_INDICATOR,
  ...indicator,
  enabled: indicator?.enabled ?? false,
});

export const getScratchTextStyle = (element: ScratchElement) => ({
  fontSize: element.fontSize ?? 42,
  fontFamily: element.fontFamily ?? "Cormorant Garamond",
  fontWeight: element.fontWeight ?? 600,
  textColor: element.textColor ?? element.contentColor ?? "#4d3e34",
  textAlign: element.textAlign ?? "center",
  textOffsetX: element.textOffsetX ?? 0,
  textOffsetY: element.textOffsetY ?? 0,
});
