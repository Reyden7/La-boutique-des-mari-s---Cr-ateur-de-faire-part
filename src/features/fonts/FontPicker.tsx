import { ChevronDown, Search, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadProjectAsset } from "../../services/assetRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { CustomFontAsset } from "../../types/editor";
import { FONT_CATALOG, ensureGoogleFont } from "./fontCatalog";
import { loadProjectFont } from "./projectFontRuntime";
import { useGlobalAssets } from "../../hooks/useGlobalAssets";
import { PublishGlobalAssetButton } from "../../components/admin/PublishGlobalAssetButton";
import { FONT_FILE_ACCEPT, getFontMimeType, normalizeFontFileFormat } from "../../../supabase/functions/_shared/fontFormats";
import { getFontFileInfo } from "./fontFile";

function FontPreview({ family, children, onClick, active }: { family: string; children: React.ReactNode; onClick: () => void; active: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) ensureGoogleFont(family);
    }, { rootMargin: "80px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [family]);
  return <button ref={ref} type="button" className={active ? "active" : ""} style={{ fontFamily: family }} onClick={onClick}>{children}</button>;
}

export function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const { project, updateCustomFonts } = useEditorStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const customFonts = project?.customFonts ?? [];
  const globalFonts = useGlobalAssets("font");
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const fonts = FONT_CATALOG.filter((font) => font.family.toLocaleLowerCase("fr").includes(normalizedSearch));

  const upload = async (file?: File) => {
    if (!file || !project) return;
    setUploading(true);
    setUploadError("");
    try {
      const { format, family } = getFontFileInfo(file);
      const uploaded = await uploadProjectAsset(project, file, "font");
      const font: CustomFontAsset = { id: crypto.randomUUID(), assetId: uploaded.id, name: family, family, url: uploaded.url, format };
      await loadProjectFont(font);
      updateCustomFonts([...customFonts, font]);
      onChange(font.family);
      setOpen(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "La police n’a pas pu être chargée.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const selectGlobalFont = async (asset: (typeof globalFonts)[number]) => {
    if (!project) return;
    const family = String(asset.metadata.family ?? asset.name);
    const format = String(asset.metadata.format ?? "woff2") as CustomFontAsset["format"];
    const snapshot: CustomFontAsset = { id: `global-${asset.id}`, globalAssetId: asset.id, name: asset.name, family, url: asset.url, format };
    await loadProjectFont(snapshot);
    if (!customFonts.some((font) => font.globalAssetId === asset.id)) updateCustomFonts([...customFonts, snapshot]);
    onChange(family);
    setOpen(false);
  };

  return <div className="font-picker">
    <button type="button" className="font-picker-trigger" style={{ fontFamily: value }} onClick={() => setOpen((current) => !current)}><span>{value}</span><ChevronDown size={14} /></button>
    {open && <div className="font-picker-popover">
      <label className="font-search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une police" /></label>
      <div className="font-options">
        {globalFonts.length > 0 && <><small>Bibliothèque générale</small>{globalFonts.filter((font) => font.name.toLocaleLowerCase("fr").includes(normalizedSearch)).map((font) => <FontPreview key={font.id} family={String(font.metadata.family ?? font.name)} active={String(font.metadata.family ?? font.name) === value} onClick={() => void selectGlobalFont(font)}>{font.name}</FontPreview>)}</>}
        {customFonts.some((font) => !font.globalAssetId) && <><small>Polices du projet</small>{customFonts.filter((font) => !font.globalAssetId && font.name.toLocaleLowerCase("fr").includes(normalizedSearch)).map((font) => <div className="font-project-option" key={font.id}><FontPreview family={font.family} active={font.family === value} onClick={() => { onChange(font.family); setOpen(false); }}>{font.name}</FontPreview><PublishGlobalAssetButton compact input={font.assetId ? { sourceAssetId: font.assetId, type: "font", name: font.name, metadata: { family: font.family, format: normalizeFontFileFormat(font.format), mimeType: getFontMimeType(font.format) } } : undefined} /></div>)}</>}
        {(["Élégantes", "Modernes", "Manuscrites"] as const).map((category) => <div key={category} className="font-category"><small>{category}</small>{fonts.filter((font) => font.category === category).map((font) => <FontPreview key={font.family} family={font.family} active={font.family === value} onClick={() => { onChange(font.family); setOpen(false); }}>{font.family}</FontPreview>)}</div>)}
      </div>
      <button type="button" className="font-upload" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={14} /> {uploading ? "Import…" : "Importer une police"}</button>
      {uploadError && <small className="font-upload-error" role="alert">{uploadError}</small>}
      <input ref={inputRef} type="file" hidden accept={FONT_FILE_ACCEPT} onChange={(event) => void upload(event.target.files?.[0])} />
    </div>}
  </div>;
}
