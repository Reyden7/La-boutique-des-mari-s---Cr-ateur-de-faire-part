import { PREVIEW_DEVICES } from "../config/previewDevices.ts";
import type { EditorElement, ImageAppearanceConfig, ResponsiveElementLayout, ResponsiveVisualStyle, SectionEdgeConfig, WeddingProject } from "../types/editor";
import { getElementLayout } from "./responsiveLayout.ts";
import { getRsvpBlockHeight, getRsvpPositionX, getRsvpPositionY, getRsvpWidth } from "./documentLayout.ts";
import { getRsvpSectionId, isRsvpVisibleOnDevice } from "../features/rsvp/rsvpEditorElement.ts";
import { resolveImageAppearance } from "./imageAppearance.ts";
import { resolveImageTransform } from "./imageLayout.ts";
import { getCalendarLayout } from "./calendarLayout.ts";
import { DEFAULT_SCHEDULE_STYLE } from "../config/scheduleStyle.ts";

export type TransferTarget = "tablet" | "desktop";
export const TRANSFER_TARGETS: TransferTarget[] = ["tablet", "desktop"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const font = (size: number, scale: number, maximum = 128) => clamp(finite(size, 16) * scale, 4, maximum);
const edge = (value: SectionEdgeConfig | undefined, scale: number) => value && ({ ...value, height: clamp(value.height * scale, 0, 240) });
const imageAppearance = (value: ImageAppearanceConfig, scale: number): ImageAppearanceConfig => ({
  topEdge: edge(value.topEdge, scale), bottomEdge: edge(value.bottomEdge, scale),
  topFade: value.topFade && { ...value.topFade, height: value.topFade.height * scale, blur: Math.min(32, value.topFade.blur * scale) },
  bottomFade: value.bottomFade && { ...value.bottomFade, height: value.bottomFade.height * scale, blur: Math.min(32, value.bottomFade.blur * scale) },
});

function visualStyle(element: EditorElement, scale: number, box: { width: number; height: number }): ResponsiveVisualStyle {
  const result: ResponsiveVisualStyle = {};
  // Pixel-only appearance. Ratios, colours, content, animation timings and URLs
  // deliberately never participate in this mapping.
  for (const key of ["letterSpacing", "padding", "cornerRadius", "strokeWidth", "borderWidth", "borderRadius", "textOffsetX", "textOffsetY"] as const) {
    if (key in element) result[key] = finite((element as unknown as Record<string, number>)[key]) * scale;
  }
  if (element.type === "button" || element.type === "scratch" || element.type === "icon") result.fontSize = font(element.fontSize ?? (element.type === "scratch" ? 16 : 13), scale, element.type === "icon" ? 128 : 48);
  if (element.type === "schedule") {
    result.iconSize = font(element.iconSize ?? (element.orientation === "horizontal" ? 32 : 24), scale, 128);
    result.spacingScale = Math.min(3, scale);
  }
  if (element.type === "scratch" && element.scratchIndicator) result.scratchIndicator = { ...element.scratchIndicator,
    size: font(element.scratchIndicator.size, scale, 128), x: element.scratchIndicator.x * scale, y: element.scratchIndicator.y * scale };
  if (element.type === "image" && element.imageStyle?.frame) {
    const frame = element.imageStyle.frame;
    result.frame = { ...frame, width: frame.width * scale, radius: frame.radius * scale, shadowBlur: frame.shadowBlur * scale, shadowDistance: frame.shadowDistance * scale };
  }
  if (element.type === "location") result.locationScale = scale;
  if (element.type === "countdown") {
    result.numberFontSize = font(element.numberFontSize ?? 64, scale, 400);
    result.labelFontSize = font(element.labelFontSize ?? 20, scale, 200);
    result.gap = finite(element.gap, 6) * scale;
  }
  if (element.type === "calendar") {
    // Calendar already scales its entire design scene to its box. Scaling its
    // design-unit fonts again would double the adaptation; only cap extremes.
    const scene = getCalendarLayout(element, box);
    result.titleFontSize = Math.min(element.titleFontSize, 128 / scene.scale);
    result.numbersFontSize = Math.min(element.numbersFontSize, 64 / scene.scale);
    result.weekdaysFontSize = Math.min(element.weekdaysFontSize ?? 10, 40 / scene.scale);
  }
  return result;
}

function transferElement(element: EditorElement, target: TransferTarget, welcome = false): EditorElement {
  const source = getElementLayout(element, "mobile");
  const canvas = PREVIEW_DEVICES[target];
  const scale = canvas.width / PREVIEW_DEVICES.mobile.width;
  let width = clamp(finite(source.width, 12) * scale, 12, canvas.width);
  let height = Math.max(12, finite(source.height, 12) * scale);
  // Oversized source boxes are reduced uniformly, never stretched.
  const reduction = width / Math.max(12, finite(source.width, 12) * scale);
  height *= reduction;
  if (welcome && height > canvas.height) { width *= canvas.height / height; height = canvas.height; }
  const x = clamp(finite(source.x) * scale, 0, canvas.width - width);
  const y = welcome ? clamp(finite(source.y) * scale, 0, canvas.height - height) : Math.max(0, finite(source.y) * scale);
  const layout: ResponsiveElementLayout = {
    x, y, width, height, rotation: source.rotation, visible: source.visible, zIndex: source.zIndex, sectionId: source.sectionId,
    visualStyle: visualStyle(element, scale * reduction, { width, height }),
    ...(element.type === "text" ? { fontSize: font(source.fontSize ?? element.fontSize, scale) } : {}),
    ...(element.type === "schedule" ? {
      timeFontSize: font(source.timeFontSize ?? DEFAULT_SCHEDULE_STYLE.timeFontSize, scale, 64), titleFontSize: font(source.titleFontSize ?? DEFAULT_SCHEDULE_STYLE.titleFontSize, scale, 72),
      descriptionFontSize: font(source.descriptionFontSize ?? DEFAULT_SCHEDULE_STYLE.descriptionFontSize, scale, 48), stepGap: Math.min(120, (source.stepGap ?? 16) * scale),
    } : {}),
    ...(element.type === "section" ? { isLastSection: source.isLastSection, topEdge: edge(source.topEdge, scale), bottomEdge: edge(source.bottomEdge, scale) } : {}),
  };
  return { ...element, responsive: { ...element.responsive, [target]: layout },
    ...(element.type === "image" ? { imageStyle: { ...element.imageStyle, responsive: { ...element.imageStyle?.responsive,
      [target]: { ...resolveImageTransform(element, "mobile"), appearance: imageAppearance(resolveImageAppearance(element, "mobile"), scale) } } } } : {}),
  } as EditorElement;
}

/** Pure, whole-project visual transfer. Smartphone/base fields remain untouched. */
export function transferMobileLayouts(source: WeddingProject, requested: readonly TransferTarget[]): WeddingProject {
  const targets = [...new Set(requested.filter((target) => TRANSFER_TARGETS.includes(target)))];
  const project = structuredClone(source);
  for (const target of targets) {
    project.pages = project.pages.map((page) => ({ ...page, elements: page.elements.map((element) => transferElement(element, target)) }));
    if (project.introductionMode === "welcome" && project.welcomePage) project.welcomePage.elements = project.welcomePage.elements.map((element) => transferElement(element, target, true));
    if (project.rsvp) {
      const config = project.rsvp;
      const scale = PREVIEW_DEVICES[target].width / PREVIEW_DEVICES.mobile.width;
      const width = Math.min(PREVIEW_DEVICES[target].width, getRsvpWidth(config, "mobile") * scale);
      const page = source.pages[0];
      config.responsive = { ...config.responsive, [target]: {
        x: clamp(getRsvpPositionX(config, "mobile") * scale, 0, PREVIEW_DEVICES[target].width - width),
        y: page ? getRsvpPositionY(page, config, "mobile") * scale : 0, width,
        height: getRsvpBlockHeight(config, "mobile") * scale,
        sectionId: getRsvpSectionId(config, "mobile"), visible: isRsvpVisibleOnDevice(config, "mobile"),
        formTypography: { ...config.typography, titleFontSize: font(config.typography?.titleFontSize ?? 34, scale, 96),
          labelFontSize: font(config.typography?.labelFontSize ?? 11, scale, 32), fieldFontSize: font(config.typography?.fieldFontSize ?? 13, scale, 36) },
        formSpacingScale: Math.min(3, scale),
      } };
      // RSVP visibility also has an older explicit map which takes precedence.
      config.visibilityByDevice = { ...config.visibilityByDevice, [target]: isRsvpVisibleOnDevice(config, "mobile") };
    }
  }
  return project;
}

/** Normalization creates inherited overrides too: warn for real differences,
 * not just for the existence of a materialized tablet/desktop object.
 */
export function getCustomizedTransferTargets(project: WeddingProject, requested: readonly TransferTarget[]): TransferTarget[] {
  const elements = [...project.pages.flatMap((page) => page.elements), ...(project.introductionMode === "welcome" ? project.welcomePage?.elements ?? [] : [])];
  return requested.filter((target) => {
    if (elements.some((element) => {
      const base = getElementLayout(element, "mobile"), current = getElementLayout(element, target);
      if (JSON.stringify(base) !== JSON.stringify(current)) return true;
      if (element.responsive?.[target]?.visualStyle) return true;
      return element.type === "image" && (JSON.stringify(resolveImageTransform(element, "mobile")) !== JSON.stringify(resolveImageTransform(element, target))
        || JSON.stringify(resolveImageAppearance(element, "mobile")) !== JSON.stringify(resolveImageAppearance(element, target)));
    })) return true;
    const config = project.rsvp, layout = config?.responsive?.[target];
    if (!config) return false;
    if (layout?.formTypography || layout?.formSpacingScale) return true;
    if (getRsvpSectionId(config, target) !== getRsvpSectionId(config, "mobile") || isRsvpVisibleOnDevice(config, target) !== isRsvpVisibleOnDevice(config, "mobile")) return true;
    return !!layout && (["x", "y", "width", "height"] as const).some((key) => layout[key] !== undefined && layout[key] !== ({ x: getRsvpPositionX(config, "mobile"), y: project.pages[0] ? getRsvpPositionY(project.pages[0], config, "mobile") : 0,
      width: getRsvpWidth(config, "mobile"), height: getRsvpBlockHeight(config, "mobile") })[key]);
  });
}
