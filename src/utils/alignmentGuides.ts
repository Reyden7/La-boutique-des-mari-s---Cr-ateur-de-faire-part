import Konva from "konva";
import { PREVIEW_DEVICES, type PreviewDevice } from "../config/previewDevices";

export const ALIGNMENT_THRESHOLD = 6;

export type AlignmentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AlignmentCandidate = {
  id: string;
  bounds: AlignmentBounds;
  isCanvas?: boolean;
};

export type AlignmentGuide = {
  orientation: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
  kind: "alignment" | "spacing";
};

export type SnapResult = {
  deltaX: number;
  deltaY: number;
  guides: AlignmentGuide[];
};

export type DistanceGuide = {
  orientation: "horizontal" | "vertical";
  start: number;
  end: number;
  crossPosition: number;
  distancePx: number;
  equalSpacing?: boolean;
  source: "canvas" | "elements";
};

export type SpacingReferences = {
  horizontal: number[];
  vertical: number[];
};

const horizontalPoints = (bounds: AlignmentBounds) => [
  bounds.x,
  bounds.x + bounds.width / 2,
  bounds.x + bounds.width,
];

const verticalPoints = (bounds: AlignmentBounds) => [
  bounds.y,
  bounds.y + bounds.height / 2,
  bounds.y + bounds.height,
];

export const translateBounds = (bounds: AlignmentBounds, x: number, y: number): AlignmentBounds => ({
  ...bounds,
  x: bounds.x + x,
  y: bounds.y + y,
});

export const getSelectionBounds = (bounds: AlignmentBounds[]): AlignmentBounds => {
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const getNodeBounds = (node: Konva.Node, stage: Konva.Stage): AlignmentBounds => {
  const rect = node.getClientRect({ relativeTo: stage, skipShadow: true });
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};

export const pxToMm = (px: number, device: PreviewDevice) =>
  px * PREVIEW_DEVICES[device].physicalWidthMm / PREVIEW_DEVICES[device].width;

export const formatMillimeters = (px: number, device: PreviewDevice) => {
  const value = pxToMm(px, device);
  const rounded = Math.abs(value - Math.round(value)) < .05
    ? Math.round(value).toString()
    : value.toFixed(1).replace(".", ",");
  return `${rounded} mm`;
};

const sameRow = (left: AlignmentBounds, right: AlignmentBounds, threshold: number) =>
  Math.abs(left.y + left.height / 2 - (right.y + right.height / 2)) <= threshold
  || Math.abs(left.y - right.y) <= threshold
  || Math.abs(left.y + left.height - right.y - right.height) <= threshold;

const sameColumn = (top: AlignmentBounds, bottom: AlignmentBounds, threshold: number) =>
  Math.abs(top.x + top.width / 2 - (bottom.x + bottom.width / 2)) <= threshold
  || Math.abs(top.x - bottom.x) <= threshold
  || Math.abs(top.x + top.width - bottom.x - bottom.width) <= threshold;

const adjacentGaps = (
  bounds: AlignmentBounds[],
  axis: "horizontal" | "vertical",
  threshold: number,
) => {
  const aligned = bounds.filter((item, index) => index === 0 || (axis === "horizontal" ? sameRow(bounds[0], item, threshold) : sameColumn(bounds[0], item, threshold)));
  const ordered = [...aligned].sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);
  return ordered.slice(0, -1).map((item, index) => {
    const next = ordered[index + 1];
    return axis === "horizontal"
      ? { gap: next.x - (item.x + item.width), before: item, after: next }
      : { gap: next.y - (item.y + item.height), before: item, after: next };
  }).filter((item) => item.gap > 0);
};

export const findEqualSpacingSnap = (
  moving: AlignmentBounds,
  candidates: AlignmentCandidate[],
  threshold: number,
  references = getSpacingReferences(candidates, threshold),
) => {
  let bestX: number | undefined;
  let bestY: number | undefined;
  const candidateBounds = candidates.map((candidate) => candidate.bounds);

  for (const candidate of candidateBounds) {
    if (sameRow(moving, candidate, threshold)) {
      for (const reference of references.horizontal) {
        const currentGap = moving.x >= candidate.x + candidate.width
          ? moving.x - candidate.x - candidate.width
          : candidate.x >= moving.x + moving.width
            ? candidate.x - moving.x - moving.width
            : -1;
        if (currentGap < 0) continue;
        const delta = moving.x >= candidate.x + candidate.width
          ? reference - currentGap
          : currentGap - reference;
        if (Math.abs(delta) <= threshold && (bestX === undefined || Math.abs(delta) < Math.abs(bestX))) bestX = delta;
      }
    }
    if (sameColumn(moving, candidate, threshold)) {
      for (const reference of references.vertical) {
        const currentGap = moving.y >= candidate.y + candidate.height
          ? moving.y - candidate.y - candidate.height
          : candidate.y >= moving.y + moving.height
            ? candidate.y - moving.y - moving.height
            : -1;
        if (currentGap < 0) continue;
        const delta = moving.y >= candidate.y + candidate.height
          ? reference - currentGap
          : currentGap - reference;
        if (Math.abs(delta) <= threshold && (bestY === undefined || Math.abs(delta) < Math.abs(bestY))) bestY = delta;
      }
    }
  }
  return { deltaX: bestX ?? 0, deltaY: bestY ?? 0 };
};

export function getSpacingReferences(candidates: AlignmentCandidate[], threshold: number): SpacingReferences {
  const horizontal = new Set<number>();
  const vertical = new Set<number>();
  const bounds = candidates.map((candidate) => candidate.bounds);
  for (const current of bounds) {
    const nextOnRow = bounds
      .filter((candidate) => candidate !== current && sameRow(current, candidate, threshold) && candidate.x >= current.x + current.width)
      .sort((left, right) => left.x - right.x)[0];
    const horizontalGap = nextOnRow ? nextOnRow.x - current.x - current.width : 0;
    if (horizontalGap > 0) horizontal.add(horizontalGap);
    const nextOnColumn = bounds
      .filter((candidate) => candidate !== current && sameColumn(current, candidate, threshold) && candidate.y >= current.y + current.height)
      .sort((top, bottom) => top.y - bottom.y)[0];
    const verticalGap = nextOnColumn ? nextOnColumn.y - current.y - current.height : 0;
    if (verticalGap > 0) vertical.add(verticalGap);
  }
  return { horizontal: [...horizontal], vertical: [...vertical] };
}

export const getDistanceGuides = (
  moving: AlignmentBounds,
  candidates: AlignmentCandidate[],
  canvas: AlignmentBounds,
  threshold: number,
  visualOffset: number,
): DistanceGuide[] => {
  const right = moving.x + moving.width;
  const bottom = moving.y + moving.height;
  const horizontalCross = Math.max(canvas.y + visualOffset, moving.y - visualOffset);
  const verticalCross = Math.min(canvas.x + canvas.width - visualOffset, right + visualOffset);
  const measurements: DistanceGuide[] = [];
  const push = (guide: DistanceGuide) => {
    if (guide.distancePx >= .5) measurements.push(guide);
  };
  push({ orientation: "horizontal", start: canvas.x, end: moving.x, crossPosition: horizontalCross, distancePx: moving.x - canvas.x, source: "canvas" });
  push({ orientation: "horizontal", start: right, end: canvas.x + canvas.width, crossPosition: horizontalCross, distancePx: canvas.x + canvas.width - right, source: "canvas" });
  push({ orientation: "vertical", start: canvas.y, end: moving.y, crossPosition: verticalCross, distancePx: moving.y - canvas.y, source: "canvas" });
  push({ orientation: "vertical", start: bottom, end: canvas.y + canvas.height, crossPosition: verticalCross, distancePx: canvas.y + canvas.height - bottom, source: "canvas" });

  const rowBounds = [moving, ...candidates.map((candidate) => candidate.bounds).filter((bounds) => sameRow(moving, bounds, threshold))];
  const columnBounds = [moving, ...candidates.map((candidate) => candidate.bounds).filter((bounds) => sameColumn(moving, bounds, threshold))];
  const horizontalGaps = adjacentGaps(rowBounds, "horizontal", threshold);
  const verticalGaps = adjacentGaps(columnBounds, "vertical", threshold);
  const repeatedHorizontal = horizontalGaps.filter((item, _, gaps) => gaps.some((other) => other !== item && Math.abs(other.gap - item.gap) <= threshold)).map((item) => item.gap);
  const repeatedVertical = verticalGaps.filter((item, _, gaps) => gaps.some((other) => other !== item && Math.abs(other.gap - item.gap) <= threshold)).map((item) => item.gap);
  horizontalGaps.forEach(({ gap, before, after }) => push({ orientation: "horizontal", start: before.x + before.width, end: after.x, crossPosition: Math.max(canvas.y + visualOffset, Math.min(before.y, after.y) - visualOffset), distancePx: gap, equalSpacing: repeatedHorizontal.some((value) => Math.abs(value - gap) <= threshold), source: "elements" }));
  verticalGaps.forEach(({ gap, before, after }) => push({ orientation: "vertical", start: before.y + before.height, end: after.y, crossPosition: Math.min(canvas.x + canvas.width - visualOffset, Math.max(before.x + before.width, after.x + after.width) + visualOffset), distancePx: gap, equalSpacing: repeatedVertical.some((value) => Math.abs(value - gap) <= threshold), source: "elements" }));
  return measurements;
};

export const calculateSnap = (
  moving: AlignmentBounds,
  candidates: AlignmentCandidate[],
  canvas: AlignmentBounds,
  threshold: number,
  spacingReferences?: SpacingReferences,
): SnapResult => {
  const allCandidates = [...candidates, { id: "__canvas__", bounds: canvas, isCanvas: true }];
  const movingX = horizontalPoints(moving);
  const movingY = verticalPoints(moving);
  let bestX: { delta: number; guide: AlignmentGuide } | undefined;
  let bestY: { delta: number; guide: AlignmentGuide } | undefined;

  for (const candidate of allCandidates) {
    for (const target of horizontalPoints(candidate.bounds)) {
      for (const source of movingX) {
        const delta = target - source;
        if (Math.abs(delta) > threshold || (bestX && Math.abs(delta) >= Math.abs(bestX.delta))) continue;
        const snapped = translateBounds(moving, delta, 0);
        bestX = {
          delta,
          guide: {
            orientation: "vertical",
            position: target,
            start: candidate.isCanvas ? canvas.y : Math.min(snapped.y, candidate.bounds.y),
            end: candidate.isCanvas ? canvas.y + canvas.height : Math.max(snapped.y + snapped.height, candidate.bounds.y + candidate.bounds.height),
            kind: "alignment",
          },
        };
      }
    }
    for (const target of verticalPoints(candidate.bounds)) {
      for (const source of movingY) {
        const delta = target - source;
        if (Math.abs(delta) > threshold || (bestY && Math.abs(delta) >= Math.abs(bestY.delta))) continue;
        const snapped = translateBounds(moving, 0, delta);
        bestY = {
          delta,
          guide: {
            orientation: "horizontal",
            position: target,
            start: candidate.isCanvas ? canvas.x : Math.min(snapped.x, candidate.bounds.x),
            end: candidate.isCanvas ? canvas.x + canvas.width : Math.max(snapped.x + snapped.width, candidate.bounds.x + candidate.bounds.width),
            kind: "alignment",
          },
        };
      }
    }
  }

  const equalSpacing = findEqualSpacingSnap(moving, candidates, threshold, spacingReferences);
  if (equalSpacing.deltaX && (!bestX || Math.abs(equalSpacing.deltaX) < Math.abs(bestX.delta))) {
    bestX = { delta: equalSpacing.deltaX, guide: {
      orientation: "vertical",
      position: moving.x + equalSpacing.deltaX,
      start: moving.y,
      end: moving.y + moving.height,
      kind: "spacing",
    } };
  }
  if (equalSpacing.deltaY && (!bestY || Math.abs(equalSpacing.deltaY) < Math.abs(bestY.delta))) {
    bestY = { delta: equalSpacing.deltaY, guide: {
      orientation: "horizontal",
      position: moving.y + equalSpacing.deltaY,
      start: moving.x,
      end: moving.x + moving.width,
      kind: "spacing",
    } };
  }

  return {
    deltaX: bestX?.delta ?? 0,
    deltaY: bestY?.delta ?? 0,
    guides: [bestX?.guide, bestY?.guide].filter((guide): guide is AlignmentGuide => Boolean(guide)),
  };
};

export const drawEditorGuides = (
  layer: Konva.Layer | null,
  guides: AlignmentGuide[],
  distances: DistanceGuide[],
  zoom: number,
  device: PreviewDevice,
) => {
  if (!layer) return;
  layer.destroyChildren();
  const safeZoom = Math.max(.1, zoom);
  for (const guide of guides) {
    const points = guide.orientation === "vertical"
      ? [guide.position, guide.start, guide.position, guide.end]
      : [guide.start, guide.position, guide.end, guide.position];
    layer.add(new Konva.Line({
      points,
      stroke: guide.kind === "spacing" ? "#a855f7" : "#d946ef",
      strokeWidth: 1 / safeZoom,
      dash: [5 / safeZoom, 3 / safeZoom],
      listening: false,
      perfectDrawEnabled: false,
    }));
  }
  for (const distance of distances) {
    const color = distance.equalSpacing ? "#a855f7" : "#d946ef";
    const points = distance.orientation === "horizontal"
      ? [distance.start, distance.crossPosition, distance.end, distance.crossPosition]
      : [distance.crossPosition, distance.start, distance.crossPosition, distance.end];
    layer.add(new Konva.Line({ points, stroke: color, strokeWidth: 1 / safeZoom, listening: false, perfectDrawEnabled: false }));
    const tick = 3 / safeZoom;
    if (distance.orientation === "horizontal") {
      layer.add(new Konva.Line({ points: [distance.start, distance.crossPosition - tick, distance.start, distance.crossPosition + tick], stroke: color, strokeWidth: 1 / safeZoom, listening: false }));
      layer.add(new Konva.Line({ points: [distance.end, distance.crossPosition - tick, distance.end, distance.crossPosition + tick], stroke: color, strokeWidth: 1 / safeZoom, listening: false }));
    } else {
      layer.add(new Konva.Line({ points: [distance.crossPosition - tick, distance.start, distance.crossPosition + tick, distance.start], stroke: color, strokeWidth: 1 / safeZoom, listening: false }));
      layer.add(new Konva.Line({ points: [distance.crossPosition - tick, distance.end, distance.crossPosition + tick, distance.end], stroke: color, strokeWidth: 1 / safeZoom, listening: false }));
    }
    const label = formatMillimeters(distance.distancePx, device);
    const fontSize = 9 / safeZoom;
    const padding = 3 / safeZoom;
    const textWidth = Math.max(34, label.length * 5.3) / safeZoom;
    const textHeight = 13 / safeZoom;
    const x = distance.orientation === "horizontal"
      ? (distance.start + distance.end) / 2 - textWidth / 2
      : distance.crossPosition + 5 / safeZoom;
    const y = distance.orientation === "horizontal"
      ? distance.crossPosition - textHeight - 4 / safeZoom
      : (distance.start + distance.end) / 2 - textHeight / 2;
    layer.add(new Konva.Rect({ x: x - padding, y: y - padding / 2, width: textWidth + padding * 2, height: textHeight + padding, cornerRadius: 3 / safeZoom, fill: "rgba(255,255,255,.94)", stroke: color, strokeWidth: .7 / safeZoom, listening: false }));
    layer.add(new Konva.Text({ x, y, width: textWidth, height: textHeight, text: label, align: "center", verticalAlign: "middle", fontFamily: "Montserrat", fontSize, fontStyle: distance.equalSpacing ? "bold" : "normal", fill: color, listening: false }));
  }
  layer.batchDraw();
};

export const clearEditorGuides = (layer: Konva.Layer | null) => {
  if (!layer) return;
  layer.destroyChildren();
  layer.batchDraw();
};
