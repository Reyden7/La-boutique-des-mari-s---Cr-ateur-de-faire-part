import { FONT_MIME_TYPES, getFontFileFormat } from "../../../supabase/functions/_shared/fontFormats.ts";

export function getFontFileInfo(file: Pick<File, "name" | "size">) {
  const format = getFontFileFormat(file.name);
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) throw new Error("La police doit peser moins de 8 Mo.");
  // Keep the existing project alias convention; never depend on file.type or
  // on the font binary's internal family name.
  const family = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  if (!family) throw new Error("Le fichier doit avoir un nom de police.");
  return { format, family, mimeType: FONT_MIME_TYPES[format] };
}
