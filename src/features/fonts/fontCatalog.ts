import { WEDDING_FONTS } from "../../types/editor";

const systemFonts = new Set(["Georgia", "Garamond", "Palatino", "Times New Roman", "Arial"]);

export const FONT_CATALOG = WEDDING_FONTS.map((family) => ({
  family,
  source: systemFonts.has(family) ? "system" as const : "google" as const,
  category: ["Great Vibes", "Parisienne", "Dancing Script", "Allura", "Alex Brush", "Sacramento", "Tangerine", "Petit Formal Script", "Italianno", "Pinyon Script", "Caveat", "Satisfy"].includes(family)
    ? "Manuscrites"
    : ["Montserrat", "Poppins", "Raleway", "Josefin Sans", "Manrope", "Inter", "Quicksand", "Nunito Sans", "Source Sans 3", "Work Sans", "Arial"].includes(family)
      ? "Modernes"
      : "Élégantes",
}));

const loadedGoogleFonts = new Set<string>();

export const ensureGoogleFont = (family: string) => {
  const font = FONT_CATALOG.find((candidate) => candidate.family === family);
  if (!font || font.source !== "google" || loadedGoogleFonts.has(family)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
  link.dataset.weddingFont = family;
  document.head.append(link);
  loadedGoogleFonts.add(family);
};
