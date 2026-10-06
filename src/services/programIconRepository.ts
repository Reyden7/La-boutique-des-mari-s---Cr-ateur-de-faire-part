import type { WeddingProject, ProgramCustomIcon } from "../types/editor";
import { uploadProjectAsset } from "./assetRepository";
import { getProgramIconFileInfo } from "../../supabase/functions/_shared/programIconFormats.ts";

export async function uploadProgramIconAsset(project: WeddingProject, file: File): Promise<ProgramCustomIcon> {
  const { mimeType } = getProgramIconFileInfo(file);
  const normalized = new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
  const asset = await uploadProjectAsset(project, normalized, "image", { folder: "program-icons" });
  return { type: "custom", url: asset.url, assetId: asset.id, name: file.name };
}
