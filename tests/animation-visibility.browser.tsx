import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {PreviewMode} from '../src/components/preview/PreviewMode';import {InvitationViewer} from '../src/features/viewer/InvitationViewer';
import {createBlankProject} from '../src/templates/templates';import {makeTextElement} from '../src/stores/editorStore';
import {AnimationProperties} from '../src/components/properties/AnimationProperties';import {WelcomePageRenderer} from '../src/features/welcome/WelcomePageRenderer';
import type {WeddingProject,OpeningAnimationType,AnimationConfig} from '../src/types/editor';import '../src/styles.css';
import {normalizeProject} from '../src/utils/storage';
import {useViewerViewport} from '../src/features/viewer/useViewerViewport';import {InvitationExperience} from '../src/features/music/InvitationExperience';

// Fixture-only preference simulation; production reads the actual media query.
if(new URLSearchParams(location.search).has('reduced')){const actualMatch=window.matchMedia.bind(window);window.matchMedia=query=>query==='(prefers-reduced-motion)'||query==='(prefers-reduced-motion: reduce)'?{matches:true,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;},onchange:null}:actualMatch(query);}

const project=normalizeProject(createBlankProject())!;project.id='animation-qa';project.audio.enabled=project.particles.enabled=false;project.rsvp!.enabled=false;
const text=(id:string,y:number,type:AnimationConfig['type'],label:string)=>({...makeTextElement(),id,y,x:25,width:340,height:85,text:label,fontFamily:'Georgia',fontSize:30,color:'#414333',opacity:.65,rotation:3,animation:{type,duration:.8,delay:99},responsive:{tablet:{x:45,y:y*1.3,width:650,height:100,fontSize:38},desktop:{x:80,y:y*1.5,width:900,height:110,fontSize:42}}});
project.pages[0].elements=[text('initial-fade',50,'fade','Première section — Fondu'),text('initial-type',160,'typewriter','Emma & Lucas'),text('initial-curve',280,'handwriting','Save the date'),
  {id:'section',type:'section',name:'Section animée',x:0,y:950,width:390,height:2000,zIndex:0,visible:true,locked:false,rotation:0,opacity:.5,padding:0,cornerRadius:0,background:{type:'color',color:'#ebe6d9'},animation:{type:'fade',duration:.8},responsive:{tablet:{x:0,y:1235,width:768,height:2600},desktop:{x:0,y:1425,width:1280,height:3000}}},
  {...text('later-text',1040,'handwriting','Section suivante — Écriture'),sectionId:'section',responsive:{tablet:{x:45,y:1352,width:650,height:100,fontSize:38,sectionId:'section'},desktop:{x:80,y:1560,width:900,height:110,fontSize:42,sectionId:'section'}}},
  {...text('far-text',2200,'word-by-word','Encore plus bas — Mot par mot'),sectionId:'section',responsive:{tablet:{x:45,y:2860,width:650,height:100,fontSize:38,sectionId:'section'},desktop:{x:80,y:3300,width:900,height:110,fontSize:42,sectionId:'section'}}},
] as WeddingProject['pages'][number]['elements'];
const curved=project.pages[0].elements[2];if(curved.type==='text'){curved.curve={enabled:true,amount:50,direction:'up'};curved.height=120;}
project.pages[0].height=3000;project.pages[0].background={type:'color',color:'#fffaf4'};
function Fixture(){const [opening,setOpening]=useState<OpeningAnimationType>('none'),[version,setVersion]=useState(0),[view,setView]=useState<'menu'|'preview'|'public'|'editor'>('menu'),[animation,setAnimation]=useState<AnimationConfig>({type:'typewriter',duration:.8});const {immersive}=useViewerViewport();
  const current={...project,introductionMode:opening==='none'?'none':'classic',opening:{...project.opening,type:opening,duration:1.5,customSettings:{...project.opening.customSettings,mobilePngDuration:1.5,landscapePngDuration:1.5}}} as WeddingProject;
  if(view==='preview')return <PreviewMode key={version} project={current} device="mobile" allowDeviceSwitching onClose={()=>setView('menu')}/>;
  const publicReturn=<button style={{position:'fixed',top:8,right:8,zIndex:3000}} onClick={()=>setView('menu')}>Retour QA</button>;
  if(view==='public')return immersive?<InvitationViewer key={version} project={current} mode="public" controls={publicReturn}/>:<main className="public-invite"><InvitationExperience key={version} project={current}/>{publicReturn}</main>;
  return <main style={{padding:24}}><h1>Déclenchement animations — QA locale</h1><p>Vrais renderers, document en mémoire, aucun compte ni appel distant. Ancien délai de 99 s dans les exemples.</p>
    <label>Introduction<select value={opening} onChange={e=>setOpening(e.target.value as OpeningAnimationType)}><option value="none">Aucune</option><option value="envelope">Enveloppe</option><option value="doors">Porte</option></select></label>
    <button onClick={()=>{setVersion(v=>v+1);setView('preview');}}>Ouvrir Aperçu</button><button onClick={()=>{setVersion(v=>v+1);setView('public');}}>Ouvrir Public local</button><button onClick={()=>setView(view==='editor'?'menu':'editor')}>État final Editor</button><button onClick={()=>{location.search=location.search?'':'?reduced=1';}}>Basculer mouvement réduit QA</button>
    <section style={{maxWidth:400,marginTop:24}}><h2>Propriétés Animation</h2><AnimationProperties animation={animation} text onChange={setAnimation}/></section>
    {view==='editor'&&<div style={{position:'relative',width:390,height:844,transform:'translateZ(0)',overflow:'hidden'}}><WelcomePageRenderer interactive={false} config={{...project.welcomePage!,elements:project.pages[0].elements.slice(0,3)}} device="mobile"/></div>}
  </main>;
}
const root=document.getElementById('root')! as HTMLElement&{animationQaRoot?:ReturnType<typeof createRoot>};
root.animationQaRoot??=createRoot(root);root.animationQaRoot.render(<Fixture/>);
