import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import type { PreviewDevice } from "../../config/previewDevices";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import type { RsvpFormConfig } from "../../types/editor";
import { getRsvpAutomaticHeight, getRsvpBlockHeight, getRsvpWidth } from "../../utils/documentLayout";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";
import { RsvpFormRenderer } from "./RsvpFormRenderer";

/** Keep the editor's simplified fields and bottom button clear of each other too. */
const getEditorTextLayout = (config: RsvpFormConfig | undefined, width: number) => {
  const textWidth = Math.max(32, width - 88);
  const titleSize = config?.typography?.titleFontSize ?? 34;
  const fieldSize = config?.typography?.fieldFontSize ?? 13;
  const labelSize = config?.typography?.labelFontSize ?? 11;
  const measure = (text: string, fontFamily: string, fontSize: number, lineHeight: number) => {
    const node = new Konva.Text({ text, width: textWidth, fontFamily, fontSize, lineHeight });
    const height = node.height();
    node.destroy();
    return height;
  };
  const titleHeight = Math.max(76, measure(config?.title ?? "", config?.typography?.fontFamily ?? "Cormorant Garamond", titleSize, 1.05));
  const descriptionY = 58 + titleHeight + 12;
  const descriptionHeight = config?.description ? Math.max(44, measure(config.description, config.typography?.fontFamily ?? "Lora", fieldSize, 1.5)) : 0;
  const fieldsY = config?.description ? descriptionY + descriptionHeight + 15 : 58 + titleHeight + 71;
  const fieldStep = Math.max(82, labelSize * 1.4 + 66);
  return { textWidth, titleSize, fieldSize, labelSize, titleHeight, descriptionY, descriptionHeight, fieldsY, fieldStep,
    minimumHeight: Math.ceil(fieldsY + Math.max(0, (config?.fields.length ?? 0) - 1) * fieldStep + 170) };
};

/** Measure the same form used by Preview/Public at unscaled logical device width.
 * Measurements are transient UI state: never project_data or autosave data.
 * ResizeObserver also catches font loading and multiline labels/options.
 */
export function useRsvpBlockLayout(config: RsvpFormConfig | undefined, device: PreviewDevice) {
  const ref = useRef<HTMLDivElement>(null);
  const revision = useProjectFontRevision();
  const width = Math.min(PREVIEW_DEVICES[device].width, getRsvpWidth(config, device));
  const key = JSON.stringify([device, width, revision, config?.title, config?.description, config?.submitLabel, config?.fields, config?.typography]);
  const [measured, setMeasured] = useState<{ key: string; height: number }>();
  useLayoutEffect(() => {
    if (!config?.enabled || !ref.current) return;
    const section = ref.current.querySelector<HTMLElement>(".rsvp-public-section");
    const form = ref.current.querySelector<HTMLElement>(".rsvp-public-form");
    if (!section || !form) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const height = Math.ceil(section.getBoundingClientRect().height);
      setMeasured((current) => current?.key === key && current.height === height ? current : { key, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(form);
    void document.fonts.ready.then(measure);
    return () => { cancelled = true; observer.disconnect(); };
  }, [key, revision, config?.enabled]);
  const editorText = useMemo(() => getEditorTextLayout(config, width), [key]);
  const minimumHeight = Math.max(editorText.minimumHeight, measured?.key === key ? measured.height : getRsvpAutomaticHeight(config, device));
  return {
    height: getRsvpBlockHeight(config, device, minimumHeight),
    minimumHeight,
    editorText,
    measurement: config?.enabled ? <div className="rsvp-layout-measure" aria-hidden="true" inert ref={ref} style={{ width: PREVIEW_DEVICES[device].width }}>
      <div style={{ width }}><RsvpFormRenderer config={config} mode="preview" device={device} /></div>
    </div> : null,
  };
}
