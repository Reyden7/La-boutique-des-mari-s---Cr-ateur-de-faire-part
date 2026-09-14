import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

let sessionPromise: Promise<User> | null = null;

export async function requireSupabaseSession(): Promise<User> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  if (!sessionPromise) sessionPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session.user;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.user) throw new Error("Impossible de créer la session du projet.");
    return data.user;
  })();
  try {
    return await sessionPromise;
  } catch (error) {
    sessionPromise = null;
    throw error;
  }
}
