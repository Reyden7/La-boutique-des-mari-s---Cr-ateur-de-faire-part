import { Circle, Group, Path, Rect, Text } from "react-konva";
import type { CalendarElement } from "../../types/editor";
import { getCalendarLayout } from "../../utils/calendarLayout";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";

export function CalendarCanvasContent({ element, layout }: { element: CalendarElement; layout: { width: number; height: number } }) {
  const revision = useProjectFontRevision();
  const scene = getCalendarLayout(element, layout);
  return <>
    {/* Stable hit box: decoration and transparent backgrounds remain selectable. */}
    <Rect width={scene.width} height={scene.height} fill="rgba(0,0,0,0.001)" />
    <Group x={scene.offsetX} y={scene.offsetY} scaleX={scene.scale} scaleY={scene.scale} listening={false}>
      {scene.shapes.map((shape, index) => shape.kind === "rect"
        ? <Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} cornerRadius={shape.radius} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
        : shape.kind === "circle" ? <Circle key={index} x={shape.x} y={shape.y} radius={shape.radius!} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
          : <Path key={index} data={shape.data!} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} lineCap="round" lineJoin="round" />)}
      {scene.text.map((text, index) => <Text key={`${index}-${revision}`} name={`calendar-${text.role}`} x={text.x} y={text.y} width={text.width} height={text.height + .01} text={text.text} fontFamily={text.fontFamily} fontSize={text.fontSize} fontStyle={text.bold ? "bold" : "normal"} lineHeight={1.2} align={text.align} wrap="none" fill={text.color} />)}
    </Group>
  </>;
}
