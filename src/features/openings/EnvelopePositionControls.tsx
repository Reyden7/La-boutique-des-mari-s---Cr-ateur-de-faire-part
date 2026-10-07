import { RotateCcw } from "lucide-react";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { useEditorStore } from "../../stores/editorStore";
import { ENVELOPE_PART_FIELDS, type EnvelopePart } from "./envelopeAssets";
import { ENVELOPE_OFFSET_FIELDS, resolveEnvelopeOffset } from "./pngEnvelopeLayout";
import type { EnvelopeOffset } from "../../types/editor";

export function EnvelopePositionControls({ part }: { part: EnvelopePart }) {
  const project = useEditorStore((state) => state.project);
  if (!project) return null;
  const field = ENVELOPE_OFFSET_FIELDS[part];
  const offset = resolveEnvelopeOffset(project.opening.envelope?.[field]);
  const update = (patch: Partial<EnvelopeOffset>) => {
    const state = useEditorStore.getState();
    if (state.project?.id !== project.id || state.project.opening.type !== "envelope") return;
    const opening = state.project.opening;
    state.updateOpening({ ...opening, envelope: { ...opening.envelope,
      [field]: resolveEnvelopeOffset({ ...resolveEnvelopeOffset(opening.envelope?.[field]), ...patch }),
    } });
  };
  return <fieldset className="envelope-position-controls">
    <legend>Position fermée</legend>
    <small>Décalage en % du Smartphone · 0 = position normale.</small>
    {(["x", "y"] as const).map((axis) => {
      const label = axis === "x" ? "Position horizontale" : "Position verticale";
      const accessibleLabel = `${ENVELOPE_PART_FIELDS[part].label} — ${label} (%)`;
      return <label key={axis} className="envelope-position-field">
        <span>{label}</span>
        <div>
          <input type="range" aria-label={`${accessibleLabel} — curseur`} min={-50} max={50} step={1} value={offset[axis]} onChange={(event) => update({ [axis]: Number(event.currentTarget.value) })} />
          <DimensionInput aria-label={accessibleLabel} value={offset[axis]} min={-50} max={50} step={1} onCommit={(value) => update({ [axis]: value })} />
          <span>%</span>
        </div>
      </label>;
    })}
    <button type="button" onClick={() => update({ x: 0, y: 0 })}><RotateCcw size={13} /> Réinitialiser la position</button>
  </fieldset>;
}
