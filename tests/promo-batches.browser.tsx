// UI fixture only. All adapters are synthetic, no Supabase or Stripe request.
import React from 'react';import {createRoot} from 'react-dom/client';
import {PromoCodesManager} from '../src/components/admin/PromoCodesManager';
import type {PromoCodeRecord} from '../src/services/promoCodeRepository';
import {normalizeBatchPrefix,type PromoBatchInput,type PromoBatchResult} from '../src/features/partners/promoBatchData';
import type {Partner} from '../src/features/partners/partnerData';import '../src/styles.css';
const partners:Partner[]=[{id:'partner-wp',name:'Vos Précieux Moments',contact_name:null,professional_email:null,is_active:true,created_at:'2026-11-02'},
 {id:'partner-other',name:'Autre partenaire',contact_name:null,professional_email:null,is_active:true,created_at:'2026-11-02'}];
let codes:PromoCodeRecord[]=[{id:'historical',code:'HISTORIQUE',discount_type:'percentage',discount_value:10,is_active:false,created_at:'2026-10-01',updated_at:'2026-10-01'}];
const requests=new Map<string,PromoBatchResult>();
const normalized=(p:PromoBatchInput)=>({...p,prefix:normalizeBatchPrefix(p.prefix),department:p.department.toUpperCase(),partnerName:partners.find(x=>x.id===p.partnerId)!.name});
const next=(p:PromoBatchInput)=>1+Math.max(0,...codes.map(c=>c.code.startsWith(p.prefix+p.department)?Number(c.code.slice((p.prefix+p.department).length))||0:0));
const preview=(p:PromoBatchInput)=>{const data=normalized(p),n=next(data);return {...data,codes:Array.from({length:p.quantity},(_,i)=>data.prefix+data.department+String(n+i).padStart(2,'0'))};};
const batchApi={preview:async(p:PromoBatchInput)=>preview(p),generate:async(p:PromoBatchInput,id:string)=>{
 const old=requests.get(id);if(old)return old;
 // Synthetic concurrent manual insertion makes the saved list differ from the preview.
 const first=preview(p);codes.push({id:'manual-race-'+id,code:first.codes[0],discount_type:'percentage',discount_value:10,is_active:true,created_at:'2026-11-02',updated_at:'2026-11-02'});
 const data=preview(p),saved:PromoCodeRecord[]=data.codes.map((code,i)=>({id:crypto.randomUUID(),code,discount_type:'percentage',discount_value:p.discountValue,partner_id:p.partnerId,partner_commission_rate:p.commissionRate,max_uses:p.maxUses,is_active:p.isActive,batch_id:id,batch_prefix:data.prefix,department:data.department,batch_number:next(data)+i,created_at:'2026-11-02',updated_at:'2026-11-02'}));
 codes.push(...saved);const result={...normalized(p),batchId:id,codes:saved};requests.set(id,result);return result;
}};
const manualApi={list:async()=>[...codes],save:async(id:string|null,code:string,rate:number,maxUses:number|null=null,partner?:{partner_id:string|null;partner_commission_rate:number})=>{
 const saved:PromoCodeRecord={id:id??crypto.randomUUID(),code:code.toUpperCase(),discount_type:'percentage',discount_value:rate,max_uses:maxUses,partner_id:partner?.partner_id??null,partner_commission_rate:partner?.partner_commission_rate??0,is_active:true,created_at:'2026-11-02',updated_at:'2026-11-02'};codes=[saved,...codes.filter(c=>c.id!==id)];return saved;
},deactivate:async(id:string)=>{codes=codes.map(c=>c.id===id?{...c,is_active:false}:c);}};
const partnerApi={list:async()=>partners,save:async()=>{throw new Error('Création partenaire hors de cette fixture.');}};
createRoot(document.getElementById('root')!).render(<main className="admin-templates-page promo-admin-page"><p>Données synthétiques locales uniquement. Aucun accès Supabase ni paiement Stripe.</p><PromoCodesManager api={manualApi} partnerApi={partnerApi} batchApi={batchApi}/></main>);
