import { Check, ChevronLeft, Copy, ExternalLink, Eye, Redo2, Save, Send, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useEditorStore } from "../../stores/editorStore";

export function TopToolbar({ onPreview }: { onPreview: () => void }) {
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const { project, renameProject, past, future, undo, redo, save, publish, saveStatus } = useEditorStore();
  if (!project) return null;
  return (
    <header className="top-toolbar">
      <div className="brand-block"><Link to="/" className="back-button" aria-label="Retour aux projets"><ChevronLeft size={18} /></Link><div className="brand-mark">B</div><div className="brand-name"><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div>
      <div className="project-name-wrap"><input aria-label="Nom du projet" value={project.name} onChange={(event) => renameProject(event.target.value)} /><div className="save-state">{saveStatus === "saving" ? "Sauvegarde…" : saveStatus === "saved" ? <><Check size={12} /> Sauvegardé</> : "Modifications locales"}</div></div>
      <div className="toolbar-actions">
        <div className="undo-group"><button onClick={undo} disabled={!past.length} title="Annuler (Ctrl+Z)"><Undo2 size={18} /></button><button onClick={redo} disabled={!future.length} title="Rétablir (Ctrl+Y)"><Redo2 size={18} /></button></div>
        <button onClick={onPreview} aria-label="Aperçu"><Eye size={17} /> <span>Aperçu</span></button>
        <button onClick={save} aria-label="Sauvegarder"><Save size={17} /> <span>Sauvegarder</span></button>
        <button className="publish-button" disabled={publishing} onClick={async () => { setPublishError(""); setPublishing(true); try { const published = await publish(); if (published?.publicId) setPublishedUrl(`${window.location.origin}/i/${published.publicId}`); } catch { setPublishError("La publication n’a pas pu aboutir. Réessayez dans un instant."); } finally { setPublishing(false); } }} aria-label={project.status === "published" && project.publicId ? "Faire-part publié" : "Publier mon faire-part"}><Send size={16} /> <span>{publishing ? "Publication…" : project.status === "published" && project.publicId ? "Faire-part publié ✓" : "Publier mon faire-part"}</span></button>
      </div>
      {publishError && <div className="publish-popover error"><button className="publish-close" onClick={() => setPublishError("")} aria-label="Fermer"><X size={14} /></button><span>Publication interrompue</span><strong>{publishError}</strong></div>}
      {publishedUrl && <div className="publish-popover"><button className="publish-close" onClick={() => setPublishedUrl(null)} aria-label="Fermer"><X size={14} /></button><span>Votre faire-part est en ligne</span><strong>Ce lien restera identique après vos modifications.</strong><button className="copy-public-link" onClick={() => void navigator.clipboard.writeText(publishedUrl)}><Copy size={14} /> Copier le lien</button><a href={publishedUrl} target="_blank" rel="noreferrer">Voir le faire-part <ExternalLink size={14} /></a></div>}
    </header>
  );
}
