import type { ScheduleElement, ProgramStepIcon } from "../types/editor";
import type { ResolvedElementLayout } from "./responsiveLayout";
import { DEFAULT_SCHEDULE_STYLE, resolveScheduleTypography } from "../config/scheduleStyle.ts";
import { getProgramIconKey, resolveProgramStepIcon } from "../features/elements/programIconModel.ts";

export type ScheduleTextRole = "time" | "title" | "description";
export interface ScheduleTextBox {
  role: ScheduleTextRole; text: string; x: number; y: number; width: number; height: number;
  fontSize: number; fontFamily: string; bold: boolean; lineHeight: number; align: "left" | "center" | "right";
}
export interface ScheduleStepLayout {
  id: string; x: number; y: number; width: number; height: number;
  icon?: { id: string; source: ProgramStepIcon; x: number; y: number; size: number };
  marker?: { x: number; y: number; size: number; diamond: boolean };
  text: ScheduleTextBox[];
}
export interface ScheduleLayout {
  orientation: "vertical" | "horizontal"; width: number; height: number; minimumHeight: number; columns: number;
  stepGap: number;
  steps: ScheduleStepLayout[]; lines: number[][];
}
export const resolveScheduleOrientation = (element: Pick<ScheduleElement, "orientation">) => element.orientation === "horizontal" ? "horizontal" : "vertical";
let context: CanvasRenderingContext2D | null | undefined;
const measure = (text: string, size: number, family: string, bold: boolean) => {
  if (typeof document !== "undefined") {
    context ??= document.createElement("canvas").getContext("2d");
    if (context) { context.font = `${bold ? "bold" : "normal"} ${size}px "${family}"`; return context.measureText(text).width; }
  }
  return Array.from(text).length * size * .6;
};

/** Shared logical font measurement for composed text elements. */
export const measureScheduleText = (text: string, size: number, family: string, bold = false) => measure(text, size, family, bold);

/** Pre-wrap once in logical pixels; DOM and Konva receive the same line breaks. */
export function wrapScheduleText(text: string, width: number, size: number, family: string, bold: boolean) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (measure(line ? `${line} ${word}` : word, size, family, bold) <= width) { line = line ? `${line} ${word}` : word; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of Array.from(word)) {
        if (line && measure(line + char, size, family, bold) > width) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** No project writes: an undersized box has a safe computed content minimum. */
export function getScheduleLayout(element: ScheduleElement, layout: Pick<ResolvedElementLayout, "width" | "height" | "timeFontSize" | "titleFontSize" | "descriptionFontSize" | "stepGap" | "visualStyle">): ScheduleLayout {
  const orientation = resolveScheduleOrientation(element);
  const items = Array.isArray(element.items) ? element.items : [];
  const width = Math.max(12, layout.width);
  const spacing = Math.max(1, Math.min(3, layout.visualStyle?.spacingScale ?? 1));
  const padding = Math.min(DEFAULT_SCHEDULE_STYLE.contentPadding * spacing, width * .08);
  const innerWidth = Math.max(1, width - padding * 2);
  const typography = resolveScheduleTypography(element, layout as ResolvedElementLayout);
  const size = (role: ScheduleTextRole) => {
    const value = typography[`${role}FontSize`];
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SCHEDULE_STYLE[`${role}FontSize`];
  };
  const elegant = element.displayStyle === "elegant";
  const hasLine = element.displayStyle !== "list";
  const configuredGap = layout.stepGap ?? element.stepGap;
  const requestedGap = Number.isFinite(configuredGap) ? Math.max(0, configuredGap!) : 16;
  const columns = orientation === "horizontal"
    ? element.wrapSteps === true
      ? Math.min(Math.max(1, items.length), Math.max(1, Math.floor((innerWidth + requestedGap) / (Math.max(120, size("title") * 7, size("time") * 6) + requestedGap))))
      : Math.max(1, items.length)
    : 1;
  // Cap horizontal gaps, never crop stages or silently put them on a second row.
  const minimumColumnWidth = Math.min(innerWidth / columns, Math.max(24, size("time") * 2.4, size("title") * 1.5));
  const columnGap = columns > 1 ? Math.min(requestedGap, Math.max(0, (innerWidth - columns * minimumColumnWidth) / (columns - 1))) : requestedGap;
  const columnWidth = (innerWidth - (columns - 1) * columnGap) / columns;
  const requestedIconSize = Number.isFinite(element.iconSize) && element.iconSize! > 0 ? Math.min(128, element.iconSize!) : orientation === "vertical" ? 24 : 32;
  const verticalIconSize = Math.min(requestedIconSize, innerWidth * .18);
  const horizontalIconSize = Math.min(requestedIconSize, columnWidth * .65);
  const anyIcons = items.some((item) => resolveProgramStepIcon(item.icon));
  const steps: ScheduleStepLayout[] = [];
  const lines: number[][] = [];
  const makeText = (role: ScheduleTextRole, text: string, x: number, y: number, boxWidth: number, align: ScheduleTextBox["align"]): ScheduleTextBox => {
    const fontFamily = role === "time" ? elegant ? "Cormorant Garamond" : "Montserrat" : role === "title" ? "Cormorant Garamond" : "Lora";
    const bold = role !== "description" && !elegant;
    const fontSize = size(role);
    const lineHeight = role === "time" ? 1.2 : role === "title" ? 1.05 : 1.35;
    const wrapped = wrapScheduleText(text, Math.max(1, boxWidth), fontSize, fontFamily, bold);
    return { role, text: wrapped, x, y, width: Math.max(1, boxWidth), height: wrapped.split("\n").length * fontSize * lineHeight, fontSize, fontFamily, bold, lineHeight, align };
  };
  if (orientation === "vertical") {
    for (const item of items) {
      const icon = resolveProgramStepIcon(item.icon);
      const iconSize = verticalIconSize;
      const leading = icon ? iconSize + 8 * spacing : hasLine && !elegant ? 22 * spacing : 0;
      const timeX = padding + leading;
      const timeWidth = elegant ? Math.max(1, width * .3 - leading) : Math.min(58 * spacing, innerWidth * .24);
      const copyX = elegant ? width * .44 : timeX + timeWidth + 8 * spacing;
      const copyWidth = Math.max(1, width - padding - copyX);
      const time = makeText("time", item.time, timeX, 0, timeWidth, elegant ? "right" : "left");
      const title = makeText("title", item.title, copyX, 0, copyWidth, "left");
      const description = item.description ? makeText("description", item.description, copyX, title.height + 4 * spacing, copyWidth, "left") : undefined;
      steps.push({ id: item.id, x: padding, y: 0, width: innerWidth, height: Math.max(time.height, description ? description.y + description.height : title.height, icon ? iconSize : 11),
        icon: icon ? { id: getProgramIconKey(icon), source: icon, x: padding, y: 0, size: iconSize } : undefined,
        marker: hasLine && (elegant || !icon) ? { x: elegant ? width * .38 : padding + 6, y: 7, size: elegant ? 9 : 10, diamond: elegant } : undefined,
        text: [time, title, ...(description ? [description] : [])] });
    }
  } else {
    const iconSize = horizontalIconSize;
    const leadingHeight = anyIcons ? iconSize + 8 * spacing : hasLine ? 20 * spacing : 0;
    items.forEach((item, index) => {
      const x = padding + (index % columns) * (columnWidth + columnGap);
      const icon = resolveProgramStepIcon(item.icon);
      const time = makeText("time", item.time, x, leadingHeight, columnWidth, "center");
      const title = makeText("title", item.title, x, time.y + time.height + 8 * spacing, columnWidth, "center");
      const description = item.description ? makeText("description", item.description, x, title.y + title.height + 4 * spacing, columnWidth, "center") : undefined;
      steps.push({ id: item.id, x, y: 0, width: columnWidth, height: description ? description.y + description.height : title.y + title.height,
        icon: icon ? { id: getProgramIconKey(icon), source: icon, x: x + (columnWidth - iconSize) / 2, y: 0, size: iconSize } : undefined,
        marker: hasLine && !icon ? { x: x + columnWidth / 2, y: anyIcons ? iconSize / 2 : 6, size: elegant ? 9 : 10, diamond: elegant } : undefined,
        text: [time, title, ...(description ? [description] : [])] });
    });
  }
  const rows = Array.from({ length: Math.ceil(steps.length / columns) }, (_, index) => steps.slice(index * columns, (index + 1) * columns));
  const rowHeights = rows.map((row) => Math.max(...row.map((step) => step.height)));
  const gap = orientation === "horizontal" ? Math.max(28, requestedGap) : requestedGap;
  const minimumHeight = padding * 2 + rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows.length - 1) * gap;
  const height = Math.max(Number.isFinite(layout.height) ? layout.height : 12, minimumHeight);
  // Preserve legacy vertical distribution; an explicit gap remains exact even in a tall box.
  const extraGap = orientation === "vertical" && configuredGap === undefined && rows.length > 1 ? (height - minimumHeight) / (rows.length - 1) : 0;
  let y = padding;
  rows.forEach((row, index) => {
    const offsetX = orientation === "horizontal" ? (columns - row.length) * (columnWidth + columnGap) / 2 : 0;
    row.forEach((step) => {
      step.x += offsetX;
      step.y = y;
      step.text.forEach((text) => { text.x += offsetX; text.y += y; });
      if (step.icon) { step.icon.x += offsetX; step.icon.y += y; }
      if (step.marker) { step.marker.x += offsetX; step.marker.y += y; }
    });
    if (orientation === "horizontal" && hasLine && row.length > 1) {
      const lineY = y + (anyIcons ? horizontalIconSize / 2 : 6);
      lines.push([row[0].x + columnWidth / 2, lineY, row[row.length - 1].x + columnWidth / 2, lineY]);
    }
    y += rowHeights[index] + gap + extraGap;
  });
  if (orientation === "vertical" && hasLine && steps.length) {
    const x = elegant ? width * .38 : padding + (anyIcons ? verticalIconSize / 2 : 6);
    const last = steps.at(-1)!;
    lines.push([x, padding, x, configuredGap === undefined ? height - padding : last.y + (last.icon ? last.icon.size / 2 : 7)]);
  }
  return { orientation, width, height, minimumHeight, columns, stepGap: orientation === "horizontal" ? columnGap : gap + extraGap, steps, lines };
}
