import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AdminAssetsPage } from "../src/pages/AdminAssetsPage";
import { EnvelopeAssetControls } from "../src/features/openings/EnvelopeAssetControls";
import { InvitationExperience } from "../src/features/music/InvitationExperience";
import { PreviewMode } from "../src/components/preview/PreviewMode";
import { createBlankProject } from "../src/templates/templates";
import { useEditorStore } from "../src/stores/editorStore";
import { normalizeProject } from "../src/utils/storage";
import { setQaAdmin, qaRows } from "./envelope-global.mock";
import { publishGlobalEnvelopeAsset } from "../src/services/globalAssetRepository";
import "../src/styles.css";
const project = normalizeProject(createBlankProject())!;
project.introductionMode = "classic"; project.opening.type = "envelope";
project.audio.enabled = false; project.particles.enabled = false; project.rsvp!.enabled = false;
useEditorStore.setState({ project, currentPageId: project.pages[0].id, previewDevice: "mobile", past: [], future: [] });
useEditorStore.subscribe((state) => { (window as any).__qaEnvelopeProject = state.project; });
(window as any).__qaEnvelopeProject = project;
function Fixture() {
  const current = useEditorStore((state) => state.project)!;
  const [mode, setMode] = useState("admin");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  return <MemoryRouter><nav style={{ display: "flex", gap: 12, padding: 12, position: "sticky", top: 0, zIndex: 500, background: "white" }}>
    <button onClick={() => { setQaAdmin(true); setMode("admin"); }}>QA Admin</button><button onClick={() => { setQaAdmin(false); setMode("admin"); }}>QA Non-admin</button>
    <button onClick={() => setMode("editor")}>Sélecteurs</button><button onClick={() => setMode("preview")}>Aperçu Smartphone</button><button onClick={() => setMode("public")}>Public</button>
    <button onClick={() => { useEditorStore.setState({ project: normalizeProject(JSON.parse(JSON.stringify(current)))! }); setRevision((n) => n + 1); }}>Sauvegarde / reload local</button>
    <button onClick={() => {
      void Promise.all(([['envelope_base','base1','QA Papier naturel global'],['envelope_base','base3','QA Papier olive global'],['envelope_flap','rabat3','QA Rabat olive global'],['envelope_seal','cachet1','QA Cachet or global']] as const).map(async ([type,filename,name]) => {
        const blob = await (await fetch(`/assets/openings/envelope/${filename}.png`)).blob();
        return publishGlobalEnvelopeAsset(new File([blob],`${filename}.png`,{type:'image/png'}),type,name);
      })).then(() => { setNotice("Fixtures publiées localement"); setMode("editor"); }).catch((cause) => setNotice(String(cause)));
    }}>Fixtures Rabat / Cachet</button>
  </nav><p style={{ padding: 12 }}>Fixtures locales : aucun appel Supabase/Stripe.</p>
    {notice && <p role="status">{notice}</p>}
    {mode === "admin" && <AdminAssetsPage />}
    {mode === "editor" && <div className="properties-panel" style={{ width: 420, margin: "auto", height: "auto" }}><EnvelopeAssetControls /></div>}
    {mode === "preview" && <PreviewMode key={revision} project={current} device="mobile" onClose={() => setMode("editor")} />}
    {mode === "public" && <div className="public-invite" style={{ width: 390, height: 844, margin: "auto", position: "relative" }}><InvitationExperience key={revision} project={current} mode="public" device="mobile" /></div>}
    <details><summary>État QA</summary><pre>{JSON.stringify({ rows: qaRows, envelope: current.opening.envelope }, null, 2)}</pre></details>
  </MemoryRouter>;
}
const rootElement = document.getElementById("root")! as HTMLElement & { envelopeGlobalQaRoot?: Root };
rootElement.envelopeGlobalQaRoot ??= createRoot(rootElement);
rootElement.envelopeGlobalQaRoot.render(<Fixture />);
