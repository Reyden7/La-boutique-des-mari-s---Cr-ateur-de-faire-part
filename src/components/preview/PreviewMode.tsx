import { Monitor, RotateCcw, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";

export function PreviewMode({ project, device, onClose, allowDeviceSwitching = false }: { project: WeddingProject; device: PreviewDevice; onClose: () => void; allowDeviceSwitching?: boolean }) {
  const [replayKey, setReplayKey] = useState(0);
  const [activeDevice, setActiveDevice] = useState(device);
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const measure = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  const viewport = PREVIEW_DEVICES[activeDevice];
  const scale = windowSize.width && windowSize.height
    ? Math.min(1, (windowSize.width - 32) / viewport.width, (windowSize.height - 88) / viewport.height)
    : 1;
  const visibleScale = Math.max(0.1, scale);
  const frameStyle = {
    "--preview-device-width": `${viewport.width}px`,
    "--preview-device-height": `${viewport.height}px`,
    "--preview-device-scale": visibleScale,
  } as CSSProperties;
  return (
    <div className={`preview-mode preview-mode-${activeDevice}`}>
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour</button>{allowDeviceSwitching && <div className="template-preview-devices"><button className={activeDevice === "mobile" ? "active" : ""} onClick={() => setActiveDevice("mobile")}><Smartphone size={15} /> Smartphone</button><button className={activeDevice === "tablet" ? "active" : ""} onClick={() => setActiveDevice("tablet")}><Tablet size={15} /> Tablette</button><button className={activeDevice === "desktop" ? "active" : ""} onClick={() => setActiveDevice("desktop")}><Monitor size={15} /> PC</button></div>}<button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button></div>
      <div className="preview-content">
        <div className="preview-device-shell" style={{ width: viewport.width * visibleScale, height: viewport.height * visibleScale }}>
          <div className="preview-device-frame" style={frameStyle}>
            <div key={`${replayKey}-${activeDevice}`} className="preview-device-viewport" aria-label={`Aperçu ${viewport.label}`}>
              <InvitationExperience project={project} device={activeDevice} mode="preview" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
