import { Check, ImagePlus, LayoutTemplate, X } from "lucide-react";
import { useMemo, useState } from "react";
import { publishProjectAsTemplate, uploadTemplateThumbnail } from "../../services/templateRepository";
import type { WeddingProject } from "../../types/editor";
import { TEMPLATE_CATEGORIES } from "../../types/templates";
import { slugifyTemplateName } from "../../utils/templateSnapshot";
import { remoteErrorSummary } from "../../utils/storage";

export function TemplatePublishModal({ project, onClose }: { project: WeddingProject; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(slugifyTemplateName(project.name));
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0]);
  const [tags, setTags] = useState("");
  const [isFeatured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [isPublished, setPublished] = useState(true);
  const [verifiedResponsive, setVerifiedResponsive] = useState(false);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const previewUrl = useMemo(() => thumbnail ? URL.createObjectURL(thumbnail) : null, [thumbnail]);

  const submit = async () => {
    if (!verifiedResponsive || saving) return;
    setSaving(true);
    setError("");
    try {
      const thumbnailUrl = thumbnail ? await uploadTemplateThumbnail(thumbnail) : null;
      const template = await publishProjectAsTemplate(project.id, {
        name: name.trim(),
        slug: slugifyTemplateName(slug),
        description: description.trim(),
        category: category.trim(),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        thumbnailUrl,
        previewImageUrl: thumbnailUrl,
        isFeatured,
        sortOrder,
        isPublished,
      });
      setSuccess(`${template.name} a été enregistré en version ${template.version}.`);
    } catch (cause) {
      setError(remoteErrorSummary(cause));
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop template-admin-backdrop" onMouseDown={() => !saving && onClose()}>
    <section className="template-admin-modal" role="dialog" aria-modal="true" aria-labelledby="template-publish-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" disabled={saving} onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      <p className="eyebrow"><LayoutTemplate size={14} /> Administration</p>
      <h2 id="template-publish-title">Publier comme template</h2>
      <p className="modal-intro">Le modèle sera un snapshot indépendant du projet actuel. Aucun paiement ni lien public ne sera copié.</p>
      <div className="template-admin-form">
        <label className="field"><span>Nom du template</span><input value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(slugifyTemplateName(value)); }} /></label>
        <label className="field"><span>Slug unique</span><input value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugifyTemplateName(event.target.value)); }} /></label>
        <label className="field template-admin-wide"><span>Description</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="field"><span>Catégorie</span><input list="template-categories" value={category} onChange={(event) => setCategory(event.target.value)} /><datalist id="template-categories">{TEMPLATE_CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="field"><span>Tags, séparés par des virgules</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="rose, floral, élégant" /></label>
        <label className="field"><span>Ordre d’affichage</span><input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value) || 0)} /></label>
        <label className="template-thumbnail-upload">
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)} />
          {previewUrl ? <img src={previewUrl} alt="Vignette du template" /> : <span><ImagePlus size={22} /> Ajouter une vignette</span>}
        </label>
        <label className="compact-check"><input type="checkbox" checked={isFeatured} onChange={(event) => setFeatured(event.target.checked)} /> Mettre en avant</label>
        <label className="compact-check"><input type="checkbox" checked={isPublished} onChange={(event) => setPublished(event.target.checked)} /> Publier immédiatement</label>
      </div>
      <label className="publication-responsive-confirmation template-responsive-confirmation"><input type="checkbox" checked={verifiedResponsive} onChange={(event) => setVerifiedResponsive(event.target.checked)} /><span>J’ai vérifié Smartphone, Tablette et PC.</span></label>
      <p className="publication-responsive-help">Chaque format du snapshot restera indépendant dans les projets créés depuis ce modèle.</p>
      {error && <div className="template-admin-message error">{error}</div>}
      {success && <div className="template-admin-message success"><Check size={15} /> {success}</div>}
      <div className="template-admin-actions"><button onClick={onClose}>Annuler</button><button className="primary" disabled={!name.trim() || !slug || !verifiedResponsive || saving || Boolean(success)} onClick={() => void submit()}>{saving ? "Création du snapshot…" : isPublished ? "Publier le template" : "Enregistrer en brouillon"}</button></div>
    </section>
  </div>;
}
