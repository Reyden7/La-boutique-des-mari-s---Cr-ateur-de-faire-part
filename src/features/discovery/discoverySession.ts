import { create } from "zustand";
import type { WeddingProject } from "../../types/editor";

/** Intentionally no persist middleware or browser storage. */
export const useDiscoverySession = create<{
  draftId: string | null;
  warningShown: boolean;
  prompt: "account" | "publish" | null;
  converting: boolean;
  error: string;
  success: string;
  retry: number;
}>(() => ({ draftId: null, warningShown: false, prompt: null, converting: false, error: "", success: "", retry: 0 }));

export const isDiscoveryProject = (project: Pick<WeddingProject, "id">) =>
  useDiscoverySession.getState().draftId === project.id;
export const requestDiscoveryAccount = (prompt: "account" | "publish" = "account") =>
  useDiscoverySession.setState({ prompt });

export type TemporaryAsset = {
  id: string; url: string; file: File; kind: "image" | "audio" | "font";
  options?: { folder: "program-icons" | "envelope/bases" | "envelope/flaps" | "envelope/seals" | "doors/left" | "doors/right" };
};
const files = new Map<string, TemporaryAsset>();
export const temporaryDiscoveryAssets = () => [...files.values()];
export const isTemporaryAsset = (id: string) => id.startsWith("discovery-asset:");
const isTemporaryReference = (value: string) => /^(blob:(?:https?:|null\/|nodedata:)|discovery-asset:)/.test(value);
export function hasTemporaryReferences(value: unknown): boolean {
  if (typeof value === "string") return isTemporaryReference(value);
  if (Array.isArray(value)) return value.some(hasTemporaryReferences);
  return Boolean(value && typeof value === "object" && Object.values(value).some(hasTemporaryReferences));
}
export function registerDiscoveryAsset(file: File, kind: TemporaryAsset["kind"], options?: TemporaryAsset["options"]) {
  if (!useDiscoverySession.getState().draftId || useDiscoverySession.getState().converting) throw new Error("Import temporaire indisponible pendant la sauvegarde.");
  const asset = { id: `discovery-asset:${crypto.randomUUID()}`, url: URL.createObjectURL(file), file, kind, options };
  files.set(asset.id, asset);
  return { id: asset.id, url: asset.url, path: "" };
}
// Removed assets remain in memory for Undo, then all URLs are released on exit/success.
export function discardDiscoverySession() {
  for (const asset of files.values()) URL.revokeObjectURL(asset.url);
  files.clear();
  useDiscoverySession.setState({ draftId: null, warningShown: false, prompt: null, converting: false, error: "" });
}
export function beginDiscoverySession(id: string) {
  discardDiscoverySession();
  useDiscoverySession.setState({ draftId: id, success: "" });
}

/** Exact string replacement, not JSON search/replace (also handles asset IDs). */
export function mapDiscoveryReferences<T>(value: T, replacements: ReadonlyMap<string, string>, stripTemporary = false): T {
  if (typeof value === "string") return (replacements.get(value) ?? (stripTemporary && isTemporaryReference(value) ? undefined : value)) as T;
  if (Array.isArray(value)) return value.map((item) => mapDiscoveryReferences(item, replacements, stripTemporary)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapDiscoveryReferences(item, replacements, stripTemporary)])) as T;
  return value;
}

export function convertDiscoveryHistory(values: WeddingProject[], references: ReadonlyMap<string, string>, saved: WeddingProject) {
  return mapDiscoveryReferences(values, references).map((snapshot) => ({ ...snapshot, id: saved.id, ownerId: saved.ownerId, createdAt: saved.createdAt }));
}
