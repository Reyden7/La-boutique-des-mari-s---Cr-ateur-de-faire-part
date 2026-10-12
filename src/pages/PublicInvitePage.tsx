import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { InvitationExperience } from "../features/music/InvitationExperience";
import { loadPublicProject } from "../services/projectRepository";
import type { WeddingProject } from "../types/editor";
import { normalizeProject } from "../utils/storage";
import { InvitationViewer } from "../features/viewer/InvitationViewer";
import { useViewerViewport } from "../features/viewer/useViewerViewport";

export function PublicInvitePage() {
  const { publicId } = useParams();
  const [project, setProject] = useState<WeddingProject | null>();
  const { immersive } = useViewerViewport();

  useEffect(() => {
    let active = true;
    if (!publicId) { setProject(null); return; }
    setProject(undefined);
    void loadPublicProject(publicId)
      .then((value) => { if (active) setProject(value ? normalizeProject(value) : null); })
      .catch(() => { if (active) setProject(null); });
    return () => { active = false; };
  }, [publicId]);

  const status = project === undefined ? <div className="loading-screen">Ouverture de l’invitation…</div>
    : !project ? <div className="invite-not-found"><div className="brand-mark">B</div><h1>Ce faire-part n’est pas disponible</h1><p>Le lien est incorrect ou l’invitation n’est pas encore publiée.</p></div>
    : project.expiresAt && new Date(project.expiresAt) <= new Date() ? <div className="invite-not-found"><div className="brand-mark">B</div><h1>Cette invitation a expiré</h1><p>Rapprochez-vous des mariés pour obtenir les informations de la célébration.</p></div> : null;
  if (status) return immersive ? <InvitationViewer>{status}</InvitationViewer> : status;
  if (!project) return null;
  if (immersive) return <InvitationViewer key={project.publicId ?? project.id} project={project} />;
  return <main className="public-invite"><InvitationExperience project={project} /></main>;
}
