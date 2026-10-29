// Entirely isolated by publication-versions.vite.mjs: no hosted requests/payment.
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import {createBlankProject} from '../src/templates/templates';import {normalizeProject} from '../src/utils/storage';import {useEditorStore} from '../src/stores/editorStore';
import {TopToolbar} from '../src/components/toolbar/TopToolbar';import {PromoCodesManager} from '../src/components/admin/PromoCodesManager';
import {setPublicationFixture} from './publication-versions.mock';import type {PromoCodeRecord} from '../src/services/promoCodeRepository';import '../src/styles.css';
const p=normalizeProject(createBlankProject())!;p.ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';p.publicationPolicy='paid_versions';p.rsvp!.enabled=false;
setPublicationFixture(p);useEditorStore.getState().setProject(p);
let records:PromoCodeRecord[]=[];
const api={list:async()=>records,save:async(id:string|null,code:string,rate:number)=>{const r={id:id??crypto.randomUUID(),code:code.trim().toUpperCase(),discount_value:rate,discount_type:'percentage' as const,is_active:true,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};records=[r,...records.filter(x=>x.id!==r.id)];return r;},deactivate:async(id:string)=>{records=records.filter(x=>x.id!==id);}};
const validate=async(code:string)=>{const r=records.find(x=>x.code===code.toUpperCase());return r?{code:r.code,discountType:'percentage' as const,discountValue:r.discount_value}:null;};
useEditorStore.setState({checkoutAndPublish:async()=>{await new Promise(resolve=>setTimeout(resolve,300));throw new Error('Échec serveur simulé : aucun droit accordé.');}});
function Fixture(){const [view,setView]=React.useState('admin');return <MemoryRouter><nav style={{padding:20}}><button onClick={()=>setView('admin')}>QA Admin</button><button onClick={()=>setView('publication')}>QA Publication</button></nav><p>Test local isolé. Aucun appel Supabase ni Stripe.</p>{view==='admin'?<PromoCodesManager api={api}/>:<TopToolbar onPreview={()=>{}} promoValidation={validate}/>}</MemoryRouter>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
