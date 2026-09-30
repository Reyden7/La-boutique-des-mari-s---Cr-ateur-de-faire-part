import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ClipboardCheck,
  CalendarClock,
  CircleDashed,
  Heart,
  GalleryHorizontal,
  ImagePlus,
  Layers3,
  Link,
  MapPin,
  Music2,
  Palette,
  Plus,
  PanelsTopLeft,
  Shapes,
  Sparkles,
  Type,
  WandSparkles,
  Upload,
} from "lucide-react";
import { makeShapeElement, makeTextElement, useEditorStore, type SidebarView } from "../../stores/editorStore";
import type { EditorElement, OpeningAnimationType } from "../../types/editor";
import { MusicPanel } from "../../features/music/MusicPanel";
import { ParticlePanel } from "../../features/particles/ParticlePanel";
import { isSupabaseConfigured } from "../../lib/supabase";
import { uploadProjectAsset } from "../../services/assetRepository";
import { DecorativeHeartSvg } from "../../features/hearts/DecorativeHeartSvg";
import { DECORATIVE_HEARTS, makeDecorativeHeartElement } from "../../features/hearts/heartRegistry";
import { makeButtonElement, makeCarouselElement, makeLocationElement, makeScheduleElement, makeScratchElement, makeSectionElement } from "../../features/elements/elementFactories";
import { IntroductionPanel } from "../../features/introduction/IntroductionPanel";
import { RSVP_EDITOR_ELEMENT_ID } from "../../features/rsvp/rsvpEditorElement";
import { getElementLayout } from "../../utils/responsiveLayout";
import { getSelectedTargetSection } from "../../utils/sectionLayout";
import { getRsvpBlockHeight, setRsvpLayoutForDevice } from "../../utils/documentLayout";
import { useGlobalAssets } from "../../hooks/useGlobalAssets";
import { PublishGlobalAssetButton } from "../admin/PublishGlobalAssetButton";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { getImageInitialSize, loadImageDimensions, readImageFileDimensions, type ImageDimensions } from "../../utils/imageLayout";
import { HierarchyList } from "./HierarchyList";

const uid = () => crypto.randomUUID();
const navItems: { id: SidebarView; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: "design", label: "Arrière-plan", icon: Palette },
  { id: "introduction", label: "Introduction", icon: Sparkles },
  { id: "elements", label: "Contenu", icon: Shapes },
  { id: "music", label: "Musique", icon: Music2 },
  { id: "effects", label: "Effets", icon: WandSparkles,},
];

export function LeftSidebar({ onPreviewOpening }: { onPreviewOpening: (type: OpeningAnimationType) => void }) {
  const [shapeMenu, setShapeMenu] = useState(false);
  const [heartMenu, setHeartMenu] = useState(false);
  const [decorationMenu, setDecorationMenu] = useState(false);
  const [lastDecoration, setLastDecoration] = useState<{ assetId: string; name: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const decorationFileRef = useRef<HTMLInputElement>(null);
  const heartMenuRef = useRef<HTMLDivElement>(null);
  const { project, currentPageId, selectedElementIds, previewDevice, sidebarView, setSidebarView, addElement, selectElement, updateElementLayout, updateRsvp } = useEditorStore();
  const globalDecorations = useGlobalAssets("decoration");
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
    let dimensions: ImageDimensions;
    try { dimensions = await readImageFileDimensions(file); }
    catch { window.alert("Les dimensions de cette image n’ont pas pu être lues."); return; }
    const size = getImageInitialSize(dimensions.width, dimensions.height, Math.min(250, PREVIEW_DEVICES.mobile.width * .65), PREVIEW_DEVICES.mobile.height * .45);
    const makeElement = (src: string, assetId?: string): EditorElement => ({
      id: uid(), type: "image", name: file.name,
      x: Math.max(20, (PREVIEW_DEVICES.mobile.width - size.width) / 2), y: 250,
      width: size.width, height: size.height, rotation: 0, opacity: 1, zIndex: Date.now(), visible: true,
      locked: false, src, alt: file.name, assetId, fit: "contain",
      animation: { type: "fade", duration: .8, delay: 0 },
    });
    if (isSupabaseConfigured && project) {
      try {
        const asset = await uploadProjectAsset(project, file, "image");
        addElement(makeElement(asset.url, asset.id));
      } catch { window.alert("L’image n’a pas pu être envoyée. Vérifiez votre connexion puis réessayez."); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => addElement(makeElement(String(reader.result)));
    reader.readAsDataURL(file);
  };

  const addDecorationImage = async (name: string, src: string, assetId?: string, globalAssetId?: string, knownDimensions?: ImageDimensions) => {
    const dimensions = knownDimensions ?? await loadImageDimensions(src).catch(() => ({ width: 1, height: 1 }));
    const size = getImageInitialSize(dimensions.width, dimensions.height, 150, 220);
    addElement({
      id: uid(), type: "image", name, x: Math.max(20, (PREVIEW_DEVICES.mobile.width - size.width) / 2), y: 250,
      width: size.width, height: size.height, rotation: 0, opacity: 1,
      zIndex: Date.now(), visible: true, locked: false, src, alt: name, assetId, globalAssetId, fit: "contain",
      animation: { type: "fade", duration: .8, delay: 0 },
    });
  };
  const importDecoration = async (file?: File) => {
    if (!file || !project) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      window.alert("Choisissez une décoration PNG, JPG ou WebP de moins de 10 Mo."); return;
    }
    try {
      const dimensions = await readImageFileDimensions(file);
      const asset = await uploadProjectAsset(project, file, "image");
      const imported = { assetId: asset.id, name: file.name.replace(/\.[^.]+$/, ""), url: asset.url };
      setLastDecoration(imported);
      await addDecorationImage(imported.name, imported.url, imported.assetId, undefined, dimensions);
    } catch { window.alert("La décoration n’a pas pu être envoyée."); }
  };

  const documentSummary = <section className="scrollable-document-summary"><div className="panel-title">Document</div><strong>Page verticale scrollable</strong><small>{page?.elements.length ?? 0} élément{(page?.elements.length ?? 0) > 1 ? "s" : ""} · hauteur adaptée au contenu</small></section>;

  const addOrSelectRsvp = () => {
    if (!project?.rsvp || !page) return;
    if (project.rsvp.enabled) {
      selectElement(RSVP_EDITOR_ELEMENT_ID);
      return;
    }
    let next = { ...project.rsvp, enabled: true };
    const targetSection = getSelectedTargetSection(page.elements, selectedElementIds);
    if (targetSection) {
      const sectionLayout = getElementLayout(targetSection, previewDevice);
      const childrenBottom = page.elements.reduce((bottom, element) => {
        if (element.sectionId !== targetSection.id || !element.visible) return bottom;
        const layout = getElementLayout(element, previewDevice);
        return Math.max(bottom, layout.y + layout.height);
      }, sectionLayout.y + targetSection.padding);
      const positionY = Math.max(sectionLayout.y + targetSection.padding, childrenBottom + 24);
      next = setRsvpLayoutForDevice({ ...next, sectionId: targetSection.id }, previewDevice, {
        x: sectionLayout.x + targetSection.padding,
        y: positionY,
        width: Math.max(120, sectionLayout.width - targetSection.padding * 2),
      });
      const requiredHeight = positionY + getRsvpBlockHeight(next, previewDevice) + targetSection.padding - sectionLayout.y;
      if (requiredHeight > sectionLayout.height) updateElementLayout(targetSection.id, { height: requiredHeight });
    }
    updateRsvp(next);
    selectElement(RSVP_EDITOR_ELEMENT_ID);
  };

  return <aside className="left-sidebar"><nav className="studio-sections" aria-label="Sections de création">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={sidebarView === id ? "active" : ""} onClick={() => setSidebarView(id)}><Icon size={16} /><span>{label}</span></button>)}</nav>
    {sidebarView === "design" && <div className="sidebar-view"><div className="view-intro"><span>Arrière-plan</span><h2>Fond du document</h2><p>Personnalisez uniquement la couleur, le dégradé ou l’image de fond du faire-part.</p></div>{documentSummary}</div>}
    {sidebarView === "introduction" && <IntroductionPanel onPreview={onPreviewOpening} />}
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
            <button onClick={() => addElement(makeCarouselElement())}><GalleryHorizontal size={20} /><span>Carrousel</span></button>
            <button onClick={() => addElement(makeLocationElement())}><MapPin size={20} /><span>Lieu / Carte</span></button>
            <button onClick={() => addElement(makeScheduleElement())}><CalendarClock size={20} /><span>Programme</span></button>
            <button onClick={() => addElement(makeScratchElement())}><CircleDashed size={20} /><span>À gratter</span></button>
            <button onClick={() => addElement(makeButtonElement())}><Link size={20} /><span>Bouton</span></button>
            <button onClick={() => { setDecorationMenu((value) => !value); setHeartMenu(false); setShapeMenu(false); }}><Sparkles size={20} /><span>Décorations</span></button>
            <button onClick={() => page && addElement(makeSectionElement(page))}><PanelsTopLeft size={20} /><span>Section</span></button>
            <button onClick={addOrSelectRsvp}><ClipboardCheck size={20} /><span>Formulaire</span></button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { void addImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={decorationFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void importDecoration(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {shapeMenu && <div className="shape-picker">{(["rectangle", "rounded-rectangle", "circle", "line"] as const).map((shape) => <button key={shape} onClick={() => { addElement(makeShapeElement(shape)); setShapeMenu(false); }}>{shape === "rounded-rectangle" ? "Arrondi" : shape === "circle" ? "Cercle" : shape === "line" ? "Ligne" : "Rectangle"}</button>)}</div>}
          {decorationMenu && <div className="global-decoration-picker"><strong>Bibliothèque de décorations</strong><div>{globalDecorations.map((asset) => <button key={asset.id} title={asset.name} onClick={() => { void addDecorationImage(asset.name, asset.url, undefined, asset.id); setDecorationMenu(false); }}><img loading="lazy" src={asset.thumbnailUrl ?? asset.url} alt="" /><span>{asset.name}</span></button>)}</div><button className="decoration-upload-button" onClick={() => decorationFileRef.current?.click()}><Upload size={14} /> Importer une décoration</button>{lastDecoration && <PublishGlobalAssetButton input={{ sourceAssetId: lastDecoration.assetId, type: "decoration", name: lastDecoration.name }} />}</div>}
        </section>
        {documentSummary}
        <section className="layers-section">
          <div className="panel-title"><Layers3 size={15} /> Calques</div>
          <HierarchyList elements={page?.elements ?? []} />
        </section>
      </div>
    )}
    {sidebarView === "music" && <MusicPanel />}
    {sidebarView === "effects" && (<ParticlePanel />)}
  </aside>;
}
