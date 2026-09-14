import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { OpeningAnimationProps } from "../openingTypes";

export function CurtainsOpening({ children, config, couple, onInteract }: OpeningAnimationProps) {
  const [opened, setOpened] = useState(false);
  const reduceMotion = useReducedMotion();
  const [primary, accent] = config.colors ?? ["#7a2330", "#d5b46d"];
  const duration = reduceMotion ? .12 : Math.max(1.6, config.duration);
  const open = () => { if (opened) return; onInteract?.(); setOpened(true); };
  return <div className="opening-stage curtains-theme" style={{ "--opening-primary": primary, "--opening-accent": accent } as React.CSSProperties}>
    <motion.div className="opening-content-behind" initial={false} animate={opened ? { scale: [1.025, 1.012, 1], filter: ["brightness(.68)", "brightness(.88)", "brightness(1)"] } : { scale: 1.025, filter: "brightness(.68)" }} transition={{ duration: duration * .9, delay: duration * .08, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
    <motion.button className="curtains-scene" onClick={open} aria-label="Ouvrir les rideaux" animate={opened ? { pointerEvents: "none" } : {}}>
      <div className="curtain-valance" />
      <motion.div className="curtain-panel curtain-left" animate={opened ? { scaleX: [1, .975, .48, .29], skewY: [0, -.8, 1.1, 0], x: [0, "1%", "-.5%", 0] } : { scaleX: 1, skewY: 0, x: 0 }} transition={{ duration, times: [0, .12, .68, 1], ease: [0.22, .74, .2, 1] }}><i /><i /><i /></motion.div>
      <motion.div className="curtain-panel curtain-right" animate={opened ? { scaleX: [1, .975, .48, .29], skewY: [0, .8, -1.1, 0], x: [0, "-1%", ".5%", 0] } : { scaleX: 1, skewY: 0, x: 0 }} transition={{ duration, times: [0, .12, .68, 1], ease: [0.22, .74, .2, 1] }}><i /><i /><i /></motion.div>
      <motion.span className="curtain-tie curtain-tie-left" animate={opened ? { x: [0, -8, -32], y: [0, 4, 0], opacity: [0, 1, 1] } : { opacity: 0 }} transition={{ duration: duration * .72, delay: duration * .18, ease: [0.22, 1, 0.36, 1] }} />
      <motion.span className="curtain-tie curtain-tie-right" animate={opened ? { x: [0, 8, 32], y: [0, 4, 0], opacity: [0, 1, 1] } : { opacity: 0 }} transition={{ duration: duration * .72, delay: duration * .18, ease: [0.22, 1, 0.36, 1] }} />
      <motion.div className="curtain-intro" animate={opened ? { opacity: 0, y: -8, scale: 1.015 } : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: duration * .22, ease: "easeOut" }}><span>{couple}</span><small>La célébration commence</small><b>Ouvrir les rideaux</b></motion.div>
    </motion.button>
  </div>;
}
