import { Monitor, RotateCcw, Smartphone, Tablet, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";

export function PreviewMode({ project, device, onClose, allowDeviceSwitching = false }: { project: WeddingProject; device: PreviewDevice; onClose: () => void; allowDeviceSwitching?: boolean }) {
  const [replayKey, setReplayKey] = useState(0);
  const [activeDevice, setActiveDevice] = useState(device);
  const viewport = PREVIEW_DEVICES[activeDevice];
  const frameStyle = {
    "--preview-device-width": `${viewport.width}px`,
    "--preview-device-ratio": `${viewport.width} / ${viewport.height}`,
  } as CSSProperties;
  return (
    <div className={`preview-mode preview-mode-${activeDevice}`}>
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour</button>{allowDeviceSwitching && <div className="template-preview-devices"><button className={activeDevice === "mobile" ? "active" : ""} onClick={() => setActiveDevice("mobile")}><Smartphone size={15} /> Smartphone</button><button className={activeDevice === "tablet" ? "active" : ""} onClick={() => setActiveDevice("tablet")}><Tablet size={15} /> Tablette</button><button className={activeDevice === "desktop" ? "active" : ""} onClick={() => setActiveDevice("desktop")}><Monitor size={15} /> PC</button></div>}<button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button></div>
      <div className="preview-content"><div key={`${replayKey}-${activeDevice}`} className="preview-device-frame" style={frameStyle}><InvitationExperience project={project} device={activeDevice} mode="preview" /></div></div>
    </div>
  );
}
