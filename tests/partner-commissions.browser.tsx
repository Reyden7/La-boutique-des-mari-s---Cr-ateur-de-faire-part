// Isolated UI fixture. All service adapters are in memory; no Supabase/Stripe call.
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {PromoCodesManager} from '../src/components/admin/PromoCodesManager';
import {PartnersManager} from '../src/components/admin/PartnersManager';
import {PartnerCommissionsManager} from '../src/components/admin/PartnerCommissionsManager';
import type {Partner,PartnerCommission,PartnerSettlement,CommissionAdjustment} from '../src/features/partners/partnerData';
import type {PromoCodeRecord} from '../src/services/promoCodeRepository';import '../src/styles.css';
let partners:Partner[]=[{id:'partner-1',name:'Vos Précieux Moments',contact_name:'Contact synthétique',professional_email:'contact@example.invalid',is_active:true,created_at:'2026-11-02T00:00:00Z'}];
let codes:PromoCodeRecord[]=[{id:'code-1',code:'VOSPRECIEUXMOMENT',discount_type:'percentage',discount_value:10,is_active:true,partner_id:'partner-1',partner_commission_rate:15,max_uses:1,confirmed_uses:0,reserved_uses:0,created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'}];
const row:PartnerCommission={id:'commission-1',receipt_id:'vente-synthetique-1',partner_id:'partner-1',partner_name:'Vos Précieux Moments',promo_code:'VOSPRECIEUXMOMENT',sale_at:'2026-11-02T10:00:00Z',gross_cents:2969,discount_cents:330,tax_cents:0,base_cents:2969,commission_rate:15,original_commission_cents:445,commission_cents:445,refunded_cents:0,status:'payable',settled_cents:0,settled_at:null,settlement_id:null};
let commissions:PartnerCommission[]=[row,{...row,id:'commission-2',receipt_id:'vente-synthetique-2',status:'paid',settled_cents:445,settled_at:'2026-11-01',settlement_id:'settlement-old',commission_cents:295,refunded_cents:1000},
 {...row,id:'commission-free',receipt_id:'vente-gratuite',gross_cents:0,discount_cents:3299,base_cents:0,commission_cents:0,original_commission_cents:0},
 {...row,id:'commission-pending',receipt_id:'vente-attente-tva',status:'pending',tax_cents:null,base_cents:null,original_commission_cents:null,commission_cents:0},
 {...row,id:'commission-canceled',receipt_id:'vente-remboursee',status:'canceled',refunded_cents:2969,commission_cents:0}];
let settlements:PartnerSettlement[]=[{id:'settlement-old',partner_id:'partner-1',amount_cents:445,paid_on:'2026-11-01',reference:'Facture synthétique 001',administrator_id:'admin-synthetique',created_at:'2026-11-01T12:00:00Z'}];
const adjustments:CommissionAdjustment[]=[{id:'adjustment-1',commission_id:'commission-2',stripe_event_id:'evt_synthetique_refund',refunded_cents:1000,previous_commission_cents:445,new_commission_cents:295,delta_cents:-150,requires_regularization:true,created_at:'2026-11-02T12:00:00Z'}];
const partnerApi={list:async()=>partners,save:async(id:string|null,name:string,contact:string,email:string,active:boolean)=>{
 const duplicate=partners.find(p=>p.name.trim().toLowerCase()===name.trim().toLowerCase());if(!id&&duplicate)return duplicate;
 const p:Partner={id:id??crypto.randomUUID(),name:name.trim(),contact_name:contact||null,professional_email:email||null,is_active:active,created_at:'2026-11-02T00:00:00Z'};partners=[p,...partners.filter(x=>x.id!==p.id)];return p;
}};
const codesApi={list:async()=>codes,save:async(id:string|null,code:string,rate:number,maxUses:number|null=null,partner?:{partner_id:string|null;partner_commission_rate:number})=>{
 const saved:PromoCodeRecord={id:id??crypto.randomUUID(),code:code.toUpperCase(),discount_type:'percentage',discount_value:rate,max_uses:maxUses,partner_id:partner?.partner_id??null,partner_commission_rate:partner?.partner_commission_rate??0,is_active:true,created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z'};codes=[saved,...codes.filter(c=>c.id!==id)];return saved;
},deactivate:async(id:string)=>{codes=codes.map(c=>c.id===id?{...c,is_active:false}:c);}};
const ledgerApi={load:async()=>({commissions,settlements,adjustments}),settle:async(requestId:string,partnerId:string,ids:string[],paidOn:string,reference:string)=>{
 const existing=settlements.find(s=>s.id===requestId);if(existing)return existing;
 const selected=commissions.filter(c=>ids.includes(c.id));if(selected.some(c=>c.status!=='payable'||c.partner_id!==partnerId||c.commission_cents<=0))throw new Error('Sélection invalide.');
 const s:PartnerSettlement={id:requestId,partner_id:partnerId,amount_cents:selected.reduce((n,c)=>n+c.commission_cents,0),paid_on:paidOn,reference:reference||null,administrator_id:'admin-synthetique',created_at:new Date().toISOString()};
 settlements=[s,...settlements];commissions=commissions.map(c=>ids.includes(c.id)?{...c,status:'paid',settled_cents:c.commission_cents,settled_at:paidOn,settlement_id:requestId}:c);return s;
}};
function Fixture(){const [view,setView]=useState('commissions');return <main className="admin-templates-page promo-admin-page"><p>Données synthétiques locales. Aucun appel Supabase, aucun paiement bancaire.</p><nav className="promo-actions"><button onClick={()=>setView('codes')}>Codes promotionnels</button><button onClick={()=>setView('partners')}>Partenaires</button><button onClick={()=>setView('commissions')}>Commissions partenaires</button></nav>{view==='codes'?<PromoCodesManager api={codesApi} partnerApi={partnerApi}/>:view==='partners'?<PartnersManager api={partnerApi}/>:<PartnerCommissionsManager api={ledgerApi}/>}</main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
