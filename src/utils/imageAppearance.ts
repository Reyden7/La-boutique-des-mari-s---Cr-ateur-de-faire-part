import type { PreviewDevice } from "../config/previewDevices";
import type { ImageAppearanceConfig, ImageElement, ImageFadeConfig, ImageFit, ImageTransformConfig } from "../types/editor";
import { getImageRenderLayout } from "./imageLayout";
import { getSectionShape, resolveSectionEdge } from "./sectionEdges";

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const resolveImageFade = (input?: Partial<ImageFadeConfig>): ImageFadeConfig => ({
  enabled: input?.enabled === true,
  height: clamp(finite(input?.height, 80), 0, 1000),
  intensity: clamp(finite(input?.intensity, .65), 0, 1),
  blur: clamp(finite(input?.blur, 6), 0, 24),
  opacity: clamp(finite(input?.opacity, 0), 0, 1),
});
export const normalizeImageAppearance = (input?: ImageAppearanceConfig) => ({
  topEdge: resolveSectionEdge(input?.topEdge), bottomEdge: resolveSectionEdge(input?.bottomEdge),
  topFade: resolveImageFade(input?.topFade), bottomFade: resolveImageFade(input?.bottomFade),
});
export type ResolvedImageAppearance = ReturnType<typeof normalizeImageAppearance>;
export const resolveImageAppearance = (element: ImageElement, device: PreviewDevice) => normalizeImageAppearance({
  ...element.imageStyle?.appearance,
  ...(device === "mobile" ? undefined : element.imageStyle?.responsive?.[device]?.appearance),
});

/** Freeze inherited sibling appearances before editing mobile; crop overrides are untouched. */
export function setImageAppearanceForDevice(element: ImageElement, device: PreviewDevice, changes: ImageAppearanceConfig): Pick<ImageElement, "imageStyle"> {
  const style = element.imageStyle ?? {};
  const appearance = { ...resolveImageAppearance(element, device), ...changes };
  if (device !== "mobile") return { imageStyle: { ...style, responsive: { ...style.responsive, [device]: { ...style.responsive?.[device], appearance } } } };
  return { imageStyle: { ...style, appearance, responsive: {
    ...style.responsive,
    tablet: { ...style.responsive?.tablet, appearance: resolveImageAppearance(element, "tablet") },
    desktop: { ...style.responsive?.desktop, appearance: resolveImageAppearance(element, "desktop") },
  } } };
}

export const hasImageAppearance = (appearance: ResolvedImageAppearance) =>
  [appearance.topEdge, appearance.bottomEdge].some((edge) => edge.enabled && edge.style !== "none" && edge.height > 0 && edge.intensity! > 0)
  || [appearance.topFade, appearance.bottomFade].some((fade) => fade.enabled && fade.height > 0 && fade.intensity > 0 && (fade.blur > 0 || fade.opacity < 1));

/** Effects follow the visible photo, not empty contain letterboxing. */
export function getImageAppearanceBounds(naturalWidth: number, naturalHeight: number, width: number, height: number, fit: ImageFit, transform: ImageTransformConfig) {
  const rendered = getImageRenderLayout(naturalWidth, naturalHeight, width, height, fit, transform);
  const x = Math.max(0, rendered.x), y = Math.max(0, rendered.y);
  return { x, y, width: Math.max(1, Math.min(width, rendered.x + rendered.width) - x), height: Math.max(1, Math.min(height, rendered.y + rendered.height) - y) };
}

/** Smoothstep has no abrupt slope at either end; intensity changes the curve, not global opacity. */
export function getImageFadeProgress(fade: ImageFadeConfig, progress: number) {
  if (!fade.enabled || fade.intensity === 0) return 0;
  const p = clamp(progress, 0, 1);
  return (p * p * (3 - 2 * p)) ** (1 + (1 - fade.intensity) * 3);
}
export const getImageFadeAlpha = (fade: ImageFadeConfig, progress: number) => 1 - (1 - fade.opacity) * getImageFadeProgress(fade, progress);

/** Bounded raster size, independent of drag/rotation/opacity/animation and browser zoom. */
export function getImageCompositeSize(width: number, height: number) {
  const w = Math.max(1, finite(width, 1)), h = Math.max(1, finite(height, 1));
  const scale = Math.min(2, 4096 / Math.max(w, h), Math.sqrt(2_000_000 / (w * h)));
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}

/** Same photo pixels for DOM and Konva. No readback, filter cache, or per-frame recompositing.
 * The frame stays outside the photo. Alpha holes stay holes; blur cannot spill beyond the silhouette.
 */
export function composeImageAppearance(image: HTMLImageElement, width: number, height: number, fit: ImageFit, transform: ImageTransformConfig, appearance: ResolvedImageAppearance): HTMLCanvasElement {
  const size = getImageCompositeSize(width, height);
  const make = () => { const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height; return canvas; };
  const result = make(), source = make(), strip = make();
  const sx = size.width / width, sy = size.height / height;
  const context = result.getContext("2d")!, raw = source.getContext("2d")!, buffer = strip.getContext("2d")!;
  const bounds = getImageAppearanceBounds(image.naturalWidth, image.naturalHeight, width, height, fit, transform);
  const rendered = getImageRenderLayout(image.naturalWidth, image.naturalHeight, width, height, fit, transform);
  const shape = getSectionShape(bounds.width, bounds.height, appearance.topEdge, appearance.bottomEdge);
  raw.save(); raw.scale(sx, sy); raw.beginPath();
  shape.points.forEach(([x, y], i) => i ? raw.lineTo(bounds.x + x, bounds.y + y) : raw.moveTo(bounds.x + x, bounds.y + y));
  raw.closePath(); raw.clip();
  raw.translate(rendered.x + (transform.flipX ? rendered.width : 0), rendered.y + (transform.flipY ? rendered.height : 0));
  raw.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  raw.drawImage(image, 0, 0, rendered.width, rendered.height); raw.restore();
  context.drawImage(source, 0, 0);

  // Blur the already cropped/flipped/masked source, then blend it only into the fading strips.
  // source-atop preserves the original silhouette, including a transparent PNG's alpha holes.
  for (const [side, fade] of [["top", appearance.topFade], ["bottom", appearance.bottomFade]] as const) {
    if (!fade.enabled || fade.height <= 0 || fade.intensity <= 0) continue;
    const depth = Math.min(fade.height, bounds.height);
    const start = (side === "top" ? bounds.y : bounds.y + bounds.height - depth) * sy;
    const end = start + depth * sy;
    const gradient = (alpha: (p: number) => number) => {
      const g = buffer.createLinearGradient(0, start, 0, end);
      for (let i = 0; i <= 32; i++) g.addColorStop(i / 32, `rgba(255,255,255,${alpha(side === "top" ? 1 - i / 32 : i / 32)})`);
      return g;
    };
    if (fade.blur > 0) {
      buffer.clearRect(0, 0, size.width, size.height);
      buffer.filter = `blur(${fade.blur * Math.min(sx, sy)}px)`;
      buffer.drawImage(source, 0, 0); buffer.filter = "none";
      buffer.globalCompositeOperation = "destination-in";
      buffer.fillStyle = gradient((p) => getImageFadeProgress(fade, p));
      buffer.fillRect(0, start, size.width, end - start);
      // destination-in only touches the painted strip, so explicitly clear everything else.
      buffer.clearRect(0, 0, size.width, start); buffer.clearRect(0, end, size.width, size.height - end);
      buffer.globalCompositeOperation = "source-over";
      context.globalCompositeOperation = "source-atop"; context.drawImage(strip, 0, 0);
      context.globalCompositeOperation = "source-over";
    }
  }
  // Apply both alpha gradients last. Their overlap multiplies naturally and deterministically.
  for (const [side, fade] of [["top", appearance.topFade], ["bottom", appearance.bottomFade]] as const) {
    if (!fade.enabled || fade.height <= 0 || fade.intensity <= 0) continue;
    const depth = Math.min(fade.height, bounds.height);
    const start = (side === "top" ? bounds.y : bounds.y + bounds.height - depth) * sy;
    const gradient = context.createLinearGradient(0, start, 0, start + depth * sy);
    for (let i = 0; i <= 32; i++) gradient.addColorStop(i / 32, `rgba(255,255,255,${getImageFadeAlpha(fade, side === "top" ? 1 - i / 32 : i / 32)})`);
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = gradient; context.fillRect(0, 0, size.width, size.height);
    context.globalCompositeOperation = "source-over";
  }
  // Release temporary pixel buffers immediately; only the final photo stays attached to the renderer.
  source.width = 0; strip.width = 0;
  return result;
}
