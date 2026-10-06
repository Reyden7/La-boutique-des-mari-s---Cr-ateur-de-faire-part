import type { ReactNode } from "react";
import type { CalendarElement } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { PropertySection } from "../../components/properties/PropertySection";
import { FontPicker } from "../fonts/FontPicker";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { CALENDAR_MONTHS, CALENDAR_STYLES, CALENDAR_DECORATIONS, getCalendarMonth } from "../../utils/calendarLayout";

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function CalendarProperties({ element, appearance }: { element: CalendarElement; appearance: ReactNode }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  const update = (changes: Partial<CalendarElement>) => updateElement(element.id, changes);
  const calendar = getCalendarMonth(element.month, element.year, element.highlightedDay);
  const changeDate = (changes: Partial<Pick<CalendarElement, "month" | "year">>) => {
    const next = getCalendarMonth(changes.month ?? element.month, changes.year ?? element.year, element.highlightedDay);
    update({ ...changes, highlightedDay: next.highlightedDay });
  };
  return <div className="rich-properties">
    <PropertySection sectionKey="contenu" title="Contenu">
      <Field label="Titre du calendrier"><textarea value={element.title} onChange={(e) => update({ title: e.target.value })} /></Field>
      <div className="field-row"><Field label="Mois"><select value={calendar.month} onChange={(e) => changeDate({ month: Number(e.target.value) })}>{CALENDAR_MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></Field>
        <Field label="Année"><DimensionInput aria-label="Année du calendrier" value={calendar.year} min={1} max={9999} onCommit={(year) => changeDate({ year: Math.round(year) })} /></Field></div>
      <Field label="Jour mis en avant"><select value={calendar.highlightedDay ?? ""} onChange={(e) => update({ highlightedDay: e.target.value ? Number(e.target.value) : null })}><option value="">Aucun</option>{Array.from({ length: calendar.days }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></Field>
      <label className="compact-check"><input type="checkbox" checked={element.showWeekdays !== false} onChange={(e) => update({ showWeekdays: e.target.checked })} />Afficher les jours de la semaine</label>
      <label className="compact-check"><input type="checkbox" checked={element.showMonthLabel !== false} onChange={(e) => update({ showMonthLabel: e.target.checked })} />Afficher le mois</label>
      <label className="compact-check"><input type="checkbox" checked={element.showYearLabel !== false} onChange={(e) => update({ showYearLabel: e.target.checked })} />Afficher l’année</label>
    </PropertySection>
    <PropertySection sectionKey="titre" title="Titre">
      <Field label="Police du titre"><FontPicker value={element.titleFontFamily} onChange={(titleFontFamily) => update({ titleFontFamily })} /></Field>
      <div className="field-row"><Field label="Taille du titre"><DimensionInput aria-label="Taille du titre calendrier" value={element.titleFontSize} min={4} max={120} onCommit={(titleFontSize) => update({ titleFontSize })} /></Field>
        <Field label="Couleur du titre"><ColorAlphaInput value={element.titleColor} onChange={(titleColor) => update({ titleColor })} /></Field></div>
      <Field label="Alignement du titre"><select value={element.titleAlign ?? "center"} onChange={(e) => update({ titleAlign: e.target.value as CalendarElement["titleAlign"] })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></Field>
    </PropertySection>
    <PropertySection sectionKey="chiffres" title="Chiffres">
      <Field label="Police des nombres"><FontPicker value={element.numbersFontFamily} onChange={(numbersFontFamily) => update({ numbersFontFamily })} /></Field>
      <div className="field-row"><Field label="Taille des nombres"><DimensionInput aria-label="Taille des nombres calendrier" value={element.numbersFontSize} min={4} max={96} onCommit={(numbersFontSize) => update({ numbersFontSize })} /></Field><Field label="Couleur des nombres"><ColorAlphaInput value={element.numbersColor} onChange={(numbersColor) => update({ numbersColor })} /></Field></div>
      <Field label="Police des jours de semaine"><FontPicker value={element.weekdaysFontFamily ?? element.numbersFontFamily} onChange={(weekdaysFontFamily) => update({ weekdaysFontFamily })} /></Field>
      <div className="field-row"><Field label="Taille des jours de semaine"><DimensionInput aria-label="Taille des jours de semaine calendrier" value={element.weekdaysFontSize ?? 10} min={4} max={64} onCommit={(weekdaysFontSize) => update({ weekdaysFontSize })} /></Field><Field label="Couleur des jours de semaine"><ColorAlphaInput value={element.weekdaysColor ?? element.numbersColor} onChange={(weekdaysColor) => update({ weekdaysColor })} /></Field></div>
      <p className="calendar-property-hint">Le calendrier est ajusté proportionnellement à sa boîte. Les tailles trop grandes sont limitées à la largeur des cellules pour garder les jours lisibles.</p>
    </PropertySection>
    <PropertySection sectionKey="decoration" title="Décoration">
      <Field label="Style de décoration"><select value={element.decorationStyle} onChange={(e) => update({ decorationStyle: e.target.value as CalendarElement["decorationStyle"] })}>{CALENDAR_DECORATIONS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></Field>
      <Field label="Couleur de décoration"><ColorAlphaInput value={element.decorationColor} onChange={(decorationColor) => update({ decorationColor })} /></Field>
    </PropertySection>
    <PropertySection sectionKey="apparence" title="Apparence">
      <Field label="Style du calendrier"><select value={element.style} onChange={(e) => update({ style: e.target.value as CalendarElement["style"] })}>{CALENDAR_STYLES.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></Field>
      <div className="field-row"><Field label="Couleur d’accent"><ColorAlphaInput value={element.accentColor} onChange={(accentColor) => update({ accentColor })} /></Field><Field label="Couleur de fond"><ColorAlphaInput value={element.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} /></Field></div>
      <Field label="Couleur de bordure"><ColorAlphaInput value={element.borderColor ?? "#d9c4b4"} onChange={(borderColor) => update({ borderColor })} /></Field>
      {appearance}
    </PropertySection>
  </div>;
}
