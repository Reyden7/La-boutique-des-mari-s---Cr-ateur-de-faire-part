import { DimensionInput } from "../../components/ui/DimensionInput";
import { useEditorStore } from "../../stores/editorStore";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { DOOR_PART_FIELDS, resolveDoorOffset, updateDoorDeviceSettings, type DoorPart } from "./doorAssets";
import { resolveEnvelopeOffset } from "./pngEnvelopeLayout";
import type { EnvelopeOffset } from "../../types/editor";

export function DoorPositionControls({ part }: { part: DoorPart }) {
  const project = useEditorStore((state) => state.project);
  const device = useEditorStore((state) => state.previewDevice);
  if (!project) return null;
  const fields = DOOR_PART_FIELDS[part];
  const offset = resolveDoorOffset(project.opening.doors, part, device);
  const update = (patch: Partial<EnvelopeOffset>) => {
    const state = useEditorStore.getState();
    if (state.project?.id !== project.id || state.project.opening.type !== "doors" || state.previewDevice !== device) return;
    const opening = state.project.opening;
    state.updateOpening({ ...opening, doors: updateDoorDeviceSettings(opening.doors, device, {
      [fields.offset]: resolveEnvelopeOffset({ ...resolveDoorOffset(opening.doors, part, device), ...patch }),
    }) });
  };
  return <fieldset className="envelope-position-controls">
    <legend>Position fermée</legend><small>Support actif : {PREVIEW_DEVICES[device].label}</small>
    <small>Décalage en % de la zone d’ouverture · 0 = position normale.</small>
    {(["x", "y"] as const).map((axis) => {
      const label = axis === "x" ? "Position horizontale" : "Position verticale";
      const accessible = `${fields.label} — ${label} (%)`;
      return <label key={axis} className="envelope-position-field"><span>{label}</span><div>
        <input type="range" aria-label={`${accessible} — curseur`} min={-50} max={50} step={1} value={offset[axis]} onChange={(event) => update({ [axis]: Number(event.currentTarget.value) })} />
        <DimensionInput key={`${device}-${axis}`} aria-label={accessible} value={offset[axis]} min={-50} max={50} step={1} onCommit={(value) => update({ [axis]: value })} /><span>%</span>
      </div></label>;
    })}
    <button type="button" onClick={() => update({ x: 0, y: 0 })}>Réinitialiser la position</button>
  </fieldset>;
}
