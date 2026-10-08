import { createClient, type Session, type User } from "@supabase/supabase-js";
import { createRecoveryState, isRecoveryCallback } from "./passwordRecovery";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

// Capture only the flow type before Supabase consumes/removes the callback URL.
export const incomingPasswordRecovery = typeof window !== "undefined" && isRecoveryCallback(window.location);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

let recoveryStorage: Storage | undefined;
try { if (typeof window !== "undefined") recoveryStorage = window.sessionStorage; } catch { /* Private browser mode. */ }
export const passwordRecoveryState = createRecoveryState(recoveryStorage);
// Subscribe at client creation, before initialization can emit recovery. The
// React page can mount later without missing the one-time SDK event.
supabase?.auth.onAuthStateChange((event, session) => passwordRecoveryState.handleEvent(event, session));
void supabase?.auth.initialize().then(({ error }) => {
  if (error) passwordRecoveryState.clear();
}).catch(() => passwordRecoveryState.clear());

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Vous devez être connecté pour accéder à ce projet.");
    this.name = "AuthenticationRequiredError";
  }
}

export const isAuthenticatedSession = (session: Session | null): session is Session =>
  Boolean(session?.user && !session.user.is_anonymous);

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return isAuthenticatedSession(data.session) ? data.session : null;
}

export async function requireSupabaseSession(): Promise<User> {
  const session = await getSession();
  if (!session) throw new AuthenticationRequiredError();
  return session.user;
}
