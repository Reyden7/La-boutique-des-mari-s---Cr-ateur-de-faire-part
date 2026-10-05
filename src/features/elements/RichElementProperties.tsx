import { useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import type { ButtonElement, CarouselElement, EditorElement, LocationElement, ScheduleElement, ScratchElement, SectionElement } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { isSupabaseConfigured } from "../../lib/supabase";
import { deleteProjectAsset, deleteProjectAssetIfUnused, uploadProjectAsset } from "../../services/assetRepository";
import { FontPicker } from "../fonts/FontPicker";
import { getScratchTextStyle, resolveScratchIndicator } from "./scratchDefaults";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { getElementLayout } from "../../utils/responsiveLayout";
import { resolveScheduleTypography } from "../../config/scheduleStyle";
import { PropertySection } from "../../components/properties/PropertySection";
import { loadScratchMask, releaseScratchMask } from "./scratchMask";

type RichElement = ScratchElement | CarouselElement | LocationElement | ScheduleElement | ButtonElement | SectionElement;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;
const asDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });

export function RichElementProperties({ element, appearance }: { element: RichElement; appearance: React.ReactNode }) {
  const [scratchUploadBusy, setScratchUploadBusy] = useState(false);
  const [scratchUploadError, setScratchUploadError] = useState("");
  const project = useEditorStore((state) => state.project);
  const currentPageId = useEditorStore((state) => state.currentPageId);
  const previewDevice = useEditorStore((state) => state.previewDevice);
  const reorderSection = useEditorStore((state) => state.reorderSection);
  const updateElement = useEditorStore((state) => state.updateElement);
  const updateElementLayout = useEditorStore((state) => state.updateElementLayout);
  const update = (changes: object) => updateElement(element.id, changes as Partial<EditorElement>);

  if (element.type === "scratch") {
    const uploadScratchModel = async (file?: File) => {
      if (!file || !project) return;
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["png", "webp", "jpg", "jpeg"].includes(extension) || !["image/png", "image/webp", "image/jpeg"].includes(file.type)) {
        setScratchUploadError("Choisissez une image PNG, WebP ou JPG valide."); return;
      }
      if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
        setScratchUploadError("Le modèle doit peser moins de 10 Mo."); return;
      }
      if (!isSupabaseConfigured) { setScratchUploadError("Le stockage du projet n’est pas disponible."); return; }
      const localUrl = URL.createObjectURL(file);
      let uploadedAssetId: string | undefined;
      setScratchUploadBusy(true);
      setScratchUploadError("");
      try {
        await loadScratchMask(localUrl);
        const asset = await uploadProjectAsset(project, file, "image");
        uploadedAssetId = asset.id;
        await loadScratchMask(asset.url);
        const previous = element.scratchModel;
        update({ shape: "custom", scratchModel: { url: asset.url, name: file.name, assetId: asset.id } });
        uploadedAssetId = undefined;
        const currentProject = useEditorStore.getState().project;
        if (previous?.assetId && currentProject) {
          void deleteProjectAssetIfUnused(currentProject, previous.assetId, previous.url).catch(() => {
            setScratchUploadError("Le nouveau modèle est enregistré, mais l’ancien fichier n’a pas pu être nettoyé.");
          });
        }
      } catch (error) {
        if (uploadedAssetId) await deleteProjectAsset(uploadedAssetId).catch(() => undefined);
        setScratchUploadError(error instanceof Error ? error.message : "Impossible d’importer ce modèle.");
      } finally {
        releaseScratchMask(localUrl);
        URL.revokeObjectURL(localUrl);
        setScratchUploadBusy(false);
      }
    };
    const removeScratchModel = () => {
      const previous = element.scratchModel;
      update({ shape: "circle", scratchModel: undefined });
      const currentProject = useEditorStore.getState().project;
      if (previous?.assetId && currentProject) {
        void deleteProjectAssetIfUnused(currentProject, previous.assetId, previous.url).catch(() => {
          setScratchUploadError("Le modèle a été retiré, mais son fichier n’a pas pu être nettoyé.");
        });
      }
    };
    const text = getScratchTextStyle(element);
    const indicator = resolveScratchIndicator(element.scratchIndicator);
    const updateIndicator = (changes: Partial<typeof indicator>) => update({
      scratchIndicator: { ...indicator, ...changes },
    });
    const indicatorHasText = indicator.type === "text" || indicator.type === "finger-text";
    return <div className="rich-properties"><PropertySection sectionKey="zone-a-gratter" key={`${element.id}-scratch`} title="Zone à gratter">
      <Field label="Contenu révélé"><textarea rows={2} value={element.content} onChange={(e) => update({ content: e.target.value })} /></Field>
      <Field label="Police"><FontPicker value={text.fontFamily} onChange={(fontFamily) => update({ fontFamily })} /></Field>
      <div className="field-row"><Field label="Taille"><input type="number" min="8" max="180" value={text.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} /></Field><Field label="Graisse"><select value={text.fontWeight} onChange={(e) => update({ fontWeight: Number(e.target.value) })}><option value="300">Fine</option><option value="400">Normale</option><option value="500">Moyenne</option><option value="600">Demi-gras</option><option value="700">Gras</option></select></Field></div>
      <div className="field-row"><Field label="Couleur du texte"><ColorAlphaInput value={text.textColor} onChange={(value) => update({ textColor: value, contentColor: value })} /></Field><Field label="Alignement"><select value={text.textAlign} onChange={(e) => update({ textAlign: e.target.value })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></Field></div>
      <div className="field-row"><Field label="Position X locale"><input type="number" min="-500" max="500" value={text.textOffsetX} onChange={(e) => update({ textOffsetX: Number(e.target.value) })} /></Field><Field label="Position Y locale"><input type="number" min="-500" max="500" value={text.textOffsetY} onChange={(e) => update({ textOffsetY: Number(e.target.value) })} /></Field></div>
      <div className="field-row"><Field label="Forme"><select value={element.shape} onChange={(e) => update({ shape: e.target.value })}><option value="circle">Cercle</option><option value="rectangle">Rectangle</option><option value="rounded-rectangle">Arrondi</option><option value="custom">Modèle personnalisé</option></select></Field><Field label="Matière"><select value={element.surfaceStyle} onChange={(e) => update({ surfaceStyle: e.target.value })}><option value="gold">Or</option><option value="silver">Argent</option><option value="champagne">Champagne</option><option value="beige">Beige</option><option value="rose">Rose</option><option value="custom">Personnalisée</option></select></Field></div>
      {element.shape === "custom" && <div className="scratch-model-controls">
        {element.scratchModel && <div className="scratch-model-preview"><img src={element.scratchModel.url} alt={`Modèle ${element.scratchModel.name}`} loading="lazy" /><span>{element.scratchModel.name}</span></div>}
        <label className="secondary-action"><Upload size={14} /> {scratchUploadBusy ? "Import en cours…" : element.scratchModel ? "Remplacer le modèle" : "Importer un modèle"}<input hidden type="file" accept=".png,.webp,.jpg,.jpeg,image/png,image/webp,image/jpeg" disabled={scratchUploadBusy} onChange={(e) => { void uploadScratchModel(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
        {element.scratchModel && <button className="secondary-action" type="button" disabled={scratchUploadBusy} onClick={removeScratchModel}><Trash2 size={14} /> Supprimer le modèle</button>}
        <small>L’image en couleur remplace la matière avant grattage ; le fond révélé colore sa silhouette. PNG/WebP transparents recommandés. Un JPG doit avoir un fond uni distinct.</small>
        {scratchUploadError && <p className="scratch-model-error" role="alert">{scratchUploadError}</p>}
      </div>}
      <div className="field-row"><Field label="Couleur de surface"><ColorAlphaInput value={element.surfaceColor} onChange={(value) => update({ surfaceColor: value, surfaceStyle: "custom" })} /></Field><Field label="Fond révélé"><ColorAlphaInput value={element.revealedBackgroundColor ?? "#fffaf5"} onChange={(value) => update({ revealedBackgroundColor: value })} /></Field></div>
      {appearance}</PropertySection><PropertySection sectionKey="indicateur" key={`${element.id}-indicator`} title="Indicateur de grattage"><div className="scratch-indicator-properties">
        <label className="compact-check"><input type="checkbox" checked={indicator.enabled} onChange={(e) => updateIndicator({ enabled: e.target.checked })} /> Afficher un indicateur de grattage</label>
        {indicator.enabled && <>
          <Field label="Type d’indicateur"><select value={indicator.type} onChange={(e) => updateIndicator({ type: e.target.value as typeof indicator.type })}><option value="finger">Doigt animé</option><option value="hand">Main animée</option><option value="text">Texte seul</option><option value="finger-text">Doigt + texte</option></select></Field>
          {indicatorHasText && <><Field label="Texte indicateur"><input value={indicator.text} onChange={(e) => updateIndicator({ text: e.target.value })} /></Field><Field label="Police"><FontPicker value={indicator.fontFamily ?? "Montserrat"} onChange={(fontFamily) => updateIndicator({ fontFamily })} /></Field></>}
          <div className="field-row"><Field label="Taille"><input type="number" min="12" max="120" value={indicator.size} onChange={(e) => updateIndicator({ size: Number(e.target.value) })} /></Field><Field label="Couleur"><ColorAlphaInput value={indicator.color} onChange={(color) => updateIndicator({ color })} /></Field></div>
          <Field label={`Opacité · ${Math.round(indicator.opacity * 100)} %`}><input type="range" min="0.1" max="1" step="0.05" value={indicator.opacity} onChange={(e) => updateIndicator({ opacity: Number(e.target.value) })} /></Field>
          <div className="field-row"><Field label="Position X locale"><input type="number" min="-500" max="500" value={indicator.x} onChange={(e) => updateIndicator({ x: Number(e.target.value) })} /></Field><Field label="Position Y locale"><input type="number" min="-500" max="500" value={indicator.y} onChange={(e) => updateIndicator({ y: Number(e.target.value) })} /></Field></div>
          <label className="compact-check"><input type="checkbox" checked={indicator.animated} onChange={(e) => updateIndicator({ animated: e.target.checked })} /> Animation activée</label>
        </>}
      </div></PropertySection>
    </div>;
  }

  if (element.type === "carousel") {
    const upload = async (files: FileList | null) => {
      if (!files?.length || !project) return;
      const additions: CarouselElement["images"] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) continue;
        try {
          const asset = isSupabaseConfigured ? await uploadProjectAsset(project, file, "image") : undefined;
          additions.push({ id: crypto.randomUUID(), url: asset?.url ?? await asDataUrl(file), alt: file.name, assetId: asset?.id });
        } catch { window.alert(`Impossible d’ajouter ${file.name}.`); }
      }
      update({ images: [...element.images, ...additions] });
    };
    const move = (index: number, direction: -1 | 1) => { const next = [...element.images]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; update({ images: next }); };
    return <div className="rich-properties"><PropertySection sectionKey="images" key={`${element.id}-images`} title="Images">
      <label className="carousel-upload"><ImagePlus size={16} /> Ajouter des photos<input hidden multiple type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void upload(e.target.files); e.currentTarget.value = ""; }} /></label>
      <div className="carousel-photo-list">{element.images.map((image, index) => <div key={image.id}><img src={image.url} alt="" /><span>{image.alt}</span><button onClick={() => move(index, -1)} disabled={!index}><ArrowUp size={12} /></button><button onClick={() => move(index, 1)} disabled={index === element.images.length - 1}><ArrowDown size={12} /></button><button onClick={() => update({ images: element.images.filter((item) => item.id !== image.id) })}><Trash2 size={12} /></button></div>)}</div>
      </PropertySection><PropertySection sectionKey="comportement" key={`${element.id}-behavior`} title="Comportement">
      <Field label="Transition"><select value={element.transition} onChange={(e) => update({ transition: e.target.value })}><option value="slide">Glissement</option><option value="fade">Fondu</option></select></Field>
      <label className="compact-check"><input type="checkbox" checked={element.showArrows} onChange={(e) => update({ showArrows: e.target.checked })} /> Flèches</label><label className="compact-check"><input type="checkbox" checked={element.showDots} onChange={(e) => update({ showDots: e.target.checked })} /> Indicateurs</label><label className="compact-check"><input type="checkbox" checked={element.autoplay} onChange={(e) => update({ autoplay: e.target.checked })} /> Lecture automatique</label>
      {element.autoplay && <Field label="Durée entre les photos (s)"><input type="number" min="1" max="20" value={element.interval} onChange={(e) => update({ interval: Number(e.target.value) })} /></Field>}
      </PropertySection><PropertySection sectionKey="apparence" key={`${element.id}-appearance`} title="Apparence"><Field label="Ajustement"><select value={element.imageFit} onChange={(e) => update({ imageFit: e.target.value })}><option value="cover">Couvrir</option><option value="contain">Contenir</option></select></Field>
      <Field label={`Coins · ${element.cornerRadius}px`}><input type="range" min="0" max="80" value={element.cornerRadius} onChange={(e) => update({ cornerRadius: Number(e.target.value) })} /></Field>
      {appearance}</PropertySection>
    </div>;
  }

  if (element.type === "location") return <div className="rich-properties"><PropertySection sectionKey="informations" key={`${element.id}-information`} title="Informations">
    <Field label="Nom du lieu"><input value={element.venueName} onChange={(e) => update({ venueName: e.target.value })} /></Field><Field label="Adresse"><textarea rows={2} value={element.address} onChange={(e) => update({ address: e.target.value })} /></Field><Field label="Texte complémentaire"><textarea rows={2} value={element.details} onChange={(e) => update({ details: e.target.value })} /></Field><Field label="Bouton"><input value={element.buttonLabel} onChange={(e) => update({ buttonLabel: e.target.value })} /></Field>
    <div className="field-row"><Field label="Latitude"><input type="number" step="0.000001" value={element.latitude ?? ""} onChange={(e) => update({ latitude: e.target.value ? Number(e.target.value) : undefined })} /></Field><Field label="Longitude"><input type="number" step="0.000001" value={element.longitude ?? ""} onChange={(e) => update({ longitude: e.target.value ? Number(e.target.value) : undefined })} /></Field></div>
    </PropertySection><PropertySection sectionKey="couleurs" key={`${element.id}-colors`} title="Couleurs">
    <div className="field-row"><Field label="Fond"><ColorAlphaInput value={element.backgroundColor} onChange={(value) => update({ backgroundColor: value })} /></Field><Field label="Accent"><ColorAlphaInput value={element.accentColor} onChange={(value) => update({ accentColor: value })} /></Field></div>
    {appearance}</PropertySection>
  </div>;

  if (element.type === "schedule") {
    const scheduleTypography = resolveScheduleTypography(element, getElementLayout(element, previewDevice));
    const changeItem = (id: string, changes: object) => update({ items: element.items.map((item) => item.id === id ? { ...item, ...changes } : item) });
    const move = (index: number, direction: -1 | 1) => { const next = [...element.items]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; update({ items: next }); };
    return <div className="rich-properties"><PropertySection sectionKey="contenu" key={`${element.id}-content`} title="Contenu">
      <div className="schedule-editor-list">{element.items.map((item, index) => <article key={item.id}><div><input value={item.time} aria-label="Heure" onChange={(e) => changeItem(item.id, { time: e.target.value })} /><input value={item.title} aria-label="Titre" onChange={(e) => changeItem(item.id, { title: e.target.value })} /></div><textarea rows={2} value={item.description ?? ""} placeholder="Description" onChange={(e) => changeItem(item.id, { description: e.target.value })} /><div className="mini-actions"><button onClick={() => move(index, -1)} disabled={!index}><ArrowUp size={12} /></button><button onClick={() => move(index, 1)} disabled={index === element.items.length - 1}><ArrowDown size={12} /></button><button onClick={() => update({ items: element.items.filter((value) => value.id !== item.id) })}><Trash2 size={12} /></button></div></article>)}</div>
      <button className="secondary-action" onClick={() => update({ items: [...element.items, { id: crypto.randomUUID(), time: "18:00", title: "Nouvelle étape" }] })}><Plus size={13} /> Ajouter une étape</button>
    </PropertySection><PropertySection sectionKey="style" key={`${element.id}-style`} title="Style"><Field label="Style"><select value={element.displayStyle} onChange={(e) => update({ displayStyle: e.target.value })}><option value="list">Liste</option><option value="timeline">Timeline</option><option value="elegant">Timeline élégante</option></select></Field>
      <div className="schedule-typography-fields">
        <Field label="Taille des heures"><input type="number" min="6" max="96" value={scheduleTypography.timeFontSize} onChange={(e) => updateElementLayout(element.id, { timeFontSize: Number(e.target.value) })} /></Field>
        <Field label="Taille des titres"><input type="number" min="6" max="120" value={scheduleTypography.titleFontSize} onChange={(e) => updateElementLayout(element.id, { titleFontSize: Number(e.target.value) })} /></Field>
        <Field label="Taille des descriptions"><input type="number" min="6" max="96" value={scheduleTypography.descriptionFontSize} onChange={(e) => updateElementLayout(element.id, { descriptionFontSize: Number(e.target.value) })} /></Field>
      </div>
      <div className="field-row"><Field label="Fond"><ColorAlphaInput value={element.backgroundColor} onChange={(value) => update({ backgroundColor: value })} /></Field><Field label="Heures"><ColorAlphaInput value={element.timeColor} onChange={(value) => update({ timeColor: value })} /></Field></div>
      <div className="field-row"><Field label="Titres"><ColorAlphaInput value={element.titleColor ?? element.textColor} onChange={(value) => update({ titleColor: value })} /></Field><Field label="Descriptions"><ColorAlphaInput value={element.descriptionColor ?? element.textColor} onChange={(value) => update({ descriptionColor: value })} /></Field></div>
      <div className="field-row"><Field label="Trait"><ColorAlphaInput value={element.lineColor} onChange={(value) => update({ lineColor: value })} /></Field><Field label="Marqueurs"><ColorAlphaInput value={element.accentColor} onChange={(value) => update({ accentColor: value })} /></Field></div>
      {appearance}</PropertySection>
    </div>;
  }

  if (element.type === "button") return <div className="rich-properties">
    <PropertySection sectionKey="contenu" key={`${element.id}-content`} title="Contenu">
      <Field label="Texte"><input value={element.label} onChange={(e) => update({ label: e.target.value })} /></Field>
      {!element.welcomeAction && <><Field label="URL sécurisée"><input type="url" value={element.url} onChange={(e) => update({ url: e.target.value })} /></Field><Field label="Ouverture"><select value={element.target} onChange={(e) => update({ target: e.target.value })}><option value="new">Nouvel onglet</option><option value="same">Même onglet</option></select></Field></>}
    </PropertySection>
    <PropertySection sectionKey="apparence" key={`${element.id}-appearance`} title="Apparence">
      <Field label="Police"><FontPicker value={element.fontFamily ?? "Montserrat"} onChange={(fontFamily) => update({ fontFamily })} /></Field>
      <div className="field-row"><Field label="Taille"><input type="number" min="8" max="80" value={element.fontSize ?? 13} onChange={(e) => update({ fontSize: Number(e.target.value) })} /></Field><Field label="Graisse"><select value={element.fontWeight ?? 700} onChange={(e) => update({ fontWeight: Number(e.target.value) })}><option value="400">Normale</option><option value="500">Moyenne</option><option value="600">Demi-gras</option><option value="700">Gras</option></select></Field></div>
      <Field label="Alignement"><select value={element.textAlign} onChange={(e) => update({ textAlign: e.target.value })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></Field>
      <div className="field-row"><Field label="Fond"><ColorAlphaInput value={element.backgroundColor} onChange={(value) => update({ backgroundColor: value })} /></Field><Field label="Texte"><ColorAlphaInput value={element.textColor} onChange={(value) => update({ textColor: value })} /></Field></div>
      <div className="field-row"><Field label="Bordure"><ColorAlphaInput value={element.borderColor} onChange={(value) => update({ borderColor: value })} /></Field><Field label="Épaisseur"><input type="number" min="0" max="12" value={element.borderWidth} onChange={(e) => update({ borderWidth: Number(e.target.value) })} /></Field></div>
      <Field label="Rayon"><input type="number" min="0" max="100" value={element.borderRadius} onChange={(e) => update({ borderRadius: Number(e.target.value) })} /></Field>
      {appearance}
    </PropertySection>
  </div>;

  const uploadSectionBackground = async (file?: File) => {
    if (!file || !project) return;
    try {
      const asset = isSupabaseConfigured ? await uploadProjectAsset(project, file, "image") : undefined;
      update({ background: { type: "image", imageUrl: asset?.url ?? await asDataUrl(file) } });
    } catch { window.alert("Impossible d’ajouter cette image de section."); }
  };
  const sections = project?.pages.find((page) => page.id === currentPageId)?.elements
    .filter((candidate): candidate is SectionElement => candidate.type === "section")
    .sort((left, right) => getElementLayout(left, previewDevice).y - getElementLayout(right, previewDevice).y) ?? [];
  const sectionIndex = sections.findIndex((section) => section.id === element.id);
  return <div className="rich-properties">
    <PropertySection sectionKey="section" key={`${element.id}-section`} title="Section">
      <div className="section-order-actions"><button disabled={sectionIndex <= 0} onClick={() => reorderSection(element.id, -1)}><ArrowUp size={13} /> Monter la section</button><button disabled={sectionIndex < 0 || sectionIndex === sections.length - 1} onClick={() => reorderSection(element.id, 1)}><ArrowDown size={13} /> Descendre la section</button></div>
      <Field label="Padding"><input type="number" min="0" max="160" value={element.padding} onChange={(e) => update({ padding: Number(e.target.value) })} /></Field>
      <Field label="Coins arrondis"><input type="number" min="0" max="120" value={element.cornerRadius} onChange={(e) => update({ cornerRadius: Number(e.target.value) })} /></Field>
    </PropertySection>
    <PropertySection sectionKey="fond" key={`${element.id}-background`} title="Fond">
      <Field label="Type de fond"><select value={element.background.type} onChange={(e) => update({ background: { ...element.background, type: e.target.value } })}><option value="color">Couleur</option><option value="gradient">Dégradé</option><option value="image">Image</option></select></Field>
      {element.background.type === "color" ? <Field label="Couleur"><ColorAlphaInput value={element.background.color ?? "#f7f1eb"} onChange={(value) => update({ background: { ...element.background, color: value } })} /></Field> : element.background.type === "gradient" ? <div className="field-row"><Field label="Début"><ColorAlphaInput value={element.background.gradient?.color1 ?? "#f7f1eb"} onChange={(value) => update({ background: { type: "gradient", gradient: { type: "linear", color1: value, color2: element.background.gradient?.color2 ?? "#ded0c3", angle: 135 } } })} /></Field><Field label="Fin"><ColorAlphaInput value={element.background.gradient?.color2 ?? "#ded0c3"} onChange={(value) => update({ background: { type: "gradient", gradient: { type: "linear", color1: element.background.gradient?.color1 ?? "#f7f1eb", color2: value, angle: 135 } } })} /></Field></div> : <label className="carousel-upload"><ImagePlus size={16} /> Choisir une image<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { void uploadSectionBackground(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>}
    </PropertySection>
    <PropertySection sectionKey="apparence" key={`${element.id}-appearance`} title="Apparence">{appearance}</PropertySection>
  </div>;
}
