import type Konva from "konva";

export type CanvasPoint = { x: number; y: number };

/** Konva already accounts for the container's screen position and CSS scale.
 * Invert the Stage transform to also remove its own zoom/translation.
 */
export function getLogicalCanvasPointer(stage: Pick<Konva.Stage, "getPointerPosition" | "getAbsoluteTransform">): CanvasPoint | null {
  const pointer = stage.getPointerPosition();
  return pointer ? stage.getAbsoluteTransform().copy().invert().point(pointer) : null;
}

export function getPointerDragDelta(start: CanvasPoint, current: CanvasPoint) {
  return { deltaX: current.x - start.x, deltaY: current.y - start.y };
}
