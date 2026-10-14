import {StrictMode,useState} from 'react';import {createRoot} from 'react-dom/client';import App from '../src/App';
import {useEditorStore} from '../src/stores/editorStore';import {useTutorialStore} from '../src/features/tutorial/tutorialStore';
import {confirmQaEmail,qaCounts,signInQaEmptyAccount,signOutQaAccount} from './discovery.mock';import '../src/styles.css';
function Fixture(){const [baseline,setBaseline]=useState(''),[result,setResult]=useState('');
  return <><App/><aside style={{position:'fixed',bottom:3,left:3,zIndex:20000,padding:6,background:'#fff',fontSize:10}}>
    <button onClick={confirmQaEmail}>QA · Confirmer le compte</button>
    <button onClick={signInQaEmptyAccount}>QA · Compte neuf sans projet</button>
    <button onClick={signOutQaAccount}>QA · Déconnexion</button>
    <button onClick={()=>setBaseline(JSON.stringify(useEditorStore.getState().project))}>QA · Capturer le document</button>
    <button onClick={()=>setResult(JSON.stringify({unchanged:baseline===JSON.stringify(useEditorStore.getState().project),...qaCounts,status:useTutorialStore.getState().preference.status}))}>QA · Vérifier le document</button><output>{result}</output>
  </aside></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
