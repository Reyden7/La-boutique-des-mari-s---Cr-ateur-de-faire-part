import type { PreviewDevice } from "../../config/previewDevices";
import type { ImageElement, ImageFadeConfig } from "../../types/editor";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { SectionEdgeControls } from "../elements/SectionEdgeControls";
import { resolveImageAppearance, setImageAppearanceForDevice } from "../../utils/imageAppearance";

function FadeControls({ side, value, onChange }: { side: "haut" | "bas"; value: ImageFadeConfig; onChange: (value: ImageFadeConfig) => void }) {
  const change = (values: Partial<ImageFadeConfig>) => onChange({ ...value, ...values });
  return <fieldset className="section-edge-controls"><legend>Fondu {side}</legend>
    <label className="compact-check"><input type="checkbox" checked={value.enabled} onChange={(event) => change({ enabled: event.target.checked })} />Activer le fondu {side}</label>
    {value.enabled && <>
      <label className="field"><span>Hauteur du fondu (px)</span><DimensionInput aria-label={`Hauteur fondu ${side}`} min={0} max={1000} value={value.height} onCommit={(height) => change({ height })} /></label>
      <label className="field"><span>Intensité du fondu · {Math.round(value.intensity * 100)} %</span><input aria-label={`Intensité fondu ${side}`} type="range" min={0} max={1} step={.05} value={value.intensity} onChange={(event) => change({ intensity: Number(event.target.value) })} /></label>
      <label className="field"><span>Intensité du flou · {value.blur} px</span><input aria-label={`Flou ${side}`} type="range" min={0} max={24} step={1} value={value.blur} onChange={(event) => change({ blur: Number(event.target.value) })} /></label>
      <label className="field"><span>Opacité finale · {Math.round(value.opacity * 100)} %</span><input aria-label={`Opacité finale ${side}`} type="range" min={0} max={1} step={.05} value={value.opacity} onChange={(event) => change({ opacity: Number(event.target.value) })} /></label>
    </>}
  </fieldset>;
}

export function ImageAppearanceProperties({ element, device, onChange }: { element: ImageElement; device: PreviewDevice; onChange: (values: Partial<ImageElement>) => void }) {
  const appearance = resolveImageAppearance(element, device);
  return <div className="image-appearance-properties">
    <p className="property-help">Réglages sur ce support uniquement. Le masque et le fondu s’appliquent à la photo, sans déformer l’image ni son cadre.</p>
    <SectionEdgeControls side="top" value={appearance.topEdge} onChange={(topEdge) => onChange(setImageAppearanceForDevice(element, device, { topEdge }))} />
    <SectionEdgeControls side="bottom" value={appearance.bottomEdge} onChange={(bottomEdge) => onChange(setImageAppearanceForDevice(element, device, { bottomEdge }))} />
    <h3>Fondu / flou</h3>
    <FadeControls side="haut" value={appearance.topFade} onChange={(topFade) => onChange(setImageAppearanceForDevice(element, device, { topFade }))} />
    <FadeControls side="bas" value={appearance.bottomFade} onChange={(bottomFade) => onChange(setImageAppearanceForDevice(element, device, { bottomFade }))} />
  </div>;
}
