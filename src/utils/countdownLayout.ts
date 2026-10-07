import type { CountdownElement } from "../types/editor";
import { getCountdownDays } from "./countdownDate.ts";
import { measureScheduleText, wrapScheduleText } from "./scheduleLayout.ts";

const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
const bounded = (value: number | undefined, fallback: number, max: number) => Math.max(0, Math.min(max, finite(value, fallback)));

/** Shared scene: both DOM and Konva draw these exact text boxes and line breaks. */
export function getCountdownLayout(element: CountdownElement, box: { width: number; height: number }, today?: string) {
  const width = Math.max(12, finite(box.width, 260)), height = Math.max(12, finite(box.height, 140));
  const padding = Math.min(bounded(element.padding, 8, 200), width / 4, height / 4);
  const inner = width - padding * 2, availableHeight = height - padding * 2;
  const fontFamily = element.fontFamily || "Cormorant Garamond";
  const textAlign = ["left", "center", "right"].includes(element.textAlign) ? element.textAlign : "center";
  const horizontal = element.layout === "horizontal";
  const days = getCountdownDays(element.targetDate, today);
  const numberText = String(days), labelText = element.label ?? "jours";
  const gap = labelText ? Math.min(bounded(element.gap, 6, 400), inner / 4) : 0;
  const requestedSize = Math.max(4, bounded(element.numberFontSize, 64, 400));
  const measuredWidth = Math.max(1, measureScheduleText(numberText, requestedSize, fontFamily));
  const numberFontSize = requestedSize * Math.min(1, (horizontal && labelText ? inner * .55 : inner) / measuredWidth);
  const numberWidth = Math.min(inner, measureScheduleText(numberText, numberFontSize, fontFamily) + .5);
  const labelFontSize = Math.max(4, bounded(element.labelFontSize, 20, 200));
  const labelWidth = horizontal ? Math.max(1, inner - numberWidth - gap) : inner;
  const label = wrapScheduleText(labelText, labelWidth, labelFontSize, fontFamily, false);
  const renderedLabelWidth = horizontal && labelText ? Math.min(labelWidth, Math.max(...label.split("\n").map((line) => measureScheduleText(line, labelFontSize, fontFamily))) + .5) : labelWidth;
  const contentWidth = horizontal ? numberWidth + gap + (labelText ? renderedLabelWidth : 0) : inner;
  const numberHeight = numberFontSize * 1.2, labelHeight = labelText ? label.split("\n").length * labelFontSize * 1.2 : 0;
  const contentHeight = horizontal ? Math.max(numberHeight, labelHeight) : numberHeight + gap + labelHeight;
  const scale = Math.min(1, availableHeight / Math.max(1, contentHeight));
  const offsetX = padding + (inner - contentWidth * scale) * (textAlign === "left" ? 0 : textAlign === "right" ? 1 : .5);
  const offsetY = (height - contentHeight * scale) / 2;
  const text = [{ role: "number" as const, text: numberText, x: 0, y: horizontal ? (contentHeight - numberHeight) / 2 : 0,
    width: horizontal ? numberWidth : inner, height: numberHeight, fontSize: numberFontSize, fontFamily,
    color: element.numberColor || "#000000", align: horizontal ? "center" as const : textAlign as CountdownElement["textAlign"] },
  ...(labelText ? [{ role: "label" as const, text: label, x: horizontal ? numberWidth + gap : 0,
    y: horizontal ? (contentHeight - labelHeight) / 2 : numberHeight + gap, width: renderedLabelWidth, height: labelHeight,
    fontSize: labelFontSize, fontFamily, color: element.labelColor || "#000000", align: textAlign as CountdownElement["textAlign"] }] : [])];
  return { width, height, days, scale, offsetX, offsetY, text,
    backgroundColor: element.backgroundColor || "#00000000", borderColor: element.borderColor || "#00000000",
    borderWidth: Math.min(bounded(element.borderWidth, 0, 40), width / 2, height / 2),
    borderRadius: Math.min(bounded(element.borderRadius, 0, 200), width / 2, height / 2) };
}
