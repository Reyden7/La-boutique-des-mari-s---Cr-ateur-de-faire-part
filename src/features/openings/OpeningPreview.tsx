import { Check } from "lucide-react";
import type { OpeningAnimationConfig, OpeningAnimationType, WeddingProject } from "../../types/editor";
import { PreviewMode } from "../../components/preview/PreviewMode";
import { getOpeningDefinition } from "./registry/openingRegistry";
import type { PreviewDevice } from "../../config/previewDevices";

export function OpeningPreview({ project, type, device, onUse, onClose }: { project: WeddingProject; type: OpeningAnimationType; device: PreviewDevice; onUse: (opening: OpeningAnimationConfig) => void; onClose: () => void }) {
  const definition = getOpeningDefinition(type);
  const config = project.opening.type === type ? project.opening : definition.defaultSettings;
  return <PreviewMode key={`${type}-${device}`} project={{ ...project, introductionMode: "classic", opening: config }} device={device} onClose={onClose} actions={<button className="use-opening-button" onClick={() => { onUse(config); onClose(); }}><Check size={16} /> Utiliser {definition.name}</button>} />;
}
