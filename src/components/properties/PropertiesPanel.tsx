import { AlignCenter, AlignLeft, AlignRight, Bold, Copy, Eye, EyeOff, Italic, Monitor, RotateCcw, Smartphone, Tablet, Trash2, Underline } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { resolveElementVisualStyle } from "../../utils/responsiveVisualStyle";
import { type DecorativeHeartStyle, type EditorElement } from "../../types/editor";
import type { OpeningAnimationType } from "../../types/editor";
import { OpeningProperties } from "../../features/openings/OpeningProperties";
import { AudioProperties } from "../../features/music/AudioProperties";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { getElementLayout, hasElementLayoutOverride } from "../../utils/responsiveLayout";
import { BackgroundPanel } from "../../features/backgrounds/BackgroundPanel";
import { FontPicker } from "../../features/fonts/FontPicker";
import { DECORATIVE_HEARTS, getDecorativeHeart } from "../../features/hearts/heartRegistry";
import { RichElementProperties } from "../../features/elements/RichElementProperties";
import { CalendarProperties } from "../../features/elements/CalendarProperties";
import { resolveWelcomePage } from "../../features/welcome/welcomeDefaults";
import { ColorAlphaInput } from "../ui/ColorAlphaInput";
import { ImageFrameProperties } from "../../features/images/ImageFrameProperties";
import { ImageTransformProperties } from "../../features/images/ImageTransformProperties";
import { ImageAppearanceProperties } from "../../features/images/ImageAppearanceProperties";
import { resolveImageFit } from "../../utils/imageLayout";
import { RsvpFormEditor } from "../../features/rsvp/RsvpFormEditor";
import { RSVP_EDITOR_ELEMENT_ID } from "../../features/rsvp/rsvpEditorElement";
import { AnimationProperties } from "./AnimationProperties";
import { PropertySection } from "./PropertySection";
import { DimensionInput } from "../ui/DimensionInput";
import { EditableElementName } from "../ui/EditableElementName";
import { getEditorElementLabel, getRsvpEditorLabel } from "../../utils/editorNames";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function PropertiesPanel({ onPreviewOpening }: { onPreviewOpening: (type: OpeningAnimationType) => void }) {
  const { project, currentPageId, selectedElementId, sidebarView, previewDevice, updateElement, updateElementLayout, resetElementLayout, setElementVisibility, duplicateElement, removeElement } = useEditorStore();
  const page = project?.pages.find((item) => item.id === currentPageId);
  const editableElements = sidebarView === "introduction" && project?.introductionMode === "welcome" ? resolveWelcomePage(project.welcomePage).elements : page?.elements;
  const rawElement = editableElements?.find((item) => item.id === selectedElementId);
  const element = rawElement && resolveElementVisualStyle(rawElement, previewDevice);

  if (sidebarView === "introduction" && project?.introductionMode === "classic") return <OpeningProperties onPreview={onPreviewOpening} />;
  if (sidebarView === "music") return <AudioProperties />;
  if (selectedElementId === RSVP_EDITOR_ELEMENT_ID && project?.rsvp) return <aside className="properties-panel rsvp-properties-panel"><div className="properties-heading"><div><small>Élément sélectionné</small><h2><EditableElementName key={RSVP_EDITOR_ELEMENT_ID} elementId={RSVP_EDITOR_ELEMENT_ID} label={getRsvpEditorLabel(project.rsvp)} variant="heading" /></h2></div><span className="type-pill">formulaire</span></div><RsvpFormEditor embedded /></aside>;
  if (sidebarView === "introduction" && !element) return <aside className="properties-panel"><div className="properties-heading"><div><small>Expérience invité</small><h2>{project?.introductionMode === "welcome" ? "Page d’accueil" : "Aucune introduction"}</h2></div><span className="type-pill">intro</span></div><div className="background-tip"><span>{project?.introductionMode === "welcome" ? "Canvas libre" : "Accès direct"}</span><p>{project?.introductionMode === "welcome" ? "Ajoutez puis sélectionnez un élément dans la Page d’accueil pour modifier ses propriétés." : "Les invités arrivent directement sur le document principal."}</p></div></aside>;
  if (!element) return <BackgroundPanel background={page?.background} />;
  const update = (values: Partial<EditorElement>) => updateElement(element.id, values);
  const updateLayout = (values: Parameters<typeof updateElementLayout>[1]) => updateElementLayout(element.id, values);
  const layout = getElementLayout(element, previewDevice);
  const geometryLocked = element.locked ?? false;
  const hasOverride = hasElementLayoutOverride(element, previewDevice);
  const DeviceIcon = previewDevice === "mobile" ? Smartphone : previewDevice === "tablet" ? Tablet : Monitor;
  const deviceLabel = PREVIEW_DEVICES[previewDevice].label;
  const updateWidth = (width: number) => {
    const nextWidth = Math.max(12, width);
    if (element.type === "image") {
      updateLayout({ width: nextWidth, height: Math.max(12, nextWidth * layout.height / Math.max(1, layout.width)) });
      return;
    }
    updateLayout({ width: nextWidth });
  };
  const updateHeight = (height: number) => {
    const nextHeight = Math.max(12, height);
    if (element.type === "image") {
      updateLayout({ width: Math.max(12, nextHeight * layout.width / Math.max(1, layout.height)), height: nextHeight });
      return;
    }
    updateLayout({ height: nextHeight });
  };
  const appearance = <>
    <Field label={`Opacité · ${Math.round(element.opacity * 100)} %`}><input type="range" min="0.05" max="1" step="0.05" value={element.opacity} onChange={(event) => update({ opacity: Number(event.target.value) })} /></Field>
    <Field label="Rotation"><div className="input-suffix"><input type="number" disabled={geometryLocked} min="-360" max="360" value={Math.round(layout.rotation)} onChange={(event) => updateLayout({ rotation: Number(event.target.value) })} /><span>°</span></div></Field>
  </>;

  return (
    <aside className="properties-panel">
      <div className="properties-heading"><div><small>Élément sélectionné</small><h2><EditableElementName key={element.id} elementId={element.id} label={getEditorElementLabel(element)} variant="heading" /></h2></div><span className="type-pill">{element.type}</span></div>
      <PropertySection sectionKey="disposition" key={`${element.id}-disposition`} title="Disposition" defaultOpen><div className="responsive-layout-panel">
        <div className="responsive-layout-heading">
          <div><small>Support actif</small><strong><DeviceIcon size={14} /> {deviceLabel}</strong></div>
          {previewDevice !== "mobile" && <span className={hasOverride ? "active" : "inherited"}>{hasOverride ? "Personnalisation active" : "Disposition smartphone"}</span>}
        </div>
        <div className="field-row"><Field label="Position X"><input type="number" disabled={geometryLocked} value={Math.round(layout.x)} onChange={(event) => updateLayout({ x: Number(event.target.value) })} /></Field><Field label="Position Y"><input type="number" disabled={geometryLocked} value={Math.round(layout.y)} onChange={(event) => updateLayout({ y: Number(event.target.value) })} /></Field></div>
        <div className="field-row"><Field label="Largeur"><DimensionInput key={`${element.id}-${previewDevice}-width`} disabled={geometryLocked} min={12} value={layout.width} onCommit={updateWidth} /></Field><Field label="Hauteur"><DimensionInput key={`${element.id}-${previewDevice}-height`} disabled={geometryLocked} min={12} value={layout.height} onCommit={updateHeight} /></Field></div>
        {previewDevice !== "mobile" && <button className="reset-responsive-layout" disabled={geometryLocked || !hasOverride} onClick={() => resetElementLayout(element.id)}><RotateCcw size={13} /> Réinitialiser pour ce support</button>}
      </div></PropertySection>
      {element.type === "text" && <PropertySection sectionKey="police" key={`${element.id}-police`} title="Police">
        <Field label="Contenu"><textarea rows={3} value={element.text} onChange={(event) => update({ text: event.target.value, name: event.target.value.slice(0, 28) || "Texte" })} /></Field>
        <Field label="Police"><FontPicker value={element.fontFamily} onChange={(fontFamily) => update({ fontFamily })} /></Field>
        <div className="field-row"><Field label="Taille"><input type="number" min="8" max="240" value={layout.fontSize ?? element.fontSize} onChange={(event) => updateLayout({ fontSize: Number(event.target.value) })} /></Field><Field label="Couleur"><ColorAlphaInput value={element.color} onChange={(color) => update({ color })} /></Field></div>
        <div className="format-row">
          <button aria-label="Gras" className={element.fontWeight >= 600 ? "active" : ""} onClick={() => update({ fontWeight: element.fontWeight >= 600 ? 400 : 700 })}><Bold size={16} /></button>
          <button aria-label="Italique" className={element.italic ? "active" : ""} onClick={() => update({ italic: !element.italic })}><Italic size={16} /></button>
          <button aria-label="Souligné" className={element.underline ? "active" : ""} onClick={() => update({ underline: !element.underline })}><Underline size={16} /></button>
          <button aria-label="Aligner à gauche" className={element.textAlign === "left" ? "active" : ""} onClick={() => update({ textAlign: "left" })}><AlignLeft size={16} /></button>
          <button aria-label="Centrer" className={element.textAlign === "center" ? "active" : ""} onClick={() => update({ textAlign: "center" })}><AlignCenter size={16} /></button>
          <button aria-label="Aligner à droite" className={element.textAlign === "right" ? "active" : ""} onClick={() => update({ textAlign: "right" })}><AlignRight size={16} /></button>
        </div>
        <div className="field-row"><Field label="Interligne"><input type="number" min="0.7" max="3" step="0.05" value={element.lineHeight} onChange={(event) => update({ lineHeight: Number(event.target.value) })} /></Field><Field label="Espacement"><input type="number" min="-5" max="30" value={element.letterSpacing} onChange={(event) => update({ letterSpacing: Number(event.target.value) })} /></Field></div>
        {appearance}
      </PropertySection>}
      {element.type === "image" && <>
        <PropertySection sectionKey="importation" key={`${element.id}-importation`} title="Importation"><div className="image-summary"><img src={element.src} alt="Aperçu" /><p>{element.alt}</p><small>Choisissez d’afficher l’image entière ou de remplir volontairement son cadre.</small></div></PropertySection>
        <PropertySection sectionKey="ajustement" key={`${element.id}-ajustement`} title="Ajustement">
          <Field label="Affichage dans le cadre"><select value={resolveImageFit(element.fit)} onChange={(event) => update({ fit: event.target.value as typeof element.fit })}><option value="contain">Image entière</option><option value="cover">Remplir le cadre</option></select></Field>
          <ImageTransformProperties key={`${element.id}-${previewDevice}`} element={element} device={previewDevice} width={layout.width} height={layout.height} onChange={update} />{appearance}
        </PropertySection>
        <PropertySection sectionKey="apparence" key={`${element.id}-apparence`} title="Apparence"><ImageAppearanceProperties element={element} device={previewDevice} onChange={update} /><ImageFrameProperties element={element} onChange={update} /></PropertySection>
      </>}
      {element.type === "shape" && <><PropertySection sectionKey="forme" key={`${element.id}-forme`} title="Forme">
        <Field label="Type"><select value={element.shape} onChange={(event) => update({ shape: event.target.value as typeof element.shape })}><option value="rectangle">Rectangle</option><option value="rounded-rectangle">Arrondi</option><option value="circle">Cercle</option><option value="line">Ligne</option></select></Field>
        {element.shape === "rounded-rectangle" && <Field label="Coins arrondis"><input type="range" min="0" max="80" value={element.cornerRadius} onChange={(event) => update({ cornerRadius: Number(event.target.value) })} /></Field>}
      </PropertySection><PropertySection sectionKey="apparence" key={`${element.id}-apparence`} title="Apparence">
        {element.shape !== "line" && <Field label="Remplissage"><ColorAlphaInput value={element.fill} onChange={(fill) => update({ fill })} /></Field>}
        <Field label="Bordure"><ColorAlphaInput value={element.stroke} onChange={(stroke) => update({ stroke })} /></Field>
        <Field label="Épaisseur"><input type="range" min="0" max="20" value={element.strokeWidth} onChange={(event) => update({ strokeWidth: Number(event.target.value) })} /><output>{element.strokeWidth}px</output></Field>
        {appearance}
      </PropertySection></>}
      {element.type === "icon" && <><PropertySection sectionKey="contenu" key={`${element.id}-contenu`} title="Contenu">{element.heartStyle
        ? <Field label="Style de cœur"><select value={element.heartStyle} onChange={(event) => { const heart = getDecorativeHeart(event.target.value as DecorativeHeartStyle); update({ heartStyle: heart.id, name: `Cœur ${heart.label}` }); }}>{DECORATIVE_HEARTS.map((heart) => <option key={heart.id} value={heart.id}>{heart.label}</option>)}</select></Field>
        : <Field label="Décoration historique"><input value={element.icon} maxLength={4} onChange={(event) => update({ icon: event.target.value })} /></Field>}</PropertySection><PropertySection sectionKey="apparence" key={`${element.id}-apparence`} title="Apparence"><Field label="Couleur"><ColorAlphaInput value={element.color} onChange={(color) => update({ color })} /></Field>{appearance}</PropertySection></>}
      {(element.type === "scratch" || element.type === "carousel" || element.type === "location" || element.type === "schedule" || element.type === "button" || element.type === "section") && <RichElementProperties element={element} appearance={appearance} />}
      {element.type === "calendar" && <CalendarProperties element={element} appearance={appearance} />}
      <PropertySection sectionKey="animation" key={`${element.id}-animation`} title="Animation"><AnimationProperties animation={element.animation} onChange={(animation) => update({ animation })} /></PropertySection>
      <button className="property-device-visibility" type="button" onClick={() => setElementVisibility(element.id, !layout.visible)}>{layout.visible ? <Eye size={15} /> : <EyeOff size={15} />}{layout.visible ? `Masquer sur ${deviceLabel}` : `Afficher sur ${deviceLabel}`}</button>
      <div className="property-actions"><button onClick={() => duplicateElement(element.id)}><Copy size={15} /> Dupliquer</button><button className="danger" onClick={() => { if (window.confirm("Supprimer cet élément de tous les formats ?")) removeElement(element.id); }}><Trash2 size={15} /> Supprimer</button></div>
    </aside>
  );
}
