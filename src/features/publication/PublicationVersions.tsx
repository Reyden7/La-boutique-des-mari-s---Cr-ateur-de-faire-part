import { useEffect, useState } from "react";
import { ModalLayer } from "../../components/ui/ModalLayer";
import { createPortal } from "react-dom";
import { supabase, requireSupabaseSession } from "../../lib/supabase";
import { refreshRemoteProject } from "../../services/projectRepository";
import { useEditorStore } from "../../stores/editorStore";
import type { WeddingProject } from "../../types/editor";
import { normalizeProject } from "../../utils/storage";
import { PreviewMode } from "../../components/preview/PreviewMode";
import { publicationVersionLabel } from "./publicationState";
import "./publication.css";

export async function createPublicationRevision(projectId: string, sourceVersionId?: string) {
  await requireSupabaseSession();
  if (!supabase) throw new Error("Service indisponible.");
  const result=await supabase.rpc("begin_publication_revision",{p_project_id:projectId,p_source_version_id:sourceVersionId??null});
  if(result.error)throw new Error("Création impossible. Un paiement est peut-être encore en cours ; revenez après sa confirmation.");
  const refreshed=await refreshRemoteProject(projectId);
  if(!refreshed)throw new Error("Rechargement impossible.");
  useEditorStore.getState().setProject(refreshed);
}

export function PublicationVersions({project,onClose}:{project:WeddingProject;onClose:()=>void}) {
  const [versions,setVersions]=useState<{id:string;version_number:number;name:string;snapshot:Partial<WeddingProject>;published_at:string;status:string}[]>([]);
  const [error,setError]=useState(""),[preview,setPreview]=useState<WeddingProject|null>(null),[busy,setBusy]=useState(false),[restore,setRestore]=useState<string|null>(null);
  useEffect(()=>{let live=true;void (async()=>{
    await requireSupabaseSession();if(!supabase)return;
    const result=await supabase.from("project_publication_versions").select("id,version_number,name,snapshot,published_at,status").eq("project_id",project.id).eq("status","published").order("version_number",{ascending:false});
    if(result.error)throw result.error;if(live)setVersions(result.data??[]);
  })().catch(()=>{if(live)setError("Chargement de l’historique impossible.");});return()=>{live=false;};},[project.id]);
  if(preview)return createPortal(<PreviewMode project={preview} device="mobile" onClose={()=>setPreview(null)}/>,document.body);
  return <ModalLayer label="Historique des versions" onClose={onClose} busy={busy}><div className="modal-backdrop"><section className="publication-history" role="dialog" aria-modal="true" aria-label="Historique des versions"><button onClick={onClose} disabled={busy}>Fermer</button><h2>Historique des versions</h2><p>{publicationVersionLabel(project)}</p>
    {project.publicationPolicy==="legacy"&&<p>Archive à la date de migration. Votre publication historique peut continuer à évoluer gratuitement selon vos conditions d’origine.</p>}
    {error&&<p role="alert">{error}</p>}{versions.map(version=><article key={version.id}><h3>Version {version.version_number}{project.publicationPolicy!=="legacy"&&project.activeVersionId===version.id?" — actuellement en ligne":""}</h3><p>Publiée le {new Date(version.published_at).toLocaleString("fr-FR")}</p>
      <button onClick={()=>setPreview(normalizeProject({...project,...version.snapshot,id:project.id,name:version.name}))}>Consulter cette version</button>
      {project.publicationPolicy==="paid_versions"&&<button disabled={busy} onClick={()=>setRestore(version.id)}>Utiliser comme nouveau brouillon payant</button>}
    </article>)}{project.hasVersionDraft&&<p>Nouvelle version — brouillon non publié</p>}
    {restore&&<section><p>Cette version sera copiée dans votre brouillon. Elle ne sera remise en ligne qu’après un nouveau paiement. Le brouillon actuel sera remplacé.</p><button disabled={busy} onClick={()=>setRestore(null)}>Annuler</button><button disabled={busy} onClick={()=>{setBusy(true);void createPublicationRevision(project.id,restore).then(onClose).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Créer le brouillon</button></section>}
  </section></div></ModalLayer>;
}
