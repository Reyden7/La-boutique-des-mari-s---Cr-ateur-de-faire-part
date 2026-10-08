import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

export const PASSWORD_MIN_LENGTH = 6;
export const RECOVERY_INVALID_MESSAGE = "Ce lien de réinitialisation est invalide ou a expiré.";
export const RECOVERY_SENT_MESSAGE = "Si un compte existe avec cette adresse, un email de réinitialisation vient d’être envoyé.";
const STORAGE_KEY = "lbm.auth.recovery-ui";
type RecoveryMarker = { userId: string; signedInAt: string | null; expiresAt: number };
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isRecoveryCallback(location: Pick<Location, "search" | "hash">) {
  // Routing hint only: NEVER grants access to the password form. Only the SDK's
  // PASSWORD_RECOVERY event and its verified session can enable recoveryReady.
  return new URLSearchParams(location.hash.slice(1)).get("type") === "recovery"
    || new URLSearchParams(location.search).get("type") === "recovery";
}

export function getRecoveryRedirect(pathname: string, recoveryReady: boolean) {
  return recoveryReady && pathname !== "/reset-password" ? "/reset-password" : null;
}

export async function getInitializedAuthSession(client: SupabaseClient) {
  const { error } = await client.auth.initialize();
  if (error) return { data: { session: null }, error };
  // The installed SDK schedules PASSWORD_RECOVERY with setTimeout(0) AFTER
  // saving the session. getSession alone can therefore unblock normal routing
  // before the recovery event. Let that notification run before ending loading.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return client.auth.getSession();
}

export function isValidRecoveryEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (password !== confirmation) return "Les mots de passe ne correspondent pas.";
  return null;
}

// UI-only marker, not a token or authorization mechanism. Supabase verifies the
// actual session. Created ONLY after the SDK emits PASSWORD_RECOVERY, never from
// a URL parameter. Per-tab storage permits refresh without accepting a normal login.
export function createRecoveryState(storage?: RecoveryStorage, now = Date.now) {
  let marker: RecoveryMarker | null = null;
  const listeners = new Set<() => void>();
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null") as RecoveryMarker | null;
    if (saved && typeof saved.userId === "string" && Number.isFinite(saved.expiresAt)
      && (typeof saved.signedInAt === "string" || saved.signedInAt === null)
      && saved.expiresAt > now() && saved.expiresAt <= now() + 3_600_000) marker = saved;
  } catch { /* Storage unavailable: recovery works until refresh. */ }
  function clear() {
    marker = null;
    try { storage?.removeItem(STORAGE_KEY); } catch { /* No sensitive data stored. */ }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => marker,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear,
    hasSession: (session: Session | null) => Boolean(marker && session && !session.user.is_anonymous
      && marker.userId === session.user.id && marker.signedInAt === (session.user.last_sign_in_at ?? null) && marker.expiresAt > now()
      && (session.expires_at ?? 0) * 1000 > now()),
    handleEvent: (event: AuthChangeEvent, session: Session | null) => {
      if (event === "PASSWORD_RECOVERY" && session && !session.user.is_anonymous) {
        const expiresAt = Math.min((session.expires_at ?? 0) * 1000, now() + 3_600_000);
        if (expiresAt <= now()) { clear(); return; }
        marker = { userId: session.user.id, signedInAt: session.user.last_sign_in_at ?? null, expiresAt };
        try { storage?.setItem(STORAGE_KEY, JSON.stringify(marker)); } catch { /* In-memory fallback. */ }
        listeners.forEach((listener) => listener());
      } else if (event === "SIGNED_OUT" || (session && marker && (session.user.id !== marker.userId
        || (session.user.last_sign_in_at ?? null) !== marker.signedInAt))) clear();
      // SIGNED_IN is also emitted by the SDK when restoring/focusing the SAME
      // session. Clearing it unconditionally breaks refresh on /reset-password.
    },
  };
}

function reportAuthError(operation: string, error: { code?: string }) {
  // Never log payloads, passwords, tokens, or email addresses.
  console.warn(operation, error.code ?? "auth_error");
}

export async function sendPasswordRecovery(client: SupabaseClient, email: string, origin: string) {
  if (!isValidRecoveryEmail(email)) throw new Error("Veuillez saisir une adresse email valide.");
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/reset-password`,
    });
    // Preserve the same account-neutral outcome even if a provider returns this code.
    if (error && error.code !== "user_not_found") {
      reportAuthError("Envoi de récupération impossible", error);
      throw error;
    }
  } catch {
    throw new Error("Impossible d’envoyer l’email pour le moment. Veuillez réessayer.");
  }
}

export async function updateRecoveredPassword(
  client: SupabaseClient, recovery: ReturnType<typeof createRecoveryState>, password: string,
) {
  const validation = validateNewPassword(password, password);
  if (validation) throw new Error(validation);
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !recovery.hasSession(sessionData.session)) {
    recovery.clear();
    throw new Error(RECOVERY_INVALID_MESSAGE);
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user || userData.user.id !== sessionData.session!.user.id) {
    recovery.clear();
    throw new Error(RECOVERY_INVALID_MESSAGE);
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    reportAuthError("Modification du mot de passe impossible", error);
    if (["session_not_found", "session_expired", "refresh_token_not_found", "bad_jwt"].includes(error.code ?? "")) {
      recovery.clear();
      throw new Error(RECOVERY_INVALID_MESSAGE);
    }
    throw new Error("Impossible de modifier le mot de passe pour le moment. Veuillez réessayer.");
  }
  recovery.clear();
  // Return to a real sign-in after success, without revoking other devices.
  try {
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) reportAuthError("Déconnexion locale impossible", signOutError);
  } catch { /* Password already changed: do not report a false reset failure. */ }
}
