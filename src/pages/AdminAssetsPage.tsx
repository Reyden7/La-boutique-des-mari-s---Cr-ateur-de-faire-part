import { ArrowLeft, ArrowUp, ArrowDown, Eye, EyeOff, FileAudio, FileType2, Image as ImageIcon, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { deleteGlobalEnvelopeAsset, getGlobalEnvelopeUsage, listAdminGlobalAssets, updateGlobalAsset, type GlobalEnvelopeUsage } from "../services/globalAssetRepository";
import { GlobalEnvelopeAssetImport } from "../components/admin/GlobalEnvelopeAssetImport";
import type { GlobalAssetRecord, GlobalAssetType } from "../types/globalAssets";
import { remoteErrorSummary } from "../utils/storage";

const FILTERS: Array<{ type?: GlobalAssetType; label: string }> = [
  { label: "Tous" }, { type: "font", label: "Polices" }, { type: "welcome_arch", label: "Arches" },
  { type: "welcome_background", label: "Paysages" }, { type: "music", label: "Musiques" },
  { type: "particle", label: "Particules" }, { type: "decoration", label: "Décorations" },
  { type: "program_icon", label: "Icônes Programme" },
  { type: "envelope_base", label: "Bases d’enveloppe" }, { type: "envelope_flap", label: "Rabats d’enveloppe" }, { type: "envelope_seal", label: "Cachets d’enveloppe" },
];
const labels: Record<GlobalAssetType, string> = { font: "Police", welcome_arch: "Arche", welcome_background: "Paysage", music: "Musique", particle: "Particule", decoration: "Décoration", program_icon: "Icône Programme", envelope_base: "Base d’enveloppe", envelope_flap: "Rabat d’enveloppe", envelope_seal: "Cachet d’enveloppe" };
const isEnvelope = (asset: GlobalAssetRecord) => ["envelope_base", "envelope_flap", "envelope_seal"].includes(asset.type);

export function AdminAssetsPage() {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState<GlobalAssetRecord[]>([]);
  const [filter, setFilter] = useState<GlobalAssetType | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [deletion, setDeletion] = useState<{ asset: GlobalAssetRecord; usage: GlobalEnvelopeUsage } | null>(null);
  useEffect(() => { if (isAdmin) void listAdminGlobalAssets().then(setAssets).catch((cause) => setError(remoteErrorSummary(cause))); }, [isAdmin]);
  if (!isAdmin) return <Navigate to="/" replace />;
  const replace = (asset: GlobalAssetRecord) => setAssets((items) => items.map((item) => item.id === asset.id ? asset : item));
  const mutate = async (asset: GlobalAssetRecord, updates: Parameters<typeof updateGlobalAsset>[1]) => {
    if (asset.deletePending && updates.isPublished) { setError("Suppression à finaliser : réessayez « Supprimer ». Cet asset ne peut pas être republié."); return; }
    setBusy(asset.id); setError("");
    try { replace(await updateGlobalAsset(asset.id, updates)); } catch (cause) { setError(remoteErrorSummary(cause)); } finally { setBusy(null); }
  };
  const sorted = [...assets].sort((a, b) => a.type.localeCompare(b.type) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const visible = filter ? sorted.filter((asset) => asset.type === filter) : sorted;
  const move = async (asset: GlobalAssetRecord, direction: number) => {
    const group = sorted.filter((item) => item.type === asset.type);
    const index = group.findIndex((item) => item.id === asset.id);
    if (!group[index + direction]) return;
    [group[index], group[index + direction]] = [group[index + direction], group[index]];
    setBusy(asset.id); setError("");
    try {
      // Persist explicit ranks, including ties, rather than an unreliable order swap.
      const saved = await Promise.all(group.map((item, rank) => updateGlobalAsset(item.id, { sortOrder: rank })));
      setAssets((items) => items.map((item) => saved.find((other) => other.id === item.id) ?? item));
    } catch (cause) { setError(remoteErrorSummary(cause)); await listAdminGlobalAssets().then(setAssets).catch(() => {}); }
    finally { setBusy(null); }
  };
  const inspectDelete = async (asset: GlobalAssetRecord) => {
    setBusy(asset.id); setError("");
    try { setDeletion({ asset, usage: await getGlobalEnvelopeUsage(asset.id) }); }
    catch (cause) { setError(remoteErrorSummary(cause)); }
    finally { setBusy(null); }
  };
  return <div className="admin-templates-page admin-assets-page">
    <header className="admin-templates-header"><Link to="/"><ArrowLeft size={17} /> Retour aux projets</Link><div><p className="eyebrow">Administration</p><h1>Bibliothèque générale</h1></div></header>
    <main>
      <p className="admin-templates-lead">Les assets publiés sont proposés à tous. Dépublier retire un choix des bibliothèques sans casser les projets qui conservent déjà son URL.</p>
      <GlobalEnvelopeAssetImport onPublished={(asset) => setAssets((items) => [...items.filter((item) => item.id !== asset.id), asset])} />
      <nav className="admin-asset-filters">{FILTERS.map((item) => <button className={filter === item.type ? "active" : ""} key={item.label} onClick={() => setFilter(item.type)}>{item.label}</button>)}</nav>
      {error && <div className="template-admin-message error">{error}</div>}
      <div className="admin-template-list">{visible.map((asset) => <article className={`admin-template-row admin-asset-row${isEnvelope(asset) ? " admin-envelope-row" : ""}`} key={asset.id}>
        <div className={`admin-template-thumb admin-asset-thumb ${isEnvelope(asset) ? "envelope-checkerboard" : ""}`}>{asset.type === "font" ? <FileType2 size={26} /> : asset.type === "music" ? <FileAudio size={26} /> : asset.thumbnailUrl || isEnvelope(asset) ? <img loading="lazy" src={asset.thumbnailUrl ?? asset.url} alt="" /> : <ImageIcon size={26} />}</div>
        <div className="admin-template-copy"><strong style={asset.type === "font" ? { fontFamily: String(asset.metadata.family ?? "inherit") } : undefined}>{asset.name}</strong><span>{labels[asset.type]}{asset.category ? ` · ${asset.category}` : ""} · {new Date(asset.updatedAt).toLocaleDateString("fr-FR")}</span><small>/{asset.slug}</small></div>
        <label className="admin-sort-field">Ordre<input type="number" value={asset.sortOrder} disabled={busy === asset.id} onChange={(event) => replace({ ...asset, sortOrder: Number(event.target.value) || 0 })} onBlur={() => void mutate(asset, { sortOrder: asset.sortOrder })} /></label>
        <div className="admin-template-status"><span className={asset.isPublished ? "published" : "draft"}>{asset.deletePending ? "Suppression à finaliser" : asset.isPublished ? "Publié" : "Non publié"}</span></div>
        <div className="admin-template-actions"><button title="Renommer" disabled={Boolean(busy)} onClick={() => setRename({ id: asset.id, name: asset.name })}><Pencil size={15} />{isEnvelope(asset) && "Renommer"}</button>{!isEnvelope(asset) && <button title="Modifier les métadonnées JSON" disabled={Boolean(busy)} onClick={() => { const raw = window.prompt("Métadonnées JSON", JSON.stringify(asset.metadata, null, 2)); if (raw === null) return; try { void mutate(asset, { metadata: JSON.parse(raw) as Record<string, unknown> }); } catch { setError("Les métadonnées doivent être un objet JSON valide."); } }}><SlidersHorizontal size={15} /></button>}<button title={asset.isPublished ? "Dépublier" : "Publier"} disabled={Boolean(busy)} onClick={() => void mutate(asset, { isPublished: !asset.isPublished })}>{asset.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}{isEnvelope(asset) && (asset.isPublished ? "Dépublier" : "Publier")}</button>{isEnvelope(asset) && <><button aria-label={`Monter ${asset.name}`} disabled={Boolean(busy) || sorted.filter((item) => item.type === asset.type)[0]?.id === asset.id} onClick={() => void move(asset, -1)}><ArrowUp size={15} /></button><button aria-label={`Descendre ${asset.name}`} disabled={Boolean(busy) || sorted.filter((item) => item.type === asset.type).at(-1)?.id === asset.id} onClick={() => void move(asset, 1)}><ArrowDown size={15} /></button><button title="Supprimer définitivement" disabled={Boolean(busy)} onClick={() => void inspectDelete(asset)}><Trash2 size={15} />Supprimer</button></>}</div>
      </article>)}</div>
      {rename && <form className="admin-envelope-dialog" role="dialog" aria-label="Renommer l’asset" onSubmit={(event) => { event.preventDefault(); const asset = assets.find((item) => item.id === rename.id); if (asset && rename.name.trim()) { void mutate(asset, { name: rename.name }); setRename(null); } }}><label>Nom<input autoFocus required maxLength={160} value={rename.name} onChange={(event) => setRename({ ...rename, name: event.target.value })} /></label><button type="button" onClick={() => setRename(null)}>Annuler</button><button type="submit">Enregistrer</button></form>}
      {deletion && <div className="admin-envelope-dialog" role="alertdialog" aria-label="Suppression définitive" aria-modal="false">
        <h2>{deletion.asset.name}</h2><p>Utilisé par {deletion.usage.projects} projet(s) et {deletion.usage.templates} template(s).</p>
        {deletion.usage.projects + deletion.usage.templates > 0 ? <p>Suppression interdite pour protéger ces enveloppes. Vous pouvez dépublier cet élément sans casser les projets existants.</p> : <p>Supprimer définitivement le fichier Storage et son entrée dans la bibliothèque ? Cette action est irréversible. Le serveur vérifiera à nouveau ses références.</p>}
        <button type="button" disabled={Boolean(busy)} onClick={() => setDeletion(null)}>Annuler</button>
        {deletion.asset.isPublished && <button type="button" disabled={Boolean(busy)} onClick={() => { void mutate(deletion.asset, { isPublished: false }); setDeletion(null); }}>Dépublier seulement</button>}
        {deletion.usage.projects + deletion.usage.templates === 0 && <button type="button" disabled={Boolean(busy)} onClick={() => {
          const id = deletion.asset.id; setBusy(id); setError("");
          void deleteGlobalEnvelopeAsset(id).then(() => { setAssets((items) => items.filter((item) => item.id !== id)); setDeletion(null); })
            .catch(async (cause) => { setError(remoteErrorSummary(cause)); await listAdminGlobalAssets().then(setAssets).catch(() => {}); }).finally(() => setBusy(null));
        }}>Confirmer la suppression définitive</button>}
      </div>}
      {visible.length === 0 && <div className="empty-projects"><h2>Aucun asset</h2><p>Importez un asset depuis un projet admin puis ajoutez-le à la bibliothèque générale.</p></div>}
    </main>
  </div>;
}

