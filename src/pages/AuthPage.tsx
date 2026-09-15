import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function AuthPage() {
  const { user, loading, configured, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = (location.state as { from?: string } | null)?.from ?? "/";
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) navigate(destination, { replace: true });
  }, [destination, loading, navigate, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (mode === "sign-in") {
        await signIn(email.trim(), password);
        navigate(destination, { replace: true });
      } else {
        const result = await signUp(email.trim(), password);
        if (result.confirmationRequired) {
          setMessage("Compte créé. Consultez votre boîte mail pour confirmer votre adresse, puis connectez-vous.");
          setMode("sign-in");
          setPassword("");
        } else {
          navigate(destination, { replace: true });
        }
      }
    } catch (authError) {
      const detail = authError instanceof Error ? authError.message : "Authentification impossible.";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><div className="brand-mark">B</div><div><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div><div className="auth-icon"><LockKeyhole size={22} /></div><p className="eyebrow">Votre espace personnel</p><h1>{mode === "sign-in" ? "Connexion" : "Créer un compte"}</h1><p className="auth-intro">Retrouvez vos créations et préparez votre publication en toute sécurité.</p>{!configured && <div className="auth-message error">Supabase n’est pas configuré sur cet environnement.</div>}{message && <div className="auth-message">{message}</div>}{error && <div className="auth-message error">{error}</div>}<form onSubmit={(event) => void submit(event)}><label><span>Email</span><div><Mail size={16} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.fr" /></div></label><label><span>Mot de passe</span><div><LockKeyhole size={16} /><input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" /></div></label><button className="auth-submit" type="submit" disabled={submitting || !configured}>{submitting ? "Veuillez patienter…" : mode === "sign-in" ? "Se connecter" : "Créer mon compte"}<ArrowRight size={16} /></button></form><div className="auth-switch"><span>{mode === "sign-in" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"}</span><button type="button" onClick={() => { setMode((value) => value === "sign-in" ? "sign-up" : "sign-in"); setError(""); setMessage(""); }}>{mode === "sign-in" ? "Créer un compte" : "Se connecter"}</button></div></section></main>;
}
