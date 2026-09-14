import { Check, ChevronLeft, Copy, ExternalLink, Eye, LockKeyhole, Redo2, Save, Send, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useEditorStore } from "../../stores/editorStore";

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
  const [publishing, setPublishing] = useState(false);
  const { project, renameProject, past, future, undo, redo, save, checkoutAndPublish, saveStatus } = useEditorStore();
  if (!project) return null;

  const isPublished = project.paymentStatus === "paid" && project.status === "published" && Boolean(project.publicId);
  const showPublishedLink = () => {
    if (project.publicId) setPublishedUrl(`${window.location.origin}/i/${project.publicId}`);
  };
  const beginCheckout = async () => {
    setPublishError("");
    setPublishing(true);
    try {
      const checkoutUrl = await checkoutAndPublish();
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
      console.warn("Création du paiement impossible", error);
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
        <button className="publish-button" disabled={publishing} onClick={isPublished ? showPublishedLink : () => setConfirming(true)} aria-label={isPublished ? "Faire-part publié" : "Publier le faire-part pour 24,90 euros"}><Send size={16} /> <span>{publishing ? "Redirection…" : isPublished ? "Faire-part publié ✓" : project.paymentStatus === "pending" ? "Reprendre le paiement" : "Publier — 24,90 €"}</span></button>
      </div>

      {confirming && <div className="modal-backdrop publication-backdrop" role="presentation" onMouseDown={() => !publishing && setConfirming(false)}><section className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="publication-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" disabled={publishing} onClick={() => setConfirming(false)} aria-label="Fermer"><X size={18} /></button><div className="publication-lock"><LockKeyhole size={22} /></div><p className="eyebrow">Publication sécurisée</p><h2 id="publication-title">Publiez votre faire-part</h2><p className="publication-price"><strong>24,90 € TTC</strong><span>Paiement unique, pour ce projet</span></p><ul>{publicationBenefits.map((benefit) => <li key={benefit}><Check size={15} /> {benefit}</li>)}</ul><button className="checkout-button" disabled={publishing} onClick={() => void beginCheckout()}>{publishing ? "Préparation du paiement…" : "Payer et publier"}</button><small><LockKeyhole size={12} /> Paiement sécurisé par Stripe. Aucune donnée bancaire ne transite par le Studio.</small></section></div>}
      {publishError && <div className="publish-popover error"><button className="publish-close" onClick={() => setPublishError("")} aria-label="Fermer"><X size={14} /></button><span>Publication interrompue</span><strong>{publishError}</strong></div>}
      {publishedUrl && <div className="publish-popover"><button className="publish-close" onClick={() => setPublishedUrl(null)} aria-label="Fermer"><X size={14} /></button><span>Votre faire-part est en ligne</span><strong>Ce lien restera identique après vos modifications.</strong><button className="copy-public-link" onClick={() => void navigator.clipboard.writeText(publishedUrl)}><Copy size={14} /> Copier le lien</button><a href={publishedUrl} target="_blank" rel="noreferrer">Voir le faire-part <ExternalLink size={14} /></a></div>}
    </header>
  );
}
