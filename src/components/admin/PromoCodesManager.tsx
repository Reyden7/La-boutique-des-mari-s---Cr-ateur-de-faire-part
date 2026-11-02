import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { deactivatePromoCode, listPromoCodes, savePromoCode, type PromoCodeRecord } from "../../services/promoCodeRepository";
import { isValidDiscountValue, normalizePromoCode } from "../../config/promo";
import {listPartners,savePartner} from '../../services/partnerRepository';
import {validCommissionRate,type Partner} from '../../features/partners/partnerData';

const productionApi = { list: listPromoCodes, save: savePromoCode, deactivate: deactivatePromoCode };
const productionPartnerApi={list:listPartners,save:savePartner};
export function PromoCodesManager({ api = productionApi,partnerApi }: { api?: typeof productionApi;partnerApi?:typeof productionPartnerApi }) {
  const partnerService=partnerApi??(api===productionApi?productionPartnerApi:undefined);
  const [partners,setPartners]=useState<Partner[]>([]);
  const [partnerId,setPartnerId]=useState('');const [partnerName,setPartnerName]=useState('');const [commissionRate,setCommissionRate]=useState('0');
  const [codes, setCodes] = useState<PromoCodeRecord[]>([]);
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [usage, setUsage] = useState("multiple");
  const [limit, setLimit] = useState("");
  const [editing, setEditing] = useState<PromoCodeRecord | null>(null);
  const [deleting, setDeleting] = useState<PromoCodeRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(()=>{let active=true;if(partnerService)void partnerService.list().then(rows=>{if(active)setPartners(rows);}).catch(()=>{if(active)setError('Impossible de charger les partenaires.');});return()=>{active=false;};},[partnerService]);
  useEffect(() => {
    let active = true;
    void api.list().then((rows) => { if (active) setCodes(rows); }).catch(() => { if (active) setError("Impossible de charger les codes promos."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);
  const clear = () => { setEditing(null); setCode(""); setRate(""); setUsage("multiple");setLimit("");setPartnerId('');setPartnerName('');setCommissionRate('0'); };
  const save = async () => {
    if (lock.current) return;
    setError(""); setMessage("");
    if (!normalizePromoCode(code) || code.trim().length > 64) { setError("Indiquez un code de 1 à 64 caractères."); return; }
    if (!rate.trim() || !isValidDiscountValue(Number(rate))) { setError("La réduction doit être comprise entre 1 et 100 %, avec deux décimales maximum."); return; }
    const maxUses=usage==="single"?1:limit.trim()?Number(limit):null;
    if(maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1||maxUses>1000000)){setError("La limite doit être un entier entre 1 et 1 000 000.");return;}
    if(partnerId&&(!commissionRate.trim()||!validCommissionRate(Number(commissionRate)))){setError('La commission doit être comprise entre 0 et 100 %, avec deux décimales maximum.');return;}
    if(partnerId==='new'&&!partnerName.trim()){setError('Indiquez le nom du partenaire.');return;}
    lock.current = true; setBusy(true);
    try {
      let assignedId=partnerId;
      if(partnerId==='new'){
        if(!partnerService)throw new Error('Gestion des partenaires indisponible.');
        const created=await partnerService.save(null,partnerName,'','',true);assignedId=created.id;setPartnerId(created.id);setPartners(rows=>[...rows.filter(p=>p.id!==created.id),created]);
      }
      const saved = await api.save(editing?.id ?? null, code, Number(rate),maxUses,{partner_id:assignedId||null,partner_commission_rate:assignedId?Number(commissionRate):0});
      setCodes((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setMessage(editing ? "Code promo modifié." : "Code promo ajouté."); clear();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (lock.current || !deleting) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await api.deactivate(deleting.id);
      setCodes((rows) => rows.map((row) => row.id===deleting.id?{...row,is_active:false}:row));
      if (editing?.id === deleting.id) clear();
      setDeleting(null); setMessage("Code promo désactivé.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suppression impossible."); }
    finally { lock.current = false; setBusy(false); }
  };
  const select = (row: PromoCodeRecord) => { if (busy || deleting || !row.is_active) return; setEditing(row); setCode(row.code); setRate(String(row.discount_value));setUsage(row.max_uses===1?"single":"multiple");setLimit(row.max_uses&&row.max_uses!==1?String(row.max_uses):"");setPartnerId(row.partner_id??'');setCommissionRate(String(row.partner_commission_rate??0)); setError(""); setMessage(""); };
  return <>
    <form className="promo-admin-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h2>{editing ? `Modification du code : ${editing.code}` : "Nouveau code promo"}</h2>
      <label className="field"><span>Code promo</span><input maxLength={64} value={code} disabled={busy || loading} onChange={(event) => setCode(event.target.value)} placeholder="INFLUENCEUR10" /></label>
      <label className="field"><span>Réduction (%)</span><input type="number" min="1" max="100" step="0.01" value={rate} disabled={busy || loading} onChange={(event) => setRate(event.target.value)} placeholder="10" /></label>
      <label className="field"><span>Partenaire</span><select value={partnerId} disabled={busy||loading} onChange={event=>{setPartnerId(event.target.value);if(!event.target.value)setCommissionRate('0');}}><option value="">Aucun partenaire</option>{partners.filter(p=>p.is_active||p.id===partnerId).map(p=><option key={p.id} value={p.id}>{p.name}{p.is_active?'':' (inactif)'}</option>)}{partnerService&&<option value="new">Nouveau partenaire…</option>}</select></label>
      {partnerId==='new'&&<label className="field"><span>Nom du partenaire</span><input maxLength={160} value={partnerName} disabled={busy} onChange={e=>setPartnerName(e.target.value)}/></label>}
      <label className="field"><span>Commission partenaire (%)</span><input type="number" min="0" max="100" step="0.01" value={commissionRate} disabled={busy||loading||!partnerId} onChange={e=>setCommissionRate(e.target.value)}/></label>
      <p>La commission partenaire est indépendante de la réduction client. Sans partenaire : 0 %.</p>
      <label className="field"><span>Limite d’utilisation</span><select value={usage} disabled={busy||loading} onChange={event=>setUsage(event.target.value)}><option value="single">Usage unique (1 utilisation maximum)</option><option value="multiple">Plusieurs utilisations</option></select></label>
      {usage==="multiple"&&<label className="field"><span>Nombre maximal d’utilisations (facultatif)</span><input type="number" min="1" max="1000000" step="1" placeholder="Illimité" value={limit} disabled={busy||loading} onChange={event=>setLimit(event.target.value)}/></label>}
      <div className="promo-actions"><button className="primary" disabled={busy || loading} type="submit">{busy ? "Enregistrement…" : editing ? "Modifier le code" : "Ajouter le code"}</button>{editing && <button disabled={busy} type="button" onClick={() => { clear(); setError(""); setMessage(""); }}>Annuler</button>}</div>
    </form>
    {message && <p className="template-admin-message" role="status">{message}</p>}
    {error && <p className="template-admin-message error" role="alert">{error}</p>}
    <h2>Historique des codes promos</h2>
    {loading ? <p>Chargement…</p> : <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Code</th><th>Réduction</th><th>Partenaire</th><th>Commission partenaire</th><th>Limite</th><th>Utilisations confirmées</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{codes.map((row) => <tr key={row.id} onClick={() => select(row)} className={editing?.id === row.id ? "selected" : ""}>
      <td><button disabled={busy || Boolean(deleting)} onClick={() => select(row)}>{row.code}</button></td><td><button disabled={busy || Boolean(deleting)} aria-label={`Modifier ${row.code}`} onClick={() => select(row)}>{row.discount_value} %</button></td>
      <td>{row.partner_id?(partners.find(p=>p.id===row.partner_id)?.name??'Partenaire associé'):'—'}</td><td>{row.partner_commission_rate??0} %</td>
      <td>{row.max_uses??"Illimitée"}</td><td>{row.confirmed_uses??0} / {row.max_uses??"∞"} utilisation{row.max_uses===1?"":"s"}</td><td>{!row.is_active?"Désactivé":row.max_uses!=null&&(row.confirmed_uses??0)>=row.max_uses?"Utilisé":row.max_uses!=null&&(row.confirmed_uses??0)+(row.reserved_uses??0)>=row.max_uses?"Réservé":"Disponible"}</td>
      <td><button disabled={busy||!row.is_active} aria-label={`Supprimer ${row.code}`} onClick={(event) => { event.stopPropagation(); setDeleting(row); }}><Trash2 size={17} /></button></td>
    </tr>)}</tbody></table>{!codes.length && <p>Aucun code promo actif.</p>}</div>}
    {deleting && <div className="modal-backdrop" onMouseDown={() => { if (!busy) setDeleting(null); }}><section className="promo-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="promo-delete-title" onMouseDown={(event) => event.stopPropagation()}>
      <h2 id="promo-delete-title">Supprimer le code promo « {deleting.code} » ?</h2><p>Le code sera désactivé. L’historique des paiements restera intact.</p>
      <div className="promo-actions"><button autoFocus disabled={busy} onClick={() => setDeleting(null)}>Annuler</button><button className="primary" disabled={busy} onClick={() => void remove()}>{busy ? "Suppression…" : "Supprimer"}</button></div>
    </section></div>}
  </>;
}
