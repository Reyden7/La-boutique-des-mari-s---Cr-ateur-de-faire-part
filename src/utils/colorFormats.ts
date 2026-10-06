import { parseColorWithAlpha, toHex8, type ColorWithAlpha } from "./color.ts";

export const COLOR_FORMATS = ["HEX", "RGB", "RGBA", "HSL", "HSLA"] as const;
export type ColorFormat = typeof COLOR_FORMATS[number];
export type HsvColor = { h: number; s: number; v: number };
const clamp = (n: number, max = 1) => Math.max(0, Math.min(max, n));
const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
const hexFromRgb = (values: number[]) => `#${values.map((n) => Math.round(clamp(n, 255)).toString(16).padStart(2, "0")).join("")}`;
const round = (n: number) => Number(n.toFixed(3));

export function hexToHsv(hex: string): HsvColor {
  const [r, g, b] = rgb(hex).map((n) => n / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = delta === 0 ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: h * 60, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360 / 60;
  const c = clamp(v) * clamp(s), x = c * (1 - Math.abs(hue % 2 - 1)), m = clamp(v) - c;
  const values = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return hexFromRgb(values.map((n) => (n + m) * 255));
}

export function formatColor(color: ColorWithAlpha, format: ColorFormat): string {
  const [r, g, b] = rgb(color.hex);
  if (format === "HEX") return (color.alpha === 1 ? color.hex : toHex8(color.hex, color.alpha)).toUpperCase();
  if (format === "RGB") return `rgb(${r}, ${g}, ${b})`;
  if (format === "RGBA") return `rgba(${r}, ${g}, ${b}, ${round(color.alpha)})`;
  const hsv = hexToHsv(color.hex);
  const l = hsv.v * (1 - hsv.s / 2);
  const s = l === 0 || l === 1 ? 0 : (hsv.v - l) / Math.min(l, 1 - l);
  const parts = `${round(hsv.h)}, ${round(s * 100)}%, ${round(l * 100)}%`;
  return format === "HSL" ? `hsl(${parts})` : `hsla(${parts}, ${round(color.alpha)})`;
}

/** RGB/HSL without alpha preserve opacity; invalid drafts never become black. */
export function parseColorInput(input: string, currentAlpha = 1): ColorWithAlpha | null {
  const text = input.trim();
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)) return parseColorWithAlpha(text);
  const match = text.match(/^(rgb|rgba|hsl|hsla)\(([^)]+)\)$/i);
  if (!match) return null;
  const mode = match[1].toLowerCase(), parts = match[2].split(",").map((s) => s.trim());
  const hasAlpha = mode.endsWith("a");
  if (parts.length !== (hasAlpha ? 4 : 3)) return null;
  const number = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const alpha = hasAlpha && number.test(parts[3]) ? Number(parts[3]) : currentAlpha;
  if (hasAlpha && (!number.test(parts[3]) || alpha < 0 || alpha > 1)) return null;
  if (mode.startsWith("rgb")) {
    if (!parts.slice(0, 3).every((p) => number.test(p) && Number(p) >= 0 && Number(p) <= 255)) return null;
    return { hex: hexFromRgb(parts.slice(0, 3).map(Number)), alpha };
  }
  if (!number.test(parts[0]) || !Number.isFinite(Number(parts[0])) || !parts.slice(1, 3).every((p) => p.endsWith("%") && number.test(p.slice(0, -1)) && Number(p.slice(0, -1)) >= 0 && Number(p.slice(0, -1)) <= 100)) return null;
  const h = Number(parts[0]), s = Number(parts[1].slice(0, -1)) / 100, l = Number(parts[2].slice(0, -1)) / 100;
  const v = l + s * Math.min(l, 1 - l);
  return { hex: hsvToHex({ h, v, s: v === 0 ? 0 : 2 * (1 - l / v) }), alpha };
}
