import { useEffect } from "react";
import type { CustomFontAsset, WeddingProject } from "../../types/editor";
import { ensureGoogleFont } from "./fontCatalog";

const fontFormat = (font: CustomFontAsset) => font.format === "truetype" ? "truetype" : font.format === "opentype" ? "opentype" : font.format;

export function ProjectFontLoader({ project }: { project: WeddingProject }) {
  useEffect(() => {
    const usedFonts = new Set(project.pages.flatMap((page) => page.elements.filter((element) => element.type === "text").map((element) => element.type === "text" ? element.fontFamily : "")));
    usedFonts.forEach(ensureGoogleFont);
  }, [project.pages]);

  const css = (project.customFonts ?? []).map((font) => `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(font.url)}) format(${JSON.stringify(fontFormat(font))});font-display:swap;}`).join("\n");
  return css ? <style data-project-fonts>{css}</style> : null;
}
