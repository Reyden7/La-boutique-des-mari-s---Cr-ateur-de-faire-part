export const PROGRAM_ICON_ACCEPT = ".png,.webp,.jpg,.jpeg";
export const MAX_PROGRAM_ICON_BYTES = 5 * 1024 * 1024;
export const PROGRAM_ICON_FORMAT_ERROR = "Format d’icône non pris en charge. Utilisez PNG, WebP ou JPG/JPEG (PNG/WebP transparent recommandé).";
const MIME_TYPES: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };

/** Same validation in the project upload and global publication. */
export function getProgramIconFileInfo(file: { name: string; type?: string | null; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = Object.hasOwn(MIME_TYPES, extension) ? MIME_TYPES[extension] : undefined;
  const suppliedMime = file.type?.toLowerCase();
  if (!mimeType || (suppliedMime && suppliedMime !== "application/octet-stream" && suppliedMime !== mimeType)) throw new Error(PROGRAM_ICON_FORMAT_ERROR);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PROGRAM_ICON_BYTES) throw new Error("L’icône doit peser entre 1 octet et 5 Mo maximum.");
  return { extension, mimeType };
}
