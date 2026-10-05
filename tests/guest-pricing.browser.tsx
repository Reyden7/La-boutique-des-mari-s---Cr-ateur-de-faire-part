// Actual toolbar/modal. Checkout adapter is deliberately isolated from Stripe/Storage.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/contexts/AuthContext";
import { TopToolbar } from "../src/components/toolbar/TopToolbar";
import { useEditorStore } from "../src/stores/editorStore";
import type { WeddingProject } from "../src/types/editor";
import "../src/styles.css";

const calls: number[] = [];
useEditorStore.setState({
  project: {id:"pricing-test",name:"Test local sans paiement réel",status:"draft",paymentStatus:"unpaid",requestedGuestCount:40,pages:[],rsvp:{enabled:false,purchased:false}} as WeddingProject,
  past:[],future:[],previewDevice:"mobile",
  checkoutAndPublish: async (count) => {
    calls.push(count);
    useEditorStore.setState((state) => ({project:{...state.project!,requestedGuestCount:count}}));
    return null;
  },
});
function Fixture() {
  const state=useEditorStore();
  return <>
    <p style={{padding:16}}>Test local : aucun Checkout, aucune sauvegarde distante.</p>
    <div style={{display:"flex",gap:12,padding:16}}>
      {(["mobile","tablet","desktop"] as const).map((device)=><button key={device} onClick={()=>state.setPreviewDevice(device)}>{device}</button>)}
      <button onClick={()=>useEditorStore.setState({project:{...state.project!,rsvp:{...state.project!.rsvp!,enabled:!state.project!.rsvp!.enabled}}})}>Basculer formulaire</button>
      <button onClick={()=>useEditorStore.setState({project:{...state.project!,status:"published",paymentStatus:"paid",publicId:"test",purchasedGuestCapacity:40,purchasedExtraBlocks:0}})}>Licence payée 40</button>
    </div>
    <pre id="results">{JSON.stringify({device:state.previewDevice,form:state.project!.rsvp!.enabled,calls,requested:state.project!.requestedGuestCount,capacity:state.project!.purchasedGuestCapacity})}</pre>
    <TopToolbar onPreview={()=>{}} />
  </>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><AuthProvider><Fixture /></AuthProvider></MemoryRouter>);
