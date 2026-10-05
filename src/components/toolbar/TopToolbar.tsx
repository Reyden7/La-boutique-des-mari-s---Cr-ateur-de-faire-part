import { Check, ChevronLeft, Copy, ExternalLink, Eye, LayoutTemplate, LockKeyhole, Redo2, Save, Send, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useEditorStore } from "../../stores/editorStore";
import { remoteErrorSummary } from "../../utils/storage";
import { formatPrice } from "../../config/commerce";
import { PRICING, calculateTotalPricing, calculateGuestUpgrade, isValidGuestCount } from "../../config/pricing";
import { useAuth } from "../../contexts/AuthContext";
import { TemplatePublishModal } from "../../features/templates/TemplatePublishModal";

const publicationBenefits = [
  "Lien personnalisé et stable",
  "Modifications illimitées après publication",
  "Responsive mobile, tablette et PC",
  "Animations, musique et effets",
];

export function TopToolbar({ onPreview }: { onPreview: () => void }) {
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [responsiveFormatsConfirmed, setResponsiveFormatsConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishingTemplate, setPublishingTemplate] = useState(false);
  const [guestCountDraft, setGuestCountDraft] = useState(String(PRICING.includedGuests));
  const { isAdmin } = useAuth();
  const { project, renameProject, past, future, undo, redo, save, checkoutAndPublish, saveStatus } = useEditorStore();
  if (!project) return null;

  const isPublished = project.paymentStatus === "paid" && project.status === "published" && Boolean(project.publicId);
  const includesForm = Boolean(project.rsvp?.enabled && !project.rsvp.purchased && !isPublished);
  const savedGuestCount = isValidGuestCount(project.requestedGuestCount) ? project.requestedGuestCount : PRICING.includedGuests;
  const guestCount = confirming ? Number(guestCountDraft) : savedGuestCount;
  const validGuestCount = guestCountDraft.trim() !== "" && isValidGuestCount(guestCount);
  const pricing = calculateTotalPricing(isValidGuestCount(guestCount) ? guestCount : savedGuestCount, includesForm);
  const isUpgrade = isPublished && project.purchasedGuestCapacity != null;
  const upgrade = isUpgrade ? calculateGuestUpgrade(project.purchasedGuestCapacity!, pricing.guestCount) : null;
  const publicationPrice = upgrade?.upgradePriceCents ?? pricing.totalPriceCents;
  const publicationPriceLabel = formatPrice(publicationPrice);
  const showPublishedLink = () => {
    if (project.publicId) setPublishedUrl(`${window.location.origin}/i/${project.publicId}`);
  };
  const openPublicationConfirmation = () => {
    setResponsiveFormatsConfirmed(false);
    setGuestCountDraft(String(savedGuestCount));
    setConfirming(true);
  };
  const closePublicationConfirmation = () => {
    if (publishing) return;
    setResponsiveFormatsConfirmed(false);
    setConfirming(false);
  };
  const beginCheckout = async () => {
    if (!responsiveFormatsConfirmed || publishing || !validGuestCount) return;
    setPublishError("");
    setPublishing(true);
    try {
      const checkoutUrl = await checkoutAndPublish(guestCount);
      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }
      const refreshed = useEditorStore.getState().project;
      if (refreshed?.paymentStatus === "paid" && refreshed.publicId) {
        setConfirming(false);
        setPublishedUrl(`${window.location.origin}/i/${refreshed.publicId}`);
      }
    } catch (error) {
      console.warn("Création du paiement impossible", remoteErrorSummary(error));
      setPublishError("Le paiement n’a pas pu être préparé. Vérifiez votre connexion puis réessayez.");
      setConfirming(false);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <header className="top-toolbar">
      <div className="brand-block"><Link to="/" className="back-button" aria-label="Retour aux projets"><ChevronLeft size={18} /></Link><div className="brand-mark">B</div><div className="brand-name"><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div>
      <div className="project-name-wrap"><input aria-label="Nom du projet" value={project.name} onChange={(event) => renameProject(event.target.value)} /><div className="save-state">{saveStatus === "saving" ? "Sauvegarde…" : saveStatus === "saved" ? <><Check size={12} /> Sauvegardé</> : "Modifications locales"}</div></div>
      <div className="toolbar-actions">
        <div className="undo-group"><button onClick={undo} disabled={!past.length} title="Annuler (Ctrl+Z)"><Undo2 size={18} /></button><button onClick={redo} disabled={!future.length} title="Rétablir (Ctrl+Y)"><Redo2 size={18} /></button></div>
        <button onClick={onPreview} aria-label="Aperçu"><Eye size={17} /> <span>Aperçu</span></button>
        <button onClick={save} aria-label="Sauvegarder"><Save size={17} /> <span>Sauvegarder</span></button>
        {isAdmin && <button className="admin-template-button" onClick={() => setPublishingTemplate(true)} aria-label="Publier comme template"><LayoutTemplate size={17} /> <span>Template</span></button>}
        <button className="publish-button" disabled={publishing} onClick={isPublished ? showPublishedLink : openPublicationConfirmation} aria-label={isPublished ? "Faire-part publié" : `Publier le faire-part pour ${publicationPriceLabel}`}><Send size={16} /> <span>{publishing ? "Redirection…" : isPublished ? "Faire-part publié ✓" : project.paymentStatus === "pending" ? `Reprendre le paiement — ${publicationPriceLabel}` : `Publier — ${publicationPriceLabel}`}</span></button>
        {isUpgrade && <button disabled={publishing} onClick={openPublicationConfirmation}>Invités · capacité {project.purchasedGuestCapacity}</button>}
      </div>

      {confirming && (
        <div className="modal-backdrop publication-backdrop" role="presentation" onMouseDown={closePublicationConfirmation}>
          <section className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="publication-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" disabled={publishing} onClick={closePublicationConfirmation} aria-label="Fermer"><X size={18} /></button>
            <div className="publication-lock"><LockKeyhole size={22} /></div>
            <p className="eyebrow">Publication sécurisée</p>
            <h2 id="publication-title">{isUpgrade ? "Ajustez votre capacité" : "Publiez votre faire-part"}</h2>
            <label className="publication-guests field"><span>Nombre d’invités</span><input type="number" min={1} max={PRICING.maxGuestCount} step={1} value={guestCountDraft} disabled={publishing} onChange={(event) => setGuestCountDraft(event.target.value)} aria-describedby="publication-guest-help" /></label>
            <p className="publication-responsive-help" id="publication-guest-help">Jusqu’à 40 invités inclus. Puis {formatPrice(PRICING.extraBlockPriceCents)} par tranche de 7 invités supplémentaires. Formulaire invité en option : +{formatPrice(PRICING.formPriceCents)}.</p>
            {!validGuestCount && <p className="form-error">Indiquez un nombre entier entre 1 et {PRICING.maxGuestCount.toLocaleString("fr-FR")}.</p>}
            <dl className="publication-breakdown">
              {upgrade ? <><div><dt>Capacité déjà achetée</dt><dd>{project.purchasedGuestCapacity} invités</dd></div><div><dt>{upgrade.additionalBlocks} tranche{upgrade.additionalBlocks !== 1 ? "s" : ""} supplémentaire{upgrade.additionalBlocks !== 1 ? "s" : ""} de 7 invités</dt><dd>{formatPrice(upgrade.upgradePriceCents)}</dd></div></> : <><div><dt>Faire-part — jusqu’à 40 invités</dt><dd>{formatPrice(PRICING.basePriceCents)}</dd></div>{pricing.extraBlocks > 0 && <div><dt>{pricing.extraBlocks} tranche{pricing.extraBlocks > 1 ? "s" : ""} supplémentaire{pricing.extraBlocks > 1 ? "s" : ""} de 7 invités</dt><dd>{formatPrice(pricing.extraBlocks * PRICING.extraBlockPriceCents)}</dd></div>}{includesForm && <div><dt>Formulaire invité</dt><dd>{formatPrice(pricing.formPriceCents)}</dd></div>}</>}
            </dl>
            <p className="publication-price"><strong>Total : {validGuestCount ? publicationPriceLabel : "—"} TTC</strong><span>Licence pour un seul événement · capacité {upgrade?.guestCapacity ?? pricing.guestCapacity} invités</span></p>
            {upgrade ? <p className="publication-responsive-help">Vous ne payez que les tranches supplémentaires. Réduire le nombre déclaré ne réduit pas votre capacité achetée et ne déclenche aucun remboursement.</p> : <ul>{publicationBenefits.map((benefit) => <li key={benefit}><Check size={15} /> {benefit}</li>)}{includesForm && <li><Check size={15} /> Formulaire invité et collecte des réponses</li>}</ul>}
            <label className="publication-responsive-confirmation">
              <input
                type="checkbox"
                checked={responsiveFormatsConfirmed}
                disabled={publishing}
                onChange={(event) => setResponsiveFormatsConfirmed(event.target.checked)}
              />
              <span>J’ai bien pris en compte les 3 différents formats : Smartphone, Tablette et PC.</span>
            </label>
            <p className="publication-responsive-help" id="publication-responsive-help">Chaque format possède sa propre mise en page. Pensez à vérifier Smartphone, Tablette et PC avant de publier.</p>
            <button
              className="checkout-button publication-checkout-button"
              disabled={publishing || !responsiveFormatsConfirmed || !validGuestCount}
              aria-describedby="publication-responsive-help"
              onClick={() => void beginCheckout()}
            >
              {publishing ? "Préparation du paiement…" : upgrade ? upgrade.additionalBlocks > 0 ? "Payer les invités supplémentaires" : "Confirmer sans paiement" : "Payer et publier"}
            </button>
            <small><LockKeyhole size={12} /> Paiement sécurisé par Stripe. Aucune donnée bancaire ne transite par le Studio.</small>
          </section>
        </div>
      )}
      {publishError && <div className="publish-popover error"><button className="publish-close" onClick={() => setPublishError("")} aria-label="Fermer"><X size={14} /></button><span>Publication interrompue</span><strong>{publishError}</strong></div>}
      {publishedUrl && <div className="publish-popover"><button className="publish-close" onClick={() => setPublishedUrl(null)} aria-label="Fermer"><X size={14} /></button><span>Votre faire-part est en ligne</span><strong>Ce lien restera identique après vos modifications.</strong><button className="copy-public-link" onClick={() => void navigator.clipboard.writeText(publishedUrl)}><Copy size={14} /> Copier le lien</button><a href={publishedUrl} target="_blank" rel="noreferrer">Voir le faire-part <ExternalLink size={14} /></a></div>}
      {publishingTemplate && <TemplatePublishModal project={project} onClose={() => setPublishingTemplate(false)} />}
    </header>
  );
}
