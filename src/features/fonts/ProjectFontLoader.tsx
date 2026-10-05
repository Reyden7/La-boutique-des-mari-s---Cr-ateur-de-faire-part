import { useEffect } from "react";
import type { WeddingProject } from "../../types/editor";
import { ensureGoogleFont } from "./fontCatalog";
import { loadProjectFonts } from "./projectFontRuntime";
import { getFontFaceFormat } from "../../../supabase/functions/_shared/fontFormats";

export function ProjectFontLoader({ project }: { project: WeddingProject }) {
  useEffect(() => {
    const usedFonts = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      Object.entries(value).forEach(([key, child]) => {
        if (key === "fontFamily" && typeof child === "string") usedFonts.add(child);
        else visit(child);
      });
    };
    visit(project);
    usedFonts.forEach(ensureGoogleFont);
  }, [project]);

  useEffect(() => {
    let active = true;
    void loadProjectFonts(project.customFonts ?? []).catch((error) => {
      if (active) console.error("Impossible de charger une police du projet.", error);
    });
    return () => { active = false; };
  }, [project.customFonts]);

  const css = (project.customFonts ?? []).map((font) => `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(font.url)}) format(${JSON.stringify(getFontFaceFormat(font.format))});font-display:swap;}`).join("\n");
  return css ? <style data-project-fonts>{css}</style> : null;
}
