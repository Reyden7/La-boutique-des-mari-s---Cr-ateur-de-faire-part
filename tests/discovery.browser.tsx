import { StrictMode, useState } from 'react';import {createRoot} from 'react-dom/client';
import App from '../src/App';import {confirmQaEmail,qaCounts} from './discovery.mock';import '../src/styles.css';
function Fixture(){const [counts,setCounts]=useState({...qaCounts});return <><App/><aside style={{position:'fixed',bottom:8,left:8,zIndex:20000,background:'#fff',padding:8,fontSize:11}}>
  <button onClick={confirmQaEmail}>QA · Confirmer l’email dans un autre onglet</button>
  <button onClick={()=>setCounts({...qaCounts})}>QA · Compteurs</button><output>{JSON.stringify(counts)}</output>
</aside></>;}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
