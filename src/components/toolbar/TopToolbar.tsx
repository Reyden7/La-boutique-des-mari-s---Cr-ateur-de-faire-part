import { Check, ChevronLeft, Copy, ExternalLink, Eye, LayoutTemplate, LockKeyhole, Redo2, Save, Send, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useEditorStore } from "../../stores/editorStore";
import { remoteErrorSummary } from "../../utils/storage";
import { formatPrice } from "../../config/commerce";
import { PRICING, PRICING_CHANGED_MESSAGE, calculateTotalPricing, calculateGuestUpgrade, isValidGuestCount } from "../../config/pricing";
import { useAuth } from "../../contexts/AuthContext";
import { TemplatePublishModal } from "../../features/templates/TemplatePublishModal";
import { PromoCodeInput } from "./PromoCodeInput";
import { calculatePromoDiscount, type AppliedPromo } from "../../config/promo";
import { validatePromoCode } from "../../services/promoCodeRepository";
import { isDiscoveryProject, requestDiscoveryAccount, useDiscoverySession } from "../../features/discovery/discoverySession";
import { TutorialHelpButton } from "../../features/tutorial/TutorialHelp";
import { recipientTotals } from "../../features/recipients/recipientData";
import { recipientListKey } from "../../features/recipients/RecipientListModal";
import { openRecipientList, setRecipientList, useRecipientLists } from "../../features/recipients/recipientStore";
import { loadInvitationRecipients } from "../../services/recipientRepository";

const publicationBenefits = [
  "Lien personnalisé et stable",
  "Modifications illimitées après publication",
  "Responsive mobile, tablette et PC",
  "Animations, musique et effets",
];

export function TopToolbar({ onPreview, promoValidation = validatePromoCode }: { onPreview: () => void; promoValidation?: typeof validatePromoCode }) {
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [responsiveFormatsConfirmed, setResponsiveFormatsConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishingTemplate, setPublishingTemplate] = useState(false);
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [listVerified,setListVerified] = useState(false);
  const { isAdmin } = useAuth();
  const { project, renameProject, past, future, undo, redo, save, checkoutAndPublish, saveStatus } = useEditorStore();
  const recipientLists = useRecipientLists(state => state.lists);
  useEffect(() => {
    if (!project?.ownerId || isDiscoveryProject(project)) return;
    let active = true;
    void loadInvitationRecipients(project.id).then(value=>{if(active)setRecipientList(recipientListKey(project),value);}).catch(()=>undefined);
    return ()=>{active=false;};
  }, [project?.id,project?.ownerId]);
  useDiscoverySession((state) => state.draftId);
  if (!project) return null;
  const discovery = isDiscoveryProject(project);

  const isPublished = project.paymentStatus === "paid" && project.status === "published" && Boolean(project.publicId);
  const includesForm = Boolean(project.rsvp?.enabled && !project.rsvp.purchased && !isPublished);
  const totals = recipientTotals(recipientLists[recipientListKey(project)]?.recipients??[]);
  const guestCount = totals.guests;
  const validGuestCount = isValidGuestCount(guestCount);
  const pricing = calculateTotalPricing(validGuestCount ? guestCount : PRICING.includedGuests, includesForm);
  const isUpgrade = isPublished && project.purchasedGuestCapacity != null;
  const upgrade = isUpgrade ? calculateGuestUpgrade(project.purchasedGuestCapacity!, pricing.guestCount) : null;
  const publicationPrice = upgrade?.upgradePriceCents ?? pricing.totalPriceCents;
  const discount = !isUpgrade && promo ? calculatePromoDiscount(publicationPrice, promo.discountValue) : null;
  const publicationPriceLabel = formatPrice(confirming ? discount?.finalAmount ?? publicationPrice : publicationPrice);
  const showPublishedLink = () => {
    if (project.publicId) setPublishedUrl(`${window.location.origin}/i/${project.publicId}`);
  };
  const openPublicationConfirmation = () => {
    if (discovery) { requestDiscoveryAccount("publish"); return; }
    setPromo(null); setValidatingPromo(false); setPublishError("");
    setResponsiveFormatsConfirmed(false);
    setListVerified(false);
    void loadInvitationRecipients(project.id).then(value=>{setRecipientList(recipientListKey(project),value);setListVerified(true);}).catch(()=>setPublishError("Votre liste doit être chargée et enregistrée avant de publier."));
    setConfirming(true);
  };
  const closePublicationConfirmation = () => {
    if (publishing) return;
    setResponsiveFormatsConfirmed(false);
    setConfirming(false);
  };
  const beginCheckout = async () => {
    if (!responsiveFormatsConfirmed || publishing || validatingPromo || !validGuestCount || !listVerified) return;
    setPublishError("");
    setPublishing(true);
    try {
      const checkoutUrl = await checkoutAndPublish(guestCount, !isUpgrade ? promo?.code : undefined);
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
      setPublishError(error instanceof Error && ["Ce code promo n’est plus disponible.", PRICING_CHANGED_MESSAGE].includes(error.message) ? error.message : "Le paiement n’a pas pu être préparé. Vérifiez votre connexion puis réessayez.");
      setPromo(null);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <header className="top-toolbar">
      <div className="brand-block"><Link to="/" className="back-button" aria-label="Retour aux projets"><ChevronLeft size={18} /></Link><div className="brand-mark">B</div><div className="brand-name"><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div>
      <div className="project-name-wrap"><input aria-label="Nom du projet" value={project.name} onChange={(event) => renameProject(event.target.value)} /><div className="save-state">{discovery ? "Mode découverte — Non sauvegardé" : saveStatus === "saving" ? "Sauvegarde…" : saveStatus === "saved" ? <><Check size={12} /> Sauvegardé</> : "Modifications locales"}</div></div>
      <div className="toolbar-actions">
        <div className="undo-group"><button onClick={undo} disabled={!past.length} title="Annuler (Ctrl+Z)"><Undo2 size={18} /></button><button onClick={redo} disabled={!future.length} title="Rétablir (Ctrl+Y)"><Redo2 size={18} /></button></div>
        <TutorialHelpButton />
        <button data-tour="preview-button" onClick={onPreview} aria-label="Aperçu"><Eye size={17} /> <span>Aperçu</span></button>
        <button data-tour="save-button" className={discovery ? "discovery-save" : undefined} onClick={save} aria-label={discovery ? "Créer un compte pour sauvegarder" : "Sauvegarder"}><Save size={17} /> <span>{discovery ? "Créer un compte pour sauvegarder" : "Sauvegarder"}</span></button>
        {isAdmin && !discovery && <button className="admin-template-button" onClick={() => setPublishingTemplate(true)} aria-label="Publier comme template"><LayoutTemplate size={17} /> <span>Template</span></button>}
        <button data-tour="publish-button" className="publish-button" disabled={publishing} onClick={isPublished ? showPublishedLink : openPublicationConfirmation} aria-label={isPublished ? "Faire-part publié" : `Publier le faire-part pour ${publicationPriceLabel}`}><Send size={16} /> <span>{publishing ? "Redirection…" : isPublished ? "Faire-part publié ✓" : project.paymentStatus === "pending" ? `Reprendre le paiement — ${publicationPriceLabel}` : `Publier — ${publicationPriceLabel}`}</span></button>
        {isUpgrade && <button disabled={publishing} onClick={openPublicationConfirmation}>Invités · capacité {project.purchasedGuestCapacity}</button>}
      </div>

      {confirming && (
        <div className="modal-backdrop publication-backdrop" role="presentation" onMouseDown={closePublicationConfirmation}>
          <section className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="publication-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" disabled={publishing} onClick={closePublicationConfirmation} aria-label="Fermer"><X size={18} /></button>
            <div className="publication-lock"><LockKeyhole size={22} /></div>
            <p className="eyebrow">Publication sécurisée</p>
            <h2 id="publication-title">{isUpgrade ? "Ajustez votre capacité" : "Publiez votre faire-part"}</h2>
            <div className="publication-guests"><strong>Votre liste d’invités</strong><p>{totals.households} familles/foyers · {guestCount} personnes invitées</p><button disabled={publishing} onClick={()=>{setConfirming(false);openRecipientList();}}>Modifier ma liste</button></div>
            <p className="publication-responsive-help" id="publication-guest-help">{formatPrice(PRICING.basePriceCents)} jusqu’à {PRICING.includedGuests} invités, puis {formatPrice(PRICING.extraGuestPriceCents)} par invité supplémentaire. Formulaire invité en option : +{formatPrice(PRICING.formPriceCents)}.</p>
            {!validGuestCount && <p className="form-error">Ajoutez au moins un destinataire à votre liste avant de publier votre faire-part.</p>}
            {!isUpgrade && <PromoCodeInput value={promo} onChange={setPromo} disabled={publishing} onBusyChange={setValidatingPromo} validate={promoValidation} />}
            <dl className="publication-breakdown">
              {upgrade ? <><div><dt>Capacité déjà achetée</dt><dd>{project.purchasedGuestCapacity} invités</dd></div><div><dt>Invités supplémentaires · {upgrade.additionalGuests} × {formatPrice(PRICING.extraGuestPriceCents)}</dt><dd>{formatPrice(upgrade.upgradePriceCents)}</dd></div></> : <><div><dt>Faire-part — jusqu’à 40 invités</dt><dd>{formatPrice(PRICING.basePriceCents)}</dd></div>{pricing.extraGuests > 0 && <div><dt>Invités supplémentaires · {pricing.extraGuests} × {formatPrice(PRICING.extraGuestPriceCents)}</dt><dd>{formatPrice(pricing.extraGuests * PRICING.extraGuestPriceCents)}</dd></div>}{includesForm && <div><dt>Formulaire invité</dt><dd>{formatPrice(pricing.formPriceCents)}</dd></div>}</>}
              {discount && <><div><dt>Sous-total</dt><dd>{formatPrice(publicationPrice)}</dd></div><div className="promo-discount"><dt>Code {promo!.code} · −{promo!.discountValue} %</dt><dd>−{formatPrice(discount.discountAmount)}</dd></div></>}
            </dl>
            {publishError && <p className="form-error" role="alert">{publishError}</p>}
            <p className="publication-price"><strong>Total : {validGuestCount ? publicationPriceLabel : "—"} TTC</strong><span>Licence pour un seul événement · capacité {upgrade?.guestCapacity ?? pricing.guestCapacity} invités</span></p>
            {upgrade ? <p className="publication-responsive-help">Vous ne payez que les invités au-delà de votre capacité déjà achetée. Réduire le nombre déclaré ne réduit pas cette capacité et ne déclenche aucun remboursement.</p> : <ul>{publicationBenefits.map((benefit) => <li key={benefit}><Check size={15} /> {benefit}</li>)}{includesForm && <li><Check size={15} /> Formulaire invité et collecte des réponses</li>}</ul>}
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
              disabled={publishing || validatingPromo || !responsiveFormatsConfirmed || !validGuestCount || !listVerified}
              aria-describedby="publication-responsive-help"
              onClick={() => void beginCheckout()}
            >
              {publishing ? "Préparation du paiement…" : upgrade ? upgrade.additionalGuests > 0 ? "Payer les invités supplémentaires" : "Confirmer sans paiement" : "Payer et publier"}
            </button>
            <small><LockKeyhole size={12} /> Paiement sécurisé par Stripe. Aucune donnée bancaire ne transite par le Studio.</small>
          </section>
        </div>
      )}
      {publishError && !confirming && <div className="publish-popover error"><button className="publish-close" onClick={() => setPublishError("")} aria-label="Fermer"><X size={14} /></button><span>Publication interrompue</span><strong>{publishError}</strong></div>}
      {publishedUrl && <div className="publish-popover"><button className="publish-close" onClick={() => setPublishedUrl(null)} aria-label="Fermer"><X size={14} /></button><span>Votre faire-part est en ligne</span><button onClick={()=>{setPublishedUrl(null);openRecipientList();}}>Liens de vos invités</button><strong>Vos liens restent identiques après modification.</strong><button className="copy-public-link" onClick={() => void navigator.clipboard.writeText(publishedUrl)}><Copy size={14} /> Copier le lien commun historique</button><a href={publishedUrl} target="_blank" rel="noreferrer">Voir le faire-part <ExternalLink size={14} /></a></div>}
      {publishingTemplate && <TemplatePublishModal project={project} onClose={() => setPublishingTemplate(false)} />}
    </header>
  );
}
