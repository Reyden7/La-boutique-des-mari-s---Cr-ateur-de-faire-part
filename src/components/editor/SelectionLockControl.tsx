import { forwardRef } from "react";
import { Group, Path, Rect } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { AlignmentBounds } from "../../utils/alignmentGuides";

const CONTROL_SIZE = 24;

export const getSelectionLockPosition = (bounds: AlignmentBounds, locked: boolean, zoom: number) => {
  const scale = 1 / Math.max(.1, zoom);
  const centerX = bounds.x + bounds.width / 2;
  return {
    x: locked ? centerX - CONTROL_SIZE * scale / 2 : centerX + 16 * scale,
    y: bounds.y - 40 * scale,
  };
};

export const positionSelectionLockControl = (
  group: Konva.Group | null,
  bounds: AlignmentBounds,
  locked: boolean,
  zoom: number,
) => {
  if (!group) return;
  group.position(getSelectionLockPosition(bounds, locked, zoom));
  group.getLayer()?.batchDraw();
};

export const SelectionLockControl = forwardRef<Konva.Group, {
  bounds: AlignmentBounds;
  locked: boolean;
  zoom: number;
  onToggle: () => void;
}>(({ bounds, locked, zoom, onToggle }, ref) => {
  const scale = 1 / Math.max(.1, zoom);
  const position = getSelectionLockPosition(bounds, locked, zoom);
  const activate = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    onToggle();
  };
  return <Group
    ref={ref}
    {...position}
    scaleX={scale}
    scaleY={scale}
    rotation={0}
    onClick={activate}
    onTap={activate}
    onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = "pointer"; }}
    onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = "default"; }}
  >
    <Rect width={CONTROL_SIZE} height={CONTROL_SIZE} cornerRadius={7} fill="#fff" stroke="#9a6d51" strokeWidth={1.2} shadowColor="#3f2f25" shadowBlur={5} shadowOpacity={.18} shadowOffsetY={2} />
    <Rect x={7} y={10} width={10} height={8} cornerRadius={2} fill={locked ? "#9a6d51" : "#fff"} stroke="#9a6d51" strokeWidth={1.5} />
    <Path
      data={locked ? "M9 10V7C9 3.5 15 3.5 15 7V10" : "M15 10V7C15 3.5 9 3.5 9 7"}
      stroke="#9a6d51"
      strokeWidth={1.6}
      lineCap="round"
      lineJoin="round"
    />
    <Rect x={11.2} y={12.4} width={1.6} height={3.3} cornerRadius={1} fill={locked ? "#fff" : "#9a6d51"} />
  </Group>;
});

SelectionLockControl.displayName = "SelectionLockControl";
