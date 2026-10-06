import { useId } from "react";
import type { SectionElement } from "../../types/editor";
import type { ResolvedElementLayout } from "../../utils/responsiveLayout";
import { getSectionBackgroundPaint, getSectionShape } from "../../utils/sectionEdges";

/** Only the section surface is clipped; children are rendered in the existing
 * overlay group, never inside these clips. Preview and Public share this SVG.
 */
export function SectionSurface({ element, layout }: { element: SectionElement; layout: ResolvedElementLayout }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shape = getSectionShape(layout.width, layout.height, layout.topEdge, layout.bottomEdge);
  const paint = getSectionBackgroundPaint(element.background, shape.width, shape.height);
  const gradient = element.background.gradient;
  const radius = Math.min(Math.max(0, element.cornerRadius || 0), shape.width / 2, shape.height / 2);
  const isGradient = element.background.type === "gradient" && gradient;
  return <svg className="document-section-element" data-section-surface={element.id} data-section-path={shape.path}
    viewBox={`0 0 ${shape.width} ${shape.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-edge`} clipPathUnits="userSpaceOnUse"><path d={shape.path} /></clipPath>
      <clipPath id={`${id}-corner`} clipPathUnits="userSpaceOnUse"><rect width={shape.width} height={shape.height} rx={radius} /></clipPath>
      {isGradient && (gradient.type === "radial"
        ? <radialGradient id={`${id}-paint`} gradientUnits="userSpaceOnUse" cx={paint.center.x} cy={paint.center.y} r={paint.radius}><stop offset="0" stopColor={gradient.color1} /><stop offset="1" stopColor={gradient.color2} /></radialGradient>
        : <linearGradient id={`${id}-paint`} gradientUnits="userSpaceOnUse" x1={paint.start.x} y1={paint.start.y} x2={paint.end.x} y2={paint.end.y}><stop offset="0" stopColor={gradient.color1} /><stop offset="1" stopColor={gradient.color2} /></linearGradient>)}
    </defs>
    <g clipPath={`url(#${id}-corner)`}><g clipPath={`url(#${id}-edge)`}>
      <rect width={shape.width} height={shape.height} fill={isGradient ? `url(#${id}-paint)` : element.background.type === "image" ? element.background.color ?? "transparent" : paint.color} />
      {element.background.type === "image" && element.background.imageUrl && <image href={element.background.imageUrl} width={shape.width} height={shape.height} preserveAspectRatio="xMidYMid slice" />}
    </g></g>
  </svg>;
}
