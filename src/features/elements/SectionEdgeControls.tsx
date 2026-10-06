import type { SectionEdgeConfig } from "../../types/editor";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { getSectionShape, resolveSectionEdge, SECTION_EDGE_PRESETS } from "../../utils/sectionEdges";

export function SectionEdgeControls({ side, value, onChange }: { side: "top" | "bottom"; value?: SectionEdgeConfig; onChange: (value: SectionEdgeConfig) => void }) {
  const edge = resolveSectionEdge(value);
  const label = side === "top" ? "haute" : "basse";
  const change = (changes: Partial<SectionEdgeConfig>) => onChange({ ...edge, ...changes });
  return <fieldset className="section-edge-controls"><legend>Bordure {label}</legend>
    <label className="compact-check"><input type="checkbox" checked={edge.enabled} onChange={(event) => change({ enabled: event.target.checked, ...(event.target.checked && edge.style === "none" ? { style: "tear" } : {}) })} />Activer la bordure {label}</label>
    <div className="section-edge-presets" role="group" aria-label={`Style bordure ${label}`}>
      {SECTION_EDGE_PRESETS.map((preset) => {
        const demo = { ...edge, style: preset.id, enabled: true, height: 13, intensity: 1 };
        const shape = getSectionShape(100, 36, side === "top" ? demo : undefined, side === "bottom" ? demo : undefined);
        return <button type="button" key={preset.id} title={preset.label} aria-label={`${preset.label} — bordure ${label}`} aria-pressed={edge.style === preset.id} onClick={() => change({ style: preset.id, enabled: preset.id !== "none" })}>
          <svg viewBox="0 0 100 36" aria-hidden="true"><path d={shape.path} fill="currentColor" /></svg><span>{preset.label}</span>
        </button>;
      })}
    </div>
    <label className="field"><span>Hauteur (px)</span><DimensionInput aria-label={`Hauteur bordure ${label}`} min={0} max={240} value={edge.height} onCommit={(height) => change({ height })} /></label>
    <label className="compact-check"><input type="checkbox" checked={edge.inverted} onChange={(event) => change({ inverted: event.target.checked })} />Inverser la bordure {label}</label>
    <label className="field"><span>Amplitude · {Math.round(edge.intensity! * 100)} %</span><input aria-label={`Amplitude bordure ${label}`} type="range" min={0} max={1} step={.05} value={edge.intensity} onChange={(event) => change({ intensity: Number(event.target.value) })} /></label>
  </fieldset>;
}
