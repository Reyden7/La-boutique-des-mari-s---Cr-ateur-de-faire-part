import { passwordRecoveryState, requireSupabaseSession, supabase } from "../lib/supabase";
import { parseTutorialPreference, TUTORIAL_METADATA_KEY, type TutorialPreference } from "../features/tutorial/tutorialPreferences";

/** An editable UX preference only. Never used for roles, RLS, payments or ownership. */
export async function saveTutorialPreference(userId: string, preference: TutorialPreference) {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const user = await requireSupabaseSession();
  if (user.id !== userId || user.is_anonymous || passwordRecoveryState.getSnapshot()) throw new Error("La session a changé.");
  const { data, error } = await supabase.auth.updateUser({ data: { [TUTORIAL_METADATA_KEY]: parseTutorialPreference(preference) } });
  if (error) throw error;
  if (data.user?.id !== userId) throw new Error("La préférence n’a pas pu être confirmée.");
  return parseTutorialPreference(data.user.user_metadata?.[TUTORIAL_METADATA_KEY]);
}
