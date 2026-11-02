import {useEffect,useRef,useState} from 'react';
import {loadPartnerLedger,settlePartnerCommissions} from '../../services/partnerRepository';
import {commissionStatus,filterCommissions,partnerCommissionsCsv,regularizationDue,summarizeCommissions,type PartnerCommission} from '../../features/partners/partnerData';
import {formatPrice} from '../../config/commerce';
import {ModalLayer} from '../ui/ModalLayer';
const productionApi={load:loadPartnerLedger,settle:settlePartnerCommissions};
type Ledger=Awaited<ReturnType<typeof loadPartnerLedger>>;
const localDate=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
export function PartnerCommissionsManager({api=productionApi}:{api?:typeof productionApi}){
 const [ledger,setLedger]=useState<Ledger>({commissions:[],settlements:[],adjustments:[]});
 const [partner,setPartner]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[selected,setSelected]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [confirmation,setConfirmation]=useState<{requestId:string;rows:PartnerCommission[]}|null>(null);
 const [paidOn,setPaidOn]=useState(localDate),[reference,setReference]=useState('');const lock=useRef(false);
 useEffect(()=>{let live=true;void api.load().then(data=>{if(live)setLedger(data);}).catch(()=>{if(live)setError('Impossible de charger les commissions.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[api]);
 const rows=filterCommissions(ledger.commissions,partner,from,to),summary=summarizeCommissions(rows);
 const partners=[...new Map(ledger.commissions.map(c=>[c.partner_id,c.partner_name])).entries()];
 const chosen=rows.filter(c=>selected.includes(c.id));const selectedPartner=chosen[0]?.partner_id;
 const select=(id:string)=>setSelected(values=>values.includes(id)?values.filter(x=>x!==id):[...values,id]);
 const download=()=>{const url=URL.createObjectURL(new Blob([partnerCommissionsCsv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='commissions-partenaires.csv';a.click();URL.revokeObjectURL(url);};
 const settle=async()=>{
  if(lock.current||!confirmation)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{await api.settle(confirmation.requestId,confirmation.rows[0].partner_id,confirmation.rows.map(c=>c.id),paidOn,reference,confirmation.rows.reduce((s,c)=>s+c.commission_cents,0));setMessage('Règlement manuel enregistré. Aucun virement bancaire n’a été effectué.');setConfirmation(null);setSelected([]);setLedger(await api.load());}
  catch(cause){setError(cause instanceof Error?cause.message:'Enregistrement impossible.');}finally{lock.current=false;setBusy(false);}
 };
 return <section aria-label="Commissions partenaires"><h2>Commissions partenaires</h2>
  <p>Commissions issues des ventes confirmées. Les règlements se font hors de l’application.</p>
  <div className="partner-filters">
   <label className="field"><span>Filtrer par partenaire</span><select value={partner} onChange={e=>{setPartner(e.target.value);setSelected([]);}}><option value="">Tous les partenaires</option>{partners.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label className="field"><span>Date de vente : du</span><input type="date" value={from} onChange={e=>{setFrom(e.target.value);setSelected([]);}}/></label>
   <label className="field"><span>Au</span><input type="date" value={to} onChange={e=>{setTo(e.target.value);setSelected([]);}}/></label>
   <button disabled={loading||!rows.length} onClick={download}>Exporter les commissions CSV</button>
   <button disabled={busy||loading} onClick={()=>{setLoading(true);setError('');void api.load().then(data=>{setLedger(data);setSelected([]);}).catch(()=>setError('Actualisation impossible.')).finally(()=>setLoading(false));}}>Actualiser</button>
  </div>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {loading?<p>Chargement…</p>:<>
   <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Partenaire</th><th>Code promo</th><th>Ventes confirmées</th><th>CA encaissé</th><th>À régler</th><th>Déjà réglé</th><th>Régularisation à traiter</th><th>Actions</th></tr></thead><tbody>{summary.map(g=><tr key={`${g.partnerId}:${g.code}`}><td>{g.partner}</td><td>{g.code}</td><td>{g.sales}</td><td>{formatPrice(g.revenue)}</td><td>{formatPrice(g.payable)}</td><td>{formatPrice(g.paid)}</td><td>{formatPrice(g.regularization)}</td><td><button onClick={()=>{setPartner(g.partnerId);setSelected([]);}}>Voir les commissions</button></td></tr>)}</tbody></table></div>
   {!rows.length&&<p>Aucune commission sur cette période.</p>}
   <h3>Détail des ventes</h3>
   <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Sélection</th><th>Partenaire / code</th><th>Vente</th><th>Date</th><th>Encaissé</th><th>Base HT initiale</th><th>Taux</th><th>Commission</th><th>Statut</th><th>Régularisation</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}>
    <td><input type="checkbox" aria-label={`Sélectionner la commission ${c.id}`} checked={selected.includes(c.id)} disabled={busy||c.status!=='payable'||c.commission_cents<=0||Boolean(selectedPartner&&selectedPartner!==c.partner_id)||(!selected.includes(c.id)&&selected.length>=500)} onChange={()=>select(c.id)}/></td>
    <td>{c.partner_name}<br/>{c.promo_code}</td><td>{c.receipt_id}</td><td>{new Date(c.sale_at).toLocaleDateString('fr-FR')}</td><td>{formatPrice(c.gross_cents-c.refunded_cents)}</td><td>{c.base_cents===null?'À confirmer':formatPrice(c.base_cents)}</td><td>{c.commission_rate} %</td><td>{c.status==='pending'?'À confirmer':formatPrice(c.commission_cents)}</td><td>{commissionStatus[c.status]}</td><td>{formatPrice(regularizationDue(c))}</td>
   </tr>)}</tbody></table></div>
   <button className="primary" disabled={busy||!chosen.length} onClick={()=>{setPaidOn(localDate());setReference('');setConfirmation({requestId:crypto.randomUUID(),rows:chosen});}}>Marquer comme réglées ({chosen.length})</button>
   <h3>Historique des règlements manuels</h3>
   <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Partenaire</th><th>Date règlement</th><th>Montant</th><th>Référence</th><th>Administrateur</th><th>Enregistrement</th></tr></thead><tbody>{ledger.settlements.filter(s=>!partner||s.partner_id===partner).map(s=><tr key={s.id}><td>{partners.find(([id])=>id===s.partner_id)?.[1]??s.partner_id}</td><td>{s.paid_on}</td><td>{formatPrice(s.amount_cents)}</td><td>{s.reference??'—'}</td><td>{s.administrator_id}</td><td>{new Date(s.created_at).toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div>
   <h3>Ajustements et remboursements</h3>
   <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Commission</th><th>Événement Stripe</th><th>Date</th><th>Ajustement</th><th>Suivi</th></tr></thead><tbody>{ledger.adjustments.filter(a=>rows.some(c=>c.id===a.commission_id)).map(a=><tr key={a.id}><td>{a.commission_id}</td><td>{a.stripe_event_id}</td><td>{new Date(a.created_at).toLocaleString('fr-FR')}</td><td>{formatPrice(a.delta_cents)}</td><td>{a.requires_regularization?'Régularisation manuelle à traiter':'Ajustée avant règlement'}</td></tr>)}</tbody></table></div>
  </>}
  {confirmation&&<ModalLayer label="Confirmer le règlement manuel" busy={busy} onClose={()=>setConfirmation(null)}><div className="modal-backdrop"><section className="partner-settlement-dialog" role="region" aria-label="Détail du règlement manuel">
   <h2>Marquer comme réglées</h2><p>{confirmation.rows[0].partner_name}</p><ul>{confirmation.rows.map(c=><li key={c.id}>{c.promo_code} — {c.receipt_id} : {formatPrice(c.commission_cents)}</li>)}</ul>
   <strong>Total : {formatPrice(confirmation.rows.reduce((s,c)=>s+c.commission_cents,0))}</strong>
   <form onSubmit={e=>{e.preventDefault();void settle();}}><label className="field"><span>Date du règlement</span><input type="date" required max={localDate()} value={paidOn} disabled={busy} onChange={e=>setPaidOn(e.target.value)}/></label><label className="field"><span>Référence du virement ou de la facture (facultatif)</span><input maxLength={250} value={reference} disabled={busy} onChange={e=>setReference(e.target.value)}/></label>
    <p>Cette action enregistre un règlement déjà effectué. Elle ne déclenche aucun paiement bancaire.</p>{error&&<p role="alert">{error}</p>}
    <div className="promo-actions"><button type="button" disabled={busy} onClick={()=>setConfirmation(null)}>Annuler</button><button className="primary" disabled={busy}>{busy?'Enregistrement…':'Confirmer le règlement effectué'}</button></div>
   </form>
  </section></div></ModalLayer>}
 </section>;
}
