import type { CalendarElement, CalendarStyle, CalendarDecorationStyle } from "../types/editor";
import { wrapScheduleText } from "./scheduleLayout.ts";
import { getCalendarEventConfig } from "./calendarEvent.ts";

export const CALENDAR_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const CALENDAR_WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const CALENDAR_STYLES: ReadonlyArray<{ id: CalendarStyle; label: string }> = [
  { id: "minimal", label: "Minimal" }, { id: "elegant", label: "Carte élégante" },
  { id: "paper-note", label: "Papier / note collée" }, { id: "decorative-frame", label: "Cadre décoratif" }, { id: "romantic", label: "Romantique mariage" },
];
export const CALENDAR_DECORATIONS: ReadonlyArray<{ id: CalendarDecorationStyle; label: string }> = [
  { id: "none", label: "Aucune" }, { id: "floral", label: "Floral" }, { id: "ribbon", label: "Ruban / nœud" },
  { id: "hearts", label: "Petits cœurs" }, { id: "ornament", label: "Ornement élégant" }, { id: "torn-paper", label: "Papier déchiré" }, { id: "soft-frame", label: "Cadre doux / arrondi" },
];
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Gregorian grid, Monday first; UTC and setUTCFullYear avoid DST and years 1–99 quirks. */
export function getCalendarMonth(month: number, year: number, highlightedDay?: number | null) {
  const m = clamp(Math.trunc(finite(month, 8)), 1, 12), y = clamp(Math.trunc(finite(year, 2026)), 1, 9999);
  const first = new Date(0); first.setUTCFullYear(y, m - 1, 1); first.setUTCHours(0, 0, 0, 0);
  const last = new Date(first); last.setUTCMonth(m, 0);
  const days = last.getUTCDate(), offset = (first.getUTCDay() + 6) % 7;
  const rows = Math.ceil((offset + days) / 7);
  const highlighted = Number.isInteger(highlightedDay) && highlightedDay! >= 1 && highlightedDay! <= days ? highlightedDay! : null;
  return { month: m, year: y, days, offset, rows, highlightedDay: highlighted,
    cells: Array.from({ length: rows * 7 }, (_, index) => index >= offset && index < offset + days ? index - offset + 1 : null) };
}

export type CalendarShape = {
  kind: "rect" | "circle" | "path"; x?: number; y?: number; width?: number; height?: number; radius?: number;
  data?: string; fill: string; stroke?: string; strokeWidth?: number; opacity?: number;
};
export interface CalendarTextBox {
  role: "title" | "month" | "weekday" | "day" | "agenda-button"; day?: number; text: string; x: number; y: number; width: number; height: number;
  fontFamily: string; fontSize: number; color: string; align: "left" | "center" | "right"; bold?: boolean;
}
export const calendarHeartPath = (x: number, y: number, size: number) =>
  `M ${x} ${y + size * .42} C ${x - size * .9} ${y - size * .13} ${x - size * .44} ${y - size * .72} ${x} ${y - size * .32} C ${x + size * .44} ${y - size * .72} ${x + size * .9} ${y - size * .13} ${x} ${y + size * .42} Z`;

/** One logical scene for DOM and Konva. Fit uniformly within the requested box,
 * never stretch glyphs or silently grow the saved responsive geometry. */
export function getCalendarLayout(element: CalendarElement, box: { width: number; height: number }) {
  const calendar = getCalendarMonth(element.month, element.year, element.highlightedDay);
  const style = CALENDAR_STYLES.some((preset) => preset.id === element.style) ? element.style : "elegant";
  const decoration = CALENDAR_DECORATIONS.some((preset) => preset.id === element.decorationStyle) ? element.decorationStyle : "none";
  const width = Math.max(12, finite(box.width, 310)), height = Math.max(12, finite(box.height, 360));
  const designWidth = 320, pad = style === "decorative-frame" ? 34 : style === "minimal" ? 20 : 28;
  const inner = designWidth - 2 * pad, cellWidth = inner / 7;
  const titleFamily = element.titleFontFamily || "Cormorant Garamond", numbersFamily = element.numbersFontFamily || "Lora";
  const weekdaysFamily = element.weekdaysFontFamily || numbersFamily;
  const titleSize = clamp(finite(element.titleFontSize, 32), 4, 120);
  const numbersSize = Math.min(clamp(finite(element.numbersFontSize, 17), 4, 96), cellWidth * .6);
  const weekdaysSize = Math.min(clamp(finite(element.weekdaysFontSize, 10), 4, 64), cellWidth * .28);
  const titleColor = element.titleColor || "#493f39", numbersColor = element.numbersColor || "#493f39";
  const accent = element.accentColor || "#a9775a", decorColor = element.decorationColor || accent;
  const border = element.borderColor || "#d9c4b4";
  const title = wrapScheduleText(element.title || "", inner, titleSize, titleFamily, false);
  const text: CalendarTextBox[] = [], shapes: CalendarShape[] = [];
  let y = style === "paper-note" ? 42 : style === "romantic" ? 40 : 30;
  if (decoration === "ribbon") y = Math.max(y, 44);
  const addText = (value: CalendarTextBox) => text.push(value);
  if (title.trim()) {
    const h = title.split("\n").length * titleSize * 1.2;
    addText({ role: "title", text: title, x: pad, y, width: inner, height: h, fontFamily: titleFamily, fontSize: titleSize, color: titleColor, align: element.titleAlign || "center" }); y += h + 12;
  }
  const monthText = [element.showMonthLabel !== false ? CALENDAR_MONTHS[calendar.month - 1] : "", element.showYearLabel !== false ? String(calendar.year) : ""].filter(Boolean).join(" · ");
  if (monthText) {
    const size = style === "minimal" ? 16 : 21;
    addText({ role: "month", text: monthText, x: pad, y, width: inner, height: size * 1.2, fontFamily: titleFamily, fontSize: size, color: accent, align: "center" }); y += size * 1.2 + 16;
  }
  if (style === "elegant" || style === "decorative-frame") {
    shapes.push({ kind: "path", data: `M ${pad + 24} ${y - 5} H ${designWidth - pad - 24}`, fill: "transparent", stroke: border, strokeWidth: 1 });
  }
  if (element.showWeekdays !== false) {
    CALENDAR_WEEKDAYS.forEach((name, column) => addText({ role: "weekday", text: name, x: pad + column * cellWidth, y, width: cellWidth, height: weekdaysSize * 1.2, fontFamily: weekdaysFamily, fontSize: weekdaysSize, color: element.weekdaysColor || numbersColor, align: "center" }));
    y += weekdaysSize * 1.2 + 12;
  }
  const gridY = y, cellHeight = 38;
  calendar.cells.forEach((day, index) => {
    if (day === null) return;
    const column = index % 7, row = Math.floor(index / 7), x = pad + column * cellWidth, cy = gridY + row * cellHeight + cellHeight / 2, cx = x + cellWidth / 2;
    if (day === calendar.highlightedDay) {
      if (style === "romantic") shapes.push({ kind: "path", data: calendarHeartPath(cx, cy, Math.min(cellWidth, cellHeight) * .78), fill: "transparent", stroke: accent, strokeWidth: 1.8 });
      else if (style === "paper-note") shapes.push({ kind: "rect", x: x + 2, y: cy - 15, width: cellWidth - 4, height: 30, radius: 8, fill: accent, opacity: .22 });
      else shapes.push({ kind: "circle", x: cx, y: cy, radius: Math.min(cellWidth, cellHeight) * .43, fill: "transparent", stroke: accent, strokeWidth: style === "minimal" ? 2 : 1.4 });
    }
    addText({ role: "day", day, text: String(day), x, y: cy - numbersSize * .6, width: cellWidth, height: numbersSize * 1.2, fontFamily: numbersFamily, fontSize: numbersSize, color: numbersColor, align: "center", bold: day === calendar.highlightedDay });
  });
  const designHeight = gridY + calendar.rows * cellHeight + (style === "romantic" ? 38 : 28);
  const cardRadius = style === "minimal" || style === "paper-note" ? 2 : style === "romantic" ? 32 : 14;
  const card: CalendarShape[] = [];
  if (style === "paper-note") card.push({ kind: "rect", x: 9, y: 13, width: 304, height: designHeight - 18, radius: 2, fill: "#000000", opacity: .09 });
  const tornOutline = Array.from({ length: 32 }, (_, i) => `${i ? "L" : "M"} ${5 + i * 10} ${6 + (i % 3) * 2}`).join(" ")
    + " " + Array.from({ length: 32 }, (_, i) => `L ${315 - i * 10} ${designHeight - 6 - (i % 3) * 2}`).join(" ") + " Z";
  card.push(decoration === "torn-paper"
    ? { kind: "path", data: tornOutline, fill: element.backgroundColor || "#fffaf5", stroke: decorColor, strokeWidth: 1 }
    : { kind: "rect", x: 4, y: 4, width: 312, height: designHeight - 8, radius: cardRadius, fill: element.backgroundColor || "#fffaf5", stroke: style === "minimal" ? undefined : border, strokeWidth: 1 });
  if (style === "decorative-frame") {
    card.push({ kind: "rect", x: 12, y: 12, width: 296, height: designHeight - 24, radius: 8, fill: "transparent", stroke: accent, strokeWidth: 1 });
    for (const [x, cy] of [[20, 20], [300, 20], [20, designHeight - 20], [300, designHeight - 20]]) card.push({ kind: "path", data: `M ${x - 4} ${cy} L ${x} ${cy - 4} L ${x + 4} ${cy} L ${x} ${cy + 4} Z`, fill: accent });
  }
  if (style === "paper-note") card.push({ kind: "path", data: "M 126 0 L 194 3 L 192 23 L 125 21 Z", fill: decorColor, opacity: .3 });
  if (style === "romantic") card.push({ kind: "path", data: calendarHeartPath(160, 20, 13), fill: decorColor, opacity: .65 });
  const ornaments: CalendarShape[] = [];
  const path = (data: string, fill = "transparent", stroke = decorColor, opacity = 1) => ornaments.push({ kind: "path", data, fill, stroke, strokeWidth: 1.4, opacity });
  if (decoration === "hearts") { path(calendarHeartPath(38, 23, 12), decorColor); path(calendarHeartPath(282, designHeight - 21, 12), decorColor); }
  if (decoration === "ribbon") {
    path("M 160 19 C 136 -2 123 14 150 21 C 131 34 135 41 156 23 M 160 19 C 184 -2 197 14 170 21 C 189 34 185 41 164 23");
    ornaments.push({ kind: "circle", x: 160, y: 20, radius: 3, fill: decorColor });
  }
  if (decoration === "floral") {
    for (const [x, cy, flip] of [[18, designHeight - 24, 1], [302, 25, -1]]) {
      path(`M ${x} ${cy} Q ${x + 18 * flip} ${cy - 14 * flip} ${x + 10 * flip} ${cy - 36 * flip}`);
      for (let i = 0; i < 3; i++) { const a = x + 6 * flip, b = cy - i * 11 * flip; path(`M ${a} ${b} Q ${a + 18 * flip} ${b - 15 * flip} ${a + 14 * flip} ${b + 2 * flip} Q ${a + 8 * flip} ${b + 7 * flip} ${a} ${b} Z`, decorColor, decorColor, .6); }
    }
  }
  if (decoration === "ornament") {
    const cy = designHeight - 16;
    path(`M 105 ${cy} Q 135 ${cy - 12} 160 ${cy} Q 185 ${cy - 12} 215 ${cy} M 152 ${cy} L 160 ${cy - 5} L 168 ${cy} L 160 ${cy + 5} Z`);
  }
  if (decoration === "soft-frame") ornaments.push({ kind: "rect", x: 9, y: 9, width: 302, height: designHeight - 18, radius: 24, fill: "transparent", stroke: decorColor, strokeWidth: 2, opacity: .7 });
  if (decoration === "torn-paper") {
    const upper = Array.from({ length: 32 }, (_, i) => `${i ? "L" : "M"} ${5 + i * 10} ${6 + (i % 3) * 2}`).join(" ");
    path(upper, "transparent", decorColor, .65);
    path(Array.from({ length: 32 }, (_, i) => `${i ? "L" : "M"} ${5 + i * 10} ${designHeight - 6 - (i % 3) * 2}`).join(" "), "transparent", decorColor, .65);
  }
  const config = getCalendarEventConfig(element);
  const buttonShapes: CalendarShape[] = [];
  let button: { x: number; y: number; width: number; height: number; text: CalendarTextBox } | null = null;
  if (config.enabled) {
    const size = clamp(finite(config.buttonFontSize, 13), 4, 64), family = config.buttonFontFamily || titleFamily;
    const label = wrapScheduleText(config.buttonLabel?.trim() || "Ajouter à mon agenda", inner - 36, size, family, false);
    const textHeight = label.split("\n").length * size * 1.2;
    const buttonHeight = Math.max(40, textHeight + 20), buttonY = designHeight + clamp(finite(config.buttonGap, 12), 0, 120);
    const buttonText: CalendarTextBox = { role: "agenda-button", text: label, x: pad + 30, y: buttonY + (buttonHeight - textHeight) / 2, width: inner - 36, height: textHeight, fontFamily: family, fontSize: size, color: config.buttonTextColor || "#ffffff", align: "center" };
    text.push(buttonText);
    button = { x: pad, y: buttonY, width: inner, height: buttonHeight, text: buttonText };
    buttonShapes.push({ kind: "rect", x: pad, y: buttonY, width: inner, height: buttonHeight, radius: clamp(finite(config.buttonRadius, 8), 0, buttonHeight / 2), fill: config.buttonBackgroundColor || "#795746", stroke: config.buttonBorderColor || "#795746", strokeWidth: clamp(finite(config.buttonBorderWidth, 1), 0, 8) });
    const x = pad + 10, cy = buttonY + buttonHeight / 2 - 7;
    buttonShapes.push({ kind: "path", data: `M ${x} ${cy + 2} H ${x + 14} V ${cy + 14} H ${x} Z M ${x} ${cy + 6} H ${x + 14} M ${x + 4} ${cy} V ${cy + 4} M ${x + 10} ${cy} V ${cy + 4}`, fill: "transparent", stroke: buttonText.color, strokeWidth: 1.3 });
  }
  const fullHeight = button ? button.y + button.height + 4 : designHeight;
  const scale = Math.min(width / designWidth, height / fullHeight);
  return { ...calendar, style, decoration, width, height, designWidth, designHeight: fullHeight, scale, offsetX: (width - designWidth * scale) / 2, offsetY: (height - fullHeight * scale) / 2, shapes: [...card, ...shapes, ...ornaments, ...buttonShapes], text, button };
}
