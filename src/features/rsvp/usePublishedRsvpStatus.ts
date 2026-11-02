import { useEffect, useState } from "react";
import { loadPublishedRsvpStatuses, type PublishedRsvpStatus } from "../../services/rsvpRepository";

/** Server-owned live snapshot status: never infer presence from an unpaid draft. */
export function usePublishedRsvpStatus(projectId?: string, revision?: string | number, enabled = true) {
  const [rows, setRows] = useState<PublishedRsvpStatus[]>([]);
  useEffect(() => {
    let active = true;
    setRows([]);
    if (!enabled) return;
    void loadPublishedRsvpStatuses(projectId).then(value => { if (active) setRows(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [projectId, revision, enabled]);
  return rows;
}
