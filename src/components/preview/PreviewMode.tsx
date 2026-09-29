import { Monitor, RotateCcw, Smartphone, Tablet, X } from "lucide-react";
import { useState } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";
import type { PreviewDevice } from "../../config/previewDevices";

export function PreviewMode({ project, device, onClose, allowDeviceSwitching = false }: { project: WeddingProject; device: PreviewDevice; onClose: () => void; allowDeviceSwitching?: boolean }) {
  const [replayKey, setReplayKey] = useState(0);
  const [activeDevice, setActiveDevice] = useState(device);
  return (
    <div className="preview-mode">
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour</button>{allowDeviceSwitching && <div className="template-preview-devices"><button className={activeDevice === "mobile" ? "active" : ""} onClick={() => setActiveDevice("mobile")}><Smartphone size={15} /> Smartphone</button><button className={activeDevice === "tablet" ? "active" : ""} onClick={() => setActiveDevice("tablet")}><Tablet size={15} /> Tablette</button><button className={activeDevice === "desktop" ? "active" : ""} onClick={() => setActiveDevice("desktop")}><Monitor size={15} /> PC</button></div>}<button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button></div>
      <div key={`${replayKey}-${activeDevice}`} className="preview-content"><InvitationExperience project={project} device={activeDevice} mode="preview" /></div>
    </div>
  );
}
