import type { EnvelopeOffset } from "../../types/editor";
import type { DoorPart } from "./doorAssets";

export interface DoorImageMetrics {
  width: number; height: number;
  bounds: { x: number; y: number; width: number; height: number };
  bodyLeft: number; bodyRight: number;
}

/** One-off alpha analysis locates the panel body, excluding handles.
 * Original pixels are never changed, recoloured or converted into a mask. */
export function getDoorAlphaMetrics(width: number, height: number, pixels: ArrayLike<number>, sampleWidth = width, sampleHeight = height): DoorImageMetrics {
  let left = sampleWidth, top = sampleHeight, right = -1, bottom = -1;
  const coverage = new Array<number>(sampleWidth).fill(0);
  for (let y = 0; y < sampleHeight; y++) for (let x = 0; x < sampleWidth; x++) {
    if (pixels[(y * sampleWidth + x) * 4 + 3] < 128) continue;
    coverage[x]++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) return { width, height, bounds: { x: 0, y: 0, width, height }, bodyLeft: 0, bodyRight: width };
  const threshold = (bottom - top + 1) * .6;
  const body = coverage.map((value, index) => value >= threshold ? index : -1).filter((value) => value >= 0);
  const sx = width / sampleWidth, sy = height / sampleHeight;
  return { width, height, bounds: { x: left * sx, y: top * sy, width: (right - left + 1) * sx, height: (bottom - top + 1) * sy },
    bodyLeft: (body[0] ?? left) * sx, bodyRight: ((body.at(-1) ?? right) + 1) * sx };
}

export function measureDoorImage(image: HTMLImageElement): DoorImageMetrics {
  const width = image.naturalWidth, height = image.naturalHeight;
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 256 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return getDoorAlphaMetrics(width, height, context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } catch {
    return { width, height, bounds: { x: 0, y: 0, width, height }, bodyLeft: 0, bodyRight: width };
  }
}

export function getDoorRenderBox(viewportWidth: number, viewportHeight: number, metrics: DoorImageMetrics, part: DoorPart, offset: EnvelopeOffset = { x: 0, y: 0 }) {
  const scale = Math.max(viewportWidth / 2 / Math.max(1, metrics.bodyRight - metrics.bodyLeft), viewportHeight / Math.max(1, metrics.bounds.height));
  const seam = part === "left" ? metrics.bodyRight : metrics.bodyLeft;
  const x = viewportWidth / 2 - seam * scale + (part === "left" ? .5 : -.5) + viewportWidth * offset.x / 100;
  const y = (viewportHeight - metrics.bounds.height * scale) / 2 - metrics.bounds.y * scale + viewportHeight * offset.y / 100;
  const width = metrics.width * scale, height = metrics.height * scale;
  const travel = part === "left" ? -Math.max(0, x + width + 2) : Math.max(0, viewportWidth - x + 2);
  return { x, y, width, height, travel };
}

/** Child translations are local to the uniformly scaled group. At scale 1 this
 * is exactly the original travel; all scales/offsets clear the real viewport. */
export function getScaledDoorTravel(box: { x: number; width: number }, viewportWidth: number, part: DoorPart, scale: number) {
  const center = viewportWidth / 2;
  return part === "left"
    ? -Math.max(0, box.x + box.width - center + (center + 2) / scale)
    : Math.max(0, center + (center + 2) / scale - box.x);
}

const generated = new Map<string, string>();
export function getGeneratedDoorPng(part: DoorPart, primary = "#f4efe7", accent = "#b2905d", variant = "classic") {
  const key = JSON.stringify([part, primary, accent, variant]);
  if (generated.has(key)) return generated.get(key)!;
  const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 1000;
  const context = canvas.getContext("2d")!;
  context.fillStyle = primary; context.fillRect(0, 0, 400, 1000);
  context.strokeStyle = accent; context.lineWidth = 3; context.strokeRect(12, 12, 376, 976);
  if (variant === "classic") { context.strokeRect(32, 40, 336, 560); context.strokeRect(32, 640, 336, 320); }
  else { context.strokeRect(38, 38, 324, 924); context.lineWidth = 1; context.strokeRect(48, 48, 304, 904); }
  context.fillStyle = accent; context.beginPath(); context.arc(part === "left" ? 376 : 24, 540, 7, 0, Math.PI * 2); context.fill();
  const url = canvas.toDataURL("image/png");
  if (generated.size > 32) generated.clear();
  generated.set(key, url); return url;
}
