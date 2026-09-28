import type { IntroductionMode, OpeningAnimationType, ParticleConfig, ProjectAudioConfig, WeddingProject } from "../types/editor";
import { deleteRemoteProject, isSupabaseConfigured, loadRemoteProjects, saveRemoteProject } from "../services/projectRepository";
import { migratePagesToScrollableDocument } from "./documentLayout";
import { DEFAULT_RSVP_STYLE, resolveRsvpStyle } from "../config/rsvpStyle";
import { resolveWelcomePage } from "../features/welcome/welcomeDefaults";
import { normalizeSectionMembership } from "./sectionLayout";
import { normalizeElementLocks } from "./elementLocking";

const STORAGE_KEY = "lbm-studio-projects-v1";

const defaultAudio = (): ProjectAudioConfig => ({ enabled: false, source: null, volume: 0.7, loop: true, startMode: "opening-interaction", fadeInDuration: 2 });
const defaultParticles = (): ParticleConfig => ({ enabled: false, shape: "heart", direction: "down", speed: 30, quantity: 25, colors: ["#FFFFFF", "#F0CACA"], minSize: 8, maxSize: 18, opacity: 0.8, layer: "front" });
const defaultRsvp = () => ({ enabled: false, purchased: false, locked: false, title: "Confirmez votre présence", description: "Merci de nous répondre avant la date indiquée.", submitLabel: "Envoyer ma réponse", fields: [
  { id: crypto.randomUUID(), label: "Présence", type: "single_choice" as const, required: true, options: ["Présent", "Pas présent"] },
  { id: crypto.randomUUID(), label: "Nombre de personnes", type: "number" as const, required: true },
  { id: crypto.randomUUID(), label: "Régime alimentaire", type: "select" as const, required: false, options: ["Aucun", "Végétarien", "Vegan", "Sans gluten", "Autre"] },
  { id: crypto.randomUUID(), label: "Enfants", type: "boolean" as const, required: false },
], style: { ...DEFAULT_RSVP_STYLE } });
const normalizeBackground = (background: WeddingProject["pages"][number]["background"]) => ({
  type: background.type,
  color: background.color ?? "#fffdf9",
  gradient: background.gradient ?? { type: "linear" as const, color1: "#f5efe8", color2: "#d9c7b8", angle: 135 },
  imageUrl: background.imageUrl,
});

export const normalizeProject = (value: unknown): WeddingProject | null => {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Partial<WeddingProject> & { openingAnimation?: string; published?: boolean };
  if (!legacy.id || !legacy.name || !Array.isArray(legacy.pages)) return null;
  const legacyType: OpeningAnimationType = legacy.openingAnimation === "none" ? "none" : "envelope";
  const pages = migratePagesToScrollableDocument(legacy.pages).map((page) => ({
    ...page,
    elements: normalizeElementLocks(normalizeSectionMembership(page.elements)),
    background: normalizeBackground(page.background),
    backgroundSections: page.backgroundSections?.map((section) => ({ ...section, background: normalizeBackground(section.background) })),
  }));
  const defaultRsvpConfig = defaultRsvp();
  const rsvp = legacy.rsvp
    ? { ...defaultRsvpConfig, ...legacy.rsvp, locked: legacy.rsvp.locked ?? false, style: resolveRsvpStyle(legacy.rsvp.style) }
    : defaultRsvpConfig;
  const resolvedWelcomePage = resolveWelcomePage(legacy.welcomePage);
  const introductionMode: IntroductionMode = legacy.introductionMode
    ?? (resolvedWelcomePage.enabled ? "welcome" : (legacy.opening?.type ?? legacyType) !== "none" ? "classic" : "none");
  return {
    ...legacy,
    id: legacy.id,
    name: legacy.name,
    pages,
    createdAt: legacy.createdAt ?? new Date().toISOString(),
    updatedAt: legacy.updatedAt ?? new Date().toISOString(),
    opening: legacy.opening ?? { type: legacyType, duration: 3.4, colors: ["#E7D2C3", "#F5E9DF", "#B58A62"], variant: "classic", customSettings: { flapColor: "#DFC4B1", backgroundColor: "#F5EFEA", hintText: "Touchez pour ouvrir" } },
    audio: legacy.audio ?? defaultAudio(),
    particles: legacy.particles ?? defaultParticles(),
    customFonts: legacy.customFonts ?? [],
    rsvp,
    introductionMode,
    welcomePage: { ...resolvedWelcomePage, enabled: introductionMode === "welcome" },
    status: legacy.status ?? (legacy.published ? "published" : "draft"),
    paymentStatus: legacy.paymentStatus ?? "unpaid",
  };
};

export const loadProjects = (): WeddingProject[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const values = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(values) ? values.map(normalizeProject).filter((project): project is WeddingProject => project !== null) : [];
  } catch {
    return [];
  }
};

export const saveProjects = (projects: WeddingProject[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const upsertProject = (project: WeddingProject) => {
  const projects = loadProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.unshift(project);
  saveProjects(projects);
};

export const syncProject = async (project: WeddingProject) => {
  if (!isSupabaseConfigured) return project;
  const remoteProject = await saveRemoteProject(project);
  upsertProject(remoteProject);
  return remoteProject;
};

export const hydrateProjects = async (ownerId: string) => {
  const allLocalProjects = loadProjects();
  const visibleLocalProjects = allLocalProjects.filter((project) => !project.ownerId || project.ownerId === ownerId);
  if (!isSupabaseConfigured) return visibleLocalProjects;
  const remoteProjects = (await loadRemoteProjects()).map(normalizeProject).filter((project): project is WeddingProject => project !== null);
  const merged = new Map(visibleLocalProjects.map((project) => [project.id, project]));
  for (const project of remoteProjects) {
    const localProject = merged.get(project.id);
    if (!localProject || project.updatedAt >= localProject.updatedAt) merged.set(project.id, project);
  }
  const projects = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const hiddenLocalProjects = allLocalProjects.filter((project) => project.ownerId && project.ownerId !== ownerId);
  saveProjects([...projects, ...hiddenLocalProjects]);
  return projects;
};

export const getProject = (projectId: string, ownerId: string) => loadProjects().find((project) => project.id === projectId && project.ownerId === ownerId);

export const deleteProject = (projectId: string) => {
  const projects = loadProjects();
  const project = projects.find((item) => item.id === projectId);
  saveProjects(projects.filter((item) => item.id !== projectId));
  if (isSupabaseConfigured && project?.ownerId) void deleteRemoteProject(projectId).catch((error) => console.warn("Suppression distante différée", error));
};

export const remoteErrorSummary = (error: unknown) => {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { code?: unknown; message?: unknown };
  return [value.code, value.message].filter((item): item is string => typeof item === "string").join(" — ") || "Erreur distante inconnue";
};
