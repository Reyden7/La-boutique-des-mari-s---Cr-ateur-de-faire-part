import { Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { uploadProjectAsset } from "../../services/assetRepository";
import { validateSealImage } from "./envelopeSettings";

export function EnvelopeSealControls() {
  const project = useEditorStore((state) => state.project);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  if (!project) return null;
  const settings = project.opening.customSettings;
  const url = typeof settings?.sealImageUrl === "string" ? settings.sealImageUrl : undefined;
  const importSeal = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setError("");
    setUploading(true);
    try {
      validateSealImage(file);
      // Decode before uploading; never recolor, rasterize or flatten the alpha.
      const objectUrl = URL.createObjectURL(file);
      try { const image = new Image(); image.src = objectUrl; await image.decode(); }
      finally { URL.revokeObjectURL(objectUrl); }
      const asset = await uploadProjectAsset(project, file, "image");
      const current = useEditorStore.getState();
      if (current.project?.id !== project.id || current.project.opening.type !== "envelope") return;
      current.updateOpening({ ...current.project.opening, customSettings: {
        ...current.project.opening.customSettings, sealImageUrl: asset.url, sealImageName: file.name, sealAssetId: asset.id,
      } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible d’importer le cachet."); }
    finally { setUploading(false); }
  };
  return <div className="envelope-seal-import">
    <span>Cachet personnalisé</span>
    {url && <img src={url} alt="Votre cachet" loading="lazy" />}
    <input ref={inputRef} type="file" accept=".png,.webp,.jpg,.jpeg,image/png,image/webp,image/jpeg" hidden disabled={uploading} onChange={(event) => void importSeal(event)} />
    <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={14} />{uploading ? "Import en cours…" : url ? "Remplacer le cachet" : "Importer mon cachet"}</button>
    {url && <button type="button" disabled={uploading} onClick={() => {
      const { sealImageUrl: _url, sealImageName: _name, sealAssetId: _asset, ...rest } = settings ?? {};
      useEditorStore.getState().updateOpening({ ...project.opening, customSettings: rest });
      // Detach only: the asset may still be referenced elsewhere in this project.
    }}><X size={14} />Revenir au cachet de cire</button>}
    <small>PNG / WebP transparent conseillé · JPEG accepté · 10 Mo maximum. Les couleurs et la transparence du fichier sont conservées.</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}
