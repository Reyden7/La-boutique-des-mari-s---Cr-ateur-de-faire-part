import { motion, useReducedMotion } from "framer-motion";
import { createContext, useContext, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { AnimationConfig } from "../../types/editor";
import { animationOpacityPlacement, elementAnimationFrames, resolveElementAnimation } from "../../utils/elementAnimation";

const AnimationViewportContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);

export function AnimationViewportProvider({ root, children }: { root: RefObject<HTMLElement | null>; children: ReactNode }) {
  return <AnimationViewportContext.Provider value={root}>{children}</AnimationViewportContext.Provider>;
}

/** Motion owns only the middle layer; layout coordinates and element rotation stay on separate DOM nodes. */
export function AnimatedElement({ animation, opacity, rotation = 0, style, className, children, overlayChildren, play = true }: {
  animation?: AnimationConfig;
  opacity: number;
  rotation?: number;
  style: CSSProperties;
  className?: string;
  children: ReactNode;
  overlayChildren?: ReactNode;
  play?: boolean;
}) {
  const root = useContext(AnimationViewportContext);
  const reducedMotion = useReducedMotion();
  const resolved = !reducedMotion ? resolveElementAnimation(animation) : null;
  // A Section animates its group, but its configured opacity belongs to its own
  // surface. Applying it to the group would permanently dim every child.
  const { motionOpacity, contentOpacity } = animationOpacityPlacement(opacity, overlayChildren !== undefined);
  const content = <div className={className} style={{ width: "100%", height: "100%", opacity: contentOpacity, transform: `rotate(${rotation}deg)`, transformOrigin: "top left" }}>{children}</div>;
  return <div style={style}>
    {resolved ? <motion.div
      style={{ width: "100%", height: "100%", position: "relative", transformOrigin: "center" }}
      initial="hidden"
      whileInView={play ? "visible" : undefined}
      viewport={{ root, once: true, amount: "some" }}
      variants={elementAnimationFrames(resolved.type, motionOpacity)}
      transition={{ duration: resolved.duration, delay: resolved.delay, ease: "easeOut" }}
    >{content}{overlayChildren}</motion.div> : <div style={{ width: "100%", height: "100%", position: "relative", opacity: motionOpacity }}>{content}{overlayChildren}</div>}
  </div>;
}
