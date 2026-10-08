import type { Session, User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isAuthenticatedSession, isSupabaseConfigured, passwordRecoveryState, supabase } from "../lib/supabase";
import { getInitializedAuthSession, sendPasswordRecovery, updateRecoveredPassword } from "../lib/passwordRecovery";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  /** Display hint only. Database RLS/RPCs remain authoritative. */
  isAdmin: boolean;
  signUp: (email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  recoveryReady: boolean;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
const PRODUCTION_SITE_URL = "https://www.laboutiquedesmaries.fr";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const recoveryMarker = useSyncExternalStore(passwordRecoveryState.subscribe, passwordRecoveryState.getSnapshot, () => null);
  const recoveryReady = passwordRecoveryState.hasSession(session);
  useEffect(() => {
    if (!recoveryMarker) return;
    const timer = setTimeout(passwordRecoveryState.clear, Math.max(0, recoveryMarker.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [recoveryMarker]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    let active = true;
    let initialized = false;
    void getInitializedAuthSession(client).then(async ({ data, error }) => {
      if (!active) return;
      if (error) {
        passwordRecoveryState.clear();
        console.warn("Récupération de session impossible", error.code ?? "auth_error");
      }
      if (data.session?.user.is_anonymous) await client.auth.signOut();
      if (active) {
        initialized = true;
        setSession(isAuthenticatedSession(data.session) ? data.session : null);
        setLoading(false);
      }
    }).catch(() => {
      if (!active) return;
      initialized = true;
      passwordRecoveryState.clear();
      setSession(null);
      setLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      // Process recovery BEFORE exposing an authenticated user to route guards.
      passwordRecoveryState.handleEvent(event, nextSession);
      setSession(isAuthenticatedSession(nextSession) ? nextSession : null);
      if (initialized) setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    configured: isSupabaseConfigured,
    recoveryReady,
    isAdmin: session?.user.app_metadata?.role === "admin",
    signUp: async (email, password) => {
      if (!supabase) throw new Error("Supabase n’est pas configuré.");
      passwordRecoveryState.clear();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${PRODUCTION_SITE_URL}/` },
      });
      if (error) throw error;
      return { confirmationRequired: !data.session };
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error("Supabase n’est pas configuré.");
      passwordRecoveryState.clear();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      passwordRecoveryState.clear();
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    requestPasswordReset: async (email) => {
      if (!supabase) throw new Error("Impossible d’envoyer l’email pour le moment. Veuillez réessayer.");
      await sendPasswordRecovery(supabase, email, window.location.origin);
    },
    resetPassword: async (password) => {
      if (!supabase) throw new Error("Ce lien de réinitialisation est invalide ou a expiré.");
      await updateRecoveredPassword(supabase, passwordRecoveryState, password);
    },
  }), [loading, session, recoveryReady]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans AuthProvider.");
  return context;
}
