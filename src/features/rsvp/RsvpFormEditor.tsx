import { ArrowDown, ArrowUp, ClipboardList, Eye, EyeOff, MoveVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { COMMERCE, formatPrice } from "../../config/commerce";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { DimensionInput } from "../../components/ui/DimensionInput";
import { FontPicker } from "../fonts/FontPicker";
import { AnimationProperties } from "../../components/properties/AnimationProperties";
import { PropertySection } from "../../components/properties/PropertySection";
import { DEFAULT_RSVP_STYLE, resolveRsvpStyle } from "../../config/rsvpStyle";
import { startRsvpAddonCheckout } from "../../services/commerceRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { RsvpField, RsvpFieldType, RsvpFormConfig, RsvpFormStyle, RsvpFormTypography } from "../../types/editor";
import { getRsvpPositionX, getRsvpPositionY, getRsvpWidth, hasExplicitRsvpPosition, hasRsvpPositionOverride, resetRsvpPositionForDevice, setRsvpLayoutForDevice, setRsvpPositionForDevice } from "../../utils/documentLayout";
import { RSVP_EDITOR_ELEMENT_ID, isRsvpVisibleOnDevice } from "./rsvpEditorElement";

const fieldTypes: { value: RsvpFieldType; label: string }[] = [
  { value: "short_text", label: "Texte court" }, { value: "long_text", label: "Texte long" },
  { value: "number", label: "Nombre" }, { value: "boolean", label: "Oui / Non" },
  { value: "single_choice", label: "Choix unique" }, { value: "multiple_choice", label: "Choix multiple" },
  { value: "select", label: "Liste déroulante" }, { value: "email", label: "Email" },
];
const hasOptions = (type: RsvpFieldType) => ["single_choice", "multiple_choice", "select"].includes(type);

export function RsvpFormEditor({ embedded = false }: { embedded?: boolean }) {
  const { project, currentPageId, previewDevice, updateRsvp, selectElement, setElementVisibility } = useEditorStore();
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  if (!project?.rsvp) return null;
  const config = project.rsvp;
  const formStyle = resolveRsvpStyle(config.style);
  const page = project.pages.find((item) => item.id === currentPageId) ?? project.pages[0];
  const update = (changes: Partial<RsvpFormConfig>) => updateRsvp({ ...config, ...changes });
  const positionY = page ? getRsvpPositionY(page, config, previewDevice) : 0;
  const positionX = getRsvpPositionX(config, previewDevice);
  const formWidth = getRsvpWidth(config, previewDevice);
  const hasExplicitPosition = hasExplicitRsvpPosition(config, previewDevice);
  const hasPositionOverride = hasRsvpPositionOverride(config, previewDevice);
  const setPosition = (value: number) => updateRsvp(setRsvpPositionForDevice(config, previewDevice, value));
  const setLayout = (changes: { x?: number; y?: number; width?: number }) => updateRsvp(setRsvpLayoutForDevice(config, previewDevice, changes));
  const updateStyle = (key: keyof RsvpFormStyle, value: string) => update({ style: { ...formStyle, [key]: value } });
  const updateTypography = (key: keyof RsvpFormTypography, value: string | number) => update({ typography: { ...config.typography, [key]: value } });
  const updateFontSize = (key: "titleFontSize" | "labelFontSize" | "fieldFontSize", raw: string, minimum: number, maximum: number) => {
    const size = Number(raw);
    if (Number.isFinite(size)) updateTypography(key, Math.max(minimum, Math.min(maximum, size)));
  };
  const updateField = (id: string, changes: Partial<RsvpField>) => update({ fields: config.fields.map((field) => field.id === id ? { ...field, ...changes } : field) });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= config.fields.length) return;
    const fields = [...config.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    update({ fields });
  };
  const checkout = async () => {
    setPaying(true); setPaymentError("");
    try { window.location.assign(await startRsvpAddonCheckout(project)); }
    catch (error) { setPaymentError(error instanceof Error ? error.message : "Le paiement du formulaire n’a pas pu être préparé."); }
    finally { setPaying(false); }
  };

  const isPublished = project.paymentStatus === "paid" && project.status === "published";
  const addonPrice = COMMERCE.rsvpAddonPriceCents ? formatPrice(COMMERCE.rsvpAddonPriceCents) : "Prix à configurer";

  const removeFromDocument = () => {
    update({ enabled: false });
    selectElement(null);
  };

  return <div className={`${embedded ? "rsvp-properties-editor" : "sidebar-view"} rsvp-editor`}><div className="view-intro"><span>Option Formulaire</span><h2>Formulaire invité</h2><p>Composez le formulaire que vos invités rempliront directement dans le faire-part.</p></div>
    <PropertySection sectionKey="options-formulaire" key={`${project.id}-form-options`} title="Options du formulaire">
    <label className="rsvp-visibility-toggle"><span><strong>Afficher le formulaire</strong><small>Afficher ou masquer le formulaire dans le faire-part.</small></span><input type="checkbox" checked={config.enabled} onChange={(event) => event.target.checked ? update({ enabled: true }) : removeFromDocument()} /></label>
    {config.enabled && <button className="property-device-visibility" type="button" onClick={() => setElementVisibility(RSVP_EDITOR_ELEMENT_ID, !isRsvpVisibleOnDevice(config, previewDevice))}>{isRsvpVisibleOnDevice(config, previewDevice) ? <Eye size={15} /> : <EyeOff size={15} />}{isRsvpVisibleOnDevice(config, previewDevice) ? `Masquer sur ${PREVIEW_DEVICES[previewDevice].label}` : `Afficher sur ${PREVIEW_DEVICES[previewDevice].label}`}</button>}
    {!config.purchased && !isPublished && <section className="rsvp-purchase-card"><strong>Option Formulaire +{addonPrice}</strong><p>Activez-la librement : le supplément sera ajouté au paiement unique lors de la publication.</p></section>}
    {!config.purchased && isPublished && <section className="rsvp-purchase-card"><strong>Ajouter le formulaire — {addonPrice}</strong><p>Ce faire-part est déjà publié. Seul le supplément du formulaire sera facturé.</p>{config.enabled ? <button disabled={paying || !COMMERCE.rsvpAddonPriceCents} onClick={() => void checkout()}>{paying ? "Redirection…" : `Ajouter le formulaire — ${addonPrice}`}</button> : <small>Activez d’abord « Afficher le formulaire » pour continuer.</small>}{paymentError && <p className="form-error">{paymentError}</p>}</section>}
    {config.purchased && <section className="rsvp-purchase-card"><strong>Formulaire actif</strong><p>La collecte des réponses est disponible sur le faire-part public.</p></section>}
    </PropertySection>
    <PropertySection sectionKey="disposition" key={`${project.id}-form-layout`} title="Disposition" defaultOpen>
    <section className="rsvp-position-card">
      <div className="rsvp-position-heading"><div><MoveVertical size={15} /><span>Position dans le faire-part</span></div><small>{PREVIEW_DEVICES[previewDevice].label}</small></div>
      <p>{hasPositionOverride ? "Position personnalisée pour ce support." : hasExplicitPosition ? "Position héritée du Smartphone. Modifiez-la pour créer un override sur ce support." : "Placement automatique après le contenu. Modifiez la valeur ou glissez le formulaire dans le canvas."}</p>
      <div className="field-row"><label className="field"><span>Position X</span><input type="number" disabled={config.locked ?? false} min="0" step="10" value={positionX} onChange={(event) => setLayout({ x: Number(event.target.value) || 0 })} /></label><label className="field"><span>Position Y</span><input type="number" disabled={config.locked ?? false} min="0" step="10" value={positionY} onChange={(event) => setLayout({ y: Number(event.target.value) || 0 })} /></label></div>
      <label className="field"><span>Largeur</span><DimensionInput key={`${project.id}-${previewDevice}-form-width`} disabled={config.locked ?? false} min={120} max={PREVIEW_DEVICES[previewDevice].width} step={1} value={formWidth} onCommit={(width) => setLayout({ width })} /></label>
      <div className="rsvp-position-actions"><button type="button" disabled={config.locked ?? false} onClick={() => setPosition(Math.max(0, positionY - 100))}><ArrowUp size={13} /> Monter</button><button type="button" disabled={config.locked ?? false} onClick={() => setPosition(positionY + 100)}><ArrowDown size={13} /> Descendre</button></div>
      <button className="rsvp-position-reset" type="button" disabled={(config.locked ?? false) || !hasPositionOverride} onClick={() => updateRsvp(resetRsvpPositionForDevice(config, previewDevice))}><RotateCcw size={13} /> {previewDevice === "mobile" ? "Revenir au placement automatique" : "Supprimer l’override de ce support"}</button>
    </section>
    </PropertySection>
    <PropertySection sectionKey="informations" key={`${project.id}-form-information`} title="Informations">
      <section><label className="field"><span>Titre</span><input value={config.title} onChange={(event) => update({ title: event.target.value })} /></label><label className="field"><span>Description</span><textarea rows={3} value={config.description ?? ""} onChange={(event) => update({ description: event.target.value })} /></label><label className="field"><span>Texte du bouton</span><input value={config.submitLabel} onChange={(event) => update({ submitLabel: event.target.value })} /></label></section>
      <section><div className="panel-title">Champs</div><div className="rsvp-field-list">{config.fields.map((field, index) => <article className="rsvp-field-card" key={field.id}><div className="rsvp-field-actions"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={13} /></button><button onClick={() => move(index, 1)} disabled={index === config.fields.length - 1}><ArrowDown size={13} /></button><button onClick={() => update({ fields: config.fields.filter((item) => item.id !== field.id) })}><Trash2 size={13} /></button></div><input aria-label="Libellé" value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} /><select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as RsvpFieldType, options: hasOptions(event.target.value as RsvpFieldType) ? field.options ?? ["Option 1", "Option 2"] : undefined })}>{fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><label className="compact-check"><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> Obligatoire</label>{hasOptions(field.type) && <textarea rows={3} value={(field.options ?? []).join("\n")} onChange={(event) => updateField(field.id, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })} placeholder="Une option par ligne" />}</article>)}</div><button className="secondary-action" onClick={() => update({ fields: [...config.fields, { id: crypto.randomUUID(), label: "Nouveau champ", type: "short_text", required: false }] })}><Plus size={14} /> Ajouter un champ</button></section>
    </PropertySection>
    <PropertySection sectionKey="police" key={`${project.id}-form-typography`} title="Police">
    <section className="rsvp-style-card">
      <label className="field"><span>Police</span><FontPicker value={config.typography?.fontFamily ?? "Cormorant Garamond"} onChange={(family) => updateTypography("fontFamily", family)} /></label>
      <div className="field-row"><label className="field"><span>Taille du titre</span><input type="number" min="16" max="96" value={config.typography?.titleFontSize ?? 34} onChange={(event) => updateFontSize("titleFontSize", event.target.value, 16, 96)} /></label><label className="field"><span>Questions / labels</span><input type="number" min="8" max="40" value={config.typography?.labelFontSize ?? 11} onChange={(event) => updateFontSize("labelFontSize", event.target.value, 8, 40)} /></label></div>
      <label className="field"><span>Champs / options</span><input type="number" min="8" max="40" value={config.typography?.fieldFontSize ?? 13} onChange={(event) => updateFontSize("fieldFontSize", event.target.value, 8, 40)} /></label>
      <button className="rsvp-style-reset" type="button" onClick={() => update({ typography: undefined })}><RotateCcw size={13} /> Restaurer la typographie par défaut</button>
    </section></PropertySection>
    <PropertySection sectionKey="apparence" key={`${project.id}-form-appearance`} title="Apparence">
    <section className="rsvp-style-card"><p>Les couleurs sont identiques dans l’éditeur, l’aperçu et le faire-part public.</p>
      <div className="field-row"><label className="field"><span>Fond</span><ColorAlphaInput value={formStyle.backgroundColor} onChange={(value) => updateStyle("backgroundColor", value)} /></label><label className="field"><span>Couleur du texte</span><ColorAlphaInput value={formStyle.textColor} onChange={(value) => updateStyle("textColor", value)} /></label></div>
      <div className="field-row"><label className="field"><span>Labels / questions</span><ColorAlphaInput value={formStyle.labelColor} onChange={(value) => updateStyle("labelColor", value)} /></label><label className="field"><span>Fond des champs</span><ColorAlphaInput value={formStyle.fieldBackgroundColor} onChange={(value) => updateStyle("fieldBackgroundColor", value)} /></label></div>
      <div className="field-row"><label className="field"><span>Texte des champs</span><ColorAlphaInput value={formStyle.fieldTextColor} onChange={(value) => updateStyle("fieldTextColor", value)} /></label><label className="field"><span>Bordures</span><ColorAlphaInput value={formStyle.fieldBorderColor} onChange={(value) => updateStyle("fieldBorderColor", value)} /></label></div>
      <div className="field-row"><label className="field"><span>Bouton</span><ColorAlphaInput value={formStyle.buttonBackgroundColor} onChange={(value) => updateStyle("buttonBackgroundColor", value)} /></label><label className="field"><span>Texte du bouton</span><ColorAlphaInput value={formStyle.buttonTextColor} onChange={(value) => updateStyle("buttonTextColor", value)} /></label></div>
      <div className="field-row"><label className="field"><span>Survol du bouton</span><ColorAlphaInput value={formStyle.buttonHoverColor} onChange={(value) => updateStyle("buttonHoverColor", value)} /></label><label className="field"><span>Sélection / focus</span><ColorAlphaInput value={formStyle.selectionColor} onChange={(value) => updateStyle("selectionColor", value)} /></label></div>
      <label className="field"><span>Erreurs</span><ColorAlphaInput value={formStyle.errorColor} onChange={(value) => updateStyle("errorColor", value)} /></label>
      <button className="rsvp-style-reset" type="button" onClick={() => update({ style: { ...DEFAULT_RSVP_STYLE } })}><RotateCcw size={13} /> Restaurer la palette par défaut</button>
    </section>
    </PropertySection>
    <PropertySection sectionKey="animation" key={`${project.id}-form-animation`} title="Animation"><AnimationProperties animation={config.animation} onChange={(animation) => update({ animation })} /></PropertySection>
    <section className="rsvp-document-actions">
      {config.purchased && <Link to={`/studio/${project.id}/rsvp/responses`}><ClipboardList size={15} /> Voir les réponses au formulaire</Link>}
      <button type="button" className="danger" onClick={removeFromDocument}><Trash2 size={15} /> Supprimer le formulaire du document</button>
      {config.purchased && <small>Le droit Formulaire reste acquis et les réponses existantes sont conservées.</small>}
    </section>
  </div>;
}
