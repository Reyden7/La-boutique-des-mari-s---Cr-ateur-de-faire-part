import type { CSSProperties } from "react";
import type { ScheduleElement } from "../../types/editor";
import type { PreviewDevice } from "../../config/previewDevices";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { getElementLayout } from "../../utils/responsiveLayout";
import { getScheduleLayout, type ScheduleTextBox } from "../../utils/scheduleLayout";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";
import { ScheduleIcon } from "./ScheduleIcon";

const getScheduleTextColor = (element: ScheduleElement, role: ScheduleTextBox["role"]) =>
  role === "time" ? element.timeColor : role === "title" ? element.titleColor ?? element.textColor : element.descriptionColor ?? element.textColor;

export function ScheduleRenderer({ element, device }: { element: ScheduleElement; device: PreviewDevice }) {
  useProjectFontRevision();
  const layout = getScheduleLayout(element, getElementLayout(element, device));
  const px = (value: number) => `${value / PREVIEW_DEVICES[device].width * 100}cqw`;
  const position = (x: number, y: number, width: number, height: number): CSSProperties => ({
    position: "absolute", left: `${x / layout.width * 100}%`, top: `${y / layout.height * 100}%`, width: `${width / layout.width * 100}%`, height: `${height / layout.height * 100}%`,
  });
  return <article className={`schedule-renderer schedule-block schedule-${element.displayStyle} schedule-${layout.orientation}`} data-schedule-columns={layout.columns} style={{ background: element.backgroundColor, color: element.textColor }}>
    <svg className="schedule-connectors" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">
      {layout.lines.map(([x1, y1, x2, y2], index) => <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={element.lineColor} strokeWidth={1} opacity={element.displayStyle === "elegant" ? .65 : 1} />)}
      {layout.steps.map((step) => step.marker && (step.marker.diamond
        ? <rect key={step.id} x={step.marker.x - step.marker.size / 2} y={step.marker.y - step.marker.size / 2} width={step.marker.size} height={step.marker.size} transform={`rotate(45 ${step.marker.x} ${step.marker.y})`} fill={element.backgroundColor} stroke={element.accentColor} strokeWidth={1.5} />
        : <circle key={step.id} cx={step.marker.x} cy={step.marker.y} r={step.marker.size / 2} fill={element.backgroundColor} stroke={element.accentColor} strokeWidth={2} />))}
    </svg>
    {layout.steps.map((step) => <div className="schedule-step" data-schedule-step={step.id} key={step.id}>
      {step.icon && <ScheduleIcon value={step.icon.source} style={{ ...position(step.icon.x, step.icon.y, step.icon.size, step.icon.size), color: element.iconColor ?? element.accentColor, background: element.backgroundColor }} />}
      {step.text.map((text) => {
        const style: CSSProperties = { ...position(text.x, text.y, text.width, text.height), color: getScheduleTextColor(element, text.role), fontFamily: text.fontFamily, fontSize: px(text.fontSize), fontWeight: text.bold ? 700 : 400, lineHeight: text.lineHeight, textAlign: text.align, opacity: text.role === "description" ? .72 : 1 };
        return text.role === "time" ? <time key={text.role} style={style}>{text.text}</time>
          : text.role === "title" ? <strong key={text.role} style={style}>{text.text}</strong> : <p key={text.role} style={style}>{text.text}</p>;
      })}
    </div>)}
  </article>;
}
