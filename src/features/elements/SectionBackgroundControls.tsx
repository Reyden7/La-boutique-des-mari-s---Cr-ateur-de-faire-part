import type { SectionElement } from "../../types/editor";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";
import { SECTION_TEXTURES, resolveSectionTexture } from "../../config/sectionTextures";

export function SectionBackgroundControls({ element, onChange, onUpload }: {
  element: SectionElement;
  onChange: (changes: Partial<SectionElement>) => void;
  onUpload: (file?: File) => void;
}) {
  const texture = resolveSectionTexture(element, element.width, element.height);
  const mode = element.backgroundType === "texture" || element.backgroundType === "color-texture" ? element.backgroundType : element.background.type;
  const strengthLabel = mode === "color-texture" ? "Intensité de la texture" : "Opacité texture";
  const setMode = (value: string) => {
    if (value === "texture" || value === "color-texture") {
      onChange({ backgroundType: value, background: { ...element.background, type: "color", color: element.background.color ?? "#f7f1eb" }, textureId: element.textureId ?? "soft-paper" });
    } else {
      onChange({ backgroundType: "color", background: { ...element.background, type: value as "color" | "gradient" | "image" } });
    }
  };
  return <div className="section-background-controls">
    <label className="field"><span>Type de fond</span><select value={mode} onChange={(event) => setMode(event.target.value)}>
      <option value="color">Couleur</option><option value="texture">Texture</option><option value="color-texture">Couleur + texture</option>
      <option value="gradient">Dégradé</option><option value="image">Image</option>
    </select></label>
    {(mode === "color" || mode === "color-texture") && <label className="field"><span>Couleur</span><ColorAlphaInput value={element.background.color ?? "#f7f1eb"} onChange={(color) => onChange({ background: { ...element.background, color } })} /></label>}
    {mode === "gradient" && <div className="field-row">{(["color1", "color2"] as const).map((key, index) => <label className="field" key={key}><span>{index ? "Fin" : "Début"}</span><ColorAlphaInput value={element.background.gradient?.[key] ?? (index ? "#ded0c3" : "#f7f1eb")} onChange={(color) => onChange({ background: { ...element.background, type: "gradient", gradient: { type: "linear", color1: "#f7f1eb", color2: "#ded0c3", angle: 135, ...element.background.gradient, [key]: color } } })} /></label>)}</div>}
    {mode === "image" && <label className="carousel-upload">Choisir une image<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { onUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}
    {(mode === "texture" || mode === "color-texture") && <>
      <label className="field"><span>Texture / matière</span><select value={texture.preset?.id ?? "none"} onChange={(event) => onChange({ textureId: event.target.value })}><option value="none">Aucune</option>{SECTION_TEXTURES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="section-texture-presets" aria-label="Textures intégrées">{SECTION_TEXTURES.map((item) => <button type="button" key={item.id} title={item.name} aria-label={item.name} aria-pressed={texture.preset?.id === item.id} onClick={() => onChange({ textureId: item.id })}><img src={item.url} alt="" loading="lazy" /><span>{item.name}</span></button>)}</div>
      <label className="field"><span>{strengthLabel} · {Math.round(texture.opacity * 100)} %</span><input aria-label={strengthLabel} type="range" min="0" max="100" value={Math.round(texture.opacity * 100)} onChange={(event) => onChange({ textureOpacity: Number(event.target.value) / 100 })} /></label>
      <label className="field"><span>Taille / échelle · {Math.round(texture.scale * 100)} %</span><input aria-label="Échelle texture" type="range" min="12.5" max="400" step="12.5" value={texture.scale * 100} onChange={(event) => onChange({ textureScale: Number(event.target.value) / 100 })} /></label>
      <label className="field"><span>Application</span><select value={texture.fit} onChange={(event) => onChange({ textureFit: event.target.value as SectionElement["textureFit"] })}><option value="cover">Couvrir</option><option value="contain">Contenir</option><option value="repeat">Répéter</option></select></label>
      <small>{mode === "color-texture" ? "La matière module la couleur choisie, même à 100 %, sans la remplacer." : "La texture conserve ses couleurs d’origine."} Réglages communs aux trois supports ; la texture suit la taille de chaque section.</small>
    </>}
  </div>;
}
