import { StableColorInput } from "../../components/ui/StableColorInput";
import { Play } from "lucide-react";
import type { OpeningAnimationType } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { getOpeningDefinition } from "./registry/openingRegistry";
import { getEnvelopeDuration } from "./envelopeSettings";
import { EnvelopeSealControls } from "./EnvelopeSealControls";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function OpeningProperties({ onPreview }: { onPreview: (type: OpeningAnimationType) => void }) {
  const project = useEditorStore((state) => state.project);
  const updateOpening = useEditorStore((state) => state.updateOpening);
  if (!project) return <aside className="properties-panel" />;
  const opening = project.opening;
  const definition = getOpeningDefinition(opening.type);
  const colors = opening.colors ?? definition.defaultSettings.colors ?? [];
  const duration = opening.type === "envelope" ? getEnvelopeDuration(opening.duration) : Math.max(1.4, opening.duration);
  const updateColor = (index: number, color: string) => { const next = [...colors]; next[index] = color; updateOpening({ ...opening, colors: next }); };
  const updateSetting = (key: string, value: string) => updateOpening({ ...opening, customSettings: { ...opening.customSettings, [key]: value } });
  return <aside className="properties-panel"><div className="properties-heading"><div><small>Expérience invité</small><h2>{definition.name}</h2></div><span className="type-pill">ouverture</span></div>
    <div className={`opening-property-hero ${opening.type}`}><span>{definition.thumbnail}</span><p>{definition.description}</p></div>
    {opening.type !== "none" && <><Field label="Style"><select value={opening.variant ?? "classic"} onChange={(event) => updateOpening({ ...opening, variant: event.target.value })}>{opening.type === "curtains" ? <><option value="velvet">Velours</option><option value="soft">Tissu doux</option></> : opening.type === "envelope" ? <option value="classic">Classique</option> : <><option value="classic">Classique</option><option value="modern">Moderne</option></>}</select></Field>
      {opening.type === "envelope" ? <>
        <div className="field-row"><Field label="Papier"><StableColorInput value={colors[0] ?? "#E7D2C3"} onChange={(value) => updateColor(0, value)} /></Field><Field label="Intérieur"><StableColorInput value={colors[1] ?? "#F5E9DF"} onChange={(value) => updateColor(1, value)} /></Field></div>
        <div className="field-row"><Field label="Rabat"><StableColorInput value={typeof opening.customSettings?.flapColor === "string" ? opening.customSettings.flapColor : colors[0] ?? "#DFC4B1"} onChange={(value) => updateSetting("flapColor", value)} /></Field><Field label="Cachet"><StableColorInput value={colors[2] ?? "#B58A62"} onChange={(value) => updateColor(2, value)} /></Field></div>
        <Field label="Fond de l’ouverture"><StableColorInput value={typeof opening.customSettings?.backgroundColor === "string" ? opening.customSettings.backgroundColor : "#F5EFEA"} onChange={(value) => updateSetting("backgroundColor", value)} /></Field>
        <Field label="Texte d’indication"><input value={typeof opening.customSettings?.hintText === "string" ? opening.customSettings.hintText : typeof opening.customSettings?.label === "string" ? opening.customSettings.label : "Touchez pour ouvrir"} onChange={(event) => updateSetting("hintText", event.target.value)} /></Field>
        <EnvelopeSealControls />
      </> : <div className="field-row"><Field label="Couleur principale"><StableColorInput value={colors[0] ?? "#d8b99d"} onChange={(value) => updateColor(0, value)} /></Field><Field label="Couleur secondaire"><StableColorInput value={colors[1] ?? "#fffaf2"} onChange={(value) => updateColor(1, value)} /></Field></div>}
      <Field label={`Durée · ${duration.toFixed(1)} s`}><input type="range" min={opening.type === "envelope" ? "1.3" : "1.4"} max={opening.type === "envelope" ? "1.6" : "4"} step="0.1" value={duration} onChange={(event) => updateOpening({ ...opening, duration: Number(event.target.value) })} /></Field></>}
    <button className="large-preview-button" onClick={() => onPreview(opening.type)}><Play size={14} fill="currentColor" /> Voir l’ouverture</button>
    <div className="background-tip"><span>Design préservé</span><p>Vous pouvez changer d’ouverture à tout moment : vos pages, textes et images ne seront pas modifiés.</p></div>
  </aside>;
}
