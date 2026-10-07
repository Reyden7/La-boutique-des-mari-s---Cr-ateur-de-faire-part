import { RotateCcw } from "lucide-react";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { useEditorStore } from "../../stores/editorStore";
import { ENVELOPE_PART_FIELDS, type EnvelopePart } from "./envelopeAssets";
import { ENVELOPE_OFFSET_FIELDS, resolveEnvelopeOffset, resolveEnvelopeSealScale, resolveEnvelopeDeviceSettings, updateEnvelopeDeviceSettings } from "./pngEnvelopeLayout";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import type { EnvelopeDeviceSettings, EnvelopeOffset } from "../../types/editor";

export function EnvelopePositionControls({ part }: { part: EnvelopePart }) {
  const project = useEditorStore((state) => state.project);
  const device = useEditorStore((state) => state.previewDevice);
  if (!project) return null;
  const settings = resolveEnvelopeDeviceSettings(project.opening.envelope, device);
  const field = ENVELOPE_OFFSET_FIELDS[part];
  const offset = resolveEnvelopeOffset(settings[field]);
  const sizePercent = Math.round(resolveEnvelopeSealScale(settings.sealScale) * 100);
  const updateEnvelope = (patch: (settings: EnvelopeDeviceSettings) => Partial<EnvelopeDeviceSettings>) => {
    const state = useEditorStore.getState();
    if (state.project?.id !== project.id || state.project.opening.type !== "envelope" || state.previewDevice !== device) return;
    const opening = state.project.opening;
    state.updateOpening({ ...opening, envelope: updateEnvelopeDeviceSettings(opening.envelope, device, patch(resolveEnvelopeDeviceSettings(opening.envelope, device))) });
  };
  const update = (patch: Partial<EnvelopeOffset>) => updateEnvelope((envelope) => ({
    [field]: resolveEnvelopeOffset({ ...resolveEnvelopeOffset(envelope[field]), ...patch }),
  }));
  const updateSize = (percent: number) => updateEnvelope(() => ({ sealScale: resolveEnvelopeSealScale(percent / 100) }));
  return <fieldset className="envelope-position-controls">
    <legend>Position fermée</legend>
    <small>Support actif : {PREVIEW_DEVICES[device].label}</small>
    <small>Décalage en % de l’enveloppe · 0 = position normale.</small>
    {(["x", "y"] as const).map((axis) => {
      const label = axis === "x" ? "Position horizontale" : "Position verticale";
      const accessibleLabel = `${ENVELOPE_PART_FIELDS[part].label} — ${label} (%)`;
      return <label key={axis} className="envelope-position-field">
        <span>{label}</span>
        <div>
          <input type="range" aria-label={`${accessibleLabel} — curseur`} min={-50} max={50} step={1} value={offset[axis]} onChange={(event) => update({ [axis]: Number(event.currentTarget.value) })} />
          <DimensionInput key={`${device}-${axis}`} aria-label={accessibleLabel} value={offset[axis]} min={-50} max={50} step={1} onCommit={(value) => update({ [axis]: value })} />
          <span>%</span>
        </div>
      </label>;
    })}
    {part === "seal" && <label className="envelope-position-field">
      <span>Taille du cachet</span>
      <div>
        <input type="range" aria-label="Taille du cachet (%) — curseur" min={50} max={200} step={5} value={sizePercent} onChange={(event) => updateSize(Number(event.currentTarget.value))} />
        <DimensionInput key={device} aria-label="Taille du cachet (%)" value={sizePercent} min={50} max={200} step={5} onLiveChange={updateSize} onCommit={updateSize} />
        <span>%</span>
      </div>
    </label>}
    <button type="button" onClick={() => part === "seal"
      ? updateEnvelope(() => ({ sealClosedOffset: { x: 0, y: 0 }, sealScale: 1 }))
      : update({ x: 0, y: 0 })}><RotateCcw size={13} /> {part === "seal" ? "Réinitialiser le cachet" : "Réinitialiser la position"}</button>
  </fieldset>;
}
