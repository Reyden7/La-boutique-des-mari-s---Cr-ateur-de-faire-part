import {useEffect,useRef,useState} from 'react';
import {listPartners,savePartner} from '../../services/partnerRepository';
import type {Partner} from '../../features/partners/partnerData';
const productionApi={list:listPartners,save:savePartner};
export function PartnersManager({api=productionApi}:{api?:typeof productionApi}){
 const [partners,setPartners]=useState<Partner[]>([]),[editing,setEditing]=useState<Partner|null>(null);
 const [name,setName]=useState(''),[contact,setContact]=useState(''),[email,setEmail]=useState(''),[active,setActive]=useState(true);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');const lock=useRef(false);
 useEffect(()=>{let live=true;void api.list().then(rows=>{if(live)setPartners(rows);}).catch(()=>{if(live)setError('Impossible de charger les partenaires.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[api]);
 const clear=()=>{setEditing(null);setName('');setContact('');setEmail('');setActive(true);};
 const save=async()=>{
  if(lock.current)return;setError('');setMessage('');if(!name.trim()){setError('Indiquez un nom commercial.');return;}lock.current=true;setBusy(true);
  try{const row=await api.save(editing?.id??null,name,contact,email,active);setPartners(rows=>[row,...rows.filter(p=>p.id!==row.id)].sort((a,b)=>a.name.localeCompare(b.name)));clear();setMessage('Partenaire enregistré.');}
  catch(cause){setError(cause instanceof Error?cause.message:'Enregistrement impossible.');}finally{lock.current=false;setBusy(false);}
 };
 return <section aria-label="Gestion des partenaires"><h2>Partenaires</h2>
  <form className="promo-admin-form" onSubmit={e=>{e.preventDefault();void save();}}>
   <h3>{editing?'Modifier le partenaire':'Nouveau partenaire'}</h3>
   <label className="field"><span>Nom commercial</span><input value={name} maxLength={160} required disabled={busy||loading} onChange={e=>setName(e.target.value)}/></label>
   <label className="field"><span>Nom du contact (facultatif)</span><input value={contact} maxLength={160} disabled={busy||loading} onChange={e=>setContact(e.target.value)}/></label>
   <label className="field"><span>Email professionnel (facultatif)</span><input type="email" value={email} maxLength={254} disabled={busy||loading} onChange={e=>setEmail(e.target.value)}/></label>
   <label><input type="checkbox" checked={active} disabled={busy||loading} onChange={e=>setActive(e.target.checked)}/> Partenaire actif</label>
   <div className="promo-actions"><button className="primary" disabled={busy||loading}>Enregistrer le partenaire</button>{editing&&<button type="button" disabled={busy} onClick={clear}>Annuler</button>}</div>
  </form>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <p>Un partenaire inactif ne reçoit aucune nouvelle attribution. Les commissions et réservations déjà attribuées sont conservées.</p>
  <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Partenaire</th><th>Contact</th><th>Email professionnel</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{partners.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.contact_name??'—'}</td><td>{p.professional_email??'—'}</td><td>{p.is_active?'Actif':'Inactif'}</td><td><button disabled={busy} onClick={()=>{setEditing(p);setName(p.name);setContact(p.contact_name??'');setEmail(p.professional_email??'');setActive(p.is_active);setError('');setMessage('');}}>Modifier {p.name}</button></td></tr>)}</tbody></table></div>
 </section>;
}
