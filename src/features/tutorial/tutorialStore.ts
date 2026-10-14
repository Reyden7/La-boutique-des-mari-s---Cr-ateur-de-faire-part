import { create } from "zustand";
import { DEFAULT_TUTORIAL_PREFERENCE, mergeTutorialPreferences, parseTutorialPreference, readTutorialPreference, sameTutorialPreference, shouldOfferTutorial, type TutorialPreference } from "./tutorialPreferences";
import { getTutorialSteps } from "./tutorialConfig";

export const useTutorialStore = create<{
  actor: string; ready: boolean; preference: TutorialPreference; revision: number;
  invitation: "home" | "editor" | null; active: string | null; pending: boolean; index: number;
  help: "menu" | "features" | null; guestSeen: boolean; syncError: boolean;
}>(() => ({ actor: "guest", ready: false, preference: { ...DEFAULT_TUTORIAL_PREFERENCE }, revision: 0,
  invitation: null, active: null, pending: false, index: 0, help: null, guestSeen: false, syncError: false }));

export function bindTutorialActor(nextActor: string, profileValue?: unknown) {
  const state = useTutorialStore.getState();
  if (state.ready && state.actor === nextActor) return;
  const transfer = state.ready && state.actor === "guest" && nextActor !== "guest" && state.guestSeen;
  const profile = parseTutorialPreference(profileValue);
  let next = mergeTutorialPreferences(readTutorialPreference(nextActor), profile);
  if (transfer) next = mergeTutorialPreferences(next, state.preference);
  useTutorialStore.setState({ actor: nextActor, ready: true, preference: next,
    revision: transfer ? state.revision + 1 : nextActor !== "guest" && next.offered && !sameTutorialPreference(next, profile) ? 1 : 0, syncError: false,
    ...(!transfer ? { active: null, pending: false, invitation: null, help: null, index: 0, guestSeen: false } : {}) });
}

export function offerTutorial(context: "home" | "editor", eligible: boolean) {
  const state = useTutorialStore.getState();
  if (!state.ready || state.active || state.pending || !shouldOfferTutorial(state.preference, eligible)) return;
  useTutorialStore.setState({ invitation: context, preference: { ...state.preference, offered: true }, revision: state.revision + 1 });
}
export function startTutorial(id = "main", pending = false) {
  if (!getTutorialSteps(id).length) return;
  const state = useTutorialStore.getState();
  useTutorialStore.setState({ active: id, pending, index: 0, invitation: null, help: null,
    preference: { ...state.preference, offered: true }, revision: state.revision + 1 });
}
export function finishTutorial(completed = false) {
  const state = useTutorialStore.getState();
  const main = state.active === "main" || Boolean(state.invitation);
  useTutorialStore.setState({ active: null, pending: false, invitation: null, help: null, index: 0,
    preference: main ? mergeTutorialPreferences(state.preference, { version: 1, status: completed ? "completed" : "skipped", offered: true }) : state.preference,
    revision: state.revision + (main ? 1 : 0) });
}
export function moveTutorial(delta: number) {
  const state = useTutorialStore.getState(), steps = getTutorialSteps(state.active ?? "");
  if (delta > 0 && state.index >= steps.length - 1) { finishTutorial(true); return; }
  useTutorialStore.setState({ index: Math.max(0, Math.min(steps.length - 1, state.index + delta)) });
}
