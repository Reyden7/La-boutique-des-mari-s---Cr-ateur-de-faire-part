import { Check, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { OpeningAnimationConfig, OpeningAnimationType, WeddingProject } from "../../types/editor";
import { WeddingRenderer } from "../../components/renderer/WeddingRenderer";
import { OpeningRenderer } from "./OpeningRenderer";
import { getOpeningDefinition } from "./registry/openingRegistry";

export function OpeningPreview({ project, type, onUse, onClose }: { project: WeddingProject; type: OpeningAnimationType; onUse: (opening: OpeningAnimationConfig) => void; onClose: () => void }) {
  const [key, setKey] = useState(0);
  const definition = getOpeningDefinition(type);
  const config = project.opening.type === type ? project.opening : definition.defaultSettings;
  return <div className="preview-mode"><div className="preview-controls"><button onClick={onClose}><X size={16} /> Retour</button><button onClick={() => setKey((value) => value + 1)}><RotateCcw size={16} /> Rejouer</button><button className="use-opening-button" onClick={() => { onUse(config); onClose(); }}><Check size={16} /> Utiliser {definition.name}</button></div><div className="preview-content" key={key}><OpeningRenderer config={config} couple={project.name.match(/—\s*(.*)/)?.[1] ?? project.name}><WeddingRenderer project={project} /></OpeningRenderer></div></div>;
}
