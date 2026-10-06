import type { ProgramStepIcon } from "../../types/editor";
import { getScheduleIcon } from "../../config/scheduleIcons.ts";

/** No SVG/script/data HTML; project imports are validated raster files. */
export function getProgramIconUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (/^data:image\/(png|webp|jpeg);base64,[a-z\d+/=\s]+$/i.test(url)) return url;
  try { return ["https:", "http:"].includes(new URL(url).protocol) ? url : undefined; }
  catch { return undefined; }
}

/** Normalize at read time, keeping legacy project data intact. */
export function resolveProgramStepIcon(value: unknown): ProgramStepIcon | undefined {
  if (typeof value === "string") return getScheduleIcon(value) ? { type: "preset", name: value } : undefined;
  if (!value || typeof value !== "object") return undefined;
  const icon = value as Record<string, unknown>;
  if (icon.type === "preset" && typeof icon.name === "string" && getScheduleIcon(icon.name)) return { type: "preset", name: icon.name };
  const url = icon.type === "custom" ? getProgramIconUrl(icon.url) : undefined;
  if (!url) return undefined;
  return { type: "custom", url,
    ...(typeof icon.assetId === "string" ? { assetId: icon.assetId } : {}),
    ...(typeof icon.name === "string" ? { name: icon.name } : {}),
    ...(typeof icon.globalAssetId === "string" ? { globalAssetId: icon.globalAssetId } : {}),
  };
}

export const getProgramIconKey = (icon: ProgramStepIcon) => icon.type === "preset" ? icon.name : `custom-${icon.globalAssetId ?? icon.assetId ?? icon.url}`;
