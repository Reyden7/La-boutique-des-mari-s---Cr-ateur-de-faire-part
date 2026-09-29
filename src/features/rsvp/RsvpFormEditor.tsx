import { ArrowDown, ArrowUp, ClipboardList, MoveVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { COMMERCE, formatPrice } from "../../config/commerce";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { DEFAULT_RSVP_STYLE, resolveRsvpStyle } from "../../config/rsvpStyle";
import { startRsvpAddonCheckout } from "../../services/commerceRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { RsvpField, RsvpFieldType, RsvpFormConfig, RsvpFormStyle } from "../../types/editor";
import { getRsvpPositionX, getRsvpPositionY, getRsvpWidth, hasExplicitRsvpPosition, hasRsvpPositionOverride, resetRsvpPositionForDevice, setRsvpLayoutForDevice, setRsvpPositionForDevice } from "../../utils/documentLayout";

const fieldTypes: { value: RsvpFieldType; label: string }[] = [
  { value: "short_text", label: "Texte court" }, { value: "long_text", label: "Texte long" },
  { value: "number", label: "Nombre" }, { value: "boolean", label: "Oui / Non" },
  { value: "single_choice", label: "Choix unique" }, { value: "multiple_choice", label: "Choix multiple" },
  { value: "select", label: "Liste déroulante" }, { value: "email", label: "Email" },
];
const hasOptions = (type: RsvpFieldType) => ["single_choice", "multiple_choice", "select"].includes(type);

export function RsvpFormEditor({ embedded = false }: { embedded?: boolean }) {
  const { project, currentPageId, previewDevice, updateRsvp, selectElement } = useEditorStore();
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
    <label className="rsvp-visibility-toggle"><span><strong>Afficher le formulaire</strong><small>Afficher ou masquer le formulaire dans le faire-part.</small></span><input type="checkbox" checked={config.enabled} onChange={(event) => event.target.checked ? update({ enabled: true }) : removeFromDocument()} /></label>
    {!config.purchased && !isPublished && <section className="rsvp-purchase-card"><strong>Option Formulaire +{addonPrice}</strong><p>Activez-la librement : le supplément sera ajouté au paiement unique lors de la publication.</p></section>}
    {!config.purchased && isPublished && <section className="rsvp-purchase-card"><strong>Ajouter le formulaire — {addonPrice}</strong><p>Ce faire-part est déjà publié. Seul le supplément du formulaire sera facturé.</p>{config.enabled ? <button disabled={paying || !COMMERCE.rsvpAddonPriceCents} onClick={() => void checkout()}>{paying ? "Redirection…" : `Ajouter le formulaire — ${addonPrice}`}</button> : <small>Activez d’abord « Afficher le formulaire » pour continuer.</small>}{paymentError && <p className="form-error">{paymentError}</p>}</section>}
    {config.purchased && <section className="rsvp-purchase-card"><strong>Formulaire actif</strong><p>La collecte des réponses est disponible sur le faire-part public.</p></section>}
    <section className="rsvp-position-card">
      <div className="rsvp-position-heading"><div><MoveVertical size={15} /><span>Position dans le faire-part</span></div><small>{PREVIEW_DEVICES[previewDevice].label}</small></div>
      <p>{hasPositionOverride ? "Position personnalisée pour ce support." : hasExplicitPosition ? "Position héritée du Smartphone. Modifiez-la pour créer un override sur ce support." : "Placement automatique après le contenu. Modifiez la valeur ou glissez le formulaire dans le canvas."}</p>
      <div className="field-row"><label className="field"><span>Position X</span><input type="number" disabled={config.locked ?? false} min="0" step="10" value={positionX} onChange={(event) => setLayout({ x: Number(event.target.value) || 0 })} /></label><label className="field"><span>Position Y</span><input type="number" disabled={config.locked ?? false} min="0" step="10" value={positionY} onChange={(event) => setLayout({ y: Number(event.target.value) || 0 })} /></label></div>
      <label className="field"><span>Largeur</span><input type="number" disabled={config.locked ?? false} min="120" max={PREVIEW_DEVICES[previewDevice].width} step="10" value={formWidth} onChange={(event) => setLayout({ width: Number(event.target.value) || 120 })} /></label>
      <div className="rsvp-position-actions"><button type="button" disabled={config.locked ?? false} onClick={() => setPosition(Math.max(0, positionY - 100))}><ArrowUp size={13} /> Monter</button><button type="button" disabled={config.locked ?? false} onClick={() => setPosition(positionY + 100)}><ArrowDown size={13} /> Descendre</button></div>
      <button className="rsvp-position-reset" type="button" disabled={(config.locked ?? false) || !hasPositionOverride} onClick={() => updateRsvp(resetRsvpPositionForDevice(config, previewDevice))}><RotateCcw size={13} /> {previewDevice === "mobile" ? "Revenir au placement automatique" : "Supprimer l’override de ce support"}</button>
    </section>
    <section className="rsvp-style-card"><div className="panel-title">Apparence du formulaire</div><p>Les couleurs sont identiques dans l’éditeur, l’aperçu et le faire-part public.</p>
      <div className="field-row"><label className="field"><span>Fond</span><input type="color" value={formStyle.backgroundColor} onChange={(event) => updateStyle("backgroundColor", event.target.value)} /></label><label className="field"><span>Texte principal</span><input type="color" value={formStyle.textColor} onChange={(event) => updateStyle("textColor", event.target.value)} /></label></div>
      <div className="field-row"><label className="field"><span>Labels</span><input type="color" value={formStyle.labelColor} onChange={(event) => updateStyle("labelColor", event.target.value)} /></label><label className="field"><span>Fond des champs</span><input type="color" value={formStyle.fieldBackgroundColor} onChange={(event) => updateStyle("fieldBackgroundColor", event.target.value)} /></label></div>
      <div className="field-row"><label className="field"><span>Texte des champs</span><input type="color" value={formStyle.fieldTextColor} onChange={(event) => updateStyle("fieldTextColor", event.target.value)} /></label><label className="field"><span>Bordures</span><input type="color" value={formStyle.fieldBorderColor} onChange={(event) => updateStyle("fieldBorderColor", event.target.value)} /></label></div>
      <div className="field-row"><label className="field"><span>Bouton</span><input type="color" value={formStyle.buttonBackgroundColor} onChange={(event) => updateStyle("buttonBackgroundColor", event.target.value)} /></label><label className="field"><span>Texte du bouton</span><input type="color" value={formStyle.buttonTextColor} onChange={(event) => updateStyle("buttonTextColor", event.target.value)} /></label></div>
      <div className="field-row"><label className="field"><span>Survol du bouton</span><input type="color" value={formStyle.buttonHoverColor} onChange={(event) => updateStyle("buttonHoverColor", event.target.value)} /></label><label className="field"><span>Sélection / focus</span><input type="color" value={formStyle.selectionColor} onChange={(event) => updateStyle("selectionColor", event.target.value)} /></label></div>
      <label className="field"><span>Erreurs</span><input type="color" value={formStyle.errorColor} onChange={(event) => updateStyle("errorColor", event.target.value)} /></label>
      <button className="rsvp-style-reset" type="button" onClick={() => update({ style: { ...DEFAULT_RSVP_STYLE } })}><RotateCcw size={13} /> Restaurer la palette par défaut</button>
    </section>
    <section><label className="field"><span>Titre</span><input value={config.title} onChange={(event) => update({ title: event.target.value })} /></label><label className="field"><span>Description</span><textarea rows={3} value={config.description ?? ""} onChange={(event) => update({ description: event.target.value })} /></label><label className="field"><span>Texte du bouton</span><input value={config.submitLabel} onChange={(event) => update({ submitLabel: event.target.value })} /></label></section>
    <section><div className="panel-title">Champs</div><div className="rsvp-field-list">{config.fields.map((field, index) => <article className="rsvp-field-card" key={field.id}><div className="rsvp-field-actions"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={13} /></button><button onClick={() => move(index, 1)} disabled={index === config.fields.length - 1}><ArrowDown size={13} /></button><button onClick={() => update({ fields: config.fields.filter((item) => item.id !== field.id) })}><Trash2 size={13} /></button></div><input aria-label="Libellé" value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} /><select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as RsvpFieldType, options: hasOptions(event.target.value as RsvpFieldType) ? field.options ?? ["Option 1", "Option 2"] : undefined })}>{fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><label className="compact-check"><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> Obligatoire</label>{hasOptions(field.type) && <textarea rows={3} value={(field.options ?? []).join("\n")} onChange={(event) => updateField(field.id, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })} placeholder="Une option par ligne" />}</article>)}</div><button className="secondary-action" onClick={() => update({ fields: [...config.fields, { id: crypto.randomUUID(), label: "Nouveau champ", type: "short_text", required: false }] })}><Plus size={14} /> Ajouter un champ</button></section>
    <section className="rsvp-document-actions">
      {config.purchased && <Link to={`/studio/${project.id}/rsvp/responses`}><ClipboardList size={15} /> Voir les réponses au formulaire</Link>}
      <button type="button" className="danger" onClick={removeFromDocument}><Trash2 size={15} /> Supprimer le formulaire du document</button>
      {config.purchased && <small>Le droit Formulaire reste acquis et les réponses existantes sont conservées.</small>}
    </section>
  </div>;
}
