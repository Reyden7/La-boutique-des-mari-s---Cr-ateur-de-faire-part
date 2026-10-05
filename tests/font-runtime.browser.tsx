import React from "react";
import { createRoot } from "react-dom/client";
import Konva from "konva";
import { EditorCanvas } from "../src/components/editor/EditorCanvas";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { WelcomePageRenderer } from "../src/features/welcome/WelcomePageRenderer";
import { useEditorStore } from "../src/stores/editorStore";
import { loadProjectFont } from "../src/features/fonts/projectFontRuntime";
import { getFontFileInfo } from "../src/features/fonts/fontFile";
import { DEFAULT_WELCOME_PAGE } from "../src/features/welcome/welcomeDefaults";
import { materializeElementLayouts } from "../src/utils/responsiveLayout";
import type { WeddingProject, TextElement, CustomFontAsset } from "../src/types/editor";
import "../src/styles.css";

const fixture = document.getElementById("fixture")!;
const output = document.getElementById("results")!;
const root = createRoot(fixture);
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
let run = 0;

document.getElementById("run-font")!.addEventListener("click", async () => {
  const file = (document.getElementById("font-file") as HTMLInputElement).files?.[0];
  if (!file) { output.textContent = "Choisissez une police locale."; return; }
  const source = URL.createObjectURL(file);
  try {
    const info = getFontFileInfo(file);
    // Unique alias per run prevents accidental success from an installed font.
    const family = `TTF-Regression-${++run}`;
    const font: CustomFontAsset = { id: "font", name: info.family, family, format: info.format, url: source };
    const text = materializeElementLayouts({
      id: "text", name: "Texte", type: "text", text: "WWWW Emma et Lucas WWWW", x: 40, y: 90, width: 280, height: 120,
      rotation: 0, zIndex: 1, opacity: 1, locked: false, visible: true, fontFamily: family, fontSize: 32,
      fill: "#333", align: "center", lineHeight: 1.1, letterSpacing: 0, fontWeight: 400, italic: false, underline: false,
      animation: { type: "none", duration: 1, delay: 0 },
    } as TextElement);
    let project = {
      id: "font-regression", name: "Test local", status: "draft", paymentStatus: "unpaid", createdAt: "2026-10-05", updatedAt: "2026-10-05", introductionMode: "none",
      pages: [{ id: "page", name: "Document", elements: [text], background: { type: "color", color: "#fff" } }],
      welcomePage: { ...structuredClone(DEFAULT_WELCOME_PAGE), showArch: false, showBackground: false, elements: [text] },
      rsvp: { enabled: true, purchased: true, locked: false, title: "Emma et Lucas", description: "Merci de répondre", submitLabel: "Envoyer", fields: [{ id: "name", label: "Votre nom", type: "short_text", required: true }], typography: { fontFamily: family, titleFontSize: 32, labelFontSize: 12, fieldFontSize: 13 } },
      customFonts: [],
    } as WeddingProject;
    useEditorStore.setState({ project, currentPageId: "page", previewDevice: "mobile", sidebarView: "elements", selectedElementId: "text", selectedElementIds: ["text"] });
    root.render(<EditorCanvas key={`before-${run}`} />);
    await tick();
    const initialStage = Konva.stages.find((stage) => fixture.contains(stage.container()))!;
    const before = (initialStage.findOne("#text") as Konva.Text).getTextWidth();
    const loaded = await loadProjectFont(font);
    if (loaded.status !== "loaded" || !document.fonts.check(`32px "${family}"`)) throw new Error("FontFace non chargé");
    await tick();
    const after = (initialStage.findOne("#text") as Konva.Text).getTextWidth();
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = `32px "${family}"`;
    // The node uses wrapping, so verify the cached metrics match a fresh node
    // after the font revision, rather than requiring a specific line count.
    const fresh = new Konva.Text((initialStage.findOne("#text") as Konva.Text).getAttrs());
    if (Math.abs(after - fresh.getTextWidth()) > .001) throw new Error("Konva n’a pas recalculé sa métrique après FontFace");
    fresh.destroy();
    project = { ...project, customFonts: [font] };
    // JSON round trip models the persisted payload, including exact alias.
    project = JSON.parse(JSON.stringify(project));
    for (const device of ["mobile", "tablet", "desktop"] as const) {
      useEditorStore.setState({ project, previewDevice: device, sidebarView: "elements" });
      root.render(<EditorCanvas key={`editor-${run}-${device}`} />);
      await tick();
      let stage = Konva.stages.find((stage) => fixture.contains(stage.container()))!;
      if ((stage.findOne("#text") as Konva.Text).fontFamily() !== family) throw new Error("Alias Konva incorrect");
      for (const mode of ["preview", "public"] as const) {
        root.render(<WeddingRenderer project={project} device={device} mode={mode} playAnimations={false} />);
        await tick();
        const rendered = [...fixture.querySelectorAll("div")].find((node) => node.textContent === text.text && node.style.fontFamily);
        if (!rendered || !getComputedStyle(rendered).fontFamily.includes(family)) throw new Error(`Police texte ${mode}/${device} incorrecte`);
        const formTitle = fixture.querySelector(".rsvp-public-form h2");
        if (!formTitle || !getComputedStyle(formTitle).fontFamily.includes(family)) throw new Error(`Police formulaire ${mode}/${device} incorrecte`);
      }
      root.render(<WelcomePageRenderer config={project.welcomePage!} device={device} interactive={false} />);
      await tick();
      const welcomeText = [...fixture.querySelectorAll("div")].find((node) => node.textContent === text.text && node.style.fontFamily);
      if (!welcomeText || !getComputedStyle(welcomeText).fontFamily.includes(family)) throw new Error(`Police accueil ${device} incorrecte`);
      useEditorStore.setState({ project });
      root.render(<EditorCanvas key={`return-${run}-${device}`} />);
      await tick();
      stage = Konva.stages.find((stage) => fixture.contains(stage.container()))!;
      if ((stage.findOne("#text") as Konva.Text).fontFamily() !== family) throw new Error("Police perdue au retour Editor");
    }
    output.textContent = `PASS — ${file.name} : FontFace chargé, métrique Konva rafraîchie (${before.toFixed(2)} → ${after.toFixed(2)}), alias exact, Preview/Public, Formulaire, Page d’accueil, retour Editor et sérialisation sur 3 formats. MIME : ${info.mimeType}. Aucun upload distant.`;
  } catch (error) {
    output.textContent = `FAIL — ${error instanceof Error ? error.message : error}`;
    console.error(error);
  }
  // Keep the object URL alive while the final fixture is rendered.
});
