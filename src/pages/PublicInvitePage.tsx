import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { InvitationExperience } from "../features/music/InvitationExperience";
import { loadPublicProject } from "../services/projectRepository";
import type { WeddingProject } from "../types/editor";
import { normalizeProject } from "../utils/storage";
import { InvitationViewer } from "../features/viewer/InvitationViewer";
import { useViewerViewport } from "../features/viewer/useViewerViewport";
import { loadRecipientInvitation, type RecipientInvitation } from "../services/recipientRepository";
import { RecipientInvitationContext } from "../features/recipients/RecipientInvitationContext";
import "../features/recipients/recipients.css";

export function PublicInvitePage() {
  const { publicId, recipientToken } = useParams();
  const [recipient, setRecipient] = useState<RecipientInvitation | null>(null);
  const [project, setProject] = useState<WeddingProject | null>();
  const { immersive } = useViewerViewport();
  useEffect(()=>{
    if(!recipientToken)return;
    const original=document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta=original??document.createElement("meta"), previous=meta.content;
    meta.name="referrer";meta.content="no-referrer";if(!original)document.head.append(meta);
    return()=>{if(original)meta.content=previous;else meta.remove();};
  },[recipientToken]);

  useEffect(() => {
    let active = true;
    if (!publicId) { setProject(null); return; }
    setProject(undefined);
    setRecipient(null);
    if (recipientToken) {
      void loadRecipientInvitation(publicId, recipientToken).then(value=>{
        if (!active) return;
        const row=value?.project;
        setProject(row?normalizeProject({...row.project_data,id:row.id,name:row.name,publicId:row.public_id,status:"published",paymentStatus:"paid",expiresAt:row.expires_at}):null);
        setRecipient(value?{...value.recipient,token:recipientToken}:null);
      }).catch(()=>{if(active)setProject(null);});
      return ()=>{active=false;};
    }
    void loadPublicProject(publicId)
      .then((value) => { if (active) setProject(value ? normalizeProject(value) : null); })
      .catch(() => { if (active) setProject(null); });
    return () => { active = false; };
  }, [publicId, recipientToken]);

  const status = project === undefined ? <div className="loading-screen">Ouverture de l’invitation…</div>
    : !project ? <div className="invite-not-found"><div className="brand-mark">B</div><h1>Ce faire-part n’est pas disponible</h1><p>Le lien est incorrect ou l’invitation n’est pas encore publiée.</p></div>
    : project.expiresAt && new Date(project.expiresAt) <= new Date() ? <div className="invite-not-found"><div className="brand-mark">B</div><h1>Cette invitation a expiré</h1><p>Rapprochez-vous des mariés pour obtenir les informations de la célébration.</p></div> : null;
  if (status) return immersive ? <InvitationViewer>{status}</InvitationViewer> : status;
  if (!project) return null;
  const experience = immersive ? <InvitationViewer key={`${project.publicId ?? project.id}-${recipientToken??"common"}`} project={project} />
    : <main className="public-invite"><InvitationExperience project={project} /></main>;
  return <RecipientInvitationContext.Provider key={recipientToken??"common"} value={recipient}>{experience}</RecipientInvitationContext.Provider>;
}
