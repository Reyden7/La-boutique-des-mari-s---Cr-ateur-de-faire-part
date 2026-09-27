import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadRsvpResponses, type RsvpResponseRow } from "../services/rsvpRepository";

export function RsvpResponsesPage() {
  const { projectId } = useParams();
  const [responses, setResponses] = useState<RsvpResponseRow[]>([]);
  useEffect(() => { if (projectId) void loadRsvpResponses(projectId).then(setResponses); }, [projectId]);
  const exportCsv = () => {
    const keys = [...new Set(responses.flatMap((response) => Object.keys(response.answers)))];
    const escape = (value: unknown) => `"${String(Array.isArray(value) ? value.join(", ") : value ?? "").replace(/"/g, '""')}"`;
    const csv = [["Date", ...keys].map(escape).join(";"), ...responses.map((response) => [new Date(response.created_at).toLocaleString("fr-FR"), ...keys.map((key) => response.answers[key])].map(escape).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "reponses-rsvp.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <main className="responses-page"><header><Link to={projectId ? `/studio/${projectId}` : "/"}><ArrowLeft size={16} /> Retour</Link><div><p className="eyebrow">Invités</p><h1>Réponses RSVP</h1></div><button disabled={!responses.length} onClick={exportCsv}><Download size={15} /> Exporter CSV</button></header><section>{responses.length === 0 ? <div className="empty-responses"><h2>Aucune réponse pour le moment</h2><p>Les réponses envoyées depuis le faire-part public apparaîtront ici.</p></div> : <div className="responses-grid">{responses.map((response) => <article key={response.id}><time>{new Date(response.created_at).toLocaleString("fr-FR")}</time>{Object.entries(response.answers).map(([key, value]) => <div key={key}><span>{key}</span><strong>{Array.isArray(value) ? value.join(", ") : String(value ?? "—")}</strong></div>)}</article>)}</div>}</section></main>;
}
