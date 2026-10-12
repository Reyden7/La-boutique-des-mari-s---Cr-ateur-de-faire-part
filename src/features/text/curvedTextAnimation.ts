import type { AnimationConfig } from "../../types/editor";
import { isTextAnimation } from "../../utils/textAnimation";
import { parseAnimationSeconds } from "../../utils/elementAnimation";
import type { CurvedGlyph, CurvedTextLayout } from "./curvedTextLayout";

/** Progress controls visibility only; positions/font metrics never animate. */
export function curvedTextAnimationFrame(layout: CurvedTextLayout, animation: AnimationConfig | undefined, elapsed: number, reducedMotion = false) {
  const enabled = !reducedMotion && isTextAnimation(animation?.type);
  const duration = parseAnimationSeconds(animation?.duration, .8);
  const delay = parseAnimationSeconds(animation?.delay, 0);
  const progress = enabled ? Math.min(1, Math.max(0, duration ? (elapsed - delay) / duration : elapsed >= delay ? 1 : 0)) : 1;
  const count = animation?.type === "word-by-word" ? layout.wordCount : layout.unitCount;
  const amount = progress * Math.max(1, count);
  const glyphOpacity = (glyph: CurvedGlyph) => {
    if (progress === 1 || !enabled) return 1;
    if (animation?.type === "draw-underline") return Math.max(0, (progress - .55) / .45);
    const index = animation?.type === "word-by-word" ? glyph.word : glyph.unit;
    const value = Math.min(1, Math.max(0, amount - index));
    return animation?.type === "typewriter" ? value >= 1 ? 1 : 0 : value;
  };
  return { progress, glyphOpacity, underlineProgress: animation?.type === "draw-underline" ? Math.min(1, progress / .55) : progress,
    cursorUnit: enabled && animation?.type === "typewriter" && animation.showCursor !== false && progress > 0 && progress < 1 && Math.floor(elapsed / .35) % 2 === 0 ? Math.floor(amount) - 1 : undefined };
}
