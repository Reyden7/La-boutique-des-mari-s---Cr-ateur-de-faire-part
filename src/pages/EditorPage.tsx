import { Eye, PanelLeft, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useBlocker, useNavigate, useParams } from "react-router-dom";
import { EditorCanvas } from "../components/editor/EditorCanvas";
import { EditorWorkspace } from "../components/editor/EditorWorkspace";
import { PreviewMode } from "../components/preview/PreviewMode";
import { PropertiesPanel } from "../components/properties/PropertiesPanel";
import { LeftSidebar } from "../components/sidebar/LeftSidebar";
import { TopToolbar } from "../components/toolbar/TopToolbar";
import { useEditorStore } from "../stores/editorStore";
import type { OpeningAnimationType } from "../types/editor";
import { OpeningPreview } from "../features/openings/OpeningPreview";
import { useAuth } from "../contexts/AuthContext";
import { DiscoveryDialogs } from "../features/discovery/DiscoveryDialogs";
import { convertDiscoveryHistory, discardDiscoverySession, isDiscoveryProject, mapDiscoveryReferences, requestDiscoveryAccount, useDiscoverySession } from "../features/discovery/discoverySession";
import { persistGuestDraftAfterAuth } from "../features/discovery/persistGuestDraft";
import { upsertProject } from "../utils/storage";
import { TutorialWelcome } from "../features/tutorial/TutorialWelcome";
import { TutorialHelp } from "../features/tutorial/TutorialHelp";
import { TutorialLayer } from "../features/tutorial/TutorialLayer";
import { useTutorialStore } from "../features/tutorial/tutorialStore";

export function EditorPage({ discovery = false }: { discovery?: boolean }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [missing, setMissing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [openingPreview, setOpeningPreview] = useState<OpeningAnimationType | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"tools" | "properties" | null>(null);
  const openTutorialPanel = useCallback((panel: "tools" | "properties" | null) => setMobilePanel(panel), []);
  const project = useEditorStore((state) => state.project);
  const previewDevice = useEditorStore((state) => state.previewDevice);
  const { user, loading, recoveryReady } = useAuth();
  const session = useDiscoverySession();
  const tutorialModal = useTutorialStore((state) => state.invitation === "editor" || Boolean(state.help));
  const guest = Boolean(project && isDiscoveryProject(project));
  const tutorialBlocked = session.converting || (guest && (!session.warningShown || Boolean(session.prompt) || Boolean(session.error)));
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guest && !recoveryReady && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!guest || !user || loading || recoveryReady) return;
    const draft = useEditorStore.getState().project!;
    useDiscoverySession.setState({ converting: true, error: "" });
    void persistGuestDraftAfterAuth(draft, user.id).then(({ project: saved, references }) => {
      if (useEditorStore.getState().project !== draft) throw new Error("Votre création a évolué pendant le transfert. Réessayez pour sauvegarder la dernière version.");
      if (!isDiscoveryProject(draft)) return;
      const historyReferences = new Map(references).set(draft.id, saved.id);
      // Preserve selection, device, zoom and undo without retaining any temporary URL.
      useEditorStore.setState((state) => ({ project: saved, past: convertDiscoveryHistory(state.past, historyReferences, saved), future: convertDiscoveryHistory(state.future, historyReferences, saved), clipboard: mapDiscoveryReferences(state.clipboard, references), saveStatus: "saved" }));
      // Remote saving already succeeded; a full local cache must not undo the conversion.
      try { upsertProject(saved); } catch { console.warn("Projet enregistré en ligne ; cache local indisponible."); }
      discardDiscoverySession();
      useDiscoverySession.setState({ success: "Votre faire-part est maintenant enregistré sur votre compte." });
      navigate(`/studio/${saved.id}`, { replace: true });
    }).catch((cause) => {
      if (!isDiscoveryProject(draft)) return;
      useDiscoverySession.setState({ converting: false, error: cause instanceof Error ? cause.message : "Sauvegarde impossible. Votre brouillon reste ouvert.", prompt: "account" });
    });
  }, [guest, user?.id, loading, recoveryReady, session.retry, navigate]);

  useEffect(() => () => {
    // StrictMode's rehearsal cleanup must not discard an active editor.
    queueMicrotask(() => {
      if (discovery && window.location.pathname !== "/studio/discovery" && useDiscoverySession.getState().draftId) {
        discardDiscoverySession();
        useEditorStore.setState({ project: null, past: [], future: [], clipboard: null });
      }
    });
  }, [discovery]);

  useEffect(() => {
    if (discovery || !projectId || !user) return;
    const current = useEditorStore.getState().project;
    if (current?.id === projectId && current.ownerId === user.id) return;
    if (!useEditorStore.getState().loadProject(projectId, user.id)) setMissing(true);
  }, [discovery, projectId, user]);

  useEffect(() => {
    if (!project || isDiscoveryProject(project)) return;
    const timer = window.setTimeout(() => useEditorStore.getState().save(), 800);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useEditorStore.getState();
      if (useDiscoverySession.getState().converting) return;
      if (useTutorialStore.getState().invitation || useTutorialStore.getState().help) return;
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); state.save(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); state.undo(); }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); state.redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !typing) { event.preventDefault(); state.copyElement(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && !typing) { event.preventDefault(); state.pasteElement(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && state.selectedElementId && !typing) { event.preventDefault(); state.duplicateElement(state.selectedElementId); }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedElementIds.length > 0 && !typing) { event.preventDefault(); if (window.confirm("Supprimer la sélection de tous les formats ?")) state.removeSelectedElements(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = useEditorStore.getState().project;
      if (current && isDiscoveryProject(current)) { event.preventDefault(); event.returnValue = ""; }
      else useEditorStore.getState().save();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (missing) return <Navigate to="/" replace />;
  if (discovery && !guest) return <Navigate to={project?.ownerId && project.ownerId === user?.id ? `/studio/${project.id}` : "/"} replace />;
  if (!project) return <div className="loading-screen">Ouverture de votre studio…</div>;
  const dialogs = <>
    {guest && <DiscoveryDialogs />}
    {blocker.state === "blocked" && <div className="modal-backdrop discovery-backdrop"><section className="discovery-dialog" role="dialog" aria-modal="true" aria-label="Quitter sans sauvegarder ?"><h2>Quitter sans sauvegarder ?</h2><p>Votre faire-part n’est pas enregistré. Toutes vos modifications seront perdues si vous quittez maintenant.</p><div className="discovery-actions"><button onClick={() => blocker.reset()}>Continuer à créer</button><button onClick={() => blocker.proceed()}>Quitter sans sauvegarder</button><button className="primary" onClick={() => { blocker.reset(); requestDiscoveryAccount(); }}>Créer un compte pour sauvegarder</button></div></section></div>}
    {!guest && session.success && <div className="discovery-success" role="status">{session.success}<button aria-label="Fermer" onClick={() => useDiscoverySession.setState({ success: "" })}>×</button></div>}
  </>;
  if (openingPreview) return <><OpeningPreview project={project} type={openingPreview} device={previewDevice} onUse={(opening) => useEditorStore.getState().updateOpening(opening)} onClose={() => setOpeningPreview(null)} />{dialogs}</>;
  if (preview) return <><PreviewMode project={project} device={previewDevice} onClose={() => setPreview(false)} />{dialogs}</>;

  return (
    <><div className="studio-layout" inert={tutorialModal || session.converting || (guest && (!session.warningShown || Boolean(session.prompt) || Boolean(session.error) || blocker.state === "blocked")) || undefined}>
      <TopToolbar onPreview={() => setPreview(true)} />
      <div className={`editor-panel-host tools-panel-host ${mobilePanel === "tools" ? "mobile-open" : ""}`}>
        <button className="mobile-panel-close" onClick={() => setMobilePanel(null)} aria-label="Fermer les outils"><X size={18} /></button>
        <LeftSidebar onPreviewOpening={setOpeningPreview} />
      </div>
      <EditorWorkspace pageName={project.pages.find((page) => page.id === useEditorStore.getState().currentPageId)?.name}>
        <EditorCanvas />
      </EditorWorkspace>
      <div data-tour="properties-panel" className={`editor-panel-host properties-panel-host ${mobilePanel === "properties" ? "mobile-open" : ""}`}>
        <button className="mobile-panel-close" onClick={() => setMobilePanel(null)} aria-label="Fermer les réglages"><X size={18} /></button>
        <PropertiesPanel onPreviewOpening={setOpeningPreview} />
      </div>
      {mobilePanel && <button className="mobile-panel-backdrop" onClick={() => setMobilePanel(null)} aria-label="Fermer le panneau" />}
      <nav className="mobile-editor-nav" aria-label="Outils de l’éditeur">
        <button className={mobilePanel === "tools" ? "active" : ""} onClick={() => setMobilePanel((value) => value === "tools" ? null : "tools")}><PanelLeft size={19} /><span>Outils</span></button>
        <button data-tour="preview-button" onClick={() => setPreview(true)}><Eye size={19} /><span>Aperçu</span></button>
        <button className={mobilePanel === "properties" ? "active" : ""} onClick={() => setMobilePanel((value) => value === "properties" ? null : "properties")}><SlidersHorizontal size={19} /><span>Réglages</span></button>
      </nav>
    </div>{dialogs}
      <TutorialWelcome context="editor" eligible={guest} blocked={Boolean(tutorialBlocked || blocker.state === "blocked")} />
      {!tutorialBlocked && <TutorialHelp />}
      <TutorialLayer blocked={Boolean(tutorialBlocked || blocker.state === "blocked")} openPanel={openTutorialPanel} />
    </>
  );
}
