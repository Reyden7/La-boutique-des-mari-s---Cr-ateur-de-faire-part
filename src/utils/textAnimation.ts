import type { AnimationType, TextAnimationType } from "../types/editor";

export const TEXT_ANIMATIONS = ["typewriter", "handwriting", "word-by-word", "letter-by-letter", "draw-underline"] as const;
export const isTextAnimation = (type: AnimationType | undefined): type is TextAnimationType => TEXT_ANIMATIONS.includes(type as TextAnimationType);

/** UTF-16 offsets for DOM Range; Unicode graphemes keep emoji/accents together. */
export function textRevealSegments(text: string, words = false) {
  const segmenter = new Intl.Segmenter("fr", { granularity: words ? "word" : "grapheme" });
  return [...segmenter.segment(text)].filter((item) => /\S/u.test(item.segment))
    .map((item) => ({ start: item.index, end: item.index + item.segment.length, text: item.segment }));
}

/** Duration is total reveal time, never multiplied by character count. */
export function textRevealTiming(index: number, count: number, duration: number, stepped = false) {
  const step = duration / Math.max(1, count);
  return { delay: (stepped ? index + 1 : index) * step, duration: stepped ? 0 : step };
}
