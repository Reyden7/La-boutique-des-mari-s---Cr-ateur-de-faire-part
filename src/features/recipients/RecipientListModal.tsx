import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WeddingProject } from "../../types/editor";
import { isDiscoveryProject, useDiscoverySession } from "../discovery/discoverySession";
import { saveRemoteProject } from "../../services/projectRepository";
import { loadInvitationRecipients, saveInvitationRecipients } from "../../services/recipientRepository";
import { csvCell, parseRecipientCsv, recipientNameKey, recipientTotals, recipientUrl, validateRecipientRows, type InvitationRecipient } from "./recipientData";
import { setRecipientList, useRecipientLists } from "./recipientStore";
import "./recipients.css";

export const recipientListKey = (project: WeddingProject) => `${project.ownerId ?? "guest"}:${project.id}`;
export function RecipientListModal({ project, onClose }: { project: WeddingProject; onClose: () => void }) {
  const key = recipientListKey(project), guest = isDiscoveryProject(project);
  const entry = useRecipientLists(state => state.lists[key]);
  const [loaded, setLoaded] = useState(guest), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [count, setCount] = useState("1"), [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState(""), [preview, setPreview] = useState<ReturnType<typeof validateRecipientRows> | null>(null), [replace, setReplace] = useState(false), [acceptDuplicates, setAcceptDuplicates] = useState(false);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement>(null), file = useRef<HTMLInputElement>(null);
  const rows = entry?.recipients ?? [], totals = recipientTotals(rows);
  useEffect(() => {
    let active = true;
    if (guest) return;
    setLoaded(false);
    void (project.activeVersionId ? Promise.resolve() : saveRemoteProject(project)).then(() => loadInvitationRecipients(project.id)).then(value => { if (active) { setRecipientList(key,value); setLoaded(true); } }).catch(cause => { if (active) setError(cause.message ?? "Chargement impossible."); });
    return () => { active = false; };
  }, [key, guest]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]') ?? [])].filter(node => node.getClientRects().length);
        const first=controls[0], last=controls.at(-1);
        if (event.shiftKey && document.activeElement===first) { event.preventDefault();last?.focus(); }
        else if (!event.shiftKey && document.activeElement===last) { event.preventDefault();first?.focus(); }
      }
    };
    document.addEventListener("keydown",keys,true);
    return () => { document.removeEventListener("keydown",keys,true); previous?.focus(); };
  }, [busy, onClose]);
  const persist = async (next: InvitationRecipient[]) => {
    if (!loaded || busy || useDiscoverySession.getState().converting) return;
    if (recipientTotals(next).guests>100000 || next.length>10000) { setError("Maximum : 10 000 foyers et 100 000 personnes."); return; }
    setBusy(true); setError("");
    try {
      const value = guest ? {revision:(entry?.revision??0)+1,recipients:next} : await saveInvitationRecipients(project.id,entry?.revision??0,next);
      setRecipientList(key,value); setPreview(null); setName(""); setCount("1");setEditing(null);
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  };
  const importFile = async (selected?: File) => {
    if (!selected) return; setError("");setPreview(null);setBusy(true);setAcceptDuplicates(false);
    try {
      if (selected.size>5*1024*1024) throw new Error("Le fichier doit peser moins de 5 Mo.");
      let data: unknown[][];
      if (/\.csv$/i.test(selected.name)) {
        const bytes=await selected.arrayBuffer();let text=new TextDecoder("utf-8").decode(bytes);
        if (text.includes("\uFFFD")) text=new TextDecoder("windows-1252").decode(bytes);
        data=parseRecipientCsv(text);
      } else if (/\.xlsx$/i.test(selected.name)) { const {readSheet}=await import("read-excel-file/browser");data=await readSheet(selected); }
      else throw new Error("Choisissez un CSV ou XLSX. Convertissez les anciens fichiers XLS en XLSX.");
      setPreview(validateRecipientRows(data));setReplace(false);
    } catch(cause) { setError(cause instanceof Error?cause.message:"Fichier illisible."); } finally { setBusy(false); }
  };
  const duplicateExisting = preview && !replace ? preview.recipients.filter(row => rows.some(existing => existing.is_active && recipientNameKey(existing.display_name)===recipientNameKey(row.display_name))) : [];
  const duplicateCount=(preview?.duplicates.length??0)+(duplicateExisting?.length??0);
  const downloadLinks = () => {
    const csv=[["Destinataire","Personnes","Lien"],...rows.filter(row=>row.is_active&&row.public_token).map(row=>[row.display_name,row.guest_count,recipientUrl(location.origin,project.publicId!,row.public_token!)])].map(row=>row.map(csvCell).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download="liens-invites.csv";anchor.click();URL.revokeObjectURL(url);
  };
  return createPortal(<div className="modal-backdrop recipient-backdrop"><section className="recipient-modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby="recipient-title">
    <header><div><h2 id="recipient-title">Liste des invités</h2><p>Préparez les familles et les personnes qui recevront votre faire-part. Chaque destinataire disposera de son propre lien après publication.</p></div><button onClick={onClose} disabled={busy}>Fermer</button></header>
    {guest && <p className="recipient-warning">Mode découverte — cette liste reste uniquement en mémoire. Elle sera perdue si vous quittez le site. Créez un compte pour la sauvegarder.</p>}
    {project.publicId && <section><h3>Liens de vos invités</h3><p>Ces liens sont confidentiels. Toute personne possédant un lien peut consulter l’invitation et la réponse du foyer associé, et la modifier si vous l’autorisez. Un lien peut être transféré : il ne bloque pas le partage.</p></section>}
    <div className="recipient-import"><button disabled={!loaded||busy} onClick={()=>file.current?.click()}>Importer Excel / CSV</button><a href="/models/liste-invites.xlsx" download>Télécharger un modèle Excel</a><input ref={file} hidden type="file" accept=".xlsx,.csv" onChange={event=>{void importFile(event.target.files?.[0]);event.currentTarget.value="";}} /></div>
    {error && <p role="alert" className="form-error">{error}</p>}{notice&&<p role="status">{notice}</p>}{!loaded&&!error&&<p>Chargement de votre liste…</p>}
    <form className="recipient-add" onSubmit={event=>{event.preventDefault();const number=Number(count);if(!name.trim()||!Number.isInteger(number)||number<1||number>100000)return;
      if(!editing&&rows.some(row=>row.is_active&&recipientNameKey(row.display_name)===recipientNameKey(name))&&!confirm("Un destinataire porte déjà ce nom. Ajouter tout de même ?"))return;
      const item={id:editing??crypto.randomUUID(),display_name:name.trim(),guest_count:number,is_active:true};void persist(editing?rows.map(row=>row.id===editing?{...row,...item}:row):[...rows,item]);}}>
      <label>Nom du destinataire / famille<input required maxLength={200} value={name} disabled={busy||!loaded} onChange={event=>setName(event.target.value)} placeholder="Famille Martin" /></label>
      <label>Nombre de personnes invitées<input required type="number" min={1} max={100000} step={1} value={count} disabled={busy||!loaded} onChange={event=>setCount(event.target.value)} /></label>
      <button disabled={busy||!loaded}>{editing?"Enregistrer la modification":"+ Ajouter à la liste"}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setName("");setCount("1");}}>Annuler</button>}
    </form>
    {preview && <section className="recipient-import-preview"><h3>Prévisualisation de l’import</h3><p>{preview.recipients.length} destinataires · {recipientTotals(preview.recipients).guests} personnes</p>{preview.errors.map(error=><p className="form-error" key={error}>{error}</p>)}<div className="recipient-table-wrap"><table><thead><tr><th>Destinataire</th><th>Personnes</th></tr></thead><tbody>{preview.recipients.slice(0,100).map(row=><tr key={row.id}><td>{row.display_name}</td><td>{row.guest_count}</td></tr>)}</tbody></table></div>{preview.recipients.length>100&&<p>100 premières lignes affichées, toutes les lignes seront importées.</p>}
      <label>Mode d’import<select value={replace?"replace":"append"} onChange={event=>{setReplace(event.target.value==="replace");setAcceptDuplicates(false);}}><option value="append">Ajouter à la liste existante</option><option value="replace">Remplacer la liste existante</option></select></label>
      {duplicateCount>0&&<div><p>{duplicateCount} doublon(s) potentiel(s) : {[...preview.duplicates,...(duplicateExisting??[]).map(row=>row.display_name)].join(" ; ")}</p><label><input type="checkbox" checked={acceptDuplicates} onChange={event=>setAcceptDuplicates(event.target.checked)}/> Conserver ces destinataires malgré les noms identiques</label></div>}
      <button disabled={busy||preview.errors.length>0||!preview.recipients.length||(duplicateCount>0&&!acceptDuplicates)} onClick={()=>{if(replace&&!confirm("Remplacer la liste ? Les anciens liens seront désactivés ; leurs réponses seront conservées."))return;void persist(replace?[...rows.map(row=>({...row,is_active:false})),...preview.recipients]:[...rows,...preview.recipients]);}}>Confirmer l’import</button><button onClick={()=>setPreview(null)}>Annuler l’import</button></section>}
    <label>Rechercher un destinataire<input value={search} onChange={event=>setSearch(event.target.value)} /></label>
    <div className="recipient-table-wrap"><table><thead><tr><th>Destinataire</th><th>Personnes</th><th>Actions</th></tr></thead><tbody>{rows.filter(row=>row.is_active&&recipientNameKey(row.display_name).includes(recipientNameKey(search))).map(row=><tr key={row.id}><td>{row.display_name}</td><td>{row.guest_count}</td><td><button disabled={busy} onClick={()=>{setEditing(row.id);setName(row.display_name);setCount(String(row.guest_count));}}>Modifier</button><button disabled={busy} onClick={()=>{if(confirm(`Retirer ${row.display_name} ? Son lien sera désactivé, ses réponses conservées.`))void persist(rows.map(item=>item.id===row.id?{...item,is_active:false}:item));}}>Supprimer</button>
      {project.publicId&&row.public_token&&<button onClick={()=>void navigator.clipboard.writeText(recipientUrl(location.origin,project.publicId!,row.public_token!)).then(()=>setNotice("Lien copié.")).catch(()=>setError("Copie indisponible."))}>Copier le lien</button>}
      {project.paymentStatus==="paid"&&(!row.public_token||(row.allocated_guest_count??0)<row.guest_count)&&<small>Places supplémentaires en attente d’upgrade</small>}</td></tr>)}</tbody></table></div>
    <footer><strong>Nombre de destinataires : {totals.households}</strong><strong>Nombre total d’invités : {totals.guests}</strong>{project.purchasedGuestCapacity!=null&&<span>Capacité achetée : {project.purchasedGuestCapacity}{totals.guests>project.purchasedGuestCapacity?` · ${totals.guests-project.purchasedGuestCapacity} place(s) à régler via Publier / Capacité`:""}</span>}{project.publicId&&<button onClick={downloadLinks}>Exporter les liens en CSV</button>}</footer>
  </section></div>,document.body);
}
