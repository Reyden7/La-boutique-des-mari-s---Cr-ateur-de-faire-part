import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthCard } from "../components/auth/AuthCard";
import { useAuth } from "../contexts/AuthContext";
import { isValidRecoveryEmail, PASSWORD_MIN_LENGTH, RECOVERY_SENT_MESSAGE } from "../lib/passwordRecovery";

export function AuthPage() {
  const { user, loading, configured, signIn, signUp, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { from?: string; forgotPassword?: boolean } | null;
  const destination = routeState?.from ?? "/";
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "recovery">(routeState?.forgotPassword ? "recovery" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user && mode !== "recovery") navigate(destination, { replace: true });
  }, [destination, loading, mode, navigate, user]);

  const changeMode = (next: typeof mode) => {
    if (busy.current) return;
    setMode(next); setPassword(""); setError(""); setMessage("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    setError(""); setMessage("");
    if (mode === "recovery" && !isValidRecoveryEmail(email)) {
      setError("Veuillez saisir une adresse email valide."); return;
    }
    busy.current = true; setSubmitting(true);
    try {
      if (mode === "recovery") {
        await requestPasswordReset(email.trim());
        setMessage(RECOVERY_SENT_MESSAGE);
      } else if (mode === "sign-in") {
        await signIn(email.trim(), password);
        navigate(destination, { replace: true });
      } else {
        const result = await signUp(email.trim(), password);
        if (result.confirmationRequired) {
          setMessage("Compte créé. Consultez votre boîte mail pour confirmer votre adresse, puis connectez-vous.");
          setMode("sign-in"); setPassword("");
        } else navigate(destination, { replace: true });
      }
    } catch (authError) {
      setError(mode === "recovery" ? "Impossible d’envoyer l’email pour le moment. Veuillez réessayer."
        : authError instanceof Error ? authError.message : "Authentification impossible.");
    } finally { busy.current = false; setSubmitting(false); }
  };

  return <AuthCard title={mode === "recovery" ? "Mot de passe oublié" : mode === "sign-in" ? "Connexion" : "Créer un compte"}
    intro={mode === "recovery" ? "Renseignez l’adresse email associée à votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe."
      : "Retrouvez vos créations et préparez votre publication en toute sécurité."}>
    {!configured && <div className="auth-message error">Supabase n’est pas configuré sur cet environnement.</div>}
    {message && <div className="auth-message" role="status">{message}</div>}
    {error && <div className="auth-message error" id="auth-error" role="alert">{error}</div>}
    <form onSubmit={(event) => void submit(event)} noValidate={mode === "recovery"} aria-busy={submitting}>
      <label><span>Email</span><div><Mail size={16}/><input type="email" autoComplete="email" required value={email}
        aria-describedby={error ? "auth-error" : undefined} disabled={submitting}
        onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.fr"/></div></label>
      {mode !== "recovery" && <label><span>Mot de passe</span><div><LockKeyhole size={16}/><input type="password"
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={PASSWORD_MIN_LENGTH} required
        disabled={submitting} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum"/></div></label>}
      {mode === "sign-in" && <button className="auth-forgot" type="button" onClick={() => changeMode("recovery")} disabled={submitting}>Mot de passe oublié ?</button>}
      <button className="auth-submit" type="submit" disabled={submitting || !configured}>
        {submitting ? mode === "recovery" ? "Envoi..." : "Veuillez patienter…"
          : mode === "recovery" ? "Envoyer le lien" : mode === "sign-in" ? "Se connecter" : "Créer mon compte"}<ArrowRight size={16}/>
      </button>
    </form>
    <div className="auth-switch">
      {mode !== "recovery" && <span>{mode === "sign-in" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"}</span>}
      <button type="button" disabled={submitting} onClick={() => changeMode(mode === "sign-in" ? "sign-up" : "sign-in")}>
        {mode === "recovery" ? "Retour à la connexion" : mode === "sign-in" ? "Créer un compte" : "Se connecter"}
      </button>
    </div>
  </AuthCard>;
}
