import { ArrowLeft, Eye, EyeOff, FileAudio, FileType2, Image as ImageIcon, Pencil, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { listAdminGlobalAssets, updateGlobalAsset } from "../services/globalAssetRepository";
import type { GlobalAssetRecord, GlobalAssetType } from "../types/globalAssets";
import { remoteErrorSummary } from "../utils/storage";

const FILTERS: Array<{ type?: GlobalAssetType; label: string }> = [
  { label: "Tous" }, { type: "font", label: "Polices" }, { type: "welcome_arch", label: "Arches" },
  { type: "welcome_background", label: "Paysages" }, { type: "music", label: "Musiques" },
  { type: "particle", label: "Particules" }, { type: "decoration", label: "Décorations" },
  { type: "program_icon", label: "Icônes Programme" },
];
const labels: Record<GlobalAssetType, string> = { font: "Police", welcome_arch: "Arche", welcome_background: "Paysage", music: "Musique", particle: "Particule", decoration: "Décoration", program_icon: "Icône Programme" };

export function AdminAssetsPage() {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState<GlobalAssetRecord[]>([]);
  const [filter, setFilter] = useState<GlobalAssetType | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (isAdmin) void listAdminGlobalAssets().then(setAssets).catch((cause) => setError(remoteErrorSummary(cause))); }, [isAdmin]);
  if (!isAdmin) return <Navigate to="/" replace />;
  const replace = (asset: GlobalAssetRecord) => setAssets((items) => items.map((item) => item.id === asset.id ? asset : item));
  const mutate = async (asset: GlobalAssetRecord, updates: Parameters<typeof updateGlobalAsset>[1]) => {
    setBusy(asset.id); setError("");
    try { replace(await updateGlobalAsset(asset.id, updates)); } catch (cause) { setError(remoteErrorSummary(cause)); } finally { setBusy(null); }
  };
  const visible = filter ? assets.filter((asset) => asset.type === filter) : assets;
  return <div className="admin-templates-page admin-assets-page">
    <header className="admin-templates-header"><Link to="/"><ArrowLeft size={17} /> Retour aux projets</Link><div><p className="eyebrow">Administration</p><h1>Bibliothèque générale</h1></div></header>
    <main>
      <p className="admin-templates-lead">Les assets publiés sont proposés à tous. Dépublier retire un choix des bibliothèques sans casser les projets qui conservent déjà son URL.</p>
      <nav className="admin-asset-filters">{FILTERS.map((item) => <button className={filter === item.type ? "active" : ""} key={item.label} onClick={() => setFilter(item.type)}>{item.label}</button>)}</nav>
      {error && <div className="template-admin-message error">{error}</div>}
      <div className="admin-template-list">{visible.map((asset) => <article className="admin-template-row admin-asset-row" key={asset.id}>
        <div className="admin-template-thumb admin-asset-thumb">{asset.type === "font" ? <FileType2 size={26} /> : asset.type === "music" ? <FileAudio size={26} /> : asset.thumbnailUrl ? <img loading="lazy" src={asset.thumbnailUrl} alt="" /> : <ImageIcon size={26} />}</div>
        <div className="admin-template-copy"><strong style={asset.type === "font" ? { fontFamily: String(asset.metadata.family ?? "inherit") } : undefined}>{asset.name}</strong><span>{labels[asset.type]}{asset.category ? ` · ${asset.category}` : ""} · {new Date(asset.updatedAt).toLocaleDateString("fr-FR")}</span><small>/{asset.slug}</small></div>
        <label className="admin-sort-field">Ordre<input type="number" value={asset.sortOrder} disabled={busy === asset.id} onChange={(event) => replace({ ...asset, sortOrder: Number(event.target.value) || 0 })} onBlur={() => void mutate(asset, { sortOrder: asset.sortOrder })} /></label>
        <div className="admin-template-status"><span className={asset.isPublished ? "published" : "draft"}>{asset.isPublished ? "Publié" : "Brouillon"}</span></div>
        <div className="admin-template-actions"><button title="Renommer" disabled={busy === asset.id} onClick={() => { const name = window.prompt("Nom de l’asset", asset.name)?.trim(); if (name) void mutate(asset, { name }); }}><Pencil size={15} /></button><button title="Modifier les métadonnées JSON" disabled={busy === asset.id} onClick={() => { const raw = window.prompt("Métadonnées JSON", JSON.stringify(asset.metadata, null, 2)); if (raw === null) return; try { void mutate(asset, { metadata: JSON.parse(raw) as Record<string, unknown> }); } catch { setError("Les métadonnées doivent être un objet JSON valide."); } }}><SlidersHorizontal size={15} /></button><button title={asset.isPublished ? "Dépublier" : "Publier"} disabled={busy === asset.id} onClick={() => void mutate(asset, { isPublished: !asset.isPublished })}>{asset.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
      </article>)}</div>
      {visible.length === 0 && <div className="empty-projects"><h2>Aucun asset</h2><p>Importez un asset depuis un projet admin puis ajoutez-le à la bibliothèque générale.</p></div>}
    </main>
  </div>;
}

