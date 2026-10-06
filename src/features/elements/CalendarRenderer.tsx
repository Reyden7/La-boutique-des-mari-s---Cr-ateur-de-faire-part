import type { CalendarElement } from "../../types/editor";
import { getCalendarLayout } from "../../utils/calendarLayout";
import { getElementLayout } from "../../utils/responsiveLayout";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";

export function CalendarRenderer({ element, device }: { element: CalendarElement; device: PreviewDevice }) {
  useProjectFontRevision();
  const scene = getCalendarLayout(element, getElementLayout(element, device));
  const px = (value: number) => `${value * scene.scale / PREVIEW_DEVICES[device].width * 100}cqw`;
  return <article className={`calendar-renderer calendar-${scene.style}`} data-calendar-month={`${scene.year}-${scene.month}`} data-calendar-highlight={scene.highlightedDay ?? ""} aria-label={`Calendrier ${scene.month} / ${scene.year}`}>
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} preserveAspectRatio="none" aria-hidden="true">
      <g transform={`translate(${scene.offsetX} ${scene.offsetY}) scale(${scene.scale})`}>
        {scene.shapes.map((shape, index) => shape.kind === "rect"
          ? <rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.radius} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
          : shape.kind === "circle" ? <circle key={index} cx={shape.x} cy={shape.y} r={shape.radius} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
            : <path key={index} d={shape.data} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} strokeLinecap="round" strokeLinejoin="round" />)}
      </g>
    </svg>
    {scene.text.map((text, index) => <span key={index} data-calendar-role={text.role} data-calendar-day={text.day} aria-current={text.day === scene.highlightedDay ? "date" : undefined} style={{
      position: "absolute", left: `${(scene.offsetX + text.x * scene.scale) / scene.width * 100}%`, top: `${(scene.offsetY + text.y * scene.scale) / scene.height * 100}%`, width: `${text.width * scene.scale / scene.width * 100}%`, height: `${text.height * scene.scale / scene.height * 100}%`,
      fontFamily: text.fontFamily, fontSize: px(text.fontSize), fontWeight: text.bold ? 700 : 400, color: text.color, textAlign: text.align, lineHeight: 1.2, whiteSpace: "pre", margin: 0,
    }}>{text.text}</span>)}
  </article>;
}
