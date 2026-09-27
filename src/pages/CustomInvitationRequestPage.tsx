import { ArrowLeft, ImagePlus, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { COMMERCE, formatPrice } from "../config/commerce";
import { createCustomInvitationRequest, startCustomInvitationCheckout, type CustomInvitationRequestInput } from "../services/commerceRepository";

const initialForm: CustomInvitationRequestInput = { coupleNames: "", weddingDate: "", theme: "", desiredColors: "", desiredStyle: "", description: "" };

export function CustomInvitationRequestPage() {
  const [form, setForm] = useState(initialForm);
  const [references, setReferences] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof CustomInvitationRequestInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const requestId = await createCustomInvitationRequest(form, references);
      window.location.assign(await startCustomInvitationCheckout(requestId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La demande n’a pas pu être enregistrée.");
      setSubmitting(false);
    }
  };
  return <main className="custom-request-page"><header><Link to="/"><ArrowLeft size={16} /> Retour au Studio</Link><span>Le Bureau des Mariés</span></header><section className="custom-request-shell"><div className="custom-request-intro"><p className="eyebrow">Création exclusive</p><h1>Faire-part numérique sur mesure</h1><p>Confiez-nous votre univers. Nous réalisons une proposition personnalisée à partir de vos envies, de votre histoire et de vos références.</p><strong>{formatPrice(COMMERCE.customInvitationPriceCents)}</strong><small>Paiement unique · réalisation personnalisée</small></div><form className="custom-request-form" onSubmit={(event) => void submit(event)}><div className="field-row"><label className="field"><span>Noms des mariés</span><input required value={form.coupleNames} onChange={(event) => update("coupleNames", event.target.value)} /></label><label className="field"><span>Date du mariage</span><input type="date" value={form.weddingDate} onChange={(event) => update("weddingDate", event.target.value)} /></label></div><label className="field"><span>Thème</span><input value={form.theme} placeholder="Jardin romantique, Art déco…" onChange={(event) => update("theme", event.target.value)} /></label><div className="field-row"><label className="field"><span>Couleurs souhaitées</span><input value={form.desiredColors} onChange={(event) => update("desiredColors", event.target.value)} /></label><label className="field"><span>Style souhaité</span><input value={form.desiredStyle} placeholder="Élégant, minimaliste…" onChange={(event) => update("desiredStyle", event.target.value)} /></label></div><label className="field"><span>Votre demande</span><textarea required rows={7} value={form.description} onChange={(event) => update("description", event.target.value)} /></label><label className="reference-upload"><ImagePlus size={18} /><span>Ajouter des images ou références</span><small>Jusqu’à 5 fichiers image, 10 Mo chacun</small><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setReferences([...event.target.files ?? []].slice(0, 5))} /></label>{references.length > 0 && <p className="selected-references">{references.length} référence{references.length > 1 ? "s" : ""} sélectionnée{references.length > 1 ? "s" : ""}</p>}{error && <p className="form-error">{error}</p>}<button className="checkout-button" disabled={submitting}><LockKeyhole size={15} /> {submitting ? "Préparation du paiement…" : `Envoyer la demande et payer ${formatPrice(COMMERCE.customInvitationPriceCents)}`}</button></form></section></main>;
}
