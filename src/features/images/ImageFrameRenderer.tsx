import type { CSSProperties } from "react";
import type { ImageElement } from "../../types/editor";
import { getImageFrameMetrics, imageFrameCssBackground, resolveImageFrame } from "../../config/imageFrames";
import { resolveImageFit } from "../../utils/imageLayout";

interface ImageFrameRendererProps {
  element: ImageElement;
  layoutWidth: number;
  layoutHeight: number;
}

export function ImageFrameRenderer({ element, layoutWidth, layoutHeight }: ImageFrameRendererProps) {
  const frame = resolveImageFrame(element.imageStyle?.frame);
  const metrics = getImageFrameMetrics(frame, layoutWidth, layoutHeight);
  const unit = (value: number) => `${value / Math.max(1, layoutWidth) * 100}cqw`;
  const style = {
    "--image-frame-top": unit(metrics.top),
    "--image-frame-right": unit(metrics.right),
    "--image-frame-bottom": unit(metrics.bottom),
    "--image-frame-left": unit(metrics.left),
    "--image-frame-radius": unit(metrics.outerRadius),
    "--image-inner-radius": unit(metrics.innerRadius),
    "--image-frame-line": unit(Math.max(1, Math.min(frame.width, 6))),
    "--image-frame-color": frame.color,
    "--image-frame-opacity": frame.opacity,
    "--image-frame-shadow": frame.shadowEnabled
      ? `0 ${unit(frame.shadowDistance)} ${unit(frame.shadowBlur)} rgba(45, 34, 27, ${frame.shadowOpacity})`
      : "none",
    "--image-frame-background": imageFrameCssBackground(frame),
  } as CSSProperties;

  return <div className={`image-frame image-frame-${frame.type} image-frame-border-${frame.borderStyle}`} style={style}>
    <img src={element.src} alt={element.alt} draggable={false} style={{ objectFit: resolveImageFit(element.fit) }} />
    <span className="image-frame-detail" aria-hidden="true" />
    {frame.type === "wedding-floral" && <svg className="image-frame-floral" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g className="floral-corner floral-corner-tl"><path d="M3 22C7 10 13 5 25 3M6 16c4-1 7 1 8 5M12 9c1 4 4 6 8 6" /><circle cx="6" cy="16" r="2.3" /><circle cx="13" cy="8" r="2" /><circle cx="19" cy="5" r="1.6" /></g>
      <g className="floral-corner" transform="translate(100 100) rotate(180)"><path d="M3 22C7 10 13 5 25 3M6 16c4-1 7 1 8 5M12 9c1 4 4 6 8 6" /><circle cx="6" cy="16" r="2.3" /><circle cx="13" cy="8" r="2" /><circle cx="19" cy="5" r="1.6" /></g>
    </svg>}
  </div>;
}
