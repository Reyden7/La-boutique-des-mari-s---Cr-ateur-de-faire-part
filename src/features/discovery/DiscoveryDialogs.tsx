import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useDiscoverySession } from "./discoverySession";
import { PASSWORD_MIN_LENGTH } from "../../lib/passwordRecovery";

export function DiscoveryDialogs() {
  const { user, configured, signIn, signUp } = useAuth();
  const { warningShown, prompt, error, converting } = useDiscoverySession();
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>("input, button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = [...node.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)")];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", trap);
    return () => { node.removeEventListener("keydown", trap); previous?.focus(); };
  }, [warningShown, prompt, error, converting, Boolean(user)]);
  const dismiss = () => useDiscoverySession.setState({ warningShown: true, prompt: null });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setAuthError("");
    try {
      if (mode === "sign-in") await signIn(email.trim(), password);
      else {
        const result = await signUp(email.trim(), password);
        if (result.confirmationRequired) {
          setMessage("Confirmez votre adresse email dans un autre onglet en gardant cet éditeur ouvert. Votre création reste non sauvegardée jusqu’à la connexion. Si vous quittez ou rechargez cet onglet, elle sera perdue. Après confirmation, nous détecterons votre session ; vous pouvez aussi vous connecter ici.");
          setMode("sign-in"); setPassword("");
        }
      }
    } catch (cause) { setAuthError(cause instanceof Error ? cause.message : "Authentification impossible."); }
    finally { submitting.current = false; setBusy(false); }
  };
  if (converting) return <div className="modal-backdrop discovery-backdrop"><section className="discovery-dialog" role="dialog" aria-modal="true" aria-label="Sauvegarde du brouillon"><h2>Enregistrement de votre création…</h2><p>Transfert des fichiers et sauvegarde sur votre compte. Gardez cet onglet ouvert.</p></section></div>;
  if (warningShown && !prompt && !error) return null;
  return <div className="modal-backdrop discovery-backdrop"><section ref={dialog} className="discovery-dialog" role="dialog" aria-modal="true" aria-labelledby="discovery-title">
    {!warningShown && !prompt ? <>
      <h2 id="discovery-title">Vous créez votre faire-part en mode découverte.</h2>
      <p>Vous pouvez utiliser librement l’éditeur, mais votre création ne sera pas sauvegardée tant que vous n’aurez pas créé de compte. Si vous quittez ou actualisez cette page, vos modifications seront perdues.</p>
      <div className="discovery-actions"><button onClick={dismiss}>Continuer sans compte</button><button className="primary" onClick={() => useDiscoverySession.setState({ warningShown: true, prompt: "account" })}>Créer un compte</button></div>
    </> : <>
      <h2 id="discovery-title">{user ? "Enregistrer votre création" : prompt === "publish" ? "Créez un compte pour publier votre faire-part." : mode === "sign-up" ? "Créer un compte pour sauvegarder" : "Se connecter pour sauvegarder"}</h2>
      <p>Votre création reste ouverte dans cet onglet. Elle n’est pas encore enregistrée sur votre compte.</p>
      {message && <p role="status">{message}</p>}
      {(authError || error) && <p className="form-error" role="alert">{authError || error}</p>}
      {user ? <button className="primary" onClick={() => useDiscoverySession.setState((state) => ({ error: "", prompt: "account", retry: state.retry + 1 }))}>Réessayer la sauvegarde</button> : <>
        <form className="discovery-auth-form" onSubmit={(event) => void submit(event)}>
          <label>Email<input required type="email" autoComplete="email" value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Mot de passe<input required type="password" minLength={PASSWORD_MIN_LENGTH} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary" disabled={busy || !configured}>{busy ? "Veuillez patienter…" : mode === "sign-up" ? "Créer un compte" : "Se connecter"}</button>
        </form>
        <button disabled={busy} onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setPassword(""); setAuthError(""); }}>{mode === "sign-up" ? "Se connecter" : "Créer un compte"}</button>
      </>}
      <button disabled={busy} onClick={() => { dismiss(); useDiscoverySession.setState({ error: "" }); }}>Continuer à modifier</button>
    </>}
  </section></div>;
}
