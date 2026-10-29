import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import {createBlankProject} from '../src/templates/templates';import {normalizeProject} from '../src/utils/storage';import {useEditorStore} from '../src/stores/editorStore';
import {TopToolbar} from '../src/components/toolbar/TopToolbar';import {PreviewMode} from '../src/components/preview/PreviewMode';
import {setPublicationFixture} from './publication-versions.mock';import type {WeddingProject} from '../src/types/editor';import '../src/styles.css';
const base=normalizeProject(createBlankProject())!;base.ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';base.introductionMode='none';base.rsvp!.enabled=true;
function phase(kind:'draft'|'published'|'revision'|'legacy'){
 const p:WeddingProject={...structuredClone(base),name:'Mariage — QA synthétique',publicationPolicy:kind==='legacy'?'legacy':'paid_versions',status:kind==='draft'?'draft':'published',paymentStatus:kind==='draft'?'unpaid':'paid',publicId:kind==='draft'?undefined:'synthetic-public',activeVersionId:kind==='draft'?undefined:'synthetic-version-1',activeVersionNumber:kind==='draft'?0:1,hasVersionDraft:kind==='revision',purchasedGuestCapacity:kind==='draft'?undefined:50};p.rsvp!.purchased=kind!=='draft';setPublicationFixture(p);useEditorStore.getState().setProject(p);
}
phase('draft');
function Fixture(){const [preview,setPreview]=React.useState(false);const p=useEditorStore(state=>state.project)!;
 return <div className="published-design-view"><nav style={{padding:16,display:'flex',gap:12,flexWrap:'wrap'}} aria-label="Scénarios locaux"><button onClick={()=>phase('draft')}>Premier brouillon</button><button onClick={()=>phase('published')}>Version publiée</button><button onClick={()=>phase('revision')}>Nouvelle version</button><button onClick={()=>phase('legacy')}>Client historique</button></nav><TopToolbar key={`${p.id}-${p.publicationPolicy}-${p.activeVersionId}`} onPreview={()=>setPreview(true)}/><main style={{padding:24}}><h1>Validation locale des versions payantes</h1><p>Aucun serveur Supabase ni paiement Stripe n’est utilisé dans cette page de test.</p><p>Version : {p.activeVersionNumber??0} · Brouillon : {p.hasVersionDraft?'oui':'non'} · Conditions : {p.publicationPolicy}</p></main>{preview&&<PreviewMode project={p} device="mobile" allowDeviceSwitching onClose={()=>setPreview(false)}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Fixture/></BrowserRouter>);
