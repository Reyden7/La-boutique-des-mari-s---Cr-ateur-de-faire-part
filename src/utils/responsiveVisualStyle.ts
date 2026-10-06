import type { PreviewDevice } from "../config/previewDevices.ts";
import type { EditorElement, RsvpFormConfig } from "../types/editor";

/** The same device-local appearance is consumed by Konva and the DOM renderers.
 * Assignment, not multiplication, makes this safe at nested renderer boundaries.
 * Neither the source element nor any business/content data is mutated.
 */
export function resolveElementVisualStyle<T extends EditorElement>(element: T, device: PreviewDevice): T {
  const style = device === "mobile" ? undefined : element.responsive?.[device]?.visualStyle;
  if (!style) return element;
  const { frame, locationScale: _locationScale, spacingScale: _spacingScale, ...properties } = style;
  return {
    ...element,
    ...properties,
    ...(element.type === "image" && frame ? { imageStyle: { ...element.imageStyle, frame } } : {}),
  } as T;
}

export function resolveRsvpTypography(config: RsvpFormConfig | undefined, device: PreviewDevice) {
  return device === "mobile" ? config?.typography : config?.responsive?.[device]?.formTypography ?? config?.typography;
}

export const getFormSpacingScale = (config: RsvpFormConfig, device: PreviewDevice) =>
  device === "mobile" ? 1 : Math.max(1, Math.min(4, config.responsive?.[device]?.formSpacingScale ?? 1));
