import { ArrowLeft } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PromoCodesManager } from "../components/admin/PromoCodesManager";
import {PartnersManager} from '../components/admin/PartnersManager';
import {PartnerCommissionsManager} from '../components/admin/PartnerCommissionsManager';
import {useState} from 'react';

export function AdminPromoCodesPage() {
  const { isAdmin } = useAuth();
  const [view,setView]=useState('codes');
  if (!isAdmin) return <Navigate to="/" replace />;
  return <div className="admin-templates-page promo-admin-page"><header className="admin-templates-header"><Link to="/"><ArrowLeft size={17} /> Retour aux projets</Link><div><p className="eyebrow">Administration</p><h1>Gérer les codes promos</h1></div></header><main><p className="admin-templates-lead">Réduction sur la première publication, formulaire initial inclus. Les upgrades et achats ultérieurs restent au tarif normal.</p><nav className="promo-actions" aria-label="Gestion commerciale">{[['codes','Codes promotionnels'],['partners','Partenaires'],['commissions','Commissions partenaires']].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</nav>{view==='codes'?<PromoCodesManager/>:view==='partners'?<PartnersManager/>:<PartnerCommissionsManager/>}</main></div>;
}
