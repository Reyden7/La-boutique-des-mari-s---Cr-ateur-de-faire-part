import type { OpeningAnimationType, ParticleConfig, ProjectAudioConfig, WeddingProject } from "../types/editor";
import { deleteRemoteProject, isSupabaseConfigured, loadRemoteProjects, saveRemoteProject } from "../services/projectRepository";

const STORAGE_KEY = "lbm-studio-projects-v1";

const defaultAudio = (): ProjectAudioConfig => ({ enabled: false, source: null, volume: 0.7, loop: true, startMode: "opening-interaction", fadeInDuration: 2 });
const defaultParticles = (): ParticleConfig => ({ enabled: false, shape: "heart", direction: "down", speed: 30, quantity: 25, colors: ["#FFFFFF", "#F0CACA"], minSize: 8, maxSize: 18, opacity: 0.8, layer: "front" });

export const normalizeProject = (value: unknown): WeddingProject | null => {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Partial<WeddingProject> & { openingAnimation?: string; published?: boolean };
  if (!legacy.id || !legacy.name || !Array.isArray(legacy.pages)) return null;
  const legacyType: OpeningAnimationType = legacy.openingAnimation === "none" ? "none" : "envelope";
  return {
    ...legacy,
    id: legacy.id,
    name: legacy.name,
    pages: legacy.pages,
    createdAt: legacy.createdAt ?? new Date().toISOString(),
    updatedAt: legacy.updatedAt ?? new Date().toISOString(),
    opening: legacy.opening ?? { type: legacyType, duration: 3.4, colors: ["#E7D2C3", "#F5E9DF", "#B58A62"], variant: "classic", customSettings: { flapColor: "#DFC4B1", backgroundColor: "#F5EFEA", hintText: "Touchez pour ouvrir" } },
    audio: legacy.audio ?? defaultAudio(),
    particles: legacy.particles ?? defaultParticles(),
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

export const hydrateProjects = async () => {
  if (!isSupabaseConfigured) return loadProjects();
  const remoteProjects = await loadRemoteProjects();
  const localProjects = loadProjects();
  const merged = new Map(localProjects.map((project) => [project.id, project]));
  for (const project of remoteProjects) {
    const localProject = merged.get(project.id);
    if (!localProject || project.updatedAt >= localProject.updatedAt) merged.set(project.id, project);
  }
  const projects = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  saveProjects(projects);
  return projects;
};

export const getProject = (projectId: string) => loadProjects().find((project) => project.id === projectId);

export const deleteProject = (projectId: string) => {
  saveProjects(loadProjects().filter((project) => project.id !== projectId));
  if (isSupabaseConfigured) void deleteRemoteProject(projectId).catch((error) => console.warn("Suppression distante différée", error));
};
