import { useId } from "react";
import { Eye, Plus } from "lucide-react";
import { ModalLayer } from "../../components/ui/ModalLayer";
import { HoverVideoThumbnail } from "../previewVideos/HoverVideoThumbnail";
import { templateFactories } from "../../templates/templates";
import type { WeddingProject } from "../../types/editor";
import type { TemplateRecord } from "../../types/templates";
import { INVITATION_CATEGORIES, publishedTemplatesForCategory, type InvitationCategory } from "./invitationCategory";
import "./templateChooser.css";

export function TemplateChooser({ templates, loading, error, category, onCategoryChange, creatingId, onClose, onBlank, onUse, onPreview, onLegacy }: {
  templates: TemplateRecord[]; loading: boolean; error: string; category: InvitationCategory;
  onCategoryChange: (category: InvitationCategory) => void; creatingId: string | null;
  onClose: () => void; onBlank: (category: InvitationCategory) => void;
  onUse: (template: TemplateRecord) => void; onPreview: (template: TemplateRecord) => void;
  onLegacy: (project: WeddingProject) => void;
}) {
  const id = useId();
  const filtered = publishedTemplatesForCategory(templates, category);
  const legacy = !loading && templates.length === 0 && category === "wedding" ? templateFactories : [];
  return <ModalLayer label="Choisissez votre point de départ" onClose={onClose} busy={Boolean(creatingId)}>
    <div className="modal-backdrop" onMouseDown={() => { if (!creatingId) onClose(); }}>
      <section className="template-modal" onMouseDown={event => event.stopPropagation()}>
        <button className="modal-close" disabled={Boolean(creatingId)} onClick={onClose} aria-label="Fermer les modèles">×</button>
        <p className="eyebrow">Nouvelle création</p><h2>Choisissez votre point de départ</h2>
        <div className="invitation-category-tabs" role="tablist" aria-label="Type de faire-part">
          {INVITATION_CATEGORIES.map(item => <button key={item.value} id={`${id}-${item.value}`} type="button" role="tab"
            data-category={item.value} aria-selected={category === item.value} aria-controls={`${id}-models`}
            tabIndex={category === item.value ? 0 : -1} disabled={Boolean(creatingId)} onClick={() => onCategoryChange(item.value)}
            onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "wedding" : event.key === "End" ? "birth" : category === "wedding" ? "birth" : "wedding";
              onCategoryChange(next);
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-category="${next}"]`)?.focus();
            }}>{item.label}</button>)}
        </div>
        <p className="modal-intro">Chaque détail pourra être modifié ensuite dans le studio.</p>
        {error && <div className="template-admin-message error">{error}</div>}
        <div id={`${id}-models`} role="tabpanel" aria-labelledby={`${id}-${category}`}>
          <div className="template-grid">
            <button className="blank-template" disabled={Boolean(creatingId)} onClick={() => onBlank(category)}><span><Plus size={30}/></span><strong>Création vierge</strong><small>Une page claire, prête à imaginer.</small></button>
            {filtered.map(template => <article className="template-choice-card" key={template.id}>
              <HoverVideoThumbnail imageUrl={template.thumbnailUrl} videoPath={template.previewVideoPath} alt={`modèle ${template.name}`}><span className="template-art remote-template-art"><i>{template.name.slice(0, 1)}</i></span></HoverVideoThumbnail>
              <strong>{template.name}</strong><small>{template.category}{template.description ? ` · ${template.description}` : ""}</small>
              <div><button disabled={Boolean(creatingId)} onClick={() => onPreview(template)}><Eye size={14}/> Aperçu</button><button className="primary" disabled={Boolean(creatingId)} onClick={() => onUse(template)}>{creatingId === template.id ? "Création…" : "Utiliser ce modèle"}</button></div>
            </article>)}
            {legacy.map(template => <button className="template-choice" key={template.id} onClick={() => onLegacy({...template.create(), invitationCategory:"wedding"})}><span className={`template-art ${template.id}`}><i style={{background:template.colors[1]}}>E & L</i><b>18 · 06 · 2027</b></span><strong>{template.name}</strong><small>{template.eyebrow} · modèle historique</small></button>)}
          </div>
          {!loading && filtered.length === 0 && legacy.length === 0 && <p className="template-category-empty" role="status">Aucun modèle disponible pour le moment. Vous pouvez commencer avec une création vierge.</p>}
          {loading && <div className="projects-loading">Chargement des modèles…</div>}
        </div>
      </section>
    </div>
  </ModalLayer>;
}
