import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import {RecipientListModal} from '../src/features/recipients/RecipientListModal';
import {useRecipientLists} from '../src/features/recipients/recipientStore';
import {recipientTotals} from '../src/features/recipients/recipientData';
import {beginDiscoverySession} from '../src/features/discovery/discoverySession';
import {createBlankProject} from '../src/templates/templates';import {normalizeProject} from '../src/utils/storage';
import {useEditorStore} from '../src/stores/editorStore';
import {TopToolbar} from '../src/components/toolbar/TopToolbar';
import {LeftSidebar} from '../src/components/sidebar/LeftSidebar';
import {InvitationExperience} from '../src/features/music/InvitationExperience';
import {RecipientInvitationContext} from '../src/features/recipients/RecipientInvitationContext';
import '../src/styles.css';
const project=normalizeProject(createBlankProject())!;delete project.ownerId;project.introductionMode='none';project.opening.type='none';project.rsvp!.enabled=true;project.rsvp!.purchased=true;project.publicId='synthetic-public-test';
beginDiscoverySession(project.id);useEditorStore.setState({project,currentPageId:project.pages[0].id});
function Fixture(){const [mode,setMode]=useState('editor'),[rsvp,setRsvp]=useState(false);const open=useRecipientLists(state=>state.open),lists=useRecipientLists(state=>state.lists);const totals=recipientTotals(lists[`guest:${project.id}`]?.recipients??[]);
 if(mode==='public')return <><button onClick={()=>setMode('editor')}>Retour test</button><button onClick={()=>setRsvp(!rsvp)}>Afficher seulement le formulaire</button><RecipientInvitationContext.Provider value={{id:'synthetic-recipient',token:'a'.repeat(64),displayName:'Famille Martin',guestCount:4,answers:null,canEdit:true}}><div style={{width:'min(390px,100%)'}}><InvitationExperience project={project} device="mobile" mode="public"/></div></RecipientInvitationContext.Provider><p>Backend simulé — aucun envoi ni paiement réel.</p></>;
 return <><TopToolbar onPreview={()=>setMode('public')}/><main style={{display:'flex',gap:30,padding:20}}><div style={{width:300}}><LeftSidebar onPreviewOpening={()=>{}}/></div><section><h1>Test local — Liste des invités</h1><button onClick={()=>useRecipientLists.setState({open:true})}>Ouvrir la liste</button><p role="status">{totals.households} foyers · {totals.guests} personnes</p><button onClick={()=>setMode('public')}>Tester l’invitation Famille Martin</button></section></main>{open&&<RecipientListModal project={project} onClose={()=>useRecipientLists.setState({open:false})}/>}</>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Fixture/></BrowserRouter>);
