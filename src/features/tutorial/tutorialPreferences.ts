export type TutorialStatus = "not_started" | "completed" | "skipped";
export type TutorialPreference = { version: 1; status: TutorialStatus; offered: boolean };
export const DEFAULT_TUTORIAL_PREFERENCE: TutorialPreference = { version: 1, status: "not_started", offered: false };
export const TUTORIAL_METADATA_KEY = "studio_tutorial";
export const sameTutorialPreference = (a: TutorialPreference, b: TutorialPreference) => a.status === b.status && a.offered === b.offered && a.version === b.version;
const key = (actor: string) => `lbm-studio-tutorial-v1:${actor}`;
export function parseTutorialPreference(value: unknown): TutorialPreference {
  if (!value || typeof value !== "object") return { ...DEFAULT_TUTORIAL_PREFERENCE };
  const data = value as Partial<TutorialPreference>;
  return { version: 1, status: data.status === "completed" || data.status === "skipped" ? data.status : "not_started", offered: data.offered === true || data.status === "completed" || data.status === "skipped" };
}
export function mergeTutorialPreferences(a: TutorialPreference, b: TutorialPreference): TutorialPreference {
  const rank = { not_started: 0, skipped: 1, completed: 2 };
  return { version: 1, offered: a.offered || b.offered, status: rank[a.status] >= rank[b.status] ? a.status : b.status };
}
export function readTutorialPreference(actor: string): TutorialPreference {
  try { return parseTutorialPreference(JSON.parse(localStorage.getItem(key(actor)) ?? "null")); } catch { return { ...DEFAULT_TUTORIAL_PREFERENCE }; }
}
/** Whitelist the preference: never serialize project, Files, tour selection or history. */
export function writeTutorialPreference(actor: string, value: TutorialPreference) {
  try { localStorage.setItem(key(actor), JSON.stringify(parseTutorialPreference(value))); } catch { /* In-memory session still prevents repeated prompts. */ }
}
export const shouldOfferTutorial = (preference: TutorialPreference, eligible: boolean) => eligible && !preference.offered && preference.status === "not_started";
