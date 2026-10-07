import { useEffect, useRef, useState } from "react";
import { ENVELOPE_GLOBAL_TYPES, ENVELOPE_PART_FIELDS, ENVELOPE_PARTS, validateEnvelopeFile, type EnvelopePart } from "../../features/openings/envelopeAssets";
import { publishGlobalEnvelopeAsset } from "../../services/globalAssetRepository";
import type { GlobalAssetRecord } from "../../types/globalAssets";
import { remoteErrorSummary } from "../../utils/storage";

export function GlobalEnvelopeAssetImport({ onPublished }: { onPublished: (asset: GlobalAssetRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<EnvelopePart>("base");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [hasTransparency, setHasTransparency] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDimensions(null); setHasTransparency(null);
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    let active = true;
    setPreview(url);
    const image = new Image(); image.src = url;
    void image.decode().then(() => {
      if (!active) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000 || Math.max(image.naturalWidth, image.naturalHeight) > 16384) throw new Error("Dimensions invalides : 40 mégapixels maximum.");
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      // Only a small one-off preview is sampled. Uploaded bytes and alpha are untouched.
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(image.naturalWidth, 256); canvas.height = Math.min(image.naturalHeight, 256);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        setHasTransparency(pixels.some((value, i) => i % 4 === 3 && value < 255));
      }
    }).catch((cause) => { if (active) { setDimensions(null); setError(remoteErrorSummary(cause)); } });
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [file]);
  const fields = ENVELOPE_PART_FIELDS[part];
  const reset = () => { setFile(null); setName(""); if (input.current) input.current.value = ""; };
  return <section className="admin-envelope-import">
    <button type="button" className="primary-button" disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open}>+ Ajouter un élément d’enveloppe</button>
    {open && <form onSubmit={(event) => {
      event.preventDefault(); if (!file || !dimensions || busy) return;
      setBusy(true); setError("");
      void publishGlobalEnvelopeAsset(file, ENVELOPE_GLOBAL_TYPES[part], name).then((asset) => { onPublished(asset); reset(); setOpen(false); }).catch((cause) => setError(remoteErrorSummary(cause))).finally(() => setBusy(false));
    }}>
      <label>Type<select value={part} disabled={busy} onChange={(event) => setPart(event.target.value as EnvelopePart)}>{ENVELOPE_PARTS.map((value) => <option key={value} value={value}>{ENVELOPE_PART_FIELDS[value].label} d’enveloppe</option>)}</select></label>
      <label>Nom<input required maxLength={160} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label>Fichier PNG / WebP · 5 Mo maximum<input ref={input} type="file" accept=".png,.webp,image/png,image/webp" disabled={busy} onChange={(event) => {
        setError(""); setDimensions(null); setHasTransparency(null); const chosen = event.target.files?.[0]; setFile(null);
        if (!chosen) return;
        try { validateEnvelopeFile(chosen); setFile(chosen); if (!name) setName(chosen.name.replace(/\.[^.]+$/, "")); }
        catch (cause) { setError(remoteErrorSummary(cause)); event.target.value = ""; }
      }} /></label>
      {preview && <div className="admin-envelope-preview envelope-checkerboard"><img src={preview} alt="Aperçu avant publication" /></div>}
      {dimensions && <small>{dimensions.width} × {dimensions.height} px</small>}
      {dimensions && (dimensions.width !== fields.width || dimensions.height !== fields.height) && <p role="status">Dimensions différentes du gabarit {fields.width} × {fields.height} px. Vérifiez l’aperçu avant publication.</p>}
      {hasTransparency === false && <p role="status">Aucune transparence détectée dans l’aperçu. Une image opaque pourrait recouvrir le faire-part.</p>}
      <div><button type="button" disabled={busy} onClick={() => { reset(); setOpen(false); setError(""); }}>Annuler</button><button type="submit" className="primary-button" disabled={busy || !dimensions || !name.trim()}>{busy ? "Publication…" : "Publier"}</button></div>
    </form>}
    {error && <p role="alert" className="template-admin-message error">{error}</p>}
  </section>;
}
