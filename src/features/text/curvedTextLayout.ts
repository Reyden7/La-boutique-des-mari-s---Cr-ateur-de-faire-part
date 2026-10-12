import type { TextCurveConfig, TextElement } from "../../types/editor";

export const DEFAULT_TEXT_CURVE: TextCurveConfig = { enabled: false, amount: 0, direction: "up" };
export function resolveTextCurve(value?: Partial<TextCurveConfig> | null): TextCurveConfig {
  return { enabled: value?.enabled === true, amount: typeof value?.amount === "number" && Number.isFinite(value.amount) ? Math.max(0, Math.min(100, value.amount)) : 0, direction: value?.direction === "down" ? "down" : "up" };
}
export const hasTextCurve = (value?: Partial<TextCurveConfig> | null) => { const curve = resolveTextCurve(value); return curve.enabled && curve.amount > 0; };

export interface CurvedTextOptions {
  text: string; width: number; height: number; fontFamily: string; fontSize: number; fontWeight: number;
  italic: boolean; underline: boolean; letterSpacing: number; lineHeight: number; align: "left" | "center" | "right"; curve?: TextCurveConfig;
}
export function curvedTextOptions(element: TextElement, width: number, height: number, fontSize = element.fontSize): CurvedTextOptions {
  return { text: element.text, width, height, fontFamily: element.fontFamily, fontSize, fontWeight: element.fontWeight, italic: element.italic,
    underline: element.underline, letterSpacing: element.letterSpacing, lineHeight: element.lineHeight, align: element.textAlign, curve: element.curve };
}
export interface GlyphMeasure { width: number; left: number; right: number; ascent: number; descent: number }
export type MeasureGlyph = (text: string) => GlyphMeasure;
const boundsOf = (points: Array<{ x: number; y: number }>) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  return { minX, maxX, minY, maxY };
};
export interface CurvedGlyph {
  text: string; x: number; y: number; angle: number; width: number;
  ascent: number; descent: number; unit: number; word: number; line: number;
  corners: Array<{ x: number; y: number }>;
}
export interface CurvedTextLayout {
  width: number; height: number; font: string; fontSize: number; scale: number;
  glyphs: CurvedGlyph[]; unitCount: number; wordCount: number; underlines: Array<Array<{ x: number; y: number }>>;
}

export const curvedCanvasFont = (options: Pick<CurvedTextOptions, "italic" | "fontWeight" | "fontSize" | "fontFamily">) =>
  `${options.italic ? "italic" : "normal"} ${options.fontWeight} ${options.fontSize}px ${JSON.stringify(options.fontFamily)}`;

let measuringContext: CanvasRenderingContext2D | null = null;
export function measureCurvedText(options: CurvedTextOptions): CurvedTextLayout {
  measuringContext ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const ctx = measuringContext;
  if (ctx) { ctx.font = curvedCanvasFont(options); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px"; }
  return layoutCurvedText(options, (text) => {
    const metrics = ctx?.measureText(text);
    const width = metrics?.width ?? [...text].length * options.fontSize * .6;
    return { width, left: metrics?.actualBoundingBoxLeft ?? 0, right: metrics?.actualBoundingBoxRight ?? width,
      ascent: metrics?.actualBoundingBoxAscent ?? options.fontSize * .8, descent: metrics?.actualBoundingBoxDescent ?? options.fontSize * .2 };
  });
}

/** Circular arc geometry shared by Konva and the web Canvas renderer.
 * Future path kinds can replace only the arc point calculation below. */
export function layoutCurvedText(options: CurvedTextOptions, measure: MeasureGlyph): CurvedTextLayout {
  const curve = resolveTextCurve(options.curve);
  const sign = curve.direction === "up" ? 1 : -1;
  const fontSize = Math.max(1, options.fontSize);
  const glyphs: CurvedGlyph[] = [], underlines: CurvedTextLayout["underlines"] = [];
  const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
  let unitCount = 0, wordCount = 0, lineTop = 0;
  const lines = options.text.replace(/\r\n?/g, "\n").split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const text = lines[lineIndex];
    const words = [...new Intl.Segmenter("fr", { granularity: "word" }).segment(text)].filter((part) => /\S/u.test(part.segment));
    const pieces = [...segmenter.segment(text)];
    const total = Math.max(0, measure(text).width + options.letterSpacing * Math.max(0, pieces.length - 1));
    const requestedAngle = Math.max(.00001, curve.amount / 100 * Math.PI);
    // Very short labels must not fold glyphs into each other at a tiny radius.
    const radius = Math.max(total / requestedAngle, fontSize * 1.5);
    const angle = total / radius;
    const lineGlyphs: CurvedGlyph[] = [];
    const underlinePoints: Array<{ x: number; y: number }> = [];
    let prefix = "";
    for (let index = 0; index < pieces.length; index++) {
      const part = pieces[index], metrics = measure(part.segment);
      prefix += part.segment;
      const end = measure(prefix).width + options.letterSpacing * index;
      const distance = end - metrics.width / 2 - total / 2;
      const theta = distance / radius;
      const x = radius * Math.sin(theta), y = sign * radius * (1 - Math.cos(theta));
      const rotation = sign * theta;
      const turn = (px: number, py: number) => ({ x: x + px * Math.cos(rotation) - py * Math.sin(rotation),
        y: y + px * Math.sin(rotation) + py * Math.cos(rotation) });
      const word = words.findIndex((item) => part.index >= item.index && part.index < item.index + item.segment.length);
      if (/\S/u.test(part.segment)) {
        const corners = [
          turn(-metrics.width / 2 - metrics.left, -metrics.ascent),
          turn(-metrics.width / 2 + metrics.right, -metrics.ascent),
          turn(-metrics.width / 2 + metrics.right, metrics.descent),
          turn(-metrics.width / 2 - metrics.left, metrics.descent),
        ];
        lineGlyphs.push({ text: part.segment, x, y, angle: rotation, width: metrics.width, ascent: metrics.ascent, descent: metrics.descent,
          unit: unitCount++, word: wordCount + Math.max(0, word), line: lineIndex, corners });
      }
    }
    // Baseline underline follows the arc, including the spaces between glyphs.
    for (let step = 0; step <= 48; step++) {
      const theta = -angle / 2 + angle * step / 48;
      underlinePoints.push({ x: radius * Math.sin(theta) - Math.sin(sign * theta) * fontSize * .13,
        y: sign * radius * (1 - Math.cos(theta)) + Math.cos(theta) * fontSize * .13 });
    }
    const points = [...lineGlyphs.flatMap((glyph) => glyph.corners), ...underlinePoints];
    const bounds = boundsOf(points);
    const minX = Math.min(0, bounds.minX), maxX = Math.max(0, bounds.maxX);
    const minY = Math.min(0, bounds.minY), maxY = Math.max(fontSize * .13, bounds.maxY);
    const lineWidth = maxX - minX;
    const left = options.align === "left" ? 0 : options.align === "right" ? options.width - lineWidth : (options.width - lineWidth) / 2;
    const move = (point: { x: number; y: number }) => ({ x: point.x - minX + left, y: point.y - minY + lineTop });
    for (const glyph of lineGlyphs) glyphs.push({ ...glyph, ...move(glyph), corners: glyph.corners.map(move) });
    if (text.trim()) underlines.push(underlinePoints.map(move));
    wordCount += words.length;
    lineTop += Math.max(maxY - minY, fontSize) + Math.max(0, options.lineHeight - 1) * fontSize;
  }
  const allPoints = [...glyphs.flatMap((glyph) => glyph.corners), ...underlines.flat()];
  if (!allPoints.length) return { width: options.width, height: options.height, font: curvedCanvasFont(options), fontSize, scale: 1, glyphs, unitCount, wordCount, underlines };
  const { minX, maxX, minY, maxY } = boundsOf(allPoints);
  const contentWidth = Math.max(1, maxX - minX), contentHeight = Math.max(1, maxY - minY);
  const padding = Math.max(2, fontSize * .025);
  const scale = Math.min(1, Math.max(1, options.width - padding * 2) / contentWidth, Math.max(1, options.height - padding * 2) / contentHeight);
  const fittedWidth = contentWidth * scale;
  const x = options.align === "left" ? padding : options.align === "right" ? options.width - padding - fittedWidth : (options.width - fittedWidth) / 2;
  const y = (options.height - contentHeight * scale) / 2;
  const fit = (point: {x:number;y:number}) => ({ x: x + (point.x - minX) * scale, y: y + (point.y - minY) * scale });
  return { width: options.width, height: options.height, font: curvedCanvasFont({ ...options, fontSize: fontSize * scale }), fontSize: fontSize * scale, scale,
    glyphs: glyphs.map((glyph) => ({ ...glyph, ...fit(glyph), width: glyph.width * scale, ascent: glyph.ascent * scale, descent: glyph.descent * scale, corners: glyph.corners.map(fit) })),
    unitCount, wordCount, underlines: underlines.map((line) => line.map(fit)) };
}

export interface CurvedTextPaint {
  color: string; underline?: boolean; glyphOpacity?: (glyph: CurvedGlyph) => number; underlineProgress?: number;
  cursorUnit?: number;
}
export function paintCurvedText(ctx: CanvasRenderingContext2D, layout: CurvedTextLayout, paint: CurvedTextPaint) {
  ctx.save(); const opacity = ctx.globalAlpha;
  ctx.font = layout.font; ctx.letterSpacing = "0px"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = paint.color; ctx.strokeStyle = paint.color;
  for (const glyph of layout.glyphs) {
    const visibility = paint.glyphOpacity?.(glyph) ?? 1;
    if (visibility <= 0) continue;
    ctx.save(); ctx.globalAlpha = opacity * visibility;
    ctx.translate(glyph.x, glyph.y); ctx.rotate(glyph.angle); ctx.fillText(glyph.text, 0, 0); ctx.restore();
  }
  if (paint.underline) {
    const progress = Math.min(1, Math.max(0, paint.underlineProgress ?? 1));
    ctx.lineWidth = Math.max(.6, layout.fontSize * .045); ctx.lineCap = "round";
    for (const line of layout.underlines) {
      const end = progress * (line.length - 1);
      if (end <= 0) continue;
      ctx.beginPath(); ctx.moveTo(line[0].x, line[0].y);
      for (let index = 1; index <= Math.floor(end); index++) ctx.lineTo(line[index].x, line[index].y);
      const index = Math.floor(end), fraction = end - index;
      if (line[index + 1]) ctx.lineTo(line[index].x + (line[index+1].x-line[index].x)*fraction, line[index].y + (line[index+1].y-line[index].y)*fraction);
      ctx.stroke();
    }
  }
  const cursor = layout.glyphs.find((glyph) => glyph.unit === paint.cursorUnit);
  if (cursor) {
    ctx.save(); ctx.translate(cursor.x, cursor.y); ctx.rotate(cursor.angle); ctx.lineWidth = Math.max(1, layout.fontSize * .035);
    ctx.beginPath(); ctx.moveTo(cursor.width / 2 + 2, -cursor.ascent); ctx.lineTo(cursor.width / 2 + 2, cursor.descent); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
