import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import type { AnimationConfig } from "../../types/editor";
import { useAnimationViewport } from "../../components/renderer/AnimatedElement";
import { isTextAnimation } from "../../utils/textAnimation";
import { curvedTextAnimationFrame } from "./curvedTextAnimation";
import { paintCurvedText, type CurvedTextOptions } from "./curvedTextLayout";
import { useCurvedTextLayout } from "./useCurvedTextLayout";

/** Same geometry, font metrics and Canvas painter as the Konva node. */
export function CurvedTextRenderer({ options, color, animation, play = true }: { options: CurvedTextOptions; color: string; animation?: AnimationConfig; play?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const root = useAnimationViewport();
  const inView = useInView(ref, { root, once: true, amount: "some" });
  const reducedMotion = useReducedMotion();
  const layout = useCurvedTextLayout(options);
  const textAnimation = isTextAnimation(animation?.type) && !reducedMotion;
  const active = play && inView;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    let frame = 0, cancelled = false, elapsed = textAnimation && !active ? -1 : 0;
    const start = performance.now();
    const resize = () => {
      const ratio = (window.devicePixelRatio || 1) * Math.max(.05, canvas.clientWidth / Math.max(1, options.width));
      canvas.width = Math.max(1, Math.ceil(options.width * ratio));
      canvas.height = Math.max(1, Math.ceil(options.height * ratio));
    };
    const paint = () => {
      const state = curvedTextAnimationFrame(layout, animation, elapsed, Boolean(reducedMotion));
      context.setTransform(canvas.width / options.width, 0, 0, canvas.height / options.height, 0, 0);
      context.clearRect(0, 0, options.width, options.height);
      paintCurvedText(context, layout, { color, glyphOpacity: state.glyphOpacity,
        underline: options.underline || animation?.type === "draw-underline", underlineProgress: state.underlineProgress, cursorUnit: state.cursorUnit });
      canvas.dataset.curveProgress = String(state.progress);
      return state.progress;
    };
    resize(); paint();
    const tick = (now: number) => {
      if (cancelled) return;
      elapsed = (now - start) / 1000;
      if (paint() < 1) frame = requestAnimationFrame(tick);
    };
    if (textAnimation && active) frame = requestAnimationFrame(tick);
    const observer = new ResizeObserver(() => { resize(); paint(); }); observer.observe(canvas);
    const refreshDensity = () => { resize(); paint(); }; window.addEventListener("resize", refreshDensity);
    return () => { cancelled = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", refreshDensity); };
  }, [layout, color, active, textAnimation, animation?.type, animation?.duration, animation?.delay, animation?.showCursor, reducedMotion, options.underline, options.width, options.height]);
  return <canvas ref={ref} role="img" aria-label={options.text} data-curved-text="true" data-curve-fit={layout.scale} style={{ display: "block", width: "100%", height: "100%" }}>{options.text}</canvas>;
}
