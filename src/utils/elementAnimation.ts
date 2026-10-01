import type { AnimationConfig, AnimationType } from "../types/editor";

export function parseAnimationSeconds(value: number | string | undefined, fallback: number, maximum = 30): number {
  const parsed = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(0, parsed))
    : fallback;
}

export function resolveElementAnimation(animation?: AnimationConfig | null) {
  if (!animation || animation.type === "none") return null;
  return {
    type: animation.type,
    duration: parseAnimationSeconds(animation.duration, 0.8),
    delay: parseAnimationSeconds(animation.delay, 0),
  };
}

/** Section opacity styles its surface; only its temporary entrance effect covers children. */
export function animationOpacityPlacement(opacity: number | undefined, hasOverlayChildren: boolean) {
  const finalOpacity = typeof opacity === "number" && Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  return hasOverlayChildren
    ? { motionOpacity: 1, contentOpacity: finalOpacity }
    : { motionOpacity: finalOpacity, contentOpacity: 1 };
}

export function elementAnimationFrames(type: AnimationType, finalOpacity: number) {
  const visible = { opacity: finalOpacity, x: 0, y: 0, scale: 1, rotate: 0 };
  switch (type) {
    case "fade": return { hidden: { ...visible, opacity: 0 }, visible };
    case "slide-left": return { hidden: { ...visible, opacity: 0, x: -42 }, visible };
    case "slide-right": return { hidden: { ...visible, opacity: 0, x: 42 }, visible };
    case "slide-up": return { hidden: { ...visible, opacity: 0, y: -42 }, visible };
    case "slide-down": return { hidden: { ...visible, opacity: 0, y: 42 }, visible };
    case "zoom": return { hidden: { ...visible, opacity: 0, scale: 0.85 }, visible };
    case "rotate": return { hidden: { ...visible, opacity: 0, rotate: -20 }, visible };
    default: return { hidden: visible, visible };
  }
}
