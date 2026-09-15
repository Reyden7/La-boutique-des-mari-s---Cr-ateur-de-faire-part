import { createClient, type Session, type User } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

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
