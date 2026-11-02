import {useRef,useState} from 'react';
import type {Partner} from '../../features/partners/partnerData';
import {validCommissionRate} from '../../features/partners/partnerData';
import {isValidDiscountValue} from '../../config/promo';
import {batchCodesCsv,normalizeBatchPrefix,type PromoBatchInput,type PromoBatchPreview,type PromoBatchResult} from '../../features/partners/promoBatchData';
import {previewPromoBatch,generatePromoBatch} from '../../services/promoBatchRepository';
export const productionBatchApi={preview:previewPromoBatch,generate:generatePromoBatch};
export function PromoBatchGenerator({partners,api=productionBatchApi,onCreated,onBusyChange}:{partners:Partner[];api?:typeof productionBatchApi;onCreated:(batch:PromoBatchResult)=>void;onBusyChange:(busy:boolean)=>void}){
 const [partnerId,setPartnerId]=useState(''),[prefix,setPrefix]=useState(''),[department,setDepartment]=useState(''),[quantity,setQuantity]=useState('10');
 const [discount,setDiscount]=useState('10'),[commission,setCommission]=useState('0'),[usage,setUsage]=useState('single'),[limit,setLimit]=useState(''),[active,setActive]=useState(true);
 const [preview,setPreview]=useState<{data:PromoBatchPreview;input:PromoBatchInput;requestId:string}|null>(null),[result,setResult]=useState<PromoBatchResult|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const lock=useRef(false);
 const changed=()=>{setPreview(null);setResult(null);setError('');setMessage('');};
 const begin=()=>{if(lock.current)return false;lock.current=true;setBusy(true);onBusyChange(true);setError('');setMessage('');return true;};
 const end=()=>{lock.current=false;setBusy(false);onBusyChange(false);};
 const prepare=async()=>{
  if(lock.current)return;
  const normalized=normalizeBatchPrefix(prefix),dept=department.trim().toUpperCase(),count=Number(quantity),maxUses=usage==='single'?1:limit.trim()?Number(limit):null;
  setError('');setResult(null);setPreview(null);
  if(!partners.some(p=>p.id===partnerId&&p.is_active)){setError('Sélectionnez un partenaire actif.');return;}
  if(!normalized||normalized.length+dept.length>62){setError('Le préfixe est vide ou trop long.');return;}
  if(!/^[A-Z0-9]{2,3}$/.test(dept)){setError('Le département doit contenir 2 ou 3 lettres ou chiffres.');return;}
  if(!quantity.trim()||!Number.isInteger(count)||count<1||count>100){setError('Le nombre de codes doit être un entier de 1 à 100.');return;}
  if(!discount.trim()||!isValidDiscountValue(Number(discount))||!commission.trim()||!validCommissionRate(Number(commission))){setError('Vérifiez les pourcentages : réduction de 1 à 100 %, commission de 0 à 100 %, deux décimales maximum.');return;}
  if(maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<1||maxUses>1000000)){setError('Vérifiez la limite d’utilisation.');return;}
  if(!begin())return;
  const input:PromoBatchInput={partnerId,prefix:normalized,department:dept,quantity:count,discountValue:Number(discount),commissionRate:Number(commission),maxUses,isActive:active};
  try{const data=await api.preview(input);setPrefix(data.prefix);setDepartment(data.department);setPreview({data,input,requestId:crypto.randomUUID()});}
  catch(cause){setError(cause instanceof Error?cause.message:'Aperçu indisponible.');}finally{end();}
 };
 const generate=async()=>{
  if(!preview||!begin())return;
  try{const saved=await api.generate(preview.input,preview.requestId);setResult(saved);setPreview(null);onCreated(saved);setMessage(`${saved.codes.length} codes enregistrés.`);}
  catch(cause){setError(cause instanceof Error?cause.message:'Génération non confirmée.');}finally{end();}
 };
 const copy=async()=>{if(!result)return;try{await navigator.clipboard.writeText(result.codes.map(c=>c.code).join('\n'));setMessage('Tous les codes du lot ont été copiés.');}catch{setError('Copie indisponible. Téléchargez le CSV.');}};
 const download=()=>{if(!result)return;try{const url=URL.createObjectURL(new Blob([batchCodesCsv(result)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`codes-promo-${result.prefix}-${result.department}.csv`;link.click();URL.revokeObjectURL(url);}catch(cause){setError(cause instanceof Error?cause.message:'Export indisponible.');}};
 const shown=preview?.data??result;
 return <section aria-label="Génération de codes en lot">
  <form className="promo-admin-form" onSubmit={e=>{e.preventDefault();void prepare();}}>
   <h2>Génération en lot</h2>
   <label className="field"><span>Partenaire du lot</span><select required value={partnerId} disabled={busy} onChange={e=>{changed();setPartnerId(e.target.value);setPrefix(normalizeBatchPrefix(partners.find(p=>p.id===e.target.value)?.name??''));}}><option value="">Sélectionner un partenaire</option>{partners.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="field"><span>Préfixe</span><input required maxLength={160} value={prefix} disabled={busy} onChange={e=>{changed();setPrefix(e.target.value);}}/><small>Majuscules, lettres sans accents et chiffres. Les espaces seront supprimés.</small></label>
   <label className="field"><span>Département</span><input required minLength={2} maxLength={3} value={department} disabled={busy} placeholder="71, 2A, 971…" onChange={e=>{changed();setDepartment(e.target.value);}}/></label>
   <label className="field"><span>Nombre de codes</span><input type="number" required min={1} max={100} step={1} value={quantity} disabled={busy} onChange={e=>{changed();setQuantity(e.target.value);}}/></label>
   <label className="field"><span>Réduction client (%)</span><input type="number" required min={1} max={100} step="0.01" value={discount} disabled={busy} onChange={e=>{changed();setDiscount(e.target.value);}}/></label>
   <label className="field"><span>Commission partenaire (%)</span><input type="number" required min={0} max={100} step="0.01" value={commission} disabled={busy} onChange={e=>{changed();setCommission(e.target.value);}}/></label>
   <label className="field"><span>Usage des codes</span><select value={usage} disabled={busy} onChange={e=>{changed();setUsage(e.target.value);}}><option value="single">Usage unique (1 utilisation maximum)</option><option value="multiple">Plusieurs utilisations</option></select></label>
   {usage==='multiple'&&<label className="field"><span>Limite par code (facultative)</span><input type="number" min={1} max={1000000} step={1} placeholder="Illimitée" value={limit} disabled={busy} onChange={e=>{changed();setLimit(e.target.value);}}/></label>}
   <label><input type="checkbox" checked={active} disabled={busy} onChange={e=>{changed();setActive(e.target.checked);}}/> Codes actifs après création</label>
   <button className="primary" disabled={busy}>{busy?'Traitement…':'Afficher l’aperçu'}</button>
  </form>
  {error&&<p className="template-admin-message error" role="alert">{error}</p>}{message&&<p className="template-admin-message" role="status">{message}</p>}
  {shown&&<section className="promo-batch-preview" aria-label={result?'Codes enregistrés':'Aperçu du lot'}>
   <h3>{shown.codes.length} codes {result?'enregistrés':'à générer'}</h3><p>{shown.partnerName} · Département {shown.department}</p>
   <p>Réduction client : {shown.discountValue} % · Commission partenaire : {shown.commissionRate} % · Limite par code : {shown.maxUses??'Illimitée'} · {shown.isActive?'Actif':'Désactivé'}</p>
   <ol className="promo-batch-code-list">{result?result.codes.map(c=><li key={c.id}><code>{c.code}</code></li>):preview?.data.codes.map(c=><li key={c}><code>{c}</code></li>)}</ol>
   {preview&&<><p>La liste définitive peut être ajustée par le serveur si d’autres codes sont créés simultanément.</p><button className="primary" disabled={busy} onClick={()=>void generate()}>{busy?'Génération…':`Générer les ${preview.input.quantity} codes`}</button></>}
   {result&&<><p>Lot : {result.batchId}</p><div className="promo-actions"><button onClick={()=>void copy()}>Copier tous les codes</button><button onClick={download}>Télécharger CSV</button></div></>}
  </section>}
 </section>;
}
