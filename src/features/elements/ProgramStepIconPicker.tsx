import { useEffect, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Trash2 } from "lucide-react";
import type { ProgramCustomIcon, ProgramStepIcon, ScheduleItem, WeddingProject } from "../../types/editor";
import { SCHEDULE_ICONS, getScheduleIcon } from "../../config/scheduleIcons";
import { ScheduleIcon } from "./ScheduleIcon";
import { getProgramIconKey, resolveProgramStepIcon } from "./programIconModel";
import { uploadProgramIconAsset } from "../../services/programIconRepository";
import { deleteProjectAssetIfUnused } from "../../services/assetRepository";
import { useEditorStore } from "../../stores/editorStore";
import { readImageFileDimensions } from "../../utils/imageLayout";
import { getProgramIconFileInfo, PROGRAM_ICON_ACCEPT } from "../../../supabase/functions/_shared/programIconFormats";
import { useGlobalAssets } from "../../hooks/useGlobalAssets";
import { PublishGlobalAssetButton } from "../../components/admin/PublishGlobalAssetButton";

type Props = {
  item: ScheduleItem;
  stepNumber: number;
  project: WeddingProject | null;
  onSelect: (icon: ProgramStepIcon | null) => void;
  onImport: (icon: ProgramCustomIcon) => boolean;
  onRemoveCustom: () => void;
  /** Injectable adapter for isolated UI tests; production uses the real repository. */
  uploadIcon?: typeof uploadProgramIconAsset;
};

export function ProgramStepIconPicker({ item, stepNumber, project, onSelect, onImport, onRemoveCustom, uploadIcon = uploadProgramIconAsset }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const globals = useGlobalAssets("program_icon");
  const selected = resolveProgramStepIcon(item.icon);
  const storedCustom = resolveProgramStepIcon(item.customIcon);
  const custom = storedCustom?.type === "custom" ? storedCustom : selected?.type === "custom" && !selected.globalAssetId ? selected : undefined;
  const label = selected?.type === "preset" ? getScheduleIcon(selected.name)?.label : selected?.name ?? (selected ? "Icône personnalisée" : "Aucune");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (icon: ProgramStepIcon | null) => { onSelect(icon); setOpen(false); setError(""); };
  const upload = async (file?: File) => {
    if (!file || !project || busy) return;
    setError(""); setBusy(true);
    try {
      getProgramIconFileInfo(file);
      await readImageFileDimensions(file); // Reject mislabeled/corrupt images before any Storage write.
      const icon = await uploadIcon(project, file);
      if (alive.current && onImport(icon)) { setOpen(false); }
      else if (icon.assetId) {
        const current = useEditorStore.getState().project;
        if (current?.id === project.id) await deleteProjectAssetIfUnused(current, icon.assetId, icon.url);
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Impossible d’importer cette icône."); }
    finally { if (alive.current) setBusy(false); if (input.current) input.current.value = ""; }
  };
  const active = (icon: ProgramStepIcon | null) => selected && icon ? getProgramIconKey(selected) === getProgramIconKey(icon) : !selected && !icon;
  // Never offer publication of a copied template asset or a source owned by another project.
  const ownedCustom = custom?.assetId && project?.ownerId && custom.url.includes(`/wedding-assets/${project.ownerId}/${project.id}/`) ? custom : undefined;
  return <div className="program-step-icon-picker" ref={root}>
    <span className="program-icon-field-label">Icône</span>
    <button type="button" className="program-icon-trigger" aria-label={`Choisir l’icône étape ${stepNumber}`} aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>
      <span className="program-icon-thumbnail">{selected ? <ScheduleIcon value={selected} /> : <span className="program-icon-none" aria-hidden="true">—</span>}</span>
      <span>{busy ? "Importation…" : label}</span><ChevronDown size={14} />
    </button>
    {open && <fieldset disabled={busy} className="program-icon-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
      <small>Icônes intégrées</small>
      <div className="program-icon-grid" role="group" aria-label={`Icônes intégrées étape ${stepNumber}`}>
        <button type="button" aria-label={`Aucune icône étape ${stepNumber}`} aria-pressed={active(null)} onClick={() => choose(null)} title="Aucune"><span aria-hidden="true">—</span><span>Aucune</span></button>
        {SCHEDULE_ICONS.map((icon) => <button type="button" key={icon.id} title={icon.label} aria-label={`${icon.label} étape ${stepNumber}`} aria-pressed={active({ type: "preset", name: icon.id })} onClick={() => choose({ type: "preset", name: icon.id })}><ScheduleIcon id={icon.id} /><span>{icon.label}</span></button>)}
      </div>
      {globals.length > 0 && <><small>Bibliothèque générale</small><div className="program-icon-grid" role="group" aria-label={`Icônes globales étape ${stepNumber}`}>
        {globals.map((asset) => { const icon: ProgramCustomIcon = { type: "custom", url: asset.url, name: asset.name, globalAssetId: asset.id }; return <button type="button" key={asset.id} aria-label={`${asset.name} étape ${stepNumber}`} aria-pressed={active(icon)} onClick={() => choose(icon)}><img loading="lazy" src={asset.thumbnailUrl ?? asset.url} alt="" /><span>{asset.name}</span></button>; })}
      </div></>}
      {custom && <div className="program-custom-icon-row"><button type="button" aria-pressed={active(custom)} aria-label={`Utiliser l’icône importée étape ${stepNumber}`} onClick={() => choose(custom)}><ScheduleIcon value={custom} /><span>{custom.name ?? "Mon icône"}</span></button><button type="button" title="Retirer de cette étape" aria-label={`Supprimer l’icône importée étape ${stepNumber}`} onClick={() => { onRemoveCustom(); setError(""); }}><Trash2 size={13} /></button></div>}
      <button type="button" className="secondary-action" aria-label={`Importer une icône étape ${stepNumber}`} disabled={busy || !project} onClick={() => input.current?.click()}><ImagePlus size={14} />{custom ? "Remplacer l’icône" : "Importer une icône"}</button>
      <small>PNG / WebP / JPG • 5 Mo maximum. Couleurs et transparence conservées.</small>
      {ownedCustom && <PublishGlobalAssetButton key={ownedCustom.assetId} input={{ sourceAssetId: ownedCustom.assetId!, type: "program_icon", name: ownedCustom.name ?? "Icône Programme" }} />}
    </fieldset>}
    <input ref={input} type="file" hidden accept={PROGRAM_ICON_ACCEPT} aria-label={`Fichier icône étape ${stepNumber}`} onChange={(event) => void upload(event.target.files?.[0])} />
    {error && <small className="program-icon-error" role="alert">{error}</small>}
  </div>;
}
