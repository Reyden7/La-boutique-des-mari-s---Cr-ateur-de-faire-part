import { ArrowRight, LockKeyhole } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/auth/AuthCard";
import { useAuth } from "../contexts/AuthContext";
import { PASSWORD_MIN_LENGTH, RECOVERY_INVALID_MESSAGE, validateNewPassword } from "../lib/passwordRecovery";

export function ResetPasswordPage() {
  const { loading, recoveryReady, resetPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || !recoveryReady || success) return;
    const validation = validateNewPassword(password, confirmation);
    setError(validation ?? "");
    if (validation) return;
    busy.current = true; setSubmitting(true);
    try {
      await resetPassword(password);
      setPassword(""); setConfirmation(""); setSuccess(true);
    } catch (resetError) {
      const detail = resetError instanceof Error ? resetError.message : "";
      setError(detail === RECOVERY_INVALID_MESSAGE ? detail : "Impossible de modifier le mot de passe pour le moment. Veuillez réessayer.");
    } finally { busy.current = false; setSubmitting(false); }
  };
  return <AuthCard title="Nouveau mot de passe" intro="Choisissez votre nouveau mot de passe.">
    {success ? <><div className="auth-message" role="status">Votre mot de passe a bien été modifié.</div>
      <Link className="auth-submit" to="/auth">Se connecter<ArrowRight size={16}/></Link></>
      : loading ? <div className="auth-message" role="status">Vérification du lien…</div>
      : !recoveryReady && !submitting ? <><div className="auth-message error" role="alert">{RECOVERY_INVALID_MESSAGE}</div>
        <Link className="auth-submit" to="/auth" state={{ forgotPassword: true }}>Demander un nouveau lien<ArrowRight size={16}/></Link></>
      : <>
        {error && <div className="auth-message error" id="reset-error" role="alert">{error}</div>}
        <form onSubmit={(event) => void submit(event)} noValidate aria-busy={submitting}>
          <label><span>Nouveau mot de passe</span><div><LockKeyhole size={16}/><input type="password" autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH} required disabled={submitting} value={password}
            aria-describedby={error ? "reset-error" : undefined} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum"/></div></label>
          <label><span>Confirmer le mot de passe</span><div><LockKeyhole size={16}/><input type="password" autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH} required disabled={submitting} value={confirmation}
            aria-describedby={error ? "reset-error" : undefined} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirmez votre mot de passe"/></div></label>
          <button className="auth-submit" type="submit" disabled={submitting || !recoveryReady}>
            {submitting ? "Modification..." : "Modifier mon mot de passe"}<ArrowRight size={16}/>
          </button>
        </form>
      </>}
  </AuthCard>;
}
