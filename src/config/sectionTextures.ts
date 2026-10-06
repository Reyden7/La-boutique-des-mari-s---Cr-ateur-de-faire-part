import type { SectionElement } from "../types/editor";
import { parseColorWithAlpha } from "../utils/color.ts";

// Self-contained, lightweight SVG images: no external requests, fonts or assets.
// Each seed is stable so Editor, Preview and Public use exactly the same bitmap.
const texture = (seed: number, base: string, frequency: string, relief = "") =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".19"/></feComponentTransfer></filter></defs><rect width="256" height="256" fill="${base}"/><rect width="256" height="256" filter="url(#grain)"/>${relief}</svg>`)}`;

export const SECTION_TEXTURES = [
  { id: "soft-paper", name: "Papier doux", url: texture(3, "#f5f0e6", ".16") },
  { id: "crumpled-paper", name: "Papier froissé", url: texture(7, "#f3eee5", ".025 .055", '<path d="M0 42L256 130M28 0L115 256M0 211L256 63" stroke="#968778" stroke-opacity=".12" stroke-width="3"/><path d="M0 45L256 133M31 0L118 256" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>') },
  { id: "watercolor-paper", name: "Papier aquarelle", url: texture(13, "#f2efe7", ".035") },
  { id: "vintage-paper", name: "Papier vintage", url: texture(19, "#e5d5b7", ".075 .1") },
  { id: "light-grain", name: "Grain léger", url: texture(23, "#f3f0e9", ".35") },
  { id: "canvas", name: "Toile / canvas", url: texture(29, "#eae4d8", ".3", '<defs><pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0H6M0 0V6" stroke="#756959" stroke-opacity=".14" stroke-width=".6"/><path d="M0 2H6M2 0V6" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/></pattern></defs><rect width="256" height="256" fill="url(#weave)"/>') },
  { id: "soft-cloud", name: "Nuage doux", url: texture(31, "#f1eee8", ".009") },
  { id: "organic", name: "Texture organique", url: texture(37, "#e9e5d9", ".018 .07") },
  { id: "fine-noise", name: "Bruit fin", url: texture(41, "#f4f2ed", ".7") },
  { id: "parchment", name: "Parchemin", url: texture(43, "#e4cfa9", ".02 .04") },
  { id: "wet-paper", name: "Papier humide", url: texture(47, "#eae8e0", ".012 .025", '<ellipse cx="100" cy="128" rx="90" ry="75" fill="#b7c1b7" opacity=".08"/><ellipse cx="210" cy="55" rx="60" ry="50" fill="#fff" opacity=".18"/>') },
] as const;

const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const materialCache = new Map<string, string>();

/** Both renderers use this completed surface. Neutral luminance modulates RGB
 * by a common scalar, preserving hue instead of overlaying beige paper.
 * No pixel loops per frame; alpha is applied once to the completed surface.
 */
function materialSurface(preset: typeof SECTION_TEXTURES[number], color: string, strength: number, width: number, height: number, size: number, fit: string, x: number, y: number) {
  const { hex, alpha } = parseColorWithAlpha(color);
  const key = JSON.stringify([preset.id, hex, alpha, strength, width, height, size, fit]);
  const cached = materialCache.get(key);
  if (cached) return cached;
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const maxLight = Math.min(1.18, 1 / Math.max(...rgb, .001));
  const factors = [.82, .82, .82, .88, 1, 1.12, 1.18, 1.18, 1.18]
    .map((factor) => 1 + strength * (Math.min(factor, maxLight) - 1));
  const transfer = rgb.map((channel, index) => `<feFunc${["R", "G", "B"][index]} type="table" tableValues="${factors.map((factor) => (channel * factor).toFixed(6)).join(" ")}"/>`).join("");
  const source = decodeURIComponent(preset.url.slice(preset.url.indexOf(",") + 1))
    .replace(/(<rect width="256" height="256" fill=")[^"]+("\/?>)/, "$1#808080$2");
  const inner = source.slice(source.indexOf(">") + 1, source.lastIndexOf("</svg>"));
  const tinted = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><filter id="material" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer>${transfer}<feFuncA type="table" tableValues="1 1"/></feComponentTransfer></filter></defs><g filter="url(#material)">${inner}</g></svg>`);
  const pattern = fit === "repeat" ? `<defs><pattern id="tile" patternUnits="userSpaceOnUse" width="${size}" height="${size}"><image href="${tinted}" width="${size}" height="${size}"/></pattern></defs>` : "";
  const overlay = fit === "repeat" ? `<rect width="${width}" height="${height}" fill="url(#tile)"/>` : `<image href="${tinted}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
  const result = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${pattern}<g opacity="${alpha}"><rect width="${width}" height="${height}" fill="${hex}"/>${overlay}</g></svg>`);
  if (materialCache.size >= 64) materialCache.delete(materialCache.keys().next().value!);
  materialCache.set(key, result);
  return result;
}

export function resolveSectionTexture(section: Pick<SectionElement, "backgroundType" | "textureId" | "textureOpacity" | "textureScale" | "textureFit"> & { background?: SectionElement["background"] }, width: number, height: number) {
  const preset = SECTION_TEXTURES.find((item) => item.id === section.textureId);
  const enabled = section.backgroundType === "texture" || section.backgroundType === "color-texture";
  const scale = Math.max(.125, Math.min(4, finite(section.textureScale, 1)));
  const fit = section.textureFit === "cover" || section.textureFit === "contain" ? section.textureFit : "repeat";
  const w = Math.max(1, width), h = Math.max(1, height);
  const size = (fit === "repeat" ? 256 : fit === "cover" ? Math.max(w, h) : Math.min(w, h)) * scale;
  const opacity = Math.max(0, Math.min(1, finite(section.textureOpacity, .3)));
  const x = fit === "repeat" ? 0 : (w - size) / 2;
  const y = fit === "repeat" ? 0 : (h - size) / 2;
  return {
    preset: enabled ? preset : undefined,
    opacity,
    materialSrc: section.backgroundType === "color-texture" && preset
      ? materialSurface(preset, section.background?.color ?? "#f7f1eb", opacity, w, h, size, fit, x, y) : undefined,
    scale, fit, size,
    x, y,
    showBase: section.backgroundType !== "texture",
  };
}
