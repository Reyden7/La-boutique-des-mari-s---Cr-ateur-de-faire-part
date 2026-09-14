import { Maximize, Minus, Plus } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";

export function ZoomControls() {
  const { zoom, setZoom } = useEditorStore();
  return <div className="zoom-controls"><button onClick={() => setZoom(zoom - 0.1)} aria-label="Dézoomer"><Minus size={15} /></button><button className="zoom-value" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(zoom + 0.1)} aria-label="Zoomer"><Plus size={15} /></button><button onClick={() => setZoom(0.72)} aria-label="Ajuster à l’écran"><Maximize size={15} /></button></div>;
}
