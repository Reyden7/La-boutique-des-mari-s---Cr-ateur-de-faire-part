import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { InvitationExperience } from "../features/music/InvitationExperience";
import { loadPublicProject } from "../services/projectRepository";
import type { WeddingProject } from "../types/editor";

export function PublicInvitePage() {
  const { publicId } = useParams();
  const [project, setProject] = useState<WeddingProject | null>();

  useEffect(() => {
    let active = true;
    if (!publicId) { setProject(null); return; }
    setProject(undefined);
    void loadPublicProject(publicId)
      .then((value) => { if (active) setProject(value); })
      .catch(() => { if (active) setProject(null); });
    return () => { active = false; };
  }, [publicId]);

  if (project === undefined) return <div className="loading-screen">Ouverture de l’invitation…</div>;
  if (!project) return <div className="invite-not-found"><div className="brand-mark">B</div><h1>Ce faire-part n’est pas disponible</h1><p>Le lien est incorrect ou l’invitation n’est pas encore publiée.</p></div>;
  if (project.expiresAt && new Date(project.expiresAt) <= new Date()) return <div className="invite-not-found"><div className="brand-mark">B</div><h1>Cette invitation a expiré</h1><p>Rapprochez-vous des mariés pour obtenir les informations de la célébration.</p></div>;
  return <main className="public-invite"><InvitationExperience project={project} /></main>;
}
