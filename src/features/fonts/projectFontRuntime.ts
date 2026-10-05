import { useSyncExternalStore } from "react";
import type { CustomFontAsset } from "../../types/editor";
import { getFontFaceFormat } from "../../../supabase/functions/_shared/fontFormats.ts";

let fontRevision = 0;
const listeners = new Set<() => void>();
const pendingFonts = new Map<string, Promise<FontFace>>();

const notifyFontChange = () => {
  fontRevision += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useProjectFontRevision = () => useSyncExternalStore(
  subscribe,
  () => fontRevision,
  () => 0,
);

/** Loads the exact project alias into the browser FontFaceSet, then invalidates Konva. */
export const loadProjectFont = async (font: CustomFontAsset): Promise<FontFace> => {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    throw new Error("Le chargement de polices n’est pas disponible dans cet environnement.");
  }
  const signature = `${font.family}\u0000${font.url}\u0000${font.format}`;
  const existing = pendingFonts.get(signature);
  if (existing) return existing;

  const promise = (async () => {
    const source = `url(${JSON.stringify(font.url)}) format(${JSON.stringify(getFontFaceFormat(font.format))})`;
    const loadedFont = await new FontFace(font.family, source, { display: "swap" }).load();
    document.fonts.add(loadedFont);
    await document.fonts.ready;
    notifyFontChange();
    return loadedFont;
  })();
  pendingFonts.set(signature, promise);
  try {
    return await promise;
  } catch (error) {
    pendingFonts.delete(signature);
    throw error;
  }
};

export const loadProjectFonts = async (fonts: CustomFontAsset[]) => {
  await Promise.all(fonts.map(loadProjectFont));
  if (typeof document !== "undefined") await document.fonts.ready;
};

