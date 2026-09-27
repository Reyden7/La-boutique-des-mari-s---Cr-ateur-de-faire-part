import { ChevronDown, Search, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadProjectAsset } from "../../services/assetRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { CustomFontAsset } from "../../types/editor";
import { FONT_CATALOG, ensureGoogleFont } from "./fontCatalog";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const customFonts = project?.customFonts ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const fonts = FONT_CATALOG.filter((font) => font.family.toLocaleLowerCase("fr").includes(normalizedSearch));

  const upload = async (file?: File) => {
    if (!file || !project) return;
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name) || file.size > 8 * 1024 * 1024) return;
    setUploading(true);
    try {
      const uploaded = await uploadProjectAsset(project, file, "font");
      const extension = file.name.split(".").pop()?.toLowerCase() as CustomFontAsset["format"];
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      const font: CustomFontAsset = { id: crypto.randomUUID(), assetId: uploaded.id, name, family: `Projet · ${name}`, url: uploaded.url, format: extension };
      updateCustomFonts([...customFonts, font]);
      onChange(font.family);
      setOpen(false);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return <div className="font-picker">
    <button type="button" className="font-picker-trigger" style={{ fontFamily: value }} onClick={() => setOpen((current) => !current)}><span>{value}</span><ChevronDown size={14} /></button>
    {open && <div className="font-picker-popover">
      <label className="font-search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une police" /></label>
      <div className="font-options">
        {customFonts.length > 0 && <><small>Polices du projet</small>{customFonts.filter((font) => font.name.toLocaleLowerCase("fr").includes(normalizedSearch)).map((font) => <FontPreview key={font.id} family={font.family} active={font.family === value} onClick={() => { onChange(font.family); setOpen(false); }}>{font.name}</FontPreview>)}</>}
        {(["Élégantes", "Modernes", "Manuscrites"] as const).map((category) => <div key={category} className="font-category"><small>{category}</small>{fonts.filter((font) => font.category === category).map((font) => <FontPreview key={font.family} family={font.family} active={font.family === value} onClick={() => { onChange(font.family); setOpen(false); }}>{font.family}</FontPreview>)}</div>)}
      </div>
      <button type="button" className="font-upload" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={14} /> {uploading ? "Import…" : "Importer une police"}</button>
      <input ref={inputRef} type="file" hidden accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => void upload(event.target.files?.[0])} />
    </div>}
  </div>;
}
