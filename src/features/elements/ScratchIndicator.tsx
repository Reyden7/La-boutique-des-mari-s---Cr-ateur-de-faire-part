import { Hand, Pointer } from "lucide-react";
import type { CSSProperties } from "react";
import type { ScratchIndicatorConfig } from "../../types/editor";

interface ScratchIndicatorProps {
  indicator: ScratchIndicatorConfig;
  elementWidth: number;
}

export function ScratchIndicator({ indicator, elementWidth }: ScratchIndicatorProps) {
  const width = Math.max(1, elementWidth);
  const unit = (value: number) => `${value / width * 100}cqw`;
  const showsText = indicator.type === "text" || indicator.type === "finger-text";
  const showsFinger = indicator.type === "finger" || indicator.type === "finger-text";
  const iconSize = unit(indicator.size);
  const textSize = unit(Math.max(9, indicator.size * 0.38));
  const style = {
    left: `calc(50% + ${unit(indicator.x)})`,
    top: `calc(50% + ${unit(indicator.y)})`,
    color: indicator.color,
    opacity: indicator.opacity,
    "--scratch-indicator-icon-size": iconSize,
    "--scratch-indicator-text-size": textSize,
  } as CSSProperties;

  return <div
    className={`scratch-indicator${indicator.animated ? " is-animated" : ""}`}
    style={style}
    aria-hidden="true"
  >
    <div className="scratch-indicator-motion">
      {showsFinger && <Pointer className="scratch-indicator-icon" strokeWidth={1.65} />}
      {indicator.type === "hand" && <Hand className="scratch-indicator-icon" strokeWidth={1.55} />}
      {showsText && <span style={{ fontFamily: indicator.fontFamily, fontWeight: indicator.fontWeight }}>{indicator.text}</span>}
    </div>
  </div>;
}
