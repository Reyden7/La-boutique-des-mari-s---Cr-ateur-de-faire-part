import { RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";

export function PreviewMode({ project, onClose }: { project: WeddingProject; onClose: () => void }) {
  const [replayKey, setReplayKey] = useState(0);
  return (
    <div className="preview-mode">
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour à l’éditeur</button><button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button></div>
      <div key={replayKey} className="preview-content"><InvitationExperience project={project} /></div>
    </div>
  );
}
