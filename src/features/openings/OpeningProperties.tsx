import { StableColorInput } from "../../components/ui/StableColorInput";
import { Play } from "lucide-react";
import type { OpeningAnimationType } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { getOpeningDefinition } from "./registry/openingRegistry";
import { getPngEnvelopeDuration } from "./pngEnvelopeLayout";
import { EnvelopeAssetControls } from "./EnvelopeAssetControls";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function OpeningProperties({ onPreview }: { onPreview: (type: OpeningAnimationType) => void }) {
  const project = useEditorStore((state) => state.project);
  const updateOpening = useEditorStore((state) => state.updateOpening);
  const device = useEditorStore((state) => state.previewDevice);
  if (!project) return <aside className="properties-panel" />;
  const opening = project.opening;
  const definition = getOpeningDefinition(opening.type);
  const colors = opening.colors ?? definition.defaultSettings.colors ?? [];
  const pngEnvelope = opening.type === "envelope";
  const durationKey = device === "mobile" ? "mobilePngDuration" : "landscapePngDuration";
  const duration = pngEnvelope ? getPngEnvelopeDuration(opening.customSettings?.[durationKey]) : Math.max(1.4, opening.duration);
  const updateColor = (index: number, color: string) => { const next = [...colors]; next[index] = color; updateOpening({ ...opening, colors: next }); };
  const updateSetting = (key: string, value: string) => updateOpening({ ...opening, customSettings: { ...opening.customSettings, [key]: value } });
  return <aside className="properties-panel"><div className="properties-heading"><div><small>Expérience invité</small><h2>{definition.name}</h2></div><span className="type-pill">ouverture</span></div>
    <div className={`opening-property-hero ${opening.type}`}><span>{definition.thumbnail}</span><p>{definition.description}</p></div>
    {opening.type !== "none" && <><Field label="Style"><select value={opening.variant ?? "classic"} onChange={(event) => updateOpening({ ...opening, variant: event.target.value })}>{opening.type === "curtains" ? <><option value="velvet">Velours</option><option value="soft">Tissu doux</option></> : opening.type === "envelope" ? <option value="classic">Classique</option> : <><option value="classic">Classique</option><option value="modern">Moderne</option></>}</select></Field>
      {pngEnvelope ? <>
        <EnvelopeAssetControls />
        <Field label="Texte d’indication"><input value={typeof opening.customSettings?.hintText === "string" ? opening.customSettings.hintText : "Touchez pour ouvrir"} onChange={(event) => updateSetting("hintText", event.target.value)} /></Field>
      </> : <div className="field-row"><Field label="Couleur principale"><StableColorInput value={colors[0] ?? "#d8b99d"} onChange={(value) => updateColor(0, value)} /></Field><Field label="Couleur secondaire"><StableColorInput value={colors[1] ?? "#fffaf2"} onChange={(value) => updateColor(1, value)} /></Field></div>}
      <Field label={`Durée · ${duration.toFixed(1)} s`}><input type="range" min={pngEnvelope ? "0.9" : "1.4"} max={pngEnvelope ? "1.2" : "4"} step="0.1" value={duration} onChange={(event) => updateOpening(pngEnvelope ? { ...opening, customSettings: { ...opening.customSettings, [durationKey]: Number(event.target.value) } } : { ...opening, duration: Number(event.target.value) })} /></Field></>}
    <button className="large-preview-button" onClick={() => onPreview(opening.type)}><Play size={14} fill="currentColor" /> Voir l’ouverture</button>
    <div className="background-tip"><span>Design préservé</span><p>Vous pouvez changer d’ouverture à tout moment : vos pages, textes et images ne seront pas modifiés.</p></div>
  </aside>;
}
