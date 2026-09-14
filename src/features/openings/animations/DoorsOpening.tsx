import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { OpeningAnimationProps } from "../openingTypes";

export function DoorsOpening({ children, config, couple, onInteract }: OpeningAnimationProps) {
  const [opened, setOpened] = useState(false);
  const reduceMotion = useReducedMotion();
  const [primary, accent] = config.colors ?? ["#f4efe7", "#b2905d"];
  const duration = reduceMotion ? .12 : Math.max(1.6, config.duration);
  const open = () => { if (opened) return; onInteract?.(); setOpened(true); };
  return <div className="opening-stage doors-theme" style={{ "--opening-primary": primary, "--opening-accent": accent } as React.CSSProperties}>
    <motion.div className="opening-content-behind" initial={false} animate={opened ? { scale: [1.035, 1.018, 1], filter: ["brightness(.62) blur(1px)", "brightness(.84) blur(0px)", "brightness(1) blur(0px)"] } : { scale: 1.035, filter: "brightness(.62) blur(1px)" }} transition={{ duration: duration * .92, delay: duration * .05, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
    <motion.button className="doors-scene" onClick={open} aria-label="Ouvrir les portes" animate={opened ? { pointerEvents: "none" } : {}}>
      <motion.div className="door-light" animate={opened ? { opacity: [0, .2, .82, 0] } : { opacity: 0 }} transition={{ duration: duration * .86, delay: duration * .12, times: [0, .2, .72, 1], ease: "easeOut" }} />
      <motion.div className="door-panel door-left" animate={opened ? { rotateY: [0, -2.5, -58, -101], x: [0, 0, -2, -4] } : { rotateY: 0, x: 0 }} transition={{ duration, times: [0, .13, .66, 1], ease: [0.18, .72, .18, 1] }}><i /><span /></motion.div>
      <motion.div className="door-panel door-right" animate={opened ? { rotateY: [0, 2.5, 58, 101], x: [0, 0, 2, 4] } : { rotateY: 0, x: 0 }} transition={{ duration, times: [0, .13, .66, 1], ease: [0.18, .72, .18, 1] }}><i /><span /></motion.div>
      <motion.div className="door-intro" animate={opened ? { opacity: 0, scale: .985, y: -5 } : { opacity: 1, scale: 1, y: 0 }} transition={{ duration: duration * .2, ease: "easeOut" }}><span>{couple}</span><small>Vous ouvrent les portes de leur histoire</small><b>Entrer</b></motion.div>
    </motion.button>
  </div>;
}
