import { Group, Rect, Text } from "react-konva";
import type { CountdownElement } from "../../types/editor";
import { getCountdownLayout } from "../../utils/countdownLayout";
import { useCountdownDay } from "../../hooks/useCountdownDay";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";

export function CountdownCanvasContent({ element, layout }: { element: CountdownElement; layout: { width: number; height: number } }) {
  const revision = useProjectFontRevision(), day = useCountdownDay();
  const scene = getCountdownLayout(element, layout, day);
  return <>
    <Rect width={scene.width} height={scene.height} fill="rgba(0,0,0,0.001)" />
    <Rect x={scene.borderWidth / 2} y={scene.borderWidth / 2} width={scene.width - scene.borderWidth} height={scene.height - scene.borderWidth} fill={scene.backgroundColor} stroke={scene.borderColor} strokeWidth={scene.borderWidth} cornerRadius={scene.borderRadius} listening={false} />
    <Group x={scene.offsetX} y={scene.offsetY} scaleX={scene.scale} scaleY={scene.scale} listening={false}>
      {scene.text.map((text) => <Text key={`${text.role}-${revision}`} name={`countdown-${text.role}`} x={text.x} y={text.y} width={text.width} height={text.height + .01} text={text.text} fontFamily={text.fontFamily} fontSize={text.fontSize} lineHeight={1.2} align={text.align} wrap="none" fill={text.color} />)}
    </Group>
  </>;
}
