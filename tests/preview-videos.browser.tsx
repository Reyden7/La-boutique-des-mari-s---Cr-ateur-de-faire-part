import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import {HomePage} from '../src/pages/HomePage';import {AdminTemplatesPage} from '../src/pages/AdminTemplatesPage';
import {HoverVideoThumbnail} from '../src/features/previewVideos/HoverVideoThumbnail';
import {createBlankProject} from '../src/templates/templates';import {QA_OWNER,seedQa,qaCounts,setQaSlow} from './preview-videos.mock';
import '../src/styles.css';

// Media preference switches for QA only. Production reads the actual browser.
let touch=false,reduced=false;const realMatch=window.matchMedia.bind(window),listeners=new Set<()=>void>();
window.matchMedia=(query:string)=>{
  if(!query.includes('prefers-reduced-motion')&&query!=='(hover: hover) and (pointer: fine)')return realMatch(query);
  const callbacks=new Set<(event:any)=>void>();const matches=()=>query.includes('prefers-reduced-motion')?reduced:!touch;
  const notify=()=>callbacks.forEach(fn=>fn({matches:matches(),media:query}));listeners.add(notify);
  return {get matches(){return matches();},media:query,onchange:null,addListener:(fn:any)=>callbacks.add(fn),removeListener:(fn:any)=>callbacks.delete(fn),addEventListener:(_type:any,fn:any)=>callbacks.add(fn),removeEventListener:(_type:any,fn:any)=>callbacks.delete(fn),dispatchEvent:()=>true} as MediaQueryList;
};
const project=createBlankProject();project.introductionMode='none';project.opening.type='none';project.audio.enabled=project.particles.enabled=false;
const timestamp=new Date().toISOString();
const row=(id:string,name:string)=>({id,name,owner_id:QA_OWNER,project_data:{...project,id,name,ownerId:QA_OWNER},status:'draft',payment_status:'unpaid',created_at:timestamp,updated_at:timestamp,preview_video_path:null});
const templates=['Papier naturel','Jardin romantique'].map((name,i)=>({id:`eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${i}`,name,slug:`qa-${i}`,description:'Modèle de démonstration locale',category:'Élégant',tags:[],template_data:project,created_by:QA_OWNER,created_at:timestamp,updated_at:timestamp,is_published:true,is_featured:false,sort_order:i,version:1,thumbnail_url:'/assets/welcome/backgrounds/cherry-forest.png',preview_video_path:null}));
seedQa({projects:[row('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Emma & Lucas'),row('ffffffff-ffff-4fff-8fff-ffffffffffff','Notre mariage')],templates,preview_video_cleanup:[]});
async function downloadQaVideo(){
  // Synthetic visual probe, not a project/canvas recorder feature.
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=568;const ctx=canvas.getContext('2d')!;
  const stream=canvas.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks:BlobPart[]=[];
  const start=performance.now();let frame=0;
  const draw=()=>{const time=(performance.now()-start)/1000;ctx.fillStyle='#85855f';ctx.fillRect(0,0,320,568);ctx.fillStyle='#fffaf4';ctx.textAlign='center';ctx.font='italic 28px Georgia';ctx.fillText('Emma & Lucas',160+Math.sin(time*8)*12,284);ctx.font='14px Georgia';ctx.fillText('Démonstration locale',160,330);frame=requestAnimationFrame(draw);};draw();
  recorder.ondataavailable=event=>chunks.push(event.data);
  const done=new Promise<void>(resolve=>{recorder.onstop=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(track=>track.stop());const file=new Blob(chunks,{type:'video/webm'}),url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='preview-qa.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);resolve();};});
  recorder.start();setTimeout(()=>recorder.stop(),1600);await done;
}
function Fixture(){
  const [mode,setMode]=useState('home'),[manual,setManual]=useState(false),[motion,setMotion]=useState(false),[slow,setSlow]=useState(false),[counts,setCounts]=useState(qaCounts);
  return <><nav style={{padding:12,display:'flex',gap:14,flexWrap:'wrap',background:'#fffaf4',position:'relative',zIndex:90}}>
    <button onClick={()=>setMode('home')}>Galerie réelle</button><button onClick={()=>setMode('admin')}>Admin templates réel</button><button onClick={()=>void downloadQaVideo()}>Télécharger un WebM de test</button>
    <button onClick={()=>{touch=!touch;setManual(touch);listeners.forEach(fn=>fn());}}>Simuler tactile : {manual?'oui':'non'}</button>
    <button onClick={()=>{reduced=!reduced;setMotion(reduced);listeners.forEach(fn=>fn());}}>Mouvement réduit : {motion?'oui':'non'}</button>
    <button onClick={()=>{setQaSlow(!slow);setSlow(!slow);}}>URL lente : {slow?'oui':'non'}</button>
    <button onClick={()=>setCounts({...qaCounts})}>Compteurs réseau QA</button><output>{JSON.stringify(counts)}</output>
  </nav>{mode==='home'?<HomePage/>:<AdminTemplatesPage/>}
  <div style={{margin:24,width:320}}><h2>Fichier indisponible</h2><HoverVideoThumbnail videoPath='missing' alt='Erreur de chargement'><div style={{height:180,background:'#eee6d5',padding:24}}>Miniature conservée</div></HoverVideoThumbnail></div></>;
}
const root=document.getElementById('root')! as HTMLElement&{videoQaRoot?:ReturnType<typeof createRoot>};root.videoQaRoot??=createRoot(root);root.videoQaRoot.render(<BrowserRouter><Fixture/></BrowserRouter>);
