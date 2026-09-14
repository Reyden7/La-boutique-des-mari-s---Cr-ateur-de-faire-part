import { RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";
import type { PreviewDevice } from "../../config/previewDevices";

export function PreviewMode({ project, device, onClose }: { project: WeddingProject; device: PreviewDevice; onClose: () => void }) {
  const [replayKey, setReplayKey] = useState(0);
  return (
    <div className="preview-mode">
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour à l’éditeur</button><button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button></div>
      <div key={replayKey} className="preview-content"><InvitationExperience project={project} device={device} /></div>
    </div>
  );
}
