import { ArrowLeft, Copy, Edit3, Eye, EyeOff, ExternalLink, RefreshCw, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { deleteRemoteTemplate, duplicateRemoteTemplate, loadAdminTemplates, publishProjectAsTemplate, updateTemplateMetadata } from "../services/templateRepository";
import type { TemplateRecord } from "../types/templates";
import { TEMPLATE_CATEGORIES } from "../types/templates";
import { remoteErrorSummary } from "../utils/storage";
import { slugifyTemplateName } from "../utils/templateSnapshot";

export function AdminTemplatesPage() {
  const { isAdmin } = useAuth();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdminTemplates().then(setTemplates).catch((cause) => setError(remoteErrorSummary(cause))).finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const replace = (template: TemplateRecord) => setTemplates((values) => values.map((item) => item.id === template.id ? template : item));
  const mutate = async (id: string, work: () => Promise<TemplateRecord>) => {
    setBusyId(id); setError("");
    try { replace(await work()); } catch (cause) { setError(remoteErrorSummary(cause)); } finally { setBusyId(null); }
  };

  return <div className="admin-templates-page">
    <header className="admin-templates-header"><Link to="/"><ArrowLeft size={17} /> Retour aux projets</Link><div><p className="eyebrow">Administration</p><h1>Gestion des templates</h1></div></header>
    <main>
      <p className="admin-templates-lead">Les snapshots publiés alimentent automatiquement la galerie utilisateur. Les projets déjà créés restent indépendants.</p>
      {error && <div className="template-admin-message error">{error}</div>}
      {loading ? <div className="projects-loading">Chargement des templates…</div> : <div className="admin-template-list">{templates.map((template) => <article key={template.id} className="admin-template-row">
        <div className="admin-template-thumb">{template.thumbnailUrl ? <img src={template.thumbnailUrl} alt="" /> : <span>{template.name.slice(0, 1)}</span>}</div>
        <div className="admin-template-copy"><strong>{template.name}</strong><span>{template.category} · v{template.version} · modifié le {new Date(template.updatedAt).toLocaleDateString("fr-FR")}</span><small>/{template.slug}</small></div>
        <label className="admin-sort-field">Ordre<input type="number" value={template.sortOrder} disabled={busyId === template.id} onChange={(event) => { const sortOrder = Number(event.target.value) || 0; replace({ ...template, sortOrder }); }} onBlur={() => void mutate(template.id, () => updateTemplateMetadata(template.id, { sortOrder: template.sortOrder }))} /></label>
        <div className="admin-template-status">{template.isFeatured && <span className="featured"><Star size={12} /> Mis en avant</span>}<span className={template.isPublished ? "published" : "draft"}>{template.isPublished ? "Publié" : "Brouillon"}</span></div>
        <div className="admin-template-actions">
          {template.sourceProjectId && <Link title="Ouvrir le projet source" to={`/studio/${template.sourceProjectId}`}><ExternalLink size={15} /></Link>}
          {template.sourceProjectId && <button title="Republier le snapshot depuis le projet source" disabled={busyId === template.id} onClick={() => void mutate(template.id, () => publishProjectAsTemplate(template.sourceProjectId!, { name: template.name, slug: template.slug, description: template.description, category: template.category, tags: template.tags, thumbnailUrl: template.thumbnailUrl, previewImageUrl: template.previewImageUrl, isPublished: template.isPublished, isFeatured: template.isFeatured, sortOrder: template.sortOrder }, template.id))}><RefreshCw size={15} /></button>}
          <button title="Modifier les informations" onClick={() => setEditing(template)}><Edit3 size={15} /></button>
          <button title={template.isPublished ? "Dépublier" : "Publier"} disabled={busyId === template.id} onClick={() => void mutate(template.id, () => updateTemplateMetadata(template.id, { isPublished: !template.isPublished }))}>{template.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          <button title="Dupliquer" disabled={busyId === template.id} onClick={async () => { setBusyId(template.id); try { const copy = await duplicateRemoteTemplate(template.id); setTemplates((values) => [...values, copy]); } catch (cause) { setError(remoteErrorSummary(cause)); } finally { setBusyId(null); } }}><Copy size={15} /></button>
          <button className="danger" title="Supprimer" disabled={busyId === template.id} onClick={async () => { if (!window.confirm(`Supprimer le template « ${template.name} » ? Les projets utilisateurs ne seront pas touchés.`)) return; setBusyId(template.id); try { await deleteRemoteTemplate(template.id); setTemplates((values) => values.filter((item) => item.id !== template.id)); } catch (cause) { setError(remoteErrorSummary(cause)); } finally { setBusyId(null); } }}><Trash2 size={15} /></button>
        </div>
      </article>)}</div>}
      {!loading && templates.length === 0 && <div className="empty-projects"><h2>Aucun template</h2><p>Ouvrez un projet administrateur puis utilisez « Template » dans la barre du Studio.</p></div>}
    </main>
    {editing && <TemplateMetadataEditor template={editing} onClose={() => setEditing(null)} onSaved={(template) => { replace(template); setEditing(null); }} />}
  </div>;
}

function TemplateMetadataEditor({ template, onClose, onSaved }: { template: TemplateRecord; onClose: () => void; onSaved: (value: TemplateRecord) => void }) {
  const [name, setName] = useState(template.name);
  const [slug, setSlug] = useState(template.slug);
  const [description, setDescription] = useState(template.description);
  const [category, setCategory] = useState(template.category);
  const [tags, setTags] = useState(template.tags.join(", "));
  const [featured, setFeatured] = useState(template.isFeatured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="template-admin-modal template-metadata-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { onSaved(await updateTemplateMetadata(template.id, { name, slug: slugifyTemplateName(slug), description, category, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), isFeatured: featured })); } catch (cause) { setError(remoteErrorSummary(cause)); setSaving(false); } }}>
    <p className="eyebrow">Template v{template.version}</p><h2>Modifier les informations</h2>
    <div className="template-admin-form"><label className="field"><span>Nom</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>Slug</span><input value={slug} onChange={(event) => setSlug(event.target.value)} /></label><label className="field template-admin-wide"><span>Description</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="field"><span>Catégorie</span><input list="admin-template-categories" value={category} onChange={(event) => setCategory(event.target.value)} /><datalist id="admin-template-categories">{TEMPLATE_CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist></label><label className="field"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} /></label><label className="compact-check"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Mis en avant</label></div>
    {error && <div className="template-admin-message error">{error}</div>}<div className="template-admin-actions"><button type="button" onClick={onClose}>Annuler</button><button className="primary" disabled={saving || !name.trim() || !slug} type="submit">{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
  </form></div>;
}
