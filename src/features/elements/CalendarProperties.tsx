import type { ReactNode } from "react";
import type { CalendarElement, CalendarEventConfig } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { PropertySection } from "../../components/properties/PropertySection";
import { FontPicker } from "../fonts/FontPicker";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { CALENDAR_MONTHS, CALENDAR_STYLES, CALENDAR_DECORATIONS, getCalendarMonth } from "../../utils/calendarLayout";
import { getCalendarEventConfig, getCalendarEventError } from "../../utils/calendarEvent";

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function CalendarProperties({ element, appearance }: { element: CalendarElement; appearance: ReactNode }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  const update = (changes: Partial<CalendarElement>) => updateElement(element.id, changes);
  const calendar = getCalendarMonth(element.month, element.year, element.highlightedDay);
  const agenda = getCalendarEventConfig(element);
  const updateAgenda = (changes: Partial<CalendarEventConfig>) => update({ calendarEvent: { ...agenda, ...changes } });
  const agendaError = agenda.enabled ? getCalendarEventError(element) : null;
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
    <PropertySection sectionKey="ajout-agenda" title="Ajout à l’agenda">
      <label className="compact-check"><input type="checkbox" checked={agenda.enabled} onChange={(e) => updateAgenda({ enabled: e.target.checked })} />Afficher le bouton</label>
      {agenda.enabled && <>
        <p className="calendar-property-hint">Date utilisée : le jour mis en avant du Calendrier. Le bouton est actif uniquement dans Aperçu et Public, sans accès au compte de l’invité.</p>
        {agendaError && <p role="alert" className="calendar-property-hint">{agendaError}</p>}
        <Field label="Texte du bouton agenda"><input value={agenda.buttonLabel} onChange={(e) => updateAgenda({ buttonLabel: e.target.value })} /></Field>
        <Field label="Titre de l’événement"><input value={agenda.title} onChange={(e) => updateAgenda({ title: e.target.value })} /></Field>
        <div className="field-row"><Field label="Heure de début"><input type="time" value={agenda.startTime || ""} onChange={(e) => updateAgenda({ startTime: e.target.value })} /></Field><Field label="Heure de fin"><input type="time" value={agenda.endTime || ""} onChange={(e) => updateAgenda({ endTime: e.target.value })} /></Field></div>
        <p className="calendar-property-hint">Sans début : journée entière. Sans fin : durée de 2 h. Une fin antérieure ou égale au début est le lendemain. En cas d’heure répétée en automne, la première occurrence est retenue.</p>
        <Field label="Fuseau horaire de l’événement"><input value={agenda.timezone || ""} placeholder="Europe/Paris" onChange={(e) => updateAgenda({ timezone: e.target.value })} /></Field>
        <Field label="Lieu de l’événement"><input value={agenda.location || ""} onChange={(e) => updateAgenda({ location: e.target.value })} /></Field>
        <Field label="Description de l’événement"><textarea value={agenda.description || ""} onChange={(e) => updateAgenda({ description: e.target.value })} /></Field>
        <Field label="Police du bouton agenda"><FontPicker value={agenda.buttonFontFamily || element.titleFontFamily} onChange={(buttonFontFamily) => updateAgenda({ buttonFontFamily })} /></Field>
        <Field label="Taille du texte agenda"><DimensionInput aria-label="Taille du texte agenda" value={agenda.buttonFontSize ?? 13} min={4} max={64} onCommit={(buttonFontSize) => updateAgenda({ buttonFontSize })} /></Field>
        <Field label="Couleur du texte agenda"><ColorAlphaInput value={agenda.buttonTextColor || "#ffffff"} onChange={(buttonTextColor) => updateAgenda({ buttonTextColor })} /></Field>
        <Field label="Couleur du fond agenda"><ColorAlphaInput value={agenda.buttonBackgroundColor || "#795746"} onChange={(buttonBackgroundColor) => updateAgenda({ buttonBackgroundColor })} /></Field>
        <Field label="Couleur de bordure agenda"><ColorAlphaInput value={agenda.buttonBorderColor || "#795746"} onChange={(buttonBorderColor) => updateAgenda({ buttonBorderColor })} /></Field>
        <div className="field-row"><Field label="Épaisseur de bordure agenda"><DimensionInput aria-label="Épaisseur de bordure agenda" value={agenda.buttonBorderWidth ?? 1} min={0} max={8} onCommit={(buttonBorderWidth) => updateAgenda({ buttonBorderWidth })} /></Field><Field label="Rayon des coins agenda"><DimensionInput aria-label="Rayon des coins agenda" value={agenda.buttonRadius ?? 8} min={0} max={64} onCommit={(buttonRadius) => updateAgenda({ buttonRadius })} /></Field></div>
        <Field label="Espacement sous le calendrier"><DimensionInput aria-label="Espacement sous le calendrier" value={agenda.buttonGap ?? 12} min={0} max={120} onCommit={(buttonGap) => updateAgenda({ buttonGap })} /></Field>
      </>}
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
