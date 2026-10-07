import type { WeddingProject } from "../src/types/editor";
import { upsertProject } from "../src/utils/storage";
export async function uploadProjectAsset(_project: WeddingProject, file: File) {
  const id = crypto.randomUUID();
  const url = `${window.location.origin}/__qa-envelope-assets/${id}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!response.ok) throw new Error("Local fixture upload failed");
  return { id, url, path: url };
}
export async function deleteProjectAsset(id: string) { await fetch(`/__qa-envelope-assets/${id}`, { method: "DELETE" }); }
export async function deleteProjectAssetIfUnused(project: WeddingProject, id: string, url: string) {
  if (JSON.stringify(project).includes(url)) return false;
  upsertProject(project);
  await deleteProjectAsset(id);
  return true;
}
