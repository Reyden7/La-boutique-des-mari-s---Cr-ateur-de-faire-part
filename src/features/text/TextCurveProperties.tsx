import { DimensionInput } from "../../components/ui/DimensionInput";
import { PropertySection } from "../../components/properties/PropertySection";
import type { TextCurveConfig } from "../../types/editor";
import { DEFAULT_TEXT_CURVE, resolveTextCurve } from "./curvedTextLayout";

export function TextCurveProperties({ curve, onChange }: { curve?: TextCurveConfig; onChange: (curve: TextCurveConfig) => void }) {
  const current = resolveTextCurve(curve);
  const update = (patch: Partial<TextCurveConfig>) => onChange(resolveTextCurve({ ...current, ...patch }));
  return <PropertySection sectionKey="courbure" title="Courbure">
    <label className="checkbox-field"><input type="checkbox" checked={current.enabled} onChange={(event) => update({ enabled: event.target.checked })} />Activer la courbure</label>
    <label className="field"><span>Sens de la courbure</span><select aria-label="Sens de la courbure" disabled={!current.enabled} value={current.direction} onChange={(event) => update({ direction: event.target.value as TextCurveConfig["direction"] })}><option value="up">Vers le haut</option><option value="down">Vers le bas</option></select></label>
    <label className="field"><span>Intensité de la courbure · {current.amount} %</span><input aria-label="Intensité de la courbure — curseur" type="range" min={0} max={100} step={1} disabled={!current.enabled} value={current.amount} onChange={(event) => update({ amount: Number(event.target.value) })} /></label>
    <label className="field"><span>Valeur (%)</span><DimensionInput aria-label="Intensité de la courbure (%)" min={0} max={100} step={1} disabled={!current.enabled} value={current.amount} onLiveChange={(amount) => update({ amount })} onCommit={(amount) => update({ amount })} /></label>
    <div><small>Courbure commune aux trois supports. Si le bloc est trop petit, le rendu est réduit uniformément pour ne pas couper le texte.</small></div>
    <button type="button" onClick={() => onChange({ ...DEFAULT_TEXT_CURVE })}>Réinitialiser la courbure</button>
  </PropertySection>;
}
