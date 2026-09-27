import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { COMMERCE, formatPrice } from "../../config/commerce";
import { startRsvpAddonCheckout } from "../../services/commerceRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { RsvpField, RsvpFieldType, RsvpFormConfig } from "../../types/editor";

const fieldTypes: { value: RsvpFieldType; label: string }[] = [
  { value: "short_text", label: "Texte court" }, { value: "long_text", label: "Texte long" },
  { value: "number", label: "Nombre" }, { value: "boolean", label: "Oui / Non" },
  { value: "single_choice", label: "Choix unique" }, { value: "multiple_choice", label: "Choix multiple" },
  { value: "select", label: "Liste déroulante" }, { value: "email", label: "Email" },
];
const hasOptions = (type: RsvpFieldType) => ["single_choice", "multiple_choice", "select"].includes(type);

export function RsvpFormEditor() {
  const { project, updateRsvp } = useEditorStore();
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  if (!project?.rsvp) return null;
  const config = project.rsvp;
  const update = (changes: Partial<RsvpFormConfig>) => updateRsvp({ ...config, ...changes });
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

  return <div className="sidebar-view rsvp-editor"><div className="view-intro"><span>Option Formulaire</span><h2>Formulaire invité</h2><p>Composez le formulaire que vos invités rempliront directement dans le faire-part.</p></div>
    {!config.purchased && !isPublished && <section className="rsvp-purchase-card"><strong>Option Formulaire +{addonPrice}</strong><p>Activez-la librement : le supplément sera ajouté au paiement unique lors de la publication.</p></section>}
    {!config.purchased && isPublished && <section className="rsvp-purchase-card"><strong>Ajouter le formulaire — {addonPrice}</strong><p>Ce faire-part est déjà publié. Seul le supplément du formulaire sera facturé.</p>{config.enabled ? <button disabled={paying || !COMMERCE.rsvpAddonPriceCents} onClick={() => void checkout()}>{paying ? "Redirection…" : `Ajouter le formulaire — ${addonPrice}`}</button> : <small>Activez d’abord « Afficher le formulaire » pour continuer.</small>}{paymentError && <p className="form-error">{paymentError}</p>}</section>}
    {config.purchased && <section className="rsvp-purchase-card"><strong>Formulaire actif</strong><p>La collecte des réponses est disponible sur le faire-part public.</p></section>}
    <section><label className="toggle-row"><span>Afficher le formulaire</span><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label><label className="field"><span>Titre</span><input value={config.title} onChange={(event) => update({ title: event.target.value })} /></label><label className="field"><span>Description</span><textarea rows={3} value={config.description ?? ""} onChange={(event) => update({ description: event.target.value })} /></label><label className="field"><span>Texte du bouton</span><input value={config.submitLabel} onChange={(event) => update({ submitLabel: event.target.value })} /></label></section>
    <section><div className="panel-title">Champs</div><div className="rsvp-field-list">{config.fields.map((field, index) => <article className="rsvp-field-card" key={field.id}><div className="rsvp-field-actions"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={13} /></button><button onClick={() => move(index, 1)} disabled={index === config.fields.length - 1}><ArrowDown size={13} /></button><button onClick={() => update({ fields: config.fields.filter((item) => item.id !== field.id) })}><Trash2 size={13} /></button></div><input aria-label="Libellé" value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} /><select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as RsvpFieldType, options: hasOptions(event.target.value as RsvpFieldType) ? field.options ?? ["Option 1", "Option 2"] : undefined })}>{fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><label className="compact-check"><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> Obligatoire</label>{hasOptions(field.type) && <textarea rows={3} value={(field.options ?? []).join("\n")} onChange={(event) => updateField(field.id, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })} placeholder="Une option par ligne" />}</article>)}</div><button className="secondary-action" onClick={() => update({ fields: [...config.fields, { id: crypto.randomUUID(), label: "Nouveau champ", type: "short_text", required: false }] })}><Plus size={14} /> Ajouter un champ</button></section>
  </div>;
}
