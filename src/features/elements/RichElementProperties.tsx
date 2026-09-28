import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import type { ButtonElement, CarouselElement, EditorElement, LocationElement, ScheduleElement, ScratchElement, SectionElement } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { isSupabaseConfigured } from "../../lib/supabase";
import { uploadProjectAsset } from "../../services/assetRepository";
import { FontPicker } from "../fonts/FontPicker";
import { getScratchTextStyle } from "./scratchDefaults";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { getElementLayout } from "../../utils/responsiveLayout";

type RichElement = ScratchElement | CarouselElement | LocationElement | ScheduleElement | ButtonElement | SectionElement;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;
const asDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });

export function RichElementProperties({ element }: { element: RichElement }) {
  const project = useEditorStore((state) => state.project);
  const currentPageId = useEditorStore((state) => state.currentPageId);
  const previewDevice = useEditorStore((state) => state.previewDevice);
  const reorderSection = useEditorStore((state) => state.reorderSection);
  const updateElement = useEditorStore((state) => state.updateElement);
  const update = (changes: object) => updateElement(element.id, changes as Partial<EditorElement>);

  if (element.type === "scratch") {
    const text = getScratchTextStyle(element);
    return <div className="rich-properties"><h3>Zone à gratter</h3>
      <Field label="Contenu révélé"><textarea rows={2} value={element.content} onChange={(e) => update({ content: e.target.value })} /></Field>
      <Field label="Police"><FontPicker value={text.fontFamily} onChange={(fontFamily) => update({ fontFamily })} /></Field>
      <div className="field-row"><Field label="Taille"><input type="number" min="8" max="180" value={text.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} /></Field><Field label="Graisse"><select value={text.fontWeight} onChange={(e) => update({ fontWeight: Number(e.target.value) })}><option value="300">Fine</option><option value="400">Normale</option><option value="500">Moyenne</option><option value="600">Demi-gras</option><option value="700">Gras</option></select></Field></div>
      <div className="field-row"><Field label="Couleur du texte"><ColorAlphaInput value={text.textColor} onChange={(value) => update({ textColor: value, contentColor: value })} /></Field><Field label="Alignement"><select value={text.textAlign} onChange={(e) => update({ textAlign: e.target.value })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></Field></div>
      <div className="field-row"><Field label="Position X locale"><input type="number" min="-500" max="500" value={text.textOffsetX} onChange={(e) => update({ textOffsetX: Number(e.target.value) })} /></Field><Field label="Position Y locale"><input type="number" min="-500" max="500" value={text.textOffsetY} onChange={(e) => update({ textOffsetY: Number(e.target.value) })} /></Field></div>
      <div className="field-row"><Field label="Forme"><select value={element.shape} onChange={(e) => update({ shape: e.target.value })}><option value="circle">Cercle</option><option value="rectangle">Rectangle</option><option value="rounded-rectangle">Arrondi</option></select></Field><Field label="Matière"><select value={element.surfaceStyle} onChange={(e) => update({ surfaceStyle: e.target.value })}><option value="gold">Or</option><option value="silver">Argent</option><option value="champagne">Champagne</option><option value="beige">Beige</option><option value="rose">Rose</option><option value="custom">Personnalisée</option></select></Field></div>
      <div className="field-row"><Field label="Couleur de surface"><ColorAlphaInput value={element.surfaceColor} onChange={(value) => update({ surfaceColor: value, surfaceStyle: "custom" })} /></Field><Field label="Fond révélé"><ColorAlphaInput value={element.revealedBackgroundColor ?? "#fffaf5"} onChange={(value) => update({ revealedBackgroundColor: value })} /></Field></div>
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
    return <div className="rich-properties"><h3>Carrousel photos</h3>
      <label className="carousel-upload"><ImagePlus size={16} /> Ajouter des photos<input hidden multiple type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void upload(e.target.files); e.currentTarget.value = ""; }} /></label>
      <div className="carousel-photo-list">{element.images.map((image, index) => <div key={image.id}><img src={image.url} alt="" /><span>{image.alt}</span><button onClick={() => move(index, -1)} disabled={!index}><ArrowUp size={12} /></button><button onClick={() => move(index, 1)} disabled={index === element.images.length - 1}><ArrowDown size={12} /></button><button onClick={() => update({ images: element.images.filter((item) => item.id !== image.id) })}><Trash2 size={12} /></button></div>)}</div>
      <div className="field-row"><Field label="Transition"><select value={element.transition} onChange={(e) => update({ transition: e.target.value })}><option value="slide">Glissement</option><option value="fade">Fondu</option></select></Field><Field label="Ajustement"><select value={element.imageFit} onChange={(e) => update({ imageFit: e.target.value })}><option value="cover">Couvrir</option><option value="contain">Contenir</option></select></Field></div>
      <label className="compact-check"><input type="checkbox" checked={element.showArrows} onChange={(e) => update({ showArrows: e.target.checked })} /> Flèches</label><label className="compact-check"><input type="checkbox" checked={element.showDots} onChange={(e) => update({ showDots: e.target.checked })} /> Indicateurs</label><label className="compact-check"><input type="checkbox" checked={element.autoplay} onChange={(e) => update({ autoplay: e.target.checked })} /> Lecture automatique</label>
      {element.autoplay && <Field label="Durée entre les photos (s)"><input type="number" min="1" max="20" value={element.interval} onChange={(e) => update({ interval: Number(e.target.value) })} /></Field>}
      <Field label={`Coins · ${element.cornerRadius}px`}><input type="range" min="0" max="80" value={element.cornerRadius} onChange={(e) => update({ cornerRadius: Number(e.target.value) })} /></Field>
    </div>;
  }

  if (element.type === "location") return <div className="rich-properties"><h3>Lieu / Carte</h3>
    <Field label="Nom du lieu"><input value={element.venueName} onChange={(e) => update({ venueName: e.target.value })} /></Field><Field label="Adresse"><textarea rows={2} value={element.address} onChange={(e) => update({ address: e.target.value })} /></Field><Field label="Texte complémentaire"><textarea rows={2} value={element.details} onChange={(e) => update({ details: e.target.value })} /></Field><Field label="Bouton"><input value={element.buttonLabel} onChange={(e) => update({ buttonLabel: e.target.value })} /></Field>
    <div className="field-row"><Field label="Latitude"><input type="number" step="0.000001" value={element.latitude ?? ""} onChange={(e) => update({ latitude: e.target.value ? Number(e.target.value) : undefined })} /></Field><Field label="Longitude"><input type="number" step="0.000001" value={element.longitude ?? ""} onChange={(e) => update({ longitude: e.target.value ? Number(e.target.value) : undefined })} /></Field></div>
    <div className="field-row"><Field label="Fond"><ColorAlphaInput value={element.backgroundColor} onChange={(value) => update({ backgroundColor: value })} /></Field><Field label="Accent"><ColorAlphaInput value={element.accentColor} onChange={(value) => update({ accentColor: value })} /></Field></div>
  </div>;

  if (element.type === "schedule") {
    const changeItem = (id: string, changes: object) => update({ items: element.items.map((item) => item.id === id ? { ...item, ...changes } : item) });
    const move = (index: number, direction: -1 | 1) => { const next = [...element.items]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; update({ items: next }); };
    return <div className="rich-properties"><h3>Programme</h3><Field label="Style"><select value={element.displayStyle} onChange={(e) => update({ displayStyle: e.target.value })}><option value="list">Liste</option><option value="timeline">Timeline</option><option value="elegant">Timeline élégante</option></select></Field>
      <div className="schedule-editor-list">{element.items.map((item, index) => <article key={item.id}><div><input value={item.time} aria-label="Heure" onChange={(e) => changeItem(item.id, { time: e.target.value })} /><input value={item.title} aria-label="Titre" onChange={(e) => changeItem(item.id, { title: e.target.value })} /></div><textarea rows={2} value={item.description ?? ""} placeholder="Description" onChange={(e) => changeItem(item.id, { description: e.target.value })} /><div className="mini-actions"><button onClick={() => move(index, -1)} disabled={!index}><ArrowUp size={12} /></button><button onClick={() => move(index, 1)} disabled={index === element.items.length - 1}><ArrowDown size={12} /></button><button onClick={() => update({ items: element.items.filter((value) => value.id !== item.id) })}><Trash2 size={12} /></button></div></article>)}</div>
      <button className="secondary-action" onClick={() => update({ items: [...element.items, { id: crypto.randomUUID(), time: "18:00", title: "Nouvelle étape" }] })}><Plus size={13} /> Ajouter une étape</button>
      <div className="field-row"><Field label="Fond"><ColorAlphaInput value={element.backgroundColor} onChange={(value) => update({ backgroundColor: value })} /></Field><Field label="Texte"><ColorAlphaInput value={element.textColor} onChange={(value) => update({ textColor: value })} /></Field></div><div className="field-row"><Field label="Heure"><ColorAlphaInput value={element.timeColor} onChange={(value) => update({ timeColor: value })} /></Field><Field label="Trait"><ColorAlphaInput value={element.lineColor} onChange={(value) => update({ lineColor: value })} /></Field></div><Field label="Marqueurs"><ColorAlphaInput value={element.accentColor} onChange={(value) => update({ accentColor: value })} /></Field>
    </div>;
  }

  if (element.type === "button") return <div className="rich-properties"><h3>{element.welcomeAction ? "Bouton d’entrée" : "Bouton / Lien"}</h3><Field label="Texte"><input value={element.label} onChange={(e) => update({ label: e.target.value })} /></Field>{!element.welcomeAction && <><Field label="URL sécurisée"><input type="url" value={element.url} onChange={(e) => update({ url: e.target.value })} /></Field><Field label="Ouverture"><select value={element.target} onChange={(e) => update({ target: e.target.value })}><option value="new">Nouvel onglet</option><option value="same">Même onglet</option></select></Field></>}<Field label="Police"><FontPicker value={element.fontFamily ?? "Montserrat"} onChange={(fontFamily) => update({ fontFamily })} /></Field><div className="field-row"><Field label="Taille"><input type="number" min="8" max="80" value={element.fontSize ?? 13} onChange={(e) => update({ fontSize: Number(e.target.value) })} /></Field><Field label="Graisse"><select value={element.fontWeight ?? 700} onChange={(e) => update({ fontWeight: Number(e.target.value) })}><option value="400">Normale</option><option value="500">Moyenne</option><option value="600">Demi-gras</option><option value="700">Gras</option></select></Field></div><Field label="Alignement"><select value={element.textAlign} onChange={(e) => update({ textAlign: e.target.value })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></Field><div className="field-row"><Field label="Fond"><ColorAlphaInput value={element.backgroundColor} onChange={(value) => update({ backgroundColor: value })} /></Field><Field label="Texte"><ColorAlphaInput value={element.textColor} onChange={(value) => update({ textColor: value })} /></Field></div><div className="field-row"><Field label="Bordure"><ColorAlphaInput value={element.borderColor} onChange={(value) => update({ borderColor: value })} /></Field><Field label="Épaisseur"><input type="number" min="0" max="12" value={element.borderWidth} onChange={(e) => update({ borderWidth: Number(e.target.value) })} /></Field></div><Field label="Rayon"><input type="number" min="0" max="100" value={element.borderRadius} onChange={(e) => update({ borderRadius: Number(e.target.value) })} /></Field></div>;

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
  return <div className="rich-properties"><h3>Section</h3><div className="section-order-actions"><button disabled={sectionIndex <= 0} onClick={() => reorderSection(element.id, -1)}><ArrowUp size={13} /> Monter la section</button><button disabled={sectionIndex < 0 || sectionIndex === sections.length - 1} onClick={() => reorderSection(element.id, 1)}><ArrowDown size={13} /> Descendre la section</button></div><Field label="Type de fond"><select value={element.background.type} onChange={(e) => update({ background: { ...element.background, type: e.target.value } })}><option value="color">Couleur</option><option value="gradient">Dégradé</option><option value="image">Image</option></select></Field>{element.background.type === "color" ? <Field label="Couleur"><ColorAlphaInput value={element.background.color ?? "#f7f1eb"} onChange={(value) => update({ background: { ...element.background, color: value } })} /></Field> : element.background.type === "gradient" ? <div className="field-row"><Field label="Début"><ColorAlphaInput value={element.background.gradient?.color1 ?? "#f7f1eb"} onChange={(value) => update({ background: { type: "gradient", gradient: { type: "linear", color1: value, color2: element.background.gradient?.color2 ?? "#ded0c3", angle: 135 } } })} /></Field><Field label="Fin"><ColorAlphaInput value={element.background.gradient?.color2 ?? "#ded0c3"} onChange={(value) => update({ background: { type: "gradient", gradient: { type: "linear", color1: element.background.gradient?.color1 ?? "#f7f1eb", color2: value, angle: 135 } } })} /></Field></div> : <label className="carousel-upload"><ImagePlus size={16} /> Choisir une image<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { void uploadSectionBackground(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>}<Field label="Padding"><input type="number" min="0" max="160" value={element.padding} onChange={(e) => update({ padding: Number(e.target.value) })} /></Field><Field label="Coins arrondis"><input type="number" min="0" max="120" value={element.cornerRadius} onChange={(e) => update({ cornerRadius: Number(e.target.value) })} /></Field></div>;
}
