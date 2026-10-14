import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { saveTutorialPreference } from "../../services/tutorialPreferenceRepository";
import { isEditorTutorialRoute } from "./tutorialConfig";
import { mergeTutorialPreferences, parseTutorialPreference, sameTutorialPreference, TUTORIAL_METADATA_KEY, writeTutorialPreference } from "./tutorialPreferences";
import { bindTutorialActor, finishTutorial, useTutorialStore } from "./tutorialStore";

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, loading, recoveryReady } = useAuth();
  const { pathname } = useLocation();
  const { actor, preference, revision, ready } = useTutorialStore();
  const queue = useRef(Promise.resolve());
  const previousPath = useRef(pathname);
  const lastWrite = useRef("");

  useEffect(() => {
    if (loading) return;
    if (useTutorialStore.getState().actor !== (user?.id ?? "guest")) lastWrite.current = "";
    bindTutorialActor(user?.id ?? "guest", user?.user_metadata?.[TUTORIAL_METADATA_KEY]);
  }, [user?.id, loading]);

  useEffect(() => {
    const state = useTutorialStore.getState();
    if (state.actor !== user?.id) return;
    const merged = mergeTutorialPreferences(state.preference, parseTutorialPreference(user?.user_metadata?.[TUTORIAL_METADATA_KEY]));
    if (!sameTutorialPreference(merged, state.preference)) useTutorialStore.setState({ preference: merged });
  }, [user]);

  useEffect(() => {
    if (!ready || revision === 0 || recoveryReady) return;
    writeTutorialPreference(actor, preference);
    if (!user || actor !== user.id) return;
    const fingerprint = `${actor}:${revision}:${JSON.stringify(preference)}`;
    if (lastWrite.current === fingerprint) return;
    lastWrite.current = fingerprint;
    const expectedActor = actor;
    // Serialize writes so a late "offered" response cannot overwrite "completed".
    queue.current = queue.current.catch(() => undefined).then(async () => {
      if (useTutorialStore.getState().actor !== expectedActor) return;
      try {
        await saveTutorialPreference(expectedActor, preference);
        if (useTutorialStore.getState().actor === expectedActor) useTutorialStore.setState({ syncError: false });
      } catch {
        if (useTutorialStore.getState().actor === expectedActor) useTutorialStore.setState({ syncError: true });
      }
    });
  }, [actor, preference, revision, ready, user?.id, recoveryReady]);

  useEffect(() => {
    const state = useTutorialStore.getState();
    if (pathname === "/studio/discovery" && actor === "guest") useTutorialStore.setState({ guestSeen: true });
    if (previousPath.current !== pathname) {
      useTutorialStore.setState({ help: null });
      if (state.invitation && !(state.invitation === "home" ? pathname === "/" : isEditorTutorialRoute(pathname))) finishTutorial(false);
      if (state.active && !isEditorTutorialRoute(pathname) && !(state.pending && pathname === "/")) finishTutorial(false);
    }
    previousPath.current = pathname;
  }, [pathname, actor]);
  return children;
}
