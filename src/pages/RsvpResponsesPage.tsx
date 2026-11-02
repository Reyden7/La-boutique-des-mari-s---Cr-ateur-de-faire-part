import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadRsvpResponses, loadRsvpResponseHistory, loadPublishedRsvpStatuses, type PublishedRsvpStatus, type RsvpResponseRow } from "../services/rsvpRepository";
import { loadRemoteProjects } from "../services/projectRepository";
import { loadInvitationRecipients } from "../services/recipientRepository";
import type { WeddingProject } from "../types/editor";
import { csvCell, recipientTotals, type InvitationRecipient } from "../features/recipients/recipientData";
import "../features/recipients/recipients.css";

function ResponseHistory({projectId,response}:{projectId:string;response:RsvpResponseRow}) {
  const [history,setHistory]=useState<Awaited<ReturnType<typeof loadRsvpResponseHistory>>|null>(null),[error,setError]=useState("");
  return <div><small>{response.questionnaire_snapshot?"Questionnaire conservé avec cette réponse.":"Réponse historique : libellés d’origine conservés ; questionnaire complet non enregistré à l’époque."}</small>
    <button onClick={()=>void loadRsvpResponseHistory(projectId,response.id).then(setHistory).catch(()=>setError("Historique indisponible."))}>Historique des réponses</button>
    {error&&<p role="alert">{error}</p>}{history?.length===0&&<p>Aucune modification archivée.</p>}
    {history?.map(item=><article key={item.id}><time>{new Date(item.answered_at).toLocaleString("fr-FR")}</time>{Object.entries(item.answers).map(([key,value])=><p key={key}><strong>{key} : </strong>{Array.isArray(value)?value.join(", "):String(value??"—")}</p>)}</article>)}
  </div>;
}

export function RsvpResponsesPage() {
  const {projectId}=useParams();const [selected,setSelected]=useState(projectId??"");
  const [projects,setProjects]=useState<WeddingProject[]>([]),[recipients,setRecipients]=useState<InvitationRecipient[]>([]),[responses,setResponses]=useState<RsvpResponseRow[]>([]);
  const [statuses,setStatuses]=useState<PublishedRsvpStatus[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[detail,setDetail]=useState<string|null>(null);
  useEffect(()=>{let active=true;void Promise.all([loadRemoteProjects(),loadPublishedRsvpStatuses()]).then(([rows,status])=>{if(active){setProjects(rows);setStatuses(status);setSelected(current=>current||status.find(row=>row.has_form||row.has_history)?.project_id||"");}}).catch(()=>{if(active)setError("Chargement des projets impossible.");});return()=>{active=false;};},[]);
  useEffect(()=>{
    if(!selected)return;let active=true;setLoading(true);setError("");setRecipients([]);setResponses([]);setDetail(null);
    void Promise.all([loadInvitationRecipients(selected),loadRsvpResponses(selected)]).then(([list,answers])=>{if(active){setRecipients(list.recipients);setResponses(answers);}}).catch(()=>{if(active)setError("Les réponses n’ont pas pu être chargées. Réessayez.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[selected]);
  const hasForm=statuses.some(row=>row.project_id===selected&&row.has_form);
  const active=recipients.filter(row=>row.is_active), totals=recipientTotals(recipients);
  const byRecipient=new Map(responses.filter(row=>row.recipient_id).map(row=>[row.recipient_id,row]));
  const displayedRecipients=hasForm?recipients:recipients.filter(row=>byRecipient.has(row.id));
  const answered=active.filter(row=>byRecipient.has(row.id)), confirmed=answered.reduce((total,row)=>total+(byRecipient.get(row.id)?.present_count??0),0), declined=answered.filter(row=>byRecipient.get(row.id)?.attendance==="declined").length;
  const exportCsv=()=>{
    const keys=[...new Set(responses.flatMap(row=>Object.keys(row.answers)))];
    const rows=[["Destinataire","Invités prévus","Statut","Présents","Date","Dernière modification",...keys],...displayedRecipients.map(row=>{
      const answer=byRecipient.get(row.id);return [row.display_name,row.guest_count,!row.is_active?"Désactivé":!answer?"En attente":answer.attendance==="declined"?"Décliné":"Confirmé",answer?.present_count??"",answer?.created_at??"",answer?.updated_at??"",...keys.map(key=>answer?.answers[key]??"")];
    }),...responses.filter(row=>!row.recipient_id).map(row=>["Réponse historique","","Historique","",row.created_at,row.updated_at??"",...keys.map(key=>row.answers[key]??"")])];
    const url=URL.createObjectURL(new Blob(["\uFEFF",rows.map(row=>row.map(csvCell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download="reponses-formulaire.csv";anchor.click();URL.revokeObjectURL(url);
  };
  const responseDetail=(response:RsvpResponseRow)=> <article className="response-detail"><time>Réponse du {new Date(response.created_at).toLocaleString("fr-FR")} · Dernière modification : {new Date(response.updated_at??response.created_at).toLocaleString("fr-FR")}</time>{Object.entries(response.answers).map(([key,value])=><p key={key}><strong>{key} : </strong>{Array.isArray(value)?value.join(", "):String(value??"—")}</p>)}<ResponseHistory projectId={selected} response={response}/></article>;
  return <main className="responses-page"><header><Link to={projectId?`/studio/${projectId}`:"/"}><ArrowLeft size={16}/> Retour</Link><h1>{hasForm?"Réponses au formulaire":"Historique des réponses RSVP"}</h1><button disabled={loading||(!responses.length&&(!hasForm||!recipients.length))} onClick={exportCsv}><Download size={15}/> Exporter CSV</button></header>
    <label>Faire-part<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choisir un faire-part</option>{projects.filter(project=>project.id===selected||statuses.some(row=>row.project_id===project.id&&(row.has_form||row.has_history))).map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    {error&&<p className="form-error" role="alert">{error}</p>}{loading?<p>Chargement des réponses…</p>:error?null:<>
    {!hasForm&&selected&&<p>La version publiée ne contient pas de formulaire actif. Les réponses antérieures sont conservées ci-dessous.</p>}
    {hasForm&&<div className="response-stats"><span>Destinataires<strong>{totals.households}</strong></span><span>Foyers ayant répondu<strong>{answered.length}</strong></span><span>Personnes attendues<strong>{totals.guests}</strong></span><span>Personnes confirmées<strong>{confirmed}</strong></span><span>Refus (foyers)<strong>{declined}</strong></span><span>Foyers en attente<strong>{totals.households-answered.length}</strong></span></div>}
    <section><h2>{hasForm?"Destinataires et réponses":"Réponses conservées"}</h2>{!recipients.length&&!responses.length&&<p>Aucune réponse pour le moment.</p>}<div className="recipient-table-wrap"><table><thead><tr><th>Destinataire</th><th>Invités prévus</th><th>Présents</th><th>Statut</th><th>Détail</th></tr></thead><tbody>{displayedRecipients.map(row=>{const response=byRecipient.get(row.id);return <tr key={row.id}><td>{row.display_name}</td><td>{row.guest_count}</td><td>{response?.present_count??0}</td><td>{!row.is_active?"Désactivé":!response?"En attente":response.attendance==="declined"?"Décliné":"Confirmé"}</td><td>{response&&<button onClick={()=>setDetail(detail===row.id?null:row.id)}>Voir la réponse</button>}{detail===row.id&&response&&responseDetail(response)}</td></tr>;})}</tbody></table></div></section>
    {responses.some(row=>!row.recipient_id)&&<section><h2>Réponses historiques (lien commun)</h2><p>Ces réponses sont conservées sans les attribuer arbitrairement à un foyer.</p>{responses.filter(row=>!row.recipient_id).map(row=><div key={row.id}>{responseDetail(row)}</div>)}</section>}
    </>}
  </main>;
}
