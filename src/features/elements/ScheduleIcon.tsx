import type { CSSProperties } from "react";
import { getScheduleIcon } from "../../config/scheduleIcons";
import type { ScheduleItem } from "../../types/editor";
import { getProgramIconKey, resolveProgramStepIcon } from "./programIconModel";

export function ScheduleIcon({ id, value, style, className }: { id?: string; value?: ScheduleItem["icon"]; style?: CSSProperties; className?: string }) {
  const source = resolveProgramStepIcon(value ?? id);
  if (!source) return null;
  if (source.type === "custom") return <img className={className} data-schedule-icon={getProgramIconKey(source)} data-schedule-custom-icon src={source.url} alt="" aria-hidden="true" decoding="async" style={{ ...style, objectFit: "contain", background: "transparent" }} />;
  const icon = getScheduleIcon(source.name);
  if (!icon) return null;
  return <svg className={className} data-schedule-icon={icon.id} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
    {icon.nodes.map((node, index) => "path" in node ? <path key={index} d={node.path} /> : <circle key={index} cx={node.cx} cy={node.cy} r={node.r} />)}
  </svg>;
}
