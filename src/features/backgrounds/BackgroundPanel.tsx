import { StableColorInput } from "../../components/ui/StableColorInput";
import { useState } from "react";
import { uploadProjectAsset } from "../../services/assetRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { PageBackground } from "../../types/editor";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function BackgroundPanel({ background }: { background?: PageBackground }) {
  const { project, updateBackground } = useEditorStore();
  const [uploading, setUploading] = useState(false);
  if (!background) return <aside className="properties-panel" />;
  const gradient = background.gradient ?? { type: "linear" as const, color1: "#f5efe8", color2: "#d9c7b8", angle: 135 };
  const update = (changes: Partial<PageBackground>) => updateBackground({ ...background, ...changes });
  const uploadImage = async (file?: File) => {
    if (!file || !project || file.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const asset = await uploadProjectAsset(project, file, "image");
      update({ type: "image", imageUrl: asset.url });
    } finally {
      setUploading(false);
    }
  };

  return <aside className="properties-panel">
    <div className="properties-heading"><div><small>Document</small><h2>Arrière-plan</h2></div></div>
    <Field label="Type"><div className="segmented">{(["color", "gradient", "image"] as const).map((type) => <button type="button" key={type} className={background.type === type ? "active" : ""} onClick={() => update({ type })}>{type === "color" ? "Couleur" : type === "gradient" ? "Dégradé" : "Image"}</button>)}</div></Field>
    {background.type === "color" && <Field label="Couleur"><StableColorInput value={background.color ?? "#fffdf9"} onChange={(value) => update({ color: value })} /></Field>}
    {background.type === "gradient" && <>
      <div className="field-row"><Field label="Couleur 1"><StableColorInput value={gradient.color1} onChange={(value) => update({ gradient: { ...gradient, color1: value } })} /></Field><Field label="Couleur 2"><StableColorInput value={gradient.color2} onChange={(value) => update({ gradient: { ...gradient, color2: value } })} /></Field></div>
      <Field label="Style"><select value={gradient.type} onChange={(event) => update({ gradient: { ...gradient, type: event.target.value as "linear" | "radial" } })}><option value="linear">Linéaire</option><option value="radial">Radial</option></select></Field>
      {gradient.type === "linear" && <Field label={`Angle · ${gradient.angle ?? 135}°`}><input type="range" min="0" max="360" value={gradient.angle ?? 135} onChange={(event) => update({ gradient: { ...gradient, angle: Number(event.target.value) } })} /></Field>}
    </>}
    {background.type === "image" && <Field label="Image de fond"><input type="file" disabled={uploading} accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadImage(event.target.files?.[0])} />{background.imageUrl && <small>Image enregistrée dans le projet.</small>}</Field>}
    <div className="background-tip"><span>Configurations conservées</span><p>La couleur, le dégradé et l’image restent mémorisés lorsque vous changez de type.</p></div>
  </aside>;
}
