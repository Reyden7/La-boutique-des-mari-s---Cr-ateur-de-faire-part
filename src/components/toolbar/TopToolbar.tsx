import { ModalLayer } from "../ui/ModalLayer";
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
import { isPublishedDesignLocked, publicationVersionLabel } from "../../features/publication/publicationState";
import { createPublicationRevision, PublicationVersions } from "../../features/publication/PublicationVersions";

const publicationBenefits = [
  "Lien personnalisé et stable",
  "Une version publiée définitive",
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
  const [termsAccepted,setTermsAccepted] = useState(false);
  const [operation,setOperation] = useState<"design"|"capacity">("design");
  const [creatingVersion,setCreatingVersion] = useState(false),[versionBusy,setVersionBusy] = useState(false),[history,setHistory] = useState(false);
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
  const republishing = isPublished && project.publicationPolicy === "paid_versions" && Boolean(project.hasVersionDraft) && operation === "design";
  const locked = isPublishedDesignLocked(project);
  const includesForm = Boolean(project.rsvp?.enabled && !project.rsvp.purchased && (!isPublished || republishing));
  const totals = recipientTotals(recipientLists[recipientListKey(project)]?.recipients??[]);
  const guestCount = totals.guests;
  const validGuestCount = isValidGuestCount(guestCount);
  const pricing = calculateTotalPricing(republishing ? Math.max(guestCount,project.purchasedGuestCapacity??40,40) : validGuestCount ? guestCount : PRICING.includedGuests, includesForm);
  const isUpgrade = isPublished && !republishing && project.purchasedGuestCapacity != null;
  const requiresFixedTerms = !isUpgrade && project.publicationPolicy !== "legacy";
  const upgrade = isUpgrade ? calculateGuestUpgrade(project.purchasedGuestCapacity!, pricing.guestCount) : null;
  const publicationPrice = upgrade?.upgradePriceCents ?? pricing.totalPriceCents;
  const discount = !isPublished && promo ? calculatePromoDiscount(publicationPrice, promo.discountValue) : null;
  const publicationPriceLabel = formatPrice(confirming ? discount?.finalAmount ?? publicationPrice : publicationPrice);
  const showPublishedLink = () => {
    if (project.publicId) setPublishedUrl(`${window.location.origin}/i/${project.publicId}`);
  };
  const openPublicationConfirmation = (kind: "design"|"capacity" = "design") => {
    if (discovery) { requestDiscoveryAccount("publish"); return; }
    setPromo(null); setValidatingPromo(false); setPublishError("");
    setResponsiveFormatsConfirmed(false);
    setOperation(kind);setTermsAccepted(false);
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
    if (!responsiveFormatsConfirmed || publishing || validatingPromo || !validGuestCount || !listVerified || (requiresFixedTerms && !termsAccepted)) return;
    setPublishError("");
    setPublishing(true);
    try {
      const checkoutUrl = await checkoutAndPublish(guestCount, !isPublished ? promo?.code : undefined, {
        kind: republishing ? "paid_version" : isUpgrade ? "guest_capacity_upgrade" : "initial_publication",
        termsAccepted, expectedAmount:discount?.finalAmount??publicationPrice,
      });
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
      setPublishError(error instanceof Error && ["Ce code promo n’est plus disponible.", PRICING_CHANGED_MESSAGE].includes(error.message) ? error.message : discount?.finalAmount === 0 ? "La publication gratuite n’a pas pu être confirmée. Actualisez le projet puis réessayez." : "Le paiement n’a pas pu être préparé. Vérifiez votre connexion puis réessayez.");
      setPromo(null);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <header className={`top-toolbar${project.activeVersionId?" publication-has-version":""}`}>
      <div className="brand-block"><Link to="/" className="back-button" aria-label="Retour aux projets"><ChevronLeft size={18} /></Link><div className="brand-mark">B</div><div className="brand-name"><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div>
      <div className="project-name-wrap"><input aria-label="Nom du projet" disabled={locked} value={project.name} onChange={(event) => renameProject(event.target.value)} /><div className="save-state">{discovery ? "Mode découverte — Non sauvegardé" : saveStatus === "saving" ? "Sauvegarde…" : saveStatus === "saved" ? <><Check size={12} /> Sauvegardé</> : "Modifications locales"}</div>{project.activeVersionId&&<span className="publication-badge">{publicationVersionLabel(project)}</span>}</div>
      <div className="toolbar-actions">
        <div className="undo-group"><button onClick={undo} disabled={locked||!past.length} title="Annuler (Ctrl+Z)"><Undo2 size={18} /></button><button onClick={redo} disabled={locked||!future.length} title="Rétablir (Ctrl+Y)"><Redo2 size={18} /></button></div>
        <TutorialHelpButton />
        <button data-tour="preview-button" onClick={onPreview} aria-label="Aperçu"><Eye size={17} /> <span>{project.hasVersionDraft?"Aperçu de la nouvelle version":"Aperçu"}</span></button>
        <button data-tour="save-button" className={discovery ? "discovery-save" : undefined} onClick={save} aria-label={discovery ? "Créer un compte pour sauvegarder" : "Sauvegarder"}><Save size={17} /> <span>{discovery ? "Créer un compte pour sauvegarder" : "Sauvegarder"}</span></button>
        {isAdmin && !discovery && <button className="admin-template-button" onClick={() => setPublishingTemplate(true)} aria-label="Publier comme template"><LayoutTemplate size={17} /> <span>Template</span></button>}
        <button data-tour="publish-button" className="publish-button" disabled={publishing} onClick={()=>isPublished&&!project.hasVersionDraft?showPublishedLink():openPublicationConfirmation("design")} aria-label={project.hasVersionDraft?"Publier la nouvelle version":isPublished ? "Faire-part publié" : `Publier le faire-part pour ${publicationPriceLabel}`}><Send size={16} /> <span>{publishing ? "Redirection…" : project.hasVersionDraft?"Publier la nouvelle version":isPublished ? "Faire-part publié ✓" : project.paymentStatus === "pending" ? `Reprendre le paiement — ${publicationPriceLabel}` : `Publier — ${publicationPriceLabel}`}</span></button>
        {isPublished&&project.purchasedGuestCapacity!=null&&<button className="publication-secondary-action" disabled={publishing} onClick={()=>openPublicationConfirmation("capacity")}>Invités · capacité {project.purchasedGuestCapacity}</button>}
        {locked&&<button className="publication-secondary-action" onClick={()=>setCreatingVersion(true)}>Créer une nouvelle version</button>}
        {project.activeVersionId&&<button className="publication-secondary-action" onClick={()=>setHistory(true)}>Historique des versions</button>}
      </div>

      {project.activeVersionId&&<nav className="publication-mobile-actions" aria-label="Gestion de la publication">
        {isPublished&&project.purchasedGuestCapacity!=null&&<button disabled={publishing} onClick={()=>openPublicationConfirmation("capacity")}>Invités · capacité {project.purchasedGuestCapacity}</button>}
        {locked&&<button onClick={()=>setCreatingVersion(true)}>Créer une nouvelle version</button>}
        <button onClick={()=>setHistory(true)}>Historique des versions</button>
      </nav>}
      {confirming && (
        <ModalLayer label="Publication" onClose={closePublicationConfirmation} busy={publishing}><div className="modal-backdrop publication-backdrop" role="presentation" onMouseDown={closePublicationConfirmation}>
          <section className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="publication-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" disabled={publishing} onClick={closePublicationConfirmation} aria-label="Fermer"><X size={18} /></button>
            <div className="publication-lock"><LockKeyhole size={22} /></div>
            <p className="eyebrow">Publication sécurisée</p>
            <h2 id="publication-title">{republishing?"Publier cette nouvelle version":isUpgrade ? "Ajustez votre capacité" : "Publiez votre faire-part"}</h2>
            {requiresFixedTerms&&<section className="publication-warning"><h3>Vérifiez votre faire-part avant sa publication</h3><p>Une fois votre faire-part payé et publié, cette version sera définitive. Toute modification de son contenu nécessitera une nouvelle publication payante. Nous vous recommandons de vérifier attentivement les textes, dates, horaires et informations de votre mariage.</p><label><input type="checkbox" checked={termsAccepted} disabled={publishing} onChange={e=>setTermsAccepted(e.target.checked)}/> J'ai vérifié mon faire-part et je comprends que toute nouvelle publication après modification sera payante.</label></section>}
            {project.publicationPolicy==="legacy"&&<p>Vos conditions historiques sont conservées : les modifications de contenu restent illimitées. Seules les places supplémentaires éventuelles sont payantes.</p>}
            {republishing&&<p>Le tarif normal est recalculé sur {pricing.guestCapacity} places, au moins votre capacité déjà achetée. Ce paiement publie le nouveau design ; un formulaire déjà acheté n’est pas refacturé. Vos liens et réponses restent conservés.</p>}
            <div className="publication-guests"><strong>Votre liste d’invités</strong><p>{totals.households} familles/foyers · {guestCount} personnes invitées</p><button disabled={publishing} onClick={()=>{setConfirming(false);openRecipientList();}}>Modifier ma liste</button></div>
            <p className="publication-responsive-help" id="publication-guest-help">{formatPrice(PRICING.basePriceCents)} jusqu’à {PRICING.includedGuests} invités, puis {formatPrice(PRICING.extraGuestPriceCents)} par invité supplémentaire. Formulaire invité en option : +{formatPrice(PRICING.formPriceCents)}.</p>
            {!validGuestCount && <p className="form-error">Ajoutez au moins un destinataire à votre liste avant de publier votre faire-part.</p>}
            {!isPublished && <PromoCodeInput value={promo} onChange={setPromo} disabled={publishing} onBusyChange={setValidatingPromo} validate={promoValidation} />}
            <dl className="publication-breakdown">
              {upgrade ? <><div><dt>Capacité déjà achetée</dt><dd>{project.purchasedGuestCapacity} invités</dd></div><div><dt>Invités supplémentaires · {upgrade.additionalGuests} × {formatPrice(PRICING.extraGuestPriceCents)}</dt><dd>{formatPrice(upgrade.upgradePriceCents)}</dd></div></> : <><div><dt>Faire-part — jusqu’à 40 invités</dt><dd>{formatPrice(PRICING.basePriceCents)}</dd></div>{pricing.extraGuests > 0 && <div><dt>Invités supplémentaires · {pricing.extraGuests} × {formatPrice(PRICING.extraGuestPriceCents)}</dt><dd>{formatPrice(pricing.extraGuests * PRICING.extraGuestPriceCents)}</dd></div>}{includesForm && <div><dt>Formulaire invité</dt><dd>{formatPrice(pricing.formPriceCents)}</dd></div>}</>}
              {discount && <><div><dt>Sous-total</dt><dd>{formatPrice(publicationPrice)}</dd></div><div className="promo-discount"><dt>Code {promo!.code} · −{promo!.discountValue} %</dt><dd>−{formatPrice(discount.discountAmount)}</dd></div></>}
            </dl>
            {publishError && <p className="form-error" role="alert">{publishError}</p>}
            <p className="publication-price"><strong>Total : {validGuestCount ? publicationPriceLabel : "—"} TTC</strong><span>Licence pour un seul événement · capacité {upgrade?.guestCapacity ?? pricing.guestCapacity} invités</span></p>
            {upgrade ? <p className="publication-responsive-help">Vous ne payez que les invités au-delà de votre capacité déjà achetée. Réduire le nombre déclaré ne réduit pas cette capacité et ne déclenche aucun remboursement.</p> : <ul>{publicationBenefits.map((benefit) => <li key={benefit}><Check size={15} /> {project.publicationPolicy==="legacy"&&benefit===publicationBenefits[1]?"Modifications illimitées — conditions historiques conservées":benefit}</li>)}{includesForm && <li><Check size={15} /> Formulaire invité et collecte des réponses</li>}</ul>}
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
              disabled={publishing || validatingPromo || !responsiveFormatsConfirmed || !validGuestCount || !listVerified || (requiresFixedTerms&&!termsAccepted)}
              aria-describedby="publication-responsive-help"
              onClick={() => void beginCheckout()}
            >
              {publishing ? (discount?.finalAmount === 0 ? "Validation de la publication…" : "Préparation du paiement…") : upgrade ? upgrade.additionalGuests > 0 ? "Payer les invités supplémentaires" : "Confirmer sans paiement" : discount?.finalAmount === 0 ? "Publier gratuitement" : "Payer et publier"}
            </button>
            <small><LockKeyhole size={12} /> {discount?.finalAmount === 0 ? "Validation gratuite sécurisée. Aucune coordonnée bancaire demandée." : "Paiement sécurisé par Stripe. Aucune donnée bancaire ne transite par le Studio."}</small>
          </section>
        </div></ModalLayer>
      )}
      {publishError && !confirming && <div className="publish-popover error"><button className="publish-close" onClick={() => setPublishError("")} aria-label="Fermer"><X size={14} /></button><span>Publication interrompue</span><strong>{publishError}</strong></div>}
      {publishedUrl && <div className="publish-popover"><button className="publish-close" onClick={() => setPublishedUrl(null)} aria-label="Fermer"><X size={14} /></button><span>Votre faire-part est en ligne</span><button onClick={()=>{setPublishedUrl(null);openRecipientList();}}>Liens de vos invités</button><strong>Vos liens restent identiques après modification.</strong><button className="copy-public-link" onClick={() => void navigator.clipboard.writeText(publishedUrl)}><Copy size={14} /> Copier le lien commun historique</button><a href={publishedUrl} target="_blank" rel="noreferrer">Voir le faire-part <ExternalLink size={14} /></a></div>}
      {publishingTemplate && <TemplatePublishModal project={project} onClose={() => setPublishingTemplate(false)} />}
      {creatingVersion&&<ModalLayer label="Créer une nouvelle version" onClose={()=>setCreatingVersion(false)} busy={versionBusy}><div className="modal-backdrop"><section className="publication-history" role="dialog" aria-modal="true" aria-label="Créer une nouvelle version"><h2>Créer une nouvelle version</h2><p>Votre faire-part actuel a déjà été publié. Vous pouvez créer une nouvelle version à partir de celui-ci, mais sa mise en ligne nécessitera un nouveau paiement. Votre version actuelle restera accessible à vos invités jusqu'à la publication de la nouvelle.</p><button disabled={versionBusy} onClick={()=>setCreatingVersion(false)}>Annuler</button><button disabled={versionBusy} onClick={()=>{setVersionBusy(true);void createPublicationRevision(project.id).then(()=>setCreatingVersion(false)).catch(e=>setPublishError(e.message)).finally(()=>setVersionBusy(false));}}>Créer une nouvelle version</button></section></div></ModalLayer>}
      {history&&<PublicationVersions project={project} onClose={()=>setHistory(false)}/>}
    </header>
  );
}
