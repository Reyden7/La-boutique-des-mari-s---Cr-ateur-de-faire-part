import { Eye, PanelLeft, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { EditorCanvas } from "../components/editor/EditorCanvas";
import { ZoomControls } from "../components/editor/ZoomControls";
import { PreviewMode } from "../components/preview/PreviewMode";
import { PropertiesPanel } from "../components/properties/PropertiesPanel";
import { LeftSidebar } from "../components/sidebar/LeftSidebar";
import { TopToolbar } from "../components/toolbar/TopToolbar";
import { useEditorStore } from "../stores/editorStore";
import type { OpeningAnimationType } from "../types/editor";
import { OpeningPreview } from "../features/openings/OpeningPreview";

export function EditorPage() {
  const { projectId } = useParams();
  const [missing, setMissing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [openingPreview, setOpeningPreview] = useState<OpeningAnimationType | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"tools" | "properties" | null>(null);
  const project = useEditorStore((state) => state.project);

  useEffect(() => {
    if (!projectId) return;
    const current = useEditorStore.getState().project;
    if (current?.id !== projectId && !useEditorStore.getState().loadProject(projectId)) setMissing(true);
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => useEditorStore.getState().save(), 800);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); state.save(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); state.undo(); }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); state.redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !typing) { event.preventDefault(); state.copyElement(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && !typing) { event.preventDefault(); state.pasteElement(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && state.selectedElementId && !typing) { event.preventDefault(); state.duplicateElement(state.selectedElementId); }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedElementId && !typing) { event.preventDefault(); state.removeElement(state.selectedElementId); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => useEditorStore.getState().save();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const widthFit = (window.innerWidth - 56) / 390;
    const heightFit = (window.innerHeight - 210) / 844;
    useEditorStore.getState().setZoom(Math.min(.72, widthFit, heightFit));
  }, [projectId]);

  if (missing) return <Navigate to="/" replace />;
  if (!project) return <div className="loading-screen">Ouverture de votre studio…</div>;
  if (openingPreview) return <OpeningPreview project={project} type={openingPreview} onUse={(opening) => useEditorStore.getState().updateOpening(opening)} onClose={() => setOpeningPreview(null)} />;
  if (preview) return <PreviewMode project={project} onClose={() => setPreview(false)} />;

  return (
    <div className="studio-layout">
      <TopToolbar onPreview={() => setPreview(true)} />
      <div className={`editor-panel-host tools-panel-host ${mobilePanel === "tools" ? "mobile-open" : ""}`}>
        <button className="mobile-panel-close" onClick={() => setMobilePanel(null)} aria-label="Fermer les outils"><X size={18} /></button>
        <LeftSidebar onPreviewOpening={setOpeningPreview} />
      </div>
      <main className="editor-main"><div className="workspace-label">{project.pages.find((page) => page.id === useEditorStore.getState().currentPageId)?.name}</div><EditorCanvas /><ZoomControls /></main>
      <div className={`editor-panel-host properties-panel-host ${mobilePanel === "properties" ? "mobile-open" : ""}`}>
        <button className="mobile-panel-close" onClick={() => setMobilePanel(null)} aria-label="Fermer les réglages"><X size={18} /></button>
        <PropertiesPanel onPreviewOpening={setOpeningPreview} />
      </div>
      {mobilePanel && <button className="mobile-panel-backdrop" onClick={() => setMobilePanel(null)} aria-label="Fermer le panneau" />}
      <nav className="mobile-editor-nav" aria-label="Outils de l’éditeur">
        <button className={mobilePanel === "tools" ? "active" : ""} onClick={() => setMobilePanel((value) => value === "tools" ? null : "tools")}><PanelLeft size={19} /><span>Outils</span></button>
        <button onClick={() => setPreview(true)}><Eye size={19} /><span>Aperçu</span></button>
        <button className={mobilePanel === "properties" ? "active" : ""} onClick={() => setMobilePanel((value) => value === "properties" ? null : "properties")}><SlidersHorizontal size={19} /><span>Réglages</span></button>
      </nav>
    </div>
  );
}
