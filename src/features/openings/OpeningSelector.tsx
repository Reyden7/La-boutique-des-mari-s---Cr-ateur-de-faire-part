import { Check, Play } from "lucide-react";
import type { OpeningAnimationType } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { openingRegistry } from "./registry/openingRegistry";

export function OpeningSelector({ onPreview }: { onPreview: (type: OpeningAnimationType) => void }) {
  const project = useEditorStore((state) => state.project);
  const updateOpening = useEditorStore((state) => state.updateOpening);
  if (!project) return null;
  return <div className="opening-selector"><div className="panel-kicker">Bibliothèque</div><h2>Choisissez l’entrée</h2><p>L’ouverture reste indépendante de votre design.</p><div className="opening-card-list">{openingRegistry.map((definition) => {
    const selected = project.opening.type === definition.id;
    return <article className={`opening-card ${selected ? "selected" : ""}`} key={definition.id}><button className="opening-card-main" onClick={() => updateOpening({ ...definition.defaultSettings, colors: project.opening.type === definition.id ? project.opening.colors : definition.defaultSettings.colors })}><span className={`opening-glyph ${definition.id}`}>{definition.thumbnail}</span><span><strong>{definition.name}</strong><small>{definition.description}</small></span>{selected && <Check size={15} />}</button><button className="opening-preview-button" onClick={() => onPreview(definition.id)}><Play size={12} fill="currentColor" /> Aperçu</button></article>;
  })}</div></div>;
}
