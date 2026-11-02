import { useNavigate } from "react-router-dom";
import type { WeddingProject } from "../../types/editor";
import { usePublishedRsvpStatus } from "./usePublishedRsvpStatus";

export function PublishedRsvpActions({ project }: { project: WeddingProject }) {
  const navigate = useNavigate();
  const status = usePublishedRsvpStatus(project.id, project.activeVersionId ?? project.updatedAt, Boolean(project.ownerId && project.paymentStatus === "paid"))
    .find(row => row.project_id === project.id);
  if (!status?.has_form && !status?.has_history) return null;
  return <button type="button" onClick={() => navigate(`/studio/${project.id}/rsvp/responses`)}>
    {status.has_form ? "Réponses au formulaire" : "Historique des réponses RSVP"}
  </button>;
}
