import { createContext, useContext, useEffect, useState, type RefObject } from "react";
import { observeEntrance } from "../../utils/animationVisibility";

export const AnimationViewportContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);
export const AnimationHistoryContext = createContext<Set<string> | undefined>(undefined);
/** A child cannot consume its entrance while its animated section is waiting. */
export const ElementEntranceContext = createContext(true);
export const useElementEntrance = () => useContext(ElementEntranceContext);
export const ElementEntranceFinalContext = createContext(false);
export const useEntranceFinal = () => useContext(ElementEntranceFinalContext);

export function useEntranceVisibility(ref: RefObject<HTMLElement | null>, enabled: boolean, animationId?: string) {
  const root = useContext(AnimationViewportContext);
  const history = useContext(AnimationHistoryContext);
  const [alreadyPlayed] = useState(() => Boolean(animationId && history?.has(animationId)));
  const [started, setStarted] = useState(alreadyPlayed);
  useEffect(() => {
    if (!enabled || started || !ref.current) return;
    return observeEntrance(ref.current, root?.current ?? null, () => { if (animationId) history?.add(animationId); setStarted(true); });
  }, [enabled, started, root, ref, animationId, history]);
  return { started, alreadyPlayed };
}
