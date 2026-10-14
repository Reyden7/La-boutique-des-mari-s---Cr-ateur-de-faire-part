import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AnimationConfig } from "../../types/editor";
import { isTextAnimation, textRevealSegments, textRevealTiming } from "../../utils/textAnimation";
import { resolveElementAnimation } from "../../utils/elementAnimation";
import { useElementEntrance, useEntranceFinal } from "./useEntranceVisibility";

type Rect = { x: number; y: number; width: number; height: number; unit: number };
type Measurement = { width: number; height: number; rects: Rect[]; underline: Rect | null };

/** Animate a mask over the original single text node. No span splitting:
 * kerning, ligatures, wrapping, alignment and final typography stay unchanged. */
export function TextEntrance({ text, animation, style, play = true }: { text: string; animation?: AnimationConfig; style: CSSProperties; play?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const entranceReady = useElementEntrance();
  const final = useEntranceFinal();
  const reducedMotion = useReducedMotion();
  const id = `text-mask-${useId().replace(/:/g, "")}`;
  const effect = animation?.type;
  const enabled = isTextAnimation(effect) && !reducedMotion && !final;
  const units = useMemo(() => textRevealSegments(text, effect === "word-by-word"), [text, effect]);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [done, setDone] = useState(false);
  const [cursorUnit, setCursorUnit] = useState(-1);
  const resolved = resolveElementAnimation(animation);
  const active = play && entranceReady;
  useEffect(() => { setDone(false); setCursorUnit(-1); }, [text, effect, animation?.duration]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !enabled) { setMeasurement(null); return; }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const clone = node.cloneNode(true) as HTMLDivElement;
      const computed = getComputedStyle(node);
      const width = Number.parseFloat(computed.width) || node.clientWidth;
      const height = Number.parseFloat(computed.height) || node.clientHeight;
      // Offscreen, untransformed clone avoids parent rotation/Preview zoom in ranges.
      Object.assign(clone.style, { position: "fixed", left: "-100000px", top: "0", width: `${width}px`, height: `${height}px`,
        visibility: "hidden", opacity: "1", transform: "none", mask: "none", webkitMask: "none", transition: "none", animation: "none",
        fontFamily: computed.fontFamily, fontSize: computed.fontSize, fontWeight: computed.fontWeight, fontStyle: computed.fontStyle,
        fontFeatureSettings: computed.fontFeatureSettings, fontKerning: computed.fontKerning, fontVariantLigatures: computed.fontVariantLigatures,
        letterSpacing: computed.letterSpacing, lineHeight: computed.lineHeight, textAlign: computed.textAlign, textDecoration: computed.textDecoration,
      });
      clone.removeAttribute("id"); clone.setAttribute("aria-hidden", "true");
      document.body.appendChild(clone);
      try {
        const textNode = clone.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error("No text");
        const bounds = clone.getBoundingClientRect();
        const range = document.createRange(), rects: Rect[] = [];
        units.forEach((unit, index) => {
          range.setStart(textNode, unit.start); range.setEnd(textNode, unit.end);
          for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) rects.push({
            x: box.left - bounds.left - 2, y: box.top - bounds.top - 2, width: box.width + 4, height: box.height + 4, unit: index,
          });
        });
        const last = rects.at(-1);
        const line = last ? rects.filter((box) => Math.abs(box.y - last.y) < 2) : [];
        const left = line.length ? Math.min(...line.map((box) => box.x)) : 0;
        const right = line.length ? Math.max(...line.map((box) => box.x + box.width)) : 0;
        setMeasurement({ width, height, rects,
          underline: last ? { x: left, y: last.y + last.height - 2, width: right - left, height: 2, unit: 0 } : null });
        if (!rects.length) setDone(true);
      } catch { setDone(true); } // Never leave text hidden if measurement fails.
      finally { clone.remove(); }
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(node);
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { cancelled = true; observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [enabled, units, style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, style.lineHeight, style.letterSpacing, style.textAlign, style.justifyContent]);

  const masking = enabled && !done && effect !== "draw-underline";
  const maskStyle: CSSProperties = masking && measurement ? { maskImage: `url(#${id})`, WebkitMaskImage: `url(#${id})`, maskMode: "alpha" } : {};
  const cursor = measurement?.rects.filter((rect) => rect.unit === cursorUnit).at(-1);
  const duration = resolved?.duration ?? .8;
  return <div ref={surface} className="text-entrance" data-text-effect={enabled ? effect : "none"} data-text-complete={!enabled || done} style={{ width: "100%", height: "100%", position: "relative" }}>
    <motion.div ref={ref} style={{ ...style, ...maskStyle, visibility: enabled && !done && !measurement ? "hidden" : undefined }}
      initial={false} animate={{ opacity: enabled && effect === "draw-underline" && !done ? active ? 1 : 0 : 1 }}
      transition={effect === "draw-underline" && enabled ? { delay: active ? duration * .55 : 0, duration: active ? duration * .45 : 0 } : { duration: 0 }}
      onAnimationComplete={() => { if (enabled && effect === "draw-underline" && active) setDone(true); }}>{text}</motion.div>
    {masking && measurement && <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }}>
      <defs><mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={-10} y={-10} width={measurement.width + 20} height={measurement.height + 20} style={{ maskType: "alpha" }}>
        {measurement.rects.map((rect, index) => <motion.rect key={index} x={rect.x} y={rect.y} height={rect.height} fill="white"
          initial={{ opacity: 0, width: effect === "handwriting" ? 0 : rect.width }}
          animate={active ? { opacity: 1, width: rect.width } : { opacity: 0, width: effect === "handwriting" ? 0 : rect.width }}
          transition={active ? textRevealTiming(rect.unit, units.length, duration, effect === "typewriter") : { duration: 0 }}
          onAnimationComplete={() => {
            if (!active) return;
            if (effect === "typewriter") setCursorUnit((current) => Math.max(current, rect.unit));
            if (index === measurement.rects.length - 1) setDone(true);
          }} />)}
      </mask></defs>
    </svg>}
    {enabled && !done && active && effect === "typewriter" && animation?.showCursor !== false && cursor && <span aria-hidden="true" className="text-typing-cursor" style={{ left: cursor.x + cursor.width - 2, top: cursor.y + 2, height: cursor.height - 4, background: style.color }} />}
    {enabled && effect === "draw-underline" && measurement?.underline && !(done && String(style.textDecoration).includes("underline")) && <svg aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", color: style.color }}>
      <motion.line x1={measurement.underline.x} x2={measurement.underline.x + measurement.underline.width} y1={measurement.underline.y} y2={measurement.underline.y} stroke="currentColor" strokeWidth="1.5"
        initial={{ pathLength: 0 }} animate={{ pathLength: active ? 1 : 0 }} transition={{ duration: active ? duration * .55 : 0, ease: "easeInOut" }} />
    </svg>}
  </div>;
}
