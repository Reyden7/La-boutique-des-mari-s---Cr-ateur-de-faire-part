import { TemplateChooser } from "../features/templates/TemplateChooser";
import type { InvitationCategory } from "../types/templates";
import { usePublishedRsvpStatus } from "../features/rsvp/usePublishedRsvpStatus";
import { ArrowRight, ClipboardCheck, Copy, GalleryVerticalEnd, LayoutTemplate, LogOut, MoreHorizontal, Plus, Sparkles, Trash2, UserRoundCheck, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { associateLocalProject } from "../services/projectRepository";
import { createBlankProject } from "../templates/templates";
import type { WeddingProject } from "../types/editor";
import { deleteProject, hydrateProjects, loadProjects, remoteErrorSummary, upsertProject } from "../utils/storage";
import { instantiateRemoteTemplate, loadPublishedTemplates } from "../services/templateRepository";
import type { TemplateRecord } from "../types/templates";
import { instantiateProjectFromTemplate } from "../utils/templateSnapshot";
import { PreviewMode } from "../components/preview/PreviewMode";
import { HoverVideoThumbnail } from "../features/previewVideos/HoverVideoThumbnail";
import { PreviewVideoManager } from "../features/previewVideos/PreviewVideoManager";
import { flushPreviewVideoCleanup } from "../services/previewVideoRepository";
import { beginDiscoverySession } from "../features/discovery/discoverySession";
import { useEditorStore } from "../stores/editorStore";
import { TutorialWelcome } from "../features/tutorial/TutorialWelcome";
import { publicationVersionLabel } from "../features/publication/publicationState";

const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export function HomePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin, signOut } = useAuth();
  const rsvpStatuses = usePublishedRsvpStatus(undefined, user?.id, Boolean(user));
  const hasActiveRsvp = rsvpStatuses.some(row => row.has_form);
  const hasRsvpHistory = rsvpStatuses.some(row => row.has_history);
  const [creating, setCreating] = useState(false);
  const [invitationCategory, setInvitationCategory] = useState<InvitationCategory>("wedding");
  const openTemplateChooser = () => { setInvitationCategory("wedding"); setCreating(true); };
  const [projects, setProjects] = useState<WeddingProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState("");
  const [remoteTemplates, setRemoteTemplates] = useState<TemplateRecord[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateError, setTemplateError] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRecord | null>(null);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [videoProject, setVideoProject] = useState<WeddingProject | null>(null);

  const refreshProjects = useCallback(async () => {
    if (!user) { setProjects([]); setLoadingProjects(false); return; }
    void flushPreviewVideoCleanup().catch(() => undefined);
    setLoadingProjects(true);
    try {
      setProjects(await hydrateProjects(user.id));
    } catch (error) {
      setProjectError(`Synchronisation distante indisponible : ${remoteErrorSummary(error)}`);
      setProjects(loadProjects().filter((project) => !project.ownerId || project.ownerId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  useEffect(() => { void refreshProjects(); }, [refreshProjects]);
  useEffect(() => {
    void loadPublishedTemplates()
      .then(setRemoteTemplates)
      .catch((error) => setTemplateError(`Galerie distante indisponible : ${remoteErrorSummary(error)}`))
      .finally(() => setTemplatesLoading(false));
  }, [user]);

  if (previewTemplate) return <PreviewMode project={instantiateProjectFromTemplate(previewTemplate, user?.id ?? "")} device="mobile" allowDeviceSwitching onClose={() => setPreviewTemplate(null)} />;

  const openNewProject = (project: WeddingProject) => {
    if (!user) {
      const draft = instantiateProjectFromTemplate({ name: project.name, templateData: project, invitationCategory: project.invitationCategory }, "");
      delete draft.ownerId;
      beginDiscoverySession(draft.id);
      useEditorStore.getState().setProject(draft);
      navigate("/studio/discovery");
      return;
    }
    const ownedProject = { ...project, ownerId: user.id };
    upsertProject(ownedProject);
    navigate(`/studio/${ownedProject.id}`);
  };

  const duplicate = (project: WeddingProject) => {
    if (!user) return;
    const copy = structuredClone(project);
    copy.id = crypto.randomUUID();
    copy.ownerId = user.id;
    copy.name = `${copy.name} — copie`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    copy.status = "draft";
    copy.paymentStatus = "unpaid";
    if (copy.rsvp) copy.rsvp = { ...copy.rsvp, purchased: false };
    delete copy.publicId;
    delete copy.publishedAt;
    delete copy.expiresAt;
    delete copy.purchasedGuestCapacity;
    delete copy.purchasedExtraBlocks;
    delete copy.publicationLicenseId;
    delete copy.previewVideoPath; // a private path is not shared with a new project ID
    delete copy.publicationPolicy;
    delete copy.activeVersionId;
    delete copy.activeVersionNumber;
    delete copy.hasVersionDraft;
    upsertProject(copy);
    setProjects((values) => [copy, ...values]);
  };

  const useRemoteTemplate = async (template: TemplateRecord) => {
    if (!user) { openNewProject(instantiateProjectFromTemplate(template, "")); return; }
    setCreatingTemplateId(template.id);
    setTemplateError("");
    try {
      const project = await instantiateRemoteTemplate(template.id);
      upsertProject(project);
      navigate(`/studio/${project.id}`);
    } catch (error) {
      setTemplateError(`Création impossible : ${remoteErrorSummary(error)}`);
    } finally {
      setCreatingTemplateId(null);
    }
  };

  const claimProject = async (project: WeddingProject) => {
    setClaimingId(project.id);
    setProjectError("");
    try {
      const claimed = await associateLocalProject(project);
      upsertProject(claimed);
      setProjects((values) => values.map((item) => item.id === claimed.id ? claimed : item));
    } catch (error) {
      setProjectError(`Association impossible : ${remoteErrorSummary(error)}`);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="home-page">
      <header className="home-header"><div className="home-brand"><div className="brand-mark">B</div><div><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div><div className="home-account">{isAdmin && <><button className="help-button" onClick={() => navigate("/admin/templates")}><LayoutTemplate size={15} /> Templates</button><button className="help-button" onClick={() => navigate("/admin/assets")}><GalleryVerticalEnd size={15} /> Bibliothèque</button><button className="help-button" onClick={() => navigate("/admin/promo-codes")}>Gérer les codes promos</button></>}{user ? <><span>{user.email}</span><button className="help-button" onClick={() => void signOut()}><LogOut size={15} /> Déconnexion</button></> : <button className="help-button" onClick={() => navigate("/auth")}>Se connecter / Créer un compte</button>}</div></header>
      <main className="home-main">
        {user && (hasActiveRsvp || hasRsvpHistory) && <button className="help-button" onClick={()=>navigate("/dashboard/responses")}><ClipboardCheck size={17}/> {hasActiveRsvp ? "Réponses au formulaire" : "Historique des réponses RSVP"}</button>}
        <section className="welcome-row"><div><p className="eyebrow"><Sparkles size={14} /> Votre atelier créatif</p><h1>Vos plus belles nouvelles<br /><em>prennent vie ici.</em></h1><p>Imaginez, personnalisez et partagez un faire-part qui vous ressemble.</p></div><div className="welcome-actions"><button className="new-project-button" onClick={openTemplateChooser}><Plus size={20} /> Nouveau faire-part</button><button className="custom-request-button" onClick={() => navigate("/custom-invitation")}><Sparkles size={18} /> Sur mesure — 50 €</button></div></section>
        {projectError && <div className="project-sync-message">{projectError}</div>}
        {loadingProjects && <div className="projects-loading">Chargement de vos projets…</div>}
        {!loadingProjects && projects.length > 0 && <section className="projects-section"><div className="section-heading"><div><p className="eyebrow">Mes créations</p><h2>Derniers projets</h2></div><span>{projects.length} projet{projects.length > 1 ? "s" : ""}</span></div><div className="project-grid">{projects.map((project) => {
          const isLegacyLocal = !project.ownerId;
          const cover = project.pages[0];
          const background = cover?.background;
          const coverStyle = background?.type === "gradient" && background.gradient ? { background: `linear-gradient(${background.gradient.angle ?? 135}deg, ${background.gradient.color1}, ${background.gradient.color2})` } : { background: background?.color ?? "#f5efe8" };
          return <article className={`project-card ${isLegacyLocal ? "legacy-local-project" : ""}`} key={project.id}><HoverVideoThumbnail videoPath={project.previewVideoPath} alt={project.name}><button className="project-preview" style={coverStyle} disabled={isLegacyLocal} onClick={() => navigate(`/studio/${project.id}`)}>{isLegacyLocal && <span className="legacy-project-badge">Projet local à associer</span>}{cover?.elements.filter((element) => element.type === "text").slice(0, 2).map((element) => element.type === "text" && <span key={element.id} style={{ fontFamily: element.fontFamily, color: element.color }}>{element.text}</span>)}</button></HoverVideoThumbnail><div className="project-card-body"><div><strong>{project.name}</strong>{project.activeVersionId&&<span>{publicationVersionLabel(project)}</span>}<span>Modifié le {formatDate(project.updatedAt)}</span></div>{isLegacyLocal ? <button className="claim-project-button" disabled={claimingId === project.id} onClick={() => void claimProject(project)}><UserRoundCheck size={15} /> {claimingId === project.id ? "Association…" : "Associer"}</button> : <div className="project-menu"><button title="Vidéo de présentation" onClick={() => setVideoProject(project)}><Video size={15} /></button><button title="Dupliquer" onClick={() => duplicate(project)}><Copy size={15} /></button><button title="Supprimer" onClick={() => { if (window.confirm("Supprimer ce projet ?")) { deleteProject(project.id); setProjects((values) => values.filter((item) => item.id !== project.id)); } }}><Trash2 size={15} /></button><MoreHorizontal size={17} /></div>}</div></article>;
        })}</div></section>}
        {!loadingProjects && projects.length === 0 && <section className="empty-projects"><div className="empty-ornament">B</div><h2>Votre premier faire-part vous attend</h2><p>Partez d’un modèle de mariage ou de naissance, puis faites-le entièrement vôtre.</p><button onClick={openTemplateChooser}>Découvrir les modèles <ArrowRight size={16} /></button></section>}
      </main>
      <TutorialWelcome context="home" eligible={Boolean(user && !authLoading && !loadingProjects && !projectError && projects.filter((project) => project.ownerId === user.id).length === 0)} blocked={Boolean(creating || videoProject)} onStart={openTemplateChooser} />

      {videoProject && <PreviewVideoManager key={videoProject.id} target={{ kind: "project", project: videoProject }} name={videoProject.name} initialPath={videoProject.previewVideoPath} onClose={() => setVideoProject(null)} onSaved={({ path, updatedAt }) => { const updated = { ...videoProject, previewVideoPath: path, updatedAt }; upsertProject(updated); setProjects((values) => values.map((project) => project.id === updated.id ? updated : project)); setVideoProject(updated); }} />}
      {creating && <TemplateChooser templates={remoteTemplates} loading={templatesLoading} error={templateError} category={invitationCategory} onCategoryChange={setInvitationCategory} creatingId={creatingTemplateId} onClose={()=>setCreating(false)} onBlank={category=>openNewProject(createBlankProject(category))} onUse={template=>void useRemoteTemplate(template)} onPreview={setPreviewTemplate} onLegacy={openNewProject}/>}
    </div>
  );
}
