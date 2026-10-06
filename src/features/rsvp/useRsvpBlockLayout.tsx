import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import type { PreviewDevice } from "../../config/previewDevices";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import type { RsvpFormConfig } from "../../types/editor";
import { getRsvpAutomaticHeight, getRsvpBlockHeight, getRsvpWidth } from "../../utils/documentLayout";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";
import { RsvpFormRenderer } from "./RsvpFormRenderer";
import { getFormSpacingScale, resolveRsvpTypography } from "../../utils/responsiveVisualStyle";

/** Keep the editor's simplified fields and bottom button clear of each other too. */
const getEditorTextLayout = (config: RsvpFormConfig | undefined, width: number, spacing = 1) => {
  const inset = 44 * spacing;
  const titleY = 58 * spacing;
  const textWidth = Math.max(32, width - inset * 2);
  const titleSize = config?.typography?.titleFontSize ?? 34;
  const fieldSize = config?.typography?.fieldFontSize ?? 13;
  const labelSize = config?.typography?.labelFontSize ?? 11;
  const measure = (text: string, fontFamily: string, fontSize: number, lineHeight: number) => {
    const node = new Konva.Text({ text, width: textWidth, fontFamily, fontSize, lineHeight });
    const height = node.height();
    node.destroy();
    return height;
  };
  const titleHeight = Math.max(76 * spacing, measure(config?.title ?? "", config?.typography?.fontFamily ?? "Cormorant Garamond", titleSize, 1.05));
  const descriptionY = titleY + titleHeight + 12 * spacing;
  const descriptionHeight = config?.description ? Math.max(44 * spacing, measure(config.description, config.typography?.fontFamily ?? "Lora", fieldSize, 1.5)) : 0;
  const fieldsY = config?.description ? descriptionY + descriptionHeight + 15 * spacing : titleY + titleHeight + 71 * spacing;
  const fieldStep = Math.max(82 * spacing, labelSize * 1.4 + 66 * spacing);
  return { inset, spacing, titleY, textWidth, titleSize, fieldSize, labelSize, titleHeight, descriptionY, descriptionHeight, fieldsY, fieldStep,
    minimumHeight: Math.ceil(fieldsY + Math.max(0, (config?.fields.length ?? 0) - 1) * fieldStep + 170 * spacing) };
};

/** Measure the same form used by Preview/Public at unscaled logical device width.
 * Measurements are transient UI state: never project_data or autosave data.
 * ResizeObserver also catches font loading and multiline labels/options.
 */
export function useRsvpBlockLayout(config: RsvpFormConfig | undefined, device: PreviewDevice) {
  const ref = useRef<HTMLDivElement>(null);
  const revision = useProjectFontRevision();
  const width = Math.min(PREVIEW_DEVICES[device].width, getRsvpWidth(config, device));
  const typography = resolveRsvpTypography(config, device);
  const key = JSON.stringify([device, width, revision, config?.title, config?.description, config?.submitLabel, config?.fields, typography, device === "mobile" ? undefined : config?.responsive?.[device]?.formSpacingScale]);
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
  const editorText = useMemo(() => getEditorTextLayout(config && { ...config, typography }, width, config ? getFormSpacingScale(config, device) : 1), [key]);
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
