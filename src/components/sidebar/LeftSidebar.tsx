import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  Layers3,
  Lock,
  LockOpen,
  Music2,
  Palette,
  Plus,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  WandSparkles,
} from "lucide-react";
import { makeShapeElement, makeTextElement, useEditorStore, type SidebarView } from "../../stores/editorStore";
import type { EditorElement, OpeningAnimationType } from "../../types/editor";
import { OpeningSelector } from "../../features/openings/OpeningSelector";
import { MusicPanel } from "../../features/music/MusicPanel";
import { ParticlePanel } from "../../features/particles/ParticlePanel";
import { isSupabaseConfigured } from "../../lib/supabase";
import { uploadProjectAsset } from "../../services/assetRepository";
import { RsvpFormEditor } from "../../features/rsvp/RsvpFormEditor";
import { DecorativeHeartSvg } from "../../features/hearts/DecorativeHeartSvg";
import { DECORATIVE_HEARTS, makeDecorativeHeartElement } from "../../features/hearts/heartRegistry";

const uid = () => crypto.randomUUID();
const navItems: { id: SidebarView; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: "design", label: "Design", icon: Palette },
  { id: "elements", label: "Éléments", icon: Shapes },
  { id: "opening", label: "Ouverture", icon: Sparkles },
  { id: "music", label: "Musique", icon: Music2 },
  { id: "effects", label: "Effets", icon: WandSparkles,},
  { id: "rsvp", label: "Formulaire", icon: ClipboardCheck },
];

export function LeftSidebar({ onPreviewOpening }: { onPreviewOpening: (type: OpeningAnimationType) => void }) {
  const [shapeMenu, setShapeMenu] = useState(false);
  const [heartMenu, setHeartMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const heartMenuRef = useRef<HTMLDivElement>(null);
  const { project, currentPageId, selectedElementId, sidebarView, setSidebarView, addElement, selectElement, updateElement, removeElement, moveLayer } = useEditorStore();
  const page = project?.pages.find((item) => item.id === currentPageId);

  useEffect(() => {
    if (!heartMenu) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!heartMenuRef.current?.contains(event.target as Node)) setHeartMenu(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [heartMenu]);

  const addImage = async (file?: File) => {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) { window.alert("Choisissez une image PNG, JPG, WebP ou GIF de moins de 10 Mo."); return; }
    if (isSupabaseConfigured && project) {
      try {
        const asset = await uploadProjectAsset(project, file, "image");
        const element: EditorElement = { id: uid(), type: "image", name: file.name, x: 70, y: 250, width: 250, height: 250, rotation: 0, opacity: 1, zIndex: Date.now(), visible: true, locked: false, src: asset.url, alt: file.name, animation: { type: "fade", duration: .8, delay: 0 } };
        addElement(element);
      } catch { window.alert("L’image n’a pas pu être envoyée. Vérifiez votre connexion puis réessayez."); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const element: EditorElement = { id: uid(), type: "image", name: file.name, x: 70, y: 250, width: 250, height: 250, rotation: 0, opacity: 1, zIndex: Date.now(), visible: true, locked: false, src: String(reader.result), alt: file.name, animation: { type: "fade", duration: .8, delay: 0 } };
      addElement(element);
    };
    reader.readAsDataURL(file);
  };

  const documentSummary = <section className="scrollable-document-summary"><div className="panel-title">Document</div><strong>Page verticale scrollable</strong><small>{page?.elements.length ?? 0} élément{(page?.elements.length ?? 0) > 1 ? "s" : ""} · hauteur adaptée au contenu</small></section>;

  return <aside className="left-sidebar"><nav className="studio-sections" aria-label="Sections de création">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={sidebarView === id ? "active" : ""} onClick={() => setSidebarView(id)}><Icon size={16} /><span>{label}</span></button>)}</nav>
    {sidebarView === "design" && <div className="sidebar-view"><div className="view-intro"><span>Design</span><h2>Votre faire-part</h2><p>Le document forme maintenant une seule page verticale qui s’allonge avec son contenu.</p></div>{documentSummary}<div className="separation-note"><Sparkles size={16} /><p>Le design, l’ouverture et la musique sont enregistrés séparément.</p></div></div>}
    {sidebarView === "elements" && (
      <div className="sidebar-view">
        <section className="add-elements-section">
          <div className="panel-title"><Plus size={15} /> Ajouter</div>
          <div className="add-grid">
            <button onClick={() => addElement(makeTextElement())}><Type size={20} /><span>Texte</span></button>
            <button onClick={() => fileRef.current?.click()}><ImagePlus size={20} /><span>Image</span></button>
            <button onClick={() => { setShapeMenu((value) => !value); setHeartMenu(false); }}><Shapes size={20} /><span>Forme</span></button>
            <div className="heart-picker-anchor" ref={heartMenuRef}>
              <button className={heartMenu ? "active" : ""} onClick={() => { setHeartMenu((value) => !value); setShapeMenu(false); }}><Heart size={21} /><span>Cœurs</span></button>
              {heartMenu && (
                <div className="heart-picker-popover" role="dialog" aria-label="Choisir un cœur">
                  <strong>Choisir un cœur</strong>
                  <div className="heart-picker-grid">
                    {DECORATIVE_HEARTS.map((heart) => (
                      <button key={heart.id} title={heart.label} aria-label={`Ajouter le cœur ${heart.label}`} onClick={() => { addElement(makeDecorativeHeartElement(heart.id)); setHeartMenu(false); }}>
                        <DecorativeHeartSvg variant={heart.id} />
                        <span>{heart.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { void addImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {shapeMenu && <div className="shape-picker">{(["rectangle", "rounded-rectangle", "circle", "line"] as const).map((shape) => <button key={shape} onClick={() => { addElement(makeShapeElement(shape)); setShapeMenu(false); }}>{shape === "rounded-rectangle" ? "Arrondi" : shape === "circle" ? "Cercle" : shape === "line" ? "Ligne" : "Rectangle"}</button>)}</div>}
        </section>
        {documentSummary}
        <section className="layers-section">
          <div className="panel-title"><Layers3 size={15} /> Calques</div>
          <div className="layers-list">
            {[...(page?.elements ?? [])].sort((a, b) => b.zIndex - a.zIndex).map((element) => (
              <div className={`layer-row ${element.id === selectedElementId ? "active" : ""}`} key={element.id} onClick={() => selectElement(element.id)}>
                <span className="layer-kind">{element.type === "text" ? "T" : element.type === "image" ? "▧" : element.type === "icon" && element.heartStyle ? <Heart size={12} /> : element.type === "icon" ? "❦" : "▱"}</span>
                <span className="layer-name">{element.name}</span>
                <button title={element.visible ? "Masquer" : "Afficher"} onClick={(event) => { event.stopPropagation(); updateElement(element.id, { visible: !element.visible }); }}>{element.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button title={element.locked ? "Déverrouiller" : "Verrouiller"} onClick={(event) => { event.stopPropagation(); updateElement(element.id, { locked: !element.locked }); }}>{element.locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
                <button title="Avancer" onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "forward"); }}><ChevronUp size={14} /></button>
                <button title="Reculer" onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "backward"); }}><ChevronDown size={14} /></button>
                <button title="Supprimer" onClick={(event) => { event.stopPropagation(); removeElement(element.id); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    )}
    {sidebarView === "opening" && <OpeningSelector onPreview={onPreviewOpening} />}
    {sidebarView === "music" && <MusicPanel />}
    {sidebarView === "effects" && (<ParticlePanel />)}
    {sidebarView === "rsvp" && <RsvpFormEditor />}
  </aside>;
}
