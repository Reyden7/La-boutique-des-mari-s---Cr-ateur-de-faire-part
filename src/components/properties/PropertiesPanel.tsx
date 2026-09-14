import { AlignCenter, AlignLeft, AlignRight, Bold, Copy, Italic, Trash2, Underline } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { WEDDING_FONTS, type AnimationType, type EditorElement, type PageBackground } from "../../types/editor";
import type { OpeningAnimationType } from "../../types/editor";
import { OpeningProperties } from "../../features/openings/OpeningProperties";
import { AudioProperties } from "../../features/music/AudioProperties";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function PropertiesPanel({ onPreviewOpening }: { onPreviewOpening: (type: OpeningAnimationType) => void }) {
  const { project, currentPageId, selectedElementId, sidebarView, updateElement, updateBackground, duplicateElement, removeElement } = useEditorStore();
  const page = project?.pages.find((item) => item.id === currentPageId);
  const element = page?.elements.find((item) => item.id === selectedElementId);

  if (sidebarView === "opening") return <OpeningProperties onPreview={onPreviewOpening} />;
  if (sidebarView === "music") return <AudioProperties />;
  if (!element) return <BackgroundProperties background={page?.background} update={updateBackground} />;
  const update = (values: Partial<EditorElement>) => updateElement(element.id, values);

  return (
    <aside className="properties-panel">
      <div className="properties-heading"><div><small>Élément sélectionné</small><h2>{element.name}</h2></div><span className="type-pill">{element.type}</span></div>
      {element.type === "text" && <>
        <Field label="Contenu"><textarea rows={3} value={element.text} onChange={(event) => update({ text: event.target.value, name: event.target.value.slice(0, 28) || "Texte" })} /></Field>
        <Field label="Police"><select value={element.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}>{WEDDING_FONTS.map((font) => <option key={font} style={{ fontFamily: font }}>{font}</option>)}</select></Field>
        <div className="field-row"><Field label="Taille"><input type="number" min="8" max="160" value={element.fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) })} /></Field><Field label="Couleur"><input type="color" value={element.color} onChange={(event) => update({ color: event.target.value })} /></Field></div>
        <div className="format-row">
          <button aria-label="Gras" className={element.fontWeight >= 600 ? "active" : ""} onClick={() => update({ fontWeight: element.fontWeight >= 600 ? 400 : 700 })}><Bold size={16} /></button>
          <button aria-label="Italique" className={element.italic ? "active" : ""} onClick={() => update({ italic: !element.italic })}><Italic size={16} /></button>
          <button aria-label="Souligné" className={element.underline ? "active" : ""} onClick={() => update({ underline: !element.underline })}><Underline size={16} /></button>
          <button aria-label="Aligner à gauche" className={element.textAlign === "left" ? "active" : ""} onClick={() => update({ textAlign: "left" })}><AlignLeft size={16} /></button>
          <button aria-label="Centrer" className={element.textAlign === "center" ? "active" : ""} onClick={() => update({ textAlign: "center" })}><AlignCenter size={16} /></button>
          <button aria-label="Aligner à droite" className={element.textAlign === "right" ? "active" : ""} onClick={() => update({ textAlign: "right" })}><AlignRight size={16} /></button>
        </div>
        <div className="field-row"><Field label="Interligne"><input type="number" min="0.7" max="3" step="0.05" value={element.lineHeight} onChange={(event) => update({ lineHeight: Number(event.target.value) })} /></Field><Field label="Espacement"><input type="number" min="-5" max="30" value={element.letterSpacing} onChange={(event) => update({ letterSpacing: Number(event.target.value) })} /></Field></div>
      </>}
      {element.type === "image" && <div className="image-summary"><img src={element.src} alt="Aperçu" /><p>{element.alt}</p><small>Le recadrage et les filtres seront ajoutés dans une prochaine version.</small></div>}
      {element.type === "shape" && <>
        {element.shape !== "line" && <Field label="Remplissage"><input type="color" value={element.fill} onChange={(event) => update({ fill: event.target.value })} /></Field>}
        <Field label="Bordure"><input type="color" value={element.stroke} onChange={(event) => update({ stroke: event.target.value })} /></Field>
        <Field label="Épaisseur"><input type="range" min="0" max="20" value={element.strokeWidth} onChange={(event) => update({ strokeWidth: Number(event.target.value) })} /><output>{element.strokeWidth}px</output></Field>
        {element.shape === "rounded-rectangle" && <Field label="Coins arrondis"><input type="range" min="0" max="80" value={element.cornerRadius} onChange={(event) => update({ cornerRadius: Number(event.target.value) })} /></Field>}
      </>}
      {element.type === "icon" && <><Field label="Décoration"><input value={element.icon} maxLength={4} onChange={(event) => update({ icon: event.target.value })} /></Field><Field label="Couleur"><input type="color" value={element.color} onChange={(event) => update({ color: event.target.value })} /></Field></>}

      <div className="properties-divider" />
      <Field label={`Opacité · ${Math.round(element.opacity * 100)} %`}><input type="range" min="0.05" max="1" step="0.05" value={element.opacity} onChange={(event) => update({ opacity: Number(event.target.value) })} /></Field>
      <Field label="Rotation"><div className="input-suffix"><input type="number" min="-360" max="360" value={Math.round(element.rotation)} onChange={(event) => update({ rotation: Number(event.target.value) })} /><span>°</span></div></Field>
      <div className="properties-divider" />
      <h3>Animation</h3>
      <Field label="Effet"><select value={element.animation?.type ?? "none"} onChange={(event) => update({ animation: { type: event.target.value as AnimationType, duration: element.animation?.duration ?? 0.8, delay: element.animation?.delay ?? 0 } })}>
        <option value="none">Aucune</option><option value="fade">Fondu</option><option value="slide-left">Glisser à gauche</option><option value="slide-right">Glisser à droite</option><option value="slide-up">Glisser vers le haut</option><option value="slide-down">Glisser vers le bas</option><option value="zoom">Zoom doux</option><option value="rotate">Rotation</option>
      </select></Field>
      <div className="field-row"><Field label="Durée (s)"><input type="number" min="0.1" max="5" step="0.1" value={element.animation?.duration ?? 0.8} onChange={(event) => update({ animation: { type: element.animation?.type ?? "none", duration: Number(event.target.value), delay: element.animation?.delay ?? 0 } })} /></Field><Field label="Délai (s)"><input type="number" min="0" max="5" step="0.1" value={element.animation?.delay ?? 0} onChange={(event) => update({ animation: { type: element.animation?.type ?? "none", duration: element.animation?.duration ?? 0.8, delay: Number(event.target.value) } })} /></Field></div>
      <div className="property-actions"><button onClick={() => duplicateElement(element.id)}><Copy size={15} /> Dupliquer</button><button className="danger" onClick={() => removeElement(element.id)}><Trash2 size={15} /> Supprimer</button></div>
    </aside>
  );
}

function BackgroundProperties({ background, update }: { background?: PageBackground; update: (background: PageBackground) => void }) {
  if (!background) return <aside className="properties-panel" />;
  const gradient = background.gradient ?? { type: "linear" as const, color1: "#f5efe8", color2: "#d9c7b8", angle: 135 };
  return (
    <aside className="properties-panel">
      <div className="properties-heading"><div><small>Page actuelle</small><h2>Arrière-plan</h2></div></div>
      <Field label="Type"><div className="segmented">{(["color", "gradient", "image"] as const).map((type) => <button key={type} className={background.type === type ? "active" : ""} onClick={() => update(type === "color" ? { type, color: background.color ?? "#fffdf9" } : type === "gradient" ? { type, gradient } : { type, imageUrl: background.imageUrl })}>{type === "color" ? "Couleur" : type === "gradient" ? "Dégradé" : "Image"}</button>)}</div></Field>
      {background.type === "color" && <Field label="Couleur"><input type="color" value={background.color ?? "#fffdf9"} onChange={(event) => update({ type: "color", color: event.target.value })} /></Field>}
      {background.type === "gradient" && <>
        <div className="field-row"><Field label="Couleur 1"><input type="color" value={gradient.color1} onChange={(event) => update({ type: "gradient", gradient: { ...gradient, color1: event.target.value } })} /></Field><Field label="Couleur 2"><input type="color" value={gradient.color2} onChange={(event) => update({ type: "gradient", gradient: { ...gradient, color2: event.target.value } })} /></Field></div>
        <Field label="Style"><select value={gradient.type} onChange={(event) => update({ type: "gradient", gradient: { ...gradient, type: event.target.value as "linear" | "radial" } })}><option value="linear">Linéaire</option><option value="radial">Radial</option></select></Field>
        {gradient.type === "linear" && <Field label={`Angle · ${gradient.angle ?? 135}°`}><input type="range" min="0" max="360" value={gradient.angle ?? 135} onChange={(event) => update({ type: "gradient", gradient: { ...gradient, angle: Number(event.target.value) } })} /></Field>}
      </>}
      {background.type === "image" && <Field label="Image de fond"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file || file.size > 10 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => update({ type: "image", imageUrl: String(reader.result) }); reader.readAsDataURL(file); }} /></Field>}
      <div className="background-tip"><span>Astuce</span><p>Cliquez dans une zone vide du faire-part pour retrouver les réglages de fond.</p></div>
    </aside>
  );
}
