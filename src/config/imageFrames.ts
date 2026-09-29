import type { ImageFrameConfig, ImageFrameType } from "../types/editor";

export interface ImageFramePreset {
  id: ImageFrameType;
  name: string;
  defaults: Partial<ImageFrameConfig>;
}

export const DEFAULT_IMAGE_FRAME: ImageFrameConfig = {
  enabled: false,
  type: "simple",
  color: "#fffaf5ff",
  width: 6,
  radius: 0,
  opacity: 1,
  borderStyle: "solid",
  shadowEnabled: false,
  shadowBlur: 12,
  shadowOpacity: 0.22,
  shadowDistance: 5,
};

export const IMAGE_FRAME_PRESETS: ImageFramePreset[] = [
  { id: "simple", name: "Simple", defaults: { color: "#fffaf5ff", width: 6, radius: 0, borderStyle: "solid" } },
  { id: "thin", name: "Fin élégant", defaults: { color: "#f8f1e9ff", width: 3, radius: 1, borderStyle: "solid" } },
  { id: "thick", name: "Épais", defaults: { color: "#fffaf5ff", width: 14, radius: 2, borderStyle: "solid" } },
  { id: "double", name: "Double", defaults: { color: "#e8d8caff", width: 9, radius: 2, borderStyle: "double" } },
  { id: "rounded", name: "Arrondi", defaults: { color: "#fffaf5ff", width: 7, radius: 28, borderStyle: "solid" } },
  { id: "polaroid", name: "Polaroid", defaults: { color: "#fffdfaff", width: 10, radius: 2, shadowEnabled: true, shadowBlur: 14, shadowOpacity: .2, shadowDistance: 6 } },
  { id: "classic", name: "Photo classique", defaults: { color: "#efe6dcff", width: 10, radius: 2, borderStyle: "solid", shadowEnabled: true } },
  { id: "gold", name: "Doré", defaults: { color: "#c9a44fff", width: 9, radius: 2, borderStyle: "solid", shadowEnabled: true } },
  { id: "silver", name: "Argenté", defaults: { color: "#c6c9ceff", width: 9, radius: 2, borderStyle: "solid", shadowEnabled: true } },
  { id: "wood-light", name: "Bois clair", defaults: { color: "#c9a277ff", width: 12, radius: 2, borderStyle: "solid", shadowEnabled: true } },
  { id: "wood-dark", name: "Bois foncé", defaults: { color: "#684834ff", width: 12, radius: 2, borderStyle: "solid", shadowEnabled: true } },
  { id: "vintage", name: "Vintage", defaults: { color: "#947557ff", width: 11, radius: 3, borderStyle: "double", shadowEnabled: true } },
  { id: "wedding-floral", name: "Fleuri / mariage", defaults: { color: "#fff9f1ff", width: 13, radius: 10, borderStyle: "solid", shadowEnabled: true, shadowOpacity: .16 } },
];

export const resolveImageFrame = (frame?: Partial<ImageFrameConfig>): ImageFrameConfig => ({
  ...DEFAULT_IMAGE_FRAME,
  ...frame,
  enabled: frame?.enabled ?? false,
});

export const applyImageFramePreset = (current: ImageFrameConfig, type: ImageFrameType): ImageFrameConfig => {
  const preset = IMAGE_FRAME_PRESETS.find((item) => item.id === type);
  return { ...current, ...preset?.defaults, enabled: true, type };
};

export interface ImageFrameMetrics {
  top: number;
  right: number;
  bottom: number;
  left: number;
  outerRadius: number;
  innerRadius: number;
}

export const getImageFrameMetrics = (
  frame: ImageFrameConfig,
  elementWidth: number,
  elementHeight: number,
): ImageFrameMetrics => {
  const maximum = Math.max(1, Math.min(elementWidth, elementHeight) * .24);
  const base = Math.min(maximum, Math.max(1, frame.width));
  const classic = frame.type === "classic" ? Math.min(maximum, base * 1.35) : base;
  const side = frame.type === "polaroid" ? Math.min(maximum, Math.max(7, base)) : classic;
  const bottom = frame.type === "polaroid"
    ? Math.min(Math.max(side, elementHeight * .3), Math.max(side * 2.8, side + 18))
    : classic;
  const outerRadius = Math.max(0, frame.radius);
  const innerRadius = Math.max(0, outerRadius - Math.min(side, classic));
  return { top: side, right: side, bottom, left: side, outerRadius, innerRadius };
};

type FramePalette = { stops: Array<[number, string]>; angle: number };

const solid = (color: string): FramePalette => ({ stops: [[0, color], [1, color]], angle: 135 });

export const getImageFramePalette = (frame: ImageFrameConfig): FramePalette => {
  switch (frame.type) {
    case "gold": return { stops: [[0, "#80601f"], [.18, "#f5df91"], [.45, "#b98c32"], [.72, "#f8e6a8"], [1, "#8c6824"]], angle: 135 };
    case "silver": return { stops: [[0, "#777d84"], [.2, "#f4f5f6"], [.48, "#b6bbc1"], [.72, "#ffffff"], [1, "#858b92"]], angle: 135 };
    case "wood-light": return { stops: [[0, "#9d724c"], [.18, "#d6b184"], [.38, "#b98e61"], [.63, "#e2c499"], [.82, "#ad7d52"], [1, "#d3ad7e"]], angle: 90 };
    case "wood-dark": return { stops: [[0, "#38271f"], [.18, "#76513a"], [.4, "#4d3328"], [.66, "#896044"], [.84, "#422c23"], [1, "#6e4935"]], angle: 90 };
    case "vintage": return { stops: [[0, "#5e4635"], [.25, "#b3936e"], [.5, "#74583f"], [.76, "#c5a985"], [1, "#624936"]], angle: 135 };
    case "classic": return { stops: [[0, "#c9b9aa"], [.18, frame.color], [.5, "#fffaf4"], [.82, frame.color], [1, "#bca999"]], angle: 135 };
    case "wedding-floral": return { stops: [[0, "#eaded1"], [.2, frame.color], [.8, frame.color], [1, "#decbbb"]], angle: 135 };
    default: return solid(frame.color);
  }
};

export const imageFrameCssBackground = (frame: ImageFrameConfig) => {
  const palette = getImageFramePalette(frame);
  return `linear-gradient(${palette.angle}deg, ${palette.stops.map(([position, color]) => `${color} ${position * 100}%`).join(", ")})`;
};
