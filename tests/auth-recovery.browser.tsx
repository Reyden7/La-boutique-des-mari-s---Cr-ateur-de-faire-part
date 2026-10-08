// UI fixtures only: NO Supabase requests, NO emails, NO real credentials changed.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AuthContext } from "../src/contexts/AuthContext";
import { AuthPage } from "../src/pages/AuthPage";
import { ResetPasswordPage } from "../src/pages/ResetPasswordPage";
import "../src/styles.css";

function Fixture() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [requests, setRequests] = useState(0);
  const [resets, setResets] = useState(0);
  const [fail, setFail] = useState(false);
  const auth = {
    user: null, session: null, loading: false, configured: true, isAdmin: false,
    signIn: async () => {}, signUp: async () => ({confirmationRequired:true}), signOut: async () => {},
    recoveryReady: ready,
    requestPasswordReset: async (_email: string) => {
      setRequests((n)=>n+1); await new Promise((resolve)=>setTimeout(resolve,1500));
      if(fail) throw new Error("fixture SMTP detail");
    },
    resetPassword: async (_password: string) => {
      setResets((n)=>n+1); await new Promise((resolve)=>setTimeout(resolve,500)); setReady(false);
    },
  };
  return <AuthContext.Provider value={auth}>
    <nav style={{display:"flex",gap:12,padding:12,flexWrap:"wrap"}}>
      <button onClick={()=>navigate("/auth")}>QA Connexion</button>
      <button onClick={()=>{setReady(false);navigate("/reset-password");}}>QA Lien invalide</button>
      <button onClick={()=>{setReady(true);navigate("/reset-password");}}>QA Recovery valide</button>
      <button onClick={()=>setFail(!fail)}>QA Erreur : {fail?"oui":"non"}</button>
    </nav>
    <p style={{padding:"0 12px"}}>Simulation locale sans email ni mot de passe réel. Envois : {requests} · Modifications simulées : {resets}</p>
    <Routes><Route path="/auth" element={<AuthPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/></Routes>
  </AuthContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={["/auth"]}><Fixture/></MemoryRouter>);
