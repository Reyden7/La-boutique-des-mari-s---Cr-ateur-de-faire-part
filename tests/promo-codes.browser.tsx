// Real components, in-memory adapters only. No Supabase writes or Stripe session.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/contexts/AuthContext";
import { PromoCodesManager } from "../src/components/admin/PromoCodesManager";
import { TopToolbar } from "../src/components/toolbar/TopToolbar";
import { useEditorStore } from "../src/stores/editorStore";
import { normalizePromoCode } from "../src/config/promo";
import type { PromoCodeRecord } from "../src/services/promoCodeRepository";
import type { WeddingProject } from "../src/types/editor";
import "../src/styles.css";

let records: PromoCodeRecord[] = [{id:"wp21",code:"WP21",discount_value:10,discount_type:"percentage",is_active:true,created_at:"2026-10-07T00:00:00Z",updated_at:"2026-10-07T00:00:00Z"}];
const api = {
  list: async () => records.filter((r) => r.is_active),
  save: async (id: string | null, code: string, rate: number) => {
    const normalized = normalizePromoCode(code);
    if (records.some((r) => r.code === normalized && r.id !== id)) throw new Error("Ce code promo existe déjà.");
    const previous = records.find((r) => r.id === id);
    const now = new Date().toISOString();
    const saved: PromoCodeRecord = {id: id ?? crypto.randomUUID(),code:normalized,discount_type:"percentage",discount_value:rate,is_active:true,created_at:previous?.created_at ?? now,updated_at:now};
    records = [saved,...records.filter((r) => r.id !== saved.id)];
    return saved;
  },
  deactivate: async (id: string) => { records = records.map((r) => r.id === id ? {...r,is_active:false} : r); },
};
const validate = async (value: string) => {
  const promo = records.find((r) => r.code === normalizePromoCode(value) && r.is_active);
  return promo ? {code:promo.code,discountType:"percentage" as const,discountValue:promo.discount_value} : null;
};
const calls: {count:number;promoCode?:string}[]=[];
useEditorStore.setState({
  project:{id:"promo-local-test",name:"Test local codes promo",status:"draft",paymentStatus:"unpaid",requestedGuestCount:40,pages:[],rsvp:{enabled:false,purchased:false}} as WeddingProject,past:[],future:[],
  checkoutAndPublish:async(count,promoCode)=>{ calls.push({count,promoCode}); return null; },
});
function Fixture() {
  const [view,setView]=useState("admin");
  const project=useEditorStore((s)=>s.project)!;
  return <MemoryRouter><AuthProvider>
    <nav style={{display:"flex",gap:16,padding:16}}><button onClick={()=>setView("admin")}>QA Admin</button><button onClick={()=>setView("checkout")}>QA Publication</button><button onClick={()=>useEditorStore.setState({project:{...project,rsvp:{...project.rsvp!,enabled:!project.rsvp!.enabled}}})}>Basculer formulaire</button><button onClick={()=>useEditorStore.setState({project:{...project,status:"published",paymentStatus:"paid",publicId:"qa",purchasedGuestCapacity:40,purchasedExtraBlocks:0}})}>Licence 40 payée</button></nav>
    <p style={{padding:16}}>Fixtures en mémoire. Aucun paiement, aucune écriture Supabase.</p>
    {view==="admin" ? <div className="admin-templates-page promo-admin-page"><main><h1>Gérer les codes promos</h1><PromoCodesManager api={api}/></main></div> : <TopToolbar onPreview={()=>{}} promoValidation={validate}/>}
    <pre style={{padding:16}} id="qa-checkout-calls">{JSON.stringify(calls)}</pre>
  </AuthProvider></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
