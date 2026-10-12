import type { IntroductionMode, OpeningAnimationConfig } from "../../types/editor";

// Read-only compatibility for retired values, never exposed as editable types.
const isRetiredOpening = (value: unknown) => typeof value === "string"
  && ["curtain", "curtains", "rideau", "rideaux"].includes(value.trim().toLowerCase());

export function normalizeRetiredOpening<T extends {
  opening?: OpeningAnimationConfig;
  openingAnimation?: string;
  introductionMode?: IntroductionMode;
  welcomePage?: { enabled: boolean };
}>(project: T): T {
  const retiredMode = isRetiredOpening(project.introductionMode);
  const retiredOpening = isRetiredOpening(project.opening?.type)
    || (!project.opening && isRetiredOpening(project.openingAnimation));
  if (!retiredMode && !retiredOpening) return project;

  // A deliberately selected welcome page remains intact even if an unused
  // legacy opening is still stored. Current openings override old aliases.
  const keepWelcome = !retiredMode && (project.introductionMode === "welcome"
    || (!project.introductionMode && project.welcomePage?.enabled));
  return {
    ...project,
    opening: { ...project.opening, type: "none", duration: 0 },
    introductionMode: keepWelcome ? "welcome" : "none",
    ...(project.welcomePage && !keepWelcome ? { welcomePage: { ...project.welcomePage, enabled: false } } : {}),
  };
}
