/** Shared contract for project uploads, FontFace and global font metadata. */
export const FONT_MIME_TYPES = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
} as const;

export type FontFileFormat = keyof typeof FONT_MIME_TYPES;
export const FONT_FILE_ACCEPT = ".ttf,.otf,.woff,.woff2";
export const UNSUPPORTED_FONT_MESSAGE = "Format de police non pris en charge. Utilisez TTF, OTF, WOFF ou WOFF2.";

export function getFontFileFormat(filename: string): FontFileFormat {
  const extension = /\.([^.]+)$/.exec(filename)?.[1].toLowerCase();
  if (!extension || !Object.hasOwn(FONT_MIME_TYPES, extension)) throw new Error(UNSUPPORTED_FONT_MESSAGE);
  return extension as FontFileFormat;
}

export function normalizeFontFileFormat(format: string): FontFileFormat {
  const normalized = format.toLowerCase();
  const canonical = normalized === "truetype" ? "ttf" : normalized === "opentype" ? "otf" : normalized;
  if (!Object.hasOwn(FONT_MIME_TYPES, canonical)) throw new Error(UNSUPPORTED_FONT_MESSAGE);
  return canonical as FontFileFormat;
}

export function getFontMimeType(format: string) {
  return FONT_MIME_TYPES[normalizeFontFileFormat(format)];
}

export function getFontFaceFormat(format: FontFileFormat | "truetype" | "opentype") {
  const normalized = normalizeFontFileFormat(format);
  return normalized === "ttf" ? "truetype" : normalized === "otf" ? "opentype" : normalized;
}

export function getGlobalFontMetadata(input: Record<string, unknown>, sourceFilename: string) {
  const family = typeof input.family === "string" ? input.family.trim() : "";
  const format = getFontFileFormat(sourceFilename);
  if (!family || (typeof input.format === "string" && normalizeFontFileFormat(input.format) !== format)) throw new Error("Invalid font metadata");
  return { family, format, mimeType: FONT_MIME_TYPES[format] };
}
