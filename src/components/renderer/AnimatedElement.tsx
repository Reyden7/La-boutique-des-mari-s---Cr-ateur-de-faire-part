import { motion, useReducedMotion } from "framer-motion";
import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { AnimationConfig } from "../../types/editor";
import { animationOpacityPlacement, elementAnimationFrames, resolveElementAnimation } from "../../utils/elementAnimation";
import { isTextAnimation } from "../../utils/textAnimation";
import { AnimationViewportContext, AnimationHistoryContext, ElementEntranceContext, ElementEntranceFinalContext, useElementEntrance, useEntranceVisibility } from "./useEntranceVisibility";

export function AnimationViewportProvider({ root, children }: { root: RefObject<HTMLElement | null>; children: ReactNode }) {
  const history = useRef(new Set<string>());
  return <AnimationViewportContext.Provider value={root}><AnimationHistoryContext.Provider value={history.current}>{children}</AnimationHistoryContext.Provider></AnimationViewportContext.Provider>;
}

/** Motion owns only the middle layer; layout coordinates and element rotation stay on separate DOM nodes. */
export function AnimatedElement({ animation, animationId, opacity, rotation = 0, rotationOrigin = "top left", style, className, children, overlayChildren, play = true }: {
  animation?: AnimationConfig;
  animationId?: string;
  opacity: number;
  rotation?: number;
  rotationOrigin?: CSSProperties["transformOrigin"];
  style: CSSProperties;
  className?: string;
  children: ReactNode;
  overlayChildren?: ReactNode;
  play?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const parentReady = useElementEntrance();
  const reducedMotion = useReducedMotion();
  const hasEntrance = Boolean(resolveElementAnimation(animation)) && !reducedMotion;
  const { started, alreadyPlayed } = useEntranceVisibility(ref, hasEntrance && play && parentReady, animationId);
  const active = !hasEntrance ? play && parentReady : started;
  const resolved = !reducedMotion && !isTextAnimation(animation?.type) ? resolveElementAnimation(animation) : null;
  // A Section animates its group, but its configured opacity belongs to its own
  // surface. Applying it to the group would permanently dim every child.
  const { motionOpacity, contentOpacity } = animationOpacityPlacement(opacity, overlayChildren !== undefined);
  const content = <div className={className} style={{ width: "100%", height: "100%", opacity: contentOpacity, transform: `rotate(${rotation}deg)`, transformOrigin: rotationOrigin }}>{children}</div>;
  return <div ref={ref} style={style} data-entrance-id={animationId} data-entrance-state={!hasEntrance ? "final" : started ? "started" : "waiting"}>
    <ElementEntranceContext.Provider value={active}>
    <ElementEntranceFinalContext.Provider value={alreadyPlayed}>
    {resolved ? <motion.div
      style={{ width: "100%", height: "100%", position: "relative", transformOrigin: "center" }}
      initial={alreadyPlayed ? false : "hidden"}
      animate={started ? "visible" : "hidden"}
      variants={elementAnimationFrames(resolved.type, motionOpacity)}
      transition={{ duration: resolved.duration, ease: "easeOut" }}
    >{content}{overlayChildren}</motion.div> : <div style={{ width: "100%", height: "100%", position: "relative", opacity: motionOpacity }}>{content}{overlayChildren}</div>}
    </ElementEntranceFinalContext.Provider></ElementEntranceContext.Provider>
  </div>;
}
