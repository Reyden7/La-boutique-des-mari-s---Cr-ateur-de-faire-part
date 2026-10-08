// UI fixtures only: NO Supabase requests, NO emails, NO real credentials changed.
import React, { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../src/contexts/AuthContext";
import { RecoveryRouteGuard } from "../src/components/auth/RecoveryRouteGuard";
import { ProtectedRoute } from "../src/components/auth/ProtectedRoute";
import { AuthPage } from "../src/pages/AuthPage";
import { ResetPasswordPage } from "../src/pages/ResetPasswordPage";
import "../src/styles.css";

function Fixture() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [requests, setRequests] = useState(0);
  const [resets, setResets] = useState(0);
  const [fail, setFail] = useState(false);
  const auth = {
    user: signedIn ? { id: "fixture-user", app_metadata: { role: admin ? "admin" : "user" } } as User : null,
    session: null, loading: false, configured: true, isAdmin: admin,
    signIn: async () => {}, signUp: async () => ({confirmationRequired:true}), signOut: async () => {},
    recoveryReady: ready,
    requestPasswordReset: async (_email: string) => {
      setRequests((n)=>n+1); await new Promise((resolve)=>setTimeout(resolve,1500));
      if(fail) throw new Error("fixture SMTP detail");
    },
    resetPassword: async (_password: string) => {
      setResets((n)=>n+1); await new Promise((resolve)=>setTimeout(resolve,500)); setReady(false); setSignedIn(false);
    },
  };
  return <AuthContext.Provider value={auth}>
    <nav style={{display:"flex",gap:12,padding:12,flexWrap:"wrap"}}>
      <button onClick={()=>navigate("/auth")}>QA Connexion</button>
      <button onClick={()=>{setReady(false);navigate("/reset-password");}}>QA Lien invalide</button>
      <button onClick={()=>{setReady(true);setSignedIn(true);navigate("/reset-password");}}>QA Recovery valide</button>
      <button onClick={()=>{setReady(true);setSignedIn(true);navigate("/auth");}}>QA Recovery sur connexion</button>
      <button onClick={()=>{setReady(true);setSignedIn(true);navigate("/");}}>QA Recovery sur dashboard</button>
      <button onClick={()=>{setReady(true);setSignedIn(true);setAdmin(true);navigate("/admin/assets");}}>QA Recovery admin</button>
      <button onClick={()=>{setReady(false);setSignedIn(true);navigate("/reset-password");}}>QA Session normale sur reset</button>
      <button onClick={()=>{setReady(false);setSignedIn(true);navigate("/login");}}>QA Connexion normale</button>
      <button onClick={()=>setFail(!fail)}>QA Erreur : {fail?"oui":"non"}</button>
    </nav>
    <p style={{padding:"0 12px"}}>Simulation locale sans email ni mot de passe réel. Route : {location.pathname} · Envois : {requests} · Modifications simulées : {resets}</p>
    <RecoveryRouteGuard><Routes><Route path="/auth" element={<AuthPage/>}/><Route path="/login" element={<AuthPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/>
      <Route path="/" element={<ProtectedRoute><p>Dashboard fixture (session normale uniquement)</p></ProtectedRoute>}/>
      <Route path="/admin/assets" element={<ProtectedRoute><p>Admin fixture (session normale uniquement)</p></ProtectedRoute>}/>
    </Routes></RecoveryRouteGuard>
  </AuthContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={["/auth"]}><Fixture/></MemoryRouter>);
