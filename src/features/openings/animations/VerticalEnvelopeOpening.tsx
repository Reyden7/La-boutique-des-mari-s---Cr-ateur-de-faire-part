import { motion, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { OpeningAnimationProps } from "../openingTypes";
import { getEnvelopeFrame, getEnvelopeTimeline, resolveEnvelopeSettings } from "../envelopeSettings";
import { resolveSectionTexture } from "../../../config/sectionTextures";

function WaxSeal() {
  return <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="30" /><circle cx="40" cy="40" r="26" /><path d="M40 53C35 49 24 43 24 35a9 9 0 0 1 16-5 9 9 0 0 1 16 5c0 8-11 14-16 18Z" /><path d="m36 17 4-4 4 4m-8 46 4 4 4-4" /></svg>;
}

export function VerticalEnvelopeOpening({ children, config, onInteract, onComplete }: OpeningAnimationProps) {
  const [phase, setPhase] = useState<"closed" | "opening" | "complete">("closed");
  const [failedSeal, setFailedSeal] = useState<string>();
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 390, height: 844 });
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const resize = (width: number, height: number) => setViewport((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    resize(node.clientWidth, node.clientHeight);
    const observer = new ResizeObserver(([entry]) => { if (entry) resize(entry.contentRect.width, entry.contentRect.height); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const reduceMotion = Boolean(useReducedMotion());
  const palette = resolveEnvelopeSettings(config);
  const timing = getEnvelopeTimeline(palette.duration, reduceMotion);
  const frame = getEnvelopeFrame(viewport.width, viewport.height);
  const paper = useMemo(() => {
    const surface = (color: string) => `url("${resolveSectionTexture({ backgroundType: "color-texture", background: { type: "color", color }, textureId: "soft-paper", textureOpacity: .65, textureFit: "repeat" }, 256, 256).materialSrc}")`;
    return { body: surface(palette.envelope), flap: surface(palette.flap), inner: surface(palette.inner) };
  }, [palette.envelope, palette.flap, palette.inner]);
  const opening = phase === "opening";
  const ease = [.45, 0, .2, 1] as const;
  const transition = (part: keyof Omit<typeof timing, "total">) => ({ ...timing[part], ease });
  const letterPosition = phase === "complete" ? { x: 0, y: 0, scale: 1 } : { x: frame.letterX, y: frame.letterY + frame.letterLift, scale: frame.letterScale };
  const open = () => {
    // Also guards clicks arriving before React commits the first update.
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("opening");
    onInteract?.();
  };
  const finish = () => {
    if (!startedRef.current || completedRef.current) return;
    completedRef.current = true;
    setPhase("complete");
    onComplete?.();
  };
  const customSeal = palette.sealImageUrl && palette.sealImageUrl !== failedSeal;
  return (
    <div className={`opening-stage immersive-envelope-stage portrait-envelope-stage phase-${phase}${phase === "complete" ? " is-opened" : ""}`} data-envelope-phase={phase} style={{
      "--opening-primary": palette.envelope, "--opening-secondary": palette.inner,
      "--opening-flap": palette.flap, "--opening-accent": palette.seal,
      "--opening-background": palette.background, "--envelope-paper": paper.body,
      "--envelope-flap-paper": paper.flap, "--envelope-inner-paper": paper.inner,
    } as CSSProperties}>
      <div className="envelope-viewport-measure" ref={viewportRef} aria-hidden="true" />
      {/* One live document, mounted once. Uniform outer scale forms a portrait
          letter without changing its responsive coordinates or duplicating forms. */}
      <motion.div className="envelope-invitation" inert={phase !== "complete"} aria-hidden={phase !== "complete"}
        style={{ width: viewport.width, height: phase === "complete" ? "auto" : frame.letterClipHeight, transformOrigin: "top left" }}
        initial={false} animate={opening ? {
          x: 0, scale: 1, y: reduceMotion ? 0 : [frame.letterY + frame.letterLift, frame.letterY, 0],
          borderRadius: 0, boxShadow: "0 0 0 rgba(45,30,20,0)",
        } : { ...letterPosition, borderRadius: phase === "complete" ? 0 : 12, boxShadow: phase === "complete" ? "0 0 0 rgba(45,30,20,0)" : "0 4px 18px rgba(45,30,20,.18)" }}
        transition={opening ? { x: transition("handoff"), scale: transition("handoff"), y: { ...transition("letter"), ...(reduceMotion ? {} : { times: [0, .625, 1] }) }, borderRadius: transition("handoff"), boxShadow: transition("handoff") } : { duration: 0 }}
        onAnimationComplete={() => { if (opening) finish(); }}>{children}</motion.div>
      {phase !== "complete" && <div className="envelope-overlay" data-reduced-motion={reduceMotion || undefined}>
        <motion.div className="envelope-object" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} initial={false} animate={{ opacity: opening ? 0 : 1 }} transition={transition("handoff")}>
        <motion.div className="envelope-inside" initial={false} animate={{ opacity: opening ? 0 : 1 }} transition={transition("inside")} aria-hidden="true" />
        <motion.div className="envelope-panel envelope-bottom" initial={false} animate={opening ? { rotateX: reduceMotion ? 0 : 58, y: reduceMotion ? 0 : "6%", opacity: reduceMotion ? 0 : 1 } : { rotateX: 0, y: 0, opacity: 1 }} transition={transition("bottom")} aria-hidden="true"><span className="envelope-paper" /></motion.div>
        <motion.div className="envelope-panel envelope-left" initial={false} animate={opening ? { rotateY: reduceMotion ? 0 : -58, x: reduceMotion ? 0 : "-8%", opacity: reduceMotion ? 0 : 1 } : { rotateY: 0, x: 0, opacity: 1 }} transition={transition("left")} aria-hidden="true"><span className="envelope-paper" /></motion.div>
        <motion.div className="envelope-panel envelope-right" initial={false} animate={opening ? { rotateY: reduceMotion ? 0 : 58, x: reduceMotion ? 0 : "8%", opacity: reduceMotion ? 0 : 1 } : { rotateY: 0, x: 0, opacity: 1 }} transition={transition("right")} aria-hidden="true"><span className="envelope-paper" /></motion.div>
        <motion.div className="envelope-panel envelope-top" initial={false} animate={{ rotateX: opening && !reduceMotion ? -110 : 0, opacity: opening && reduceMotion ? 0 : 1 }} transition={transition("top")} aria-hidden="true"><span className="envelope-paper envelope-flap-front" /><span className="envelope-paper envelope-flap-inside" /></motion.div>
        <div className="envelope-seal-position" aria-hidden="true"><motion.span className={`envelope-wax-seal${customSeal ? " is-custom" : ""}`} initial={false} animate={opening ? { opacity: 0, scale: reduceMotion ? 1 : .85, y: reduceMotion ? 0 : -8 } : { opacity: 1, scale: 1, y: 0 }} transition={transition("seal")}>
          {customSeal ? <img src={palette.sealImageUrl} alt="" draggable={false} onError={() => setFailedSeal(palette.sealImageUrl)} /> : <WaxSeal />}
        </motion.span></div>
        {phase === "closed" && <span className="envelope-open-hint">{palette.hint}</span>}
        <button className="envelope-trigger" onClick={open} disabled={phase !== "closed"} aria-label="Ouvrir le faire-part" />
        </motion.div>
      </div>}
      {phase === "complete" && <span className="sr-only" aria-live="polite">Faire-part ouvert</span>}
    </div>
  );
}
