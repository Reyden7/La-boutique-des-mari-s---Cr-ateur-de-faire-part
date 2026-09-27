import type { CSSProperties } from "react";
import type { DecorativeHeartStyle } from "../../types/editor";
import { getDecorativeHeart } from "./heartRegistry";

export function DecorativeHeartSvg({
  variant,
  className,
  style,
}: {
  variant: DecorativeHeartStyle;
  className?: string;
  style?: CSSProperties;
}) {
  const heart = getDecorativeHeart(variant);
  return <svg className={className} style={style} viewBox="0 0 100 100" role="img" aria-label={`Cœur ${heart.label}`}>
    <path
      d={heart.path}
      fill={heart.filled ? "currentColor" : "none"}
      stroke={heart.filled ? "none" : "currentColor"}
      strokeWidth={heart.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>;
}
