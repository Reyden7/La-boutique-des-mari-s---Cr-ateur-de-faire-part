import { ArrowRight, Copy, LogOut, MoreHorizontal, Plus, Sparkles, Trash2, UserRoundCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { associateLocalProject } from "../services/projectRepository";
import { createBlankProject, templateFactories } from "../templates/templates";
import type { WeddingProject } from "../types/editor";
import { deleteProject, hydrateProjects, loadProjects, remoteErrorSummary, upsertProject } from "../utils/storage";

const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export function HomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<WeddingProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState("");

  const refreshProjects = useCallback(async () => {
    if (!user) return;
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

  if (!user) return null;

  const openNewProject = (project: WeddingProject) => {
    const ownedProject = { ...project, ownerId: user.id };
    upsertProject(ownedProject);
    navigate(`/studio/${ownedProject.id}`);
  };

  const duplicate = (project: WeddingProject) => {
    const copy = structuredClone(project);
    copy.id = crypto.randomUUID();
    copy.ownerId = user.id;
    copy.name = `${copy.name} — copie`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    copy.status = "draft";
    copy.paymentStatus = "unpaid";
    delete copy.publicId;
    delete copy.publishedAt;
    delete copy.expiresAt;
    upsertProject(copy);
    setProjects((values) => [copy, ...values]);
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
      <header className="home-header"><div className="home-brand"><div className="brand-mark">B</div><div><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div><div className="home-account"><span>{user.email}</span><button className="help-button" onClick={() => void signOut()}><LogOut size={15} /> Déconnexion</button></div></header>
      <main className="home-main">
        <section className="welcome-row"><div><p className="eyebrow"><Sparkles size={14} /> Votre atelier créatif</p><h1>Vos plus belles nouvelles<br /><em>prennent vie ici.</em></h1><p>Imaginez, personnalisez et partagez un faire-part qui vous ressemble.</p></div><button className="new-project-button" onClick={() => setCreating(true)}><Plus size={20} /> Nouveau faire-part</button></section>
        {projectError && <div className="project-sync-message">{projectError}</div>}
        {loadingProjects && <div className="projects-loading">Chargement de vos projets…</div>}
        {!loadingProjects && projects.length > 0 && <section className="projects-section"><div className="section-heading"><div><p className="eyebrow">Mes créations</p><h2>Derniers projets</h2></div><span>{projects.length} projet{projects.length > 1 ? "s" : ""}</span></div><div className="project-grid">{projects.map((project) => {
          const isLegacyLocal = !project.ownerId;
          const cover = project.pages[0];
          const background = cover?.background;
          const coverStyle = background?.type === "gradient" && background.gradient ? { background: `linear-gradient(${background.gradient.angle ?? 135}deg, ${background.gradient.color1}, ${background.gradient.color2})` } : { background: background?.color ?? "#f5efe8" };
          return <article className={`project-card ${isLegacyLocal ? "legacy-local-project" : ""}`} key={project.id}><button className="project-preview" style={coverStyle} disabled={isLegacyLocal} onClick={() => navigate(`/studio/${project.id}`)}>{isLegacyLocal && <span className="legacy-project-badge">Projet local à associer</span>}{cover?.elements.filter((element) => element.type === "text").slice(0, 2).map((element) => element.type === "text" && <span key={element.id} style={{ fontFamily: element.fontFamily, color: element.color }}>{element.text}</span>)}</button><div className="project-card-body"><div><strong>{project.name}</strong><span>Modifié le {formatDate(project.updatedAt)}</span></div>{isLegacyLocal ? <button className="claim-project-button" disabled={claimingId === project.id} onClick={() => void claimProject(project)}><UserRoundCheck size={15} /> {claimingId === project.id ? "Association…" : "Associer"}</button> : <div className="project-menu"><button title="Dupliquer" onClick={() => duplicate(project)}><Copy size={15} /></button><button title="Supprimer" onClick={() => { if (window.confirm("Supprimer ce projet ?")) { deleteProject(project.id); setProjects((values) => values.filter((item) => item.id !== project.id)); } }}><Trash2 size={15} /></button><MoreHorizontal size={17} /></div>}</div></article>;
        })}</div></section>}
        {!loadingProjects && projects.length === 0 && <section className="empty-projects"><div className="empty-ornament">B</div><h2>Votre premier faire-part vous attend</h2><p>Partez d’un modèle pensé pour le mariage, puis faites-le entièrement vôtre.</p><button onClick={() => setCreating(true)}>Découvrir les modèles <ArrowRight size={16} /></button></section>}
      </main>

      {creating && <div className="modal-backdrop" onMouseDown={() => setCreating(false)}><section className="template-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setCreating(false)}>×</button><p className="eyebrow">Nouvelle création</p><h2>Choisissez votre point de départ</h2><p className="modal-intro">Chaque détail pourra être modifié ensuite dans le studio.</p><div className="template-grid"><button className="blank-template" onClick={() => openNewProject(createBlankProject())}><span><Plus size={30} /></span><strong>Création vierge</strong><small>Une page claire, prête à imaginer.</small></button>{templateFactories.map((template) => <button className="template-choice" key={template.id} onClick={() => openNewProject(template.create())}><span className={`template-art ${template.id}`}><i style={{ background: template.colors[1] }}>E & L</i><b>18 · 06 · 2027</b></span><strong>{template.name}</strong><small>{template.eyebrow}</small></button>)}</div></section></div>}
    </div>
  );
}
