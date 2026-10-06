import { useEffect, useState } from "react";
import { Circle, Group, Image as KonvaImage, Line, Path, Rect, Text } from "react-konva";
import type { ScheduleElement, ProgramCustomIcon } from "../../types/editor";
import type { ResolvedElementLayout } from "../../utils/responsiveLayout";
import { getScheduleLayout } from "../../utils/scheduleLayout";
import { getScheduleIcon } from "../../config/scheduleIcons";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";
import { getImageRenderLayout } from "../../utils/imageLayout";

function CustomIconCanvas({ icon, x, y, size }: { icon: ProgramCustomIcon; x: number; y: number; size: number }) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement }>();
  useEffect(() => {
    const next = new Image();
    next.crossOrigin = "anonymous";
    next.onload = () => setLoaded({ src: icon.url, image: next });
    next.onerror = () => setLoaded(undefined);
    next.src = icon.url;
    return () => { next.onload = null; next.onerror = null; };
  }, [icon.url]);
  const image = loaded?.src === icon.url ? loaded.image : undefined;
  if (!image) return null;
  const box = getImageRenderLayout(image.naturalWidth, image.naturalHeight, size, size, "contain");
  return <KonvaImage name="schedule-custom-icon" image={image} x={x + box.x} y={y + box.y} width={box.width} height={box.height} listening={false} />;
}

/** Uses exactly the DOM renderer's logical geometry, line breaks and vector paths. */
export function ScheduleCanvasContent({ element, layout: resolved }: { element: ScheduleElement; layout: ResolvedElementLayout }) {
  const fontRevision = useProjectFontRevision();
  const layout = getScheduleLayout(element, resolved);
  return <>
    <Rect width={layout.width} height={layout.height} fill={element.backgroundColor} cornerRadius={14} />
    {layout.lines.map((points, index) => <Line key={`line-${index}`} points={points} stroke={element.lineColor} strokeWidth={1} opacity={element.displayStyle === "elegant" ? .65 : 1} />)}
    {layout.steps.map((step) => <Group key={step.id} name="schedule-step">
      {step.marker && (step.marker.diamond
        ? <Rect x={step.marker.x} y={step.marker.y} offsetX={step.marker.size / 2} offsetY={step.marker.size / 2} width={step.marker.size} height={step.marker.size} rotation={45} fill={element.backgroundColor} stroke={element.accentColor} strokeWidth={1.5} />
        : <Circle x={step.marker.x} y={step.marker.y} radius={step.marker.size / 2} fill={element.backgroundColor} stroke={element.accentColor} strokeWidth={2} />)}
      {step.icon?.source.type === "custom" && <CustomIconCanvas icon={step.icon.source} x={step.icon.x} y={step.icon.y} size={step.icon.size} />}
      {step.icon?.source.type === "preset" && <Group x={step.icon.x} y={step.icon.y} scaleX={step.icon.size / 24} scaleY={step.icon.size / 24} name={`schedule-icon-${step.icon.id}`}>
        <Rect width={24} height={24} fill={element.backgroundColor} />
        {getScheduleIcon(step.icon.id)?.nodes.map((node, index) => "path" in node
          ? <Path key={index} data={node.path} stroke={element.iconColor ?? element.accentColor} strokeWidth={1.65} lineCap="round" lineJoin="round" />
          : <Circle key={index} x={node.cx} y={node.cy} radius={node.r} stroke={element.iconColor ?? element.accentColor} strokeWidth={1.65} />)}
      </Group>}
      {step.text.map((text) => <Text name={`schedule-${text.role}`} key={`${text.role}-${fontRevision}`} x={text.x} y={text.y} width={text.width} height={text.height + .01} text={text.text} fontFamily={text.fontFamily} fontSize={text.fontSize} fontStyle={text.bold ? "bold" : "normal"} lineHeight={text.lineHeight} align={text.align} wrap="none" fill={text.role === "time" ? element.timeColor : text.role === "title" ? element.titleColor ?? element.textColor : element.descriptionColor ?? element.textColor} opacity={text.role === "description" ? .72 : 1} />)}
    </Group>)}
  </>;
}
