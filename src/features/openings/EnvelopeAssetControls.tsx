import { Download, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import type { EnvelopeAssetRef } from "../../types/editor";
import { PropertySection } from "../../components/properties/PropertySection";
import { useEditorStore } from "../../stores/editorStore";
import { deleteProjectAsset, deleteProjectAssetIfUnused, uploadProjectAsset } from "../../services/assetRepository";
import { decodeEnvelopeFile, ENVELOPE_GLOBAL_TYPES, globalEnvelopeChoices, ENVELOPE_PART_FIELDS, ENVELOPE_PARTS, ENVELOPE_PRESETS, removeEnvelopeCustom, resolveEnvelopeAsset, type EnvelopePart } from "./envelopeAssets";
import { useGlobalAssets } from "../../hooks/useGlobalAssets";
import { EnvelopePositionControls } from "./EnvelopePositionControls";

function EnvelopePartControls({ part }: { part: EnvelopePart }) {
  const project = useEditorStore((state) => state.project);
  const globals = useGlobalAssets(ENVELOPE_GLOBAL_TYPES[part]);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState<EnvelopeAssetRef | null>(null);
  if (!project) return null;
  const fields = ENVELOPE_PART_FIELDS[part];
  const selected = resolveEnvelopeAsset(project.opening.envelope, part);
  const custom = project.opening.envelope?.[fields.library] ?? [];
  const select = (asset: EnvelopeAssetRef) => {
    const current = useEditorStore.getState();
    if (current.project?.id !== project.id) return;
    current.updateOpening({ ...current.project.opening, envelope: { ...current.project.opening.envelope, [fields.active]: asset } });
  };
  const importImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const dimensions = await decodeEnvelopeFile(file);
      const beforeUpload = useEditorStore.getState().project;
      if (beforeUpload?.id !== project.id || beforeUpload.opening.type !== "envelope") return;
      const uploaded = await uploadProjectAsset(beforeUpload, file, "image", { folder: fields.folder });
      const current = useEditorStore.getState();
      if (current.project?.id !== project.id || current.project.opening.type !== "envelope") {
        // Upload can finish after navigation: safely remove the unreferenced new file.
        await deleteProjectAsset(uploaded.id);
        return;
      }
      const asset: EnvelopeAssetRef = { type: "custom", id: crypto.randomUUID(), assetId: uploaded.id, url: uploaded.url, name: file.name, ...dimensions };
      const envelope = current.project.opening.envelope;
      current.updateOpening({ ...current.project.opening, envelope: { ...envelope, [fields.active]: asset, [fields.library]: [...(envelope?.[fields.library] ?? []), asset] } });
      if (dimensions.width !== fields.width || dimensions.height !== fields.height) setNotice("Dimensions différentes du modèle. L’image sera ajustée automatiquement.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible d’importer l’image."); }
    finally { setBusy(false); }
  };
  const remove = async (asset: EnvelopeAssetRef, confirmed = false) => {
    if (!asset.id || busy || asset.type !== "custom") return;
    const current = useEditorStore.getState();
    if (current.project?.id !== project.id) return;
    if (!(current.project.opening.envelope?.[fields.library] ?? []).some((item) => item.id === asset.id)) { setPendingDelete(null); return; }
    // The same custom image can also be used as another component or in the document.
    const referenced = { ...current.project, opening: { ...current.project.opening, envelope: { ...current.project.opening.envelope, [fields.library]: [] } } };
    if (!confirmed && JSON.stringify(referenced).includes(asset.url)) { setPendingDelete(asset); return; }
    setPendingDelete(null);
    setBusy(true); setError(""); setNotice("");
    const next = { ...current.project, opening: { ...current.project.opening, envelope: removeEnvelopeCustom(current.project.opening.envelope, part, asset.id) } };
    current.updateOpening(next.opening);
    try {
      // Latest project prevents a stale selection/edit made during confirmation from deleting a used file.
      const latest = useEditorStore.getState().project;
      if (asset.assetId && latest?.id === project.id && !await deleteProjectAssetIfUnused(latest, asset.assetId, asset.url)) setNotice("Retiré de la bibliothèque. Le fichier est conservé car il est encore utilisé dans le projet.");
    } catch (cause) { setError(`L’élément a été retiré, mais son fichier n’a pas été supprimé : ${cause instanceof Error ? cause.message : "erreur Storage"}`); }
    finally { setBusy(false); }
  };
  const tile = (asset: EnvelopeAssetRef) => <div className="envelope-asset-tile" key={asset.id ?? asset.url}>
    <button type="button" disabled={busy || Boolean(pendingDelete)} className="envelope-asset-choice" aria-pressed={selected.type === asset.type && selected.id === asset.id && selected.url === asset.url} title={asset.name} onClick={() => select(asset)}>
      <img src={asset.url} alt="" loading="lazy" /><span>{asset.name ?? fields.label}</span>
    </button>
    {asset.type === "custom" && <button type="button" className="envelope-asset-delete" aria-label={`Supprimer ${asset.name ?? fields.label}`} disabled={busy || Boolean(pendingDelete)} onClick={() => void remove(asset)}><Trash2 size={13} /></button>}
  </div>;
  return <PropertySection sectionKey={`envelope-${part}`} title={fields.label}>
    <p className="envelope-asset-current">Sélection : {selected.name ?? fields.label}</p>
    <h4>Modèles</h4><div className="envelope-assets-grid">{ENVELOPE_PRESETS[part].map(tile)}</div>
    {globals.length > 0 && <><h4>Bibliothèque générale</h4><div className="envelope-assets-grid">{globalEnvelopeChoices(globals, part).map(tile)}</div></>}
    <h4>{fields.plural}</h4><div className="envelope-assets-grid">{custom.map(tile)}</div>
    {!custom.length && <small>Aucun élément importé.</small>}
    {pendingDelete && <div role="alertdialog" aria-modal="false" aria-label={`Supprimer ${pendingDelete.name ?? fields.label} ?`} className="envelope-delete-confirm" onKeyDown={(event) => { if (event.key === "Escape") setPendingDelete(null); }}>
      <p>Cet élément est utilisé dans le projet. S’il est sélectionné ici, le modèle par défaut sera rétabli. Le fichier sera conservé s’il reste utilisé ailleurs.</p>
      <button type="button" autoFocus onClick={() => setPendingDelete(null)}>Annuler</button>
      <button type="button" onClick={() => void remove(pendingDelete, true)}>Confirmer la suppression</button>
    </div>}
    <input ref={input} type="file" accept=".png,.webp,image/png,image/webp" hidden disabled={busy} onChange={(event) => void importImage(event)} />
    <button type="button" className="envelope-asset-import" disabled={busy || Boolean(pendingDelete)} onClick={() => input.current?.click()}><Upload size={14} />{busy ? "Traitement…" : `Importer ${fields.noun}`}</button>
    <a className="envelope-asset-download" href={`/envelope-templates/envelope-${fields.guide}-template.png`} download={`modele-${fields.label.toLowerCase()}-enveloppe-laboutiquedesmaries.png`}><Download size={14} />Télécharger le modèle</a>
    <small>{part === "seal" ? "Utilisez un PNG transparent. Le cachet sera automatiquement positionné sur le rabat." : "Téléchargez le modèle, personnalisez-le en conservant la transparence, puis importez votre PNG."} PNG / WebP · 5 Mo maximum · modèle {fields.width} × {fields.height} px.</small>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <EnvelopePositionControls part={part} />
  </PropertySection>;
}

export function EnvelopeAssetControls() {
  const projectId = useEditorStore((state) => state.project?.id);
  return <div className="envelope-asset-controls">{ENVELOPE_PARTS.map((part) => <EnvelopePartControls key={`${projectId}-${part}`} part={part} />)}<small>Les modèles sont communs aux trois supports. Positions et taille du cachet : support actif uniquement.</small></div>;
}
