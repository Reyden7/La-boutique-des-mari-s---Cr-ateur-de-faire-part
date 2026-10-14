import type { AnimationConfig, WeddingProject } from "../types/editor";

/** Non-destructive, targeted legacy cleanup: opening timings are untouched. */
export function withoutAnimationDelay<T extends { animation?: AnimationConfig }>(value: T): T {
  if (!value.animation || !("delay" in value.animation)) return value;
  const { delay: _legacyDelay, ...animation } = value.animation as AnimationConfig & { delay?: unknown };
  return { ...value, animation };
}

export function withoutProjectAnimationDelays<T extends Partial<WeddingProject>>(project: T): T {
  return { ...project,
    ...(project.pages ? { pages: project.pages.map(page => ({ ...page, elements: page.elements.map(withoutAnimationDelay) })) } : {}),
    ...(project.rsvp ? { rsvp: withoutAnimationDelay(project.rsvp) } : {}),
    ...(project.welcomePage?.elements ? { welcomePage: { ...project.welcomePage, elements: project.welcomePage.elements.map(withoutAnimationDelay) } } : {}),
  };
}
