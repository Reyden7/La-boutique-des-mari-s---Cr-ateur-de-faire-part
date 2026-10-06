import type { PageBackground, SectionEdgeConfig, SectionEdgeStyle } from "../types/editor";

export const SECTION_EDGE_PRESETS: ReadonlyArray<{ id: SectionEdgeStyle; label: string }> = [
  { id: "none", label: "Aucune" }, { id: "tear", label: "Déchirure" },
  { id: "wave", label: "Vagues" }, { id: "scallop", label: "Rond / festonné" },
  { id: "diagonal", label: "Coupe oblique" }, { id: "zigzag", label: "Zigzag" },
  { id: "cloud", label: "Nuage doux" }, { id: "paper-cut", label: "Papier découpé" },
];
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const resolveSectionEdge = (input?: Partial<SectionEdgeConfig> | null): SectionEdgeConfig => ({
  enabled: input?.enabled === true,
  style: SECTION_EDGE_PRESETS.some((preset) => preset.id === input?.style) ? input!.style! : "none",
  height: clamp(finite(input?.height, 32), 0, 240),
  inverted: input?.inverted === true,
  intensity: clamp(finite(input?.intensity, 1), 0, 1),
});
export const getSectionEdgeDepth = (input?: SectionEdgeConfig) => {
  const edge = resolveSectionEdge(input);
  return edge.enabled && edge.style !== "none" ? edge.height * edge.intensity! : 0;
};
const noise = (index: number) => {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const profile = (style: SectionEdgeStyle, u: number, width: number) => {
  const wavelength = style === "wave" ? 160 : style === "scallop" ? 64 : style === "cloud" ? 110 : style === "zigzag" ? 36 : style === "tear" ? 11 : 45;
  const cycles = Math.max(1, Math.min(200, Math.round(width / wavelength)));
  const phase = u * cycles;
  const fraction = phase - Math.floor(phase);
  switch (style) {
    case "diagonal": return u;
    case "wave": return .5 + .5 * Math.sin(phase * Math.PI * 2);
    case "scallop": return 1 - Math.sqrt(Math.max(0, 1 - (2 * fraction - 1) ** 2));
    case "cloud": return 1 - Math.sin(fraction * Math.PI) ** .65 * (.7 + .3 * noise(Math.floor(phase)));
    case "zigzag": return Math.abs(2 * fraction - 1);
    case "tear": {
      const index = Math.floor(phase);
      return .15 + .85 * (noise(index) * (1 - fraction) + noise(index + 1) * fraction);
    }
    case "paper-cut": {
      const index = Math.floor(phase);
      // Broad, asymmetric facets rather than a random outline on every redraw.
      const peak = .35 + noise(index) * .65;
      return fraction < .35 ? peak * fraction / .35 : peak * (1 - fraction) / .65;
    }
    default: return 0;
  }
};
export type SectionPoint = readonly [number, number];

/** One deterministic polygon, in logical pixels, for SVG and Konva clipping.
 * Decorations stay INSIDE the logical box: no added margins or document height.
 */
export function getSectionShape(width: number, height: number, top?: SectionEdgeConfig, bottom?: SectionEdgeConfig) {
  const w = Math.max(1, finite(width, 1)), h = Math.max(1, finite(height, 1));
  const topEdge = resolveSectionEdge(top), bottomEdge = resolveSectionEdge(bottom);
  const topInset = Math.min(getSectionEdgeDepth(topEdge), h * .45);
  const bottomInset = Math.min(getSectionEdgeDepth(bottomEdge), h * .45);
  const count = Math.max(32, Math.min(1600, Math.ceil(w / 2)));
  const sample = (edge: SectionEdgeConfig, depth: number, atBottom: boolean): SectionPoint[] => Array.from({ length: (depth === 0 || edge.style === "diagonal" ? 1 : count) + 1 }, (_, i) => {
    const intervals = depth === 0 || edge.style === "diagonal" ? 1 : count;
    const u = atBottom ? 1 - i / intervals : i / intervals;
    const value = depth === 0 ? 0 : profile(edge.style, u, w);
    const displacement = depth * (edge.inverted ? 1 - value : value);
    return [u * w, atBottom ? h - displacement : displacement] as const;
  });
  const points = [...sample(topEdge, topInset, false), ...sample(bottomEdge, bottomInset, true)];
  const number = (value: number) => Number(value.toFixed(4));
  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${number(x)} ${number(y)}`).join(" ") + " Z";
  // Konva traces the same rounded coordinates as the SVG path, including after resize.
  const roundedPoints = points.map(([x, y]) => [number(x), number(y)] as const);
  return { width: w, height: h, points: roundedPoints, path, topInset, bottomInset };
}

/** Conservative insertion margins: even a currently tiny section may grow. */
export const getSectionContentInsets = (padding: number, top?: SectionEdgeConfig, bottom?: SectionEdgeConfig) => ({
  top: Math.max(0, finite(padding, 0)) + getSectionEdgeDepth(top),
  bottom: Math.max(0, finite(padding, 0)) + getSectionEdgeDepth(bottom),
});

/** CSS-angle convention, shared with SVG and Konva instead of two gradients. */
export function getSectionBackgroundPaint(background: PageBackground, width: number, height: number) {
  const angle = finite(background.gradient?.angle, 135) * Math.PI / 180;
  const dx = Math.sin(angle), dy = -Math.cos(angle);
  const length = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  return {
    color: background.color ?? "#fffdf9",
    start: { x: width / 2 - dx * length, y: height / 2 - dy * length },
    end: { x: width / 2 + dx * length, y: height / 2 + dy * length },
    center: { x: width / 2, y: height / 2 }, radius: Math.hypot(width, height) / 2,
  };
}
