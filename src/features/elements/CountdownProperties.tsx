import type { ReactNode } from "react";
import type { CountdownElement } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { PropertySection } from "../../components/properties/PropertySection";
import { FontPicker } from "../fonts/FontPicker";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { DimensionInput } from "../../components/ui/DimensionInput";

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;
export function CountdownProperties({ element, appearance }: { element: CountdownElement; appearance: ReactNode }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  const update = (changes: Partial<CountdownElement>) => updateElement(element.id, changes);
  const size = (key: "numberFontSize" | "labelFontSize" | "gap", label: string, fallback: number, max: number) => <Field label={label}><div className="field-row">
    <input aria-label={`${label} — curseur`} type="range" min={key === "gap" ? 0 : 4} max={max} step={1} value={element[key] ?? fallback} onChange={(e) => update({ [key]: Number(e.target.value) })} />
    <DimensionInput aria-label={label} min={key === "gap" ? 0 : 4} max={max} value={element[key] ?? fallback} onCommit={(value) => update({ [key]: value })} />
  </div></Field>;
  return <div className="rich-properties">
    <PropertySection sectionKey="date" title="Date">
      <Field label="Date du mariage"><input type="date" min="0001-01-01" max="9999-12-31" value={element.targetDate} onChange={(e) => update({ targetDate: e.target.value })} /></Field>
      <p className="calendar-property-hint">Jours calendaires, référence Paris : même décompte pour tous les invités. Une date passée affiche 0.</p>
      <Field label="Libellé"><textarea value={element.label} onChange={(e) => update({ label: e.target.value })} /></Field>
    </PropertySection>
    <PropertySection sectionKey="police" title="Police">
      <Field label="Police"><FontPicker value={element.fontFamily} onChange={(fontFamily) => update({ fontFamily })} /></Field>
      {size("numberFontSize", "Taille du nombre", 64, 400)}
      {size("labelFontSize", "Taille du libellé", 20, 200)}
      <Field label="Couleur du nombre"><ColorAlphaInput value={element.numberColor} onChange={(numberColor) => update({ numberColor })} /></Field>
      <Field label="Couleur du libellé"><ColorAlphaInput value={element.labelColor} onChange={(labelColor) => update({ labelColor })} /></Field>
      <Field label="Alignement"><select value={element.textAlign} onChange={(e) => update({ textAlign: e.target.value as CountdownElement["textAlign"] })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></Field>
    </PropertySection>
    <PropertySection sectionKey="apparence" title="Apparence">
      <Field label="Disposition du compteur"><select value={element.layout} onChange={(e) => update({ layout: e.target.value as CountdownElement["layout"] })}><option value="vertical">Verticale</option><option value="horizontal">Horizontale</option></select></Field>
      {size("gap", "Espacement", 6, 120)}
      <Field label="Couleur de fond"><ColorAlphaInput value={element.backgroundColor ?? "#00000000"} onChange={(backgroundColor) => update({ backgroundColor })} /></Field>
      <Field label="Couleur de bordure"><ColorAlphaInput value={element.borderColor ?? "#00000000"} onChange={(borderColor) => update({ borderColor })} /></Field>
      <div className="field-row"><Field label="Épaisseur bordure"><DimensionInput value={element.borderWidth ?? 0} min={0} max={40} onCommit={(borderWidth) => update({ borderWidth })} /></Field>
        <Field label="Rayon des coins"><DimensionInput value={element.borderRadius ?? 0} min={0} max={200} onCommit={(borderRadius) => update({ borderRadius })} /></Field></div>
      <Field label="Padding"><DimensionInput value={element.padding ?? 8} min={0} max={200} onCommit={(padding) => update({ padding })} /></Field>
      {appearance}
    </PropertySection>
  </div>;
}
