import type { CountdownElement } from "../../types/editor";
import { getCountdownLayout } from "../../utils/countdownLayout";
import { getElementLayout } from "../../utils/responsiveLayout";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { useCountdownDay } from "../../hooks/useCountdownDay";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";

export function CountdownRenderer({ element, device }: { element: CountdownElement; device: PreviewDevice }) {
  useProjectFontRevision();
  const day = useCountdownDay(), scene = getCountdownLayout(element, getElementLayout(element, device), day);
  const px = (value: number) => `${value / PREVIEW_DEVICES[device].width * 100}cqw`;
  return <div className="countdown-renderer" data-countdown-date={element.targetDate} data-countdown-days={scene.days} aria-label={`${scene.days} ${element.label}`}>
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <rect x={scene.borderWidth / 2} y={scene.borderWidth / 2} width={scene.width - scene.borderWidth} height={scene.height - scene.borderWidth} rx={scene.borderRadius} fill={scene.backgroundColor} stroke={scene.borderColor} strokeWidth={scene.borderWidth} />
    </svg>
    {scene.text.map((text) => <span key={text.role} data-countdown-role={text.role} style={{ position: "absolute",
      left: `${(scene.offsetX + text.x * scene.scale) / scene.width * 100}%`, top: `${(scene.offsetY + text.y * scene.scale) / scene.height * 100}%`,
      width: `${text.width * scene.scale / scene.width * 100}%`, height: `${text.height * scene.scale / scene.height * 100}%`,
      fontFamily: text.fontFamily, fontSize: px(text.fontSize * scene.scale), fontWeight: 400, color: text.color, textAlign: text.align, lineHeight: 1.2, whiteSpace: "pre", margin: 0,
    }}>{text.text}</span>)}
  </div>;
}
