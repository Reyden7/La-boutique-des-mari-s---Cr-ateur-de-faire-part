import { DimensionInput } from "../../components/ui/DimensionInput";
import { useEditorStore } from "../../stores/editorStore";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { resolveDoorDeviceScale, resolveDoorScale, updateDoorDeviceSettings } from "./doorAssets";

export function DoorSizeControls() {
  const project = useEditorStore((state) => state.project);
  const device = useEditorStore((state) => state.previewDevice);
  if (!project) return null;
  const percent = Math.round(resolveDoorDeviceScale(project.opening.doors, device) * 100);
  const update = (value: number) => {
    const state = useEditorStore.getState();
    if (state.project?.id !== project.id || state.project.opening.type !== "doors" || state.previewDevice !== device) return;
    const opening = state.project.opening;
    state.updateOpening({ ...opening, doors: updateDoorDeviceSettings(opening.doors, device, { scale: resolveDoorScale(value / 100) }) });
  };
  return <fieldset className="envelope-position-controls">
    <legend>Taille de la porte</legend><small>Support actif : {PREVIEW_DEVICES[device].label}</small>
    <div className="envelope-position-field"><div>
      <input type="range" aria-label="Taille de la porte (%) — curseur" min={50} max={150} step={5} value={percent} onChange={(event) => update(Number(event.currentTarget.value))} />
      <DimensionInput key={device} aria-label="Taille de la porte (%)" min={50} max={150} step={5} value={percent} onLiveChange={update} onCommit={update} /><span>%</span>
    </div></div>
    <button type="button" onClick={() => update(100)}>Réinitialiser la taille</button>
  </fieldset>;
}
