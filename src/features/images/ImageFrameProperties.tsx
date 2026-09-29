import type { ImageElement, ImageFrameBorderStyle } from "../../types/editor";
import { applyImageFramePreset, IMAGE_FRAME_PRESETS, resolveImageFrame } from "../../config/imageFrames";
import { ColorAlphaInput } from "../../components/ui/ColorAlphaInput";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function ImageFrameProperties({ element, onChange }: { element: ImageElement; onChange: (element: Partial<ImageElement>) => void }) {
  const frame = resolveImageFrame(element.imageStyle?.frame);
  const updateFrame = (changes: Partial<typeof frame>) => onChange({
    imageStyle: { ...element.imageStyle, frame: { ...frame, ...changes } },
  });
  const choosePreset = (type: typeof frame.type) => onChange({
    imageStyle: { ...element.imageStyle, frame: applyImageFramePreset(frame, type) },
  });

  return <section className="image-frame-properties">
    <h3>Cadre</h3>
    <label className="compact-check"><input type="checkbox" checked={frame.enabled} onChange={(event) => updateFrame({ enabled: event.target.checked })} /> Afficher un cadre</label>
    {frame.enabled && <>
      <div className="image-frame-preset-grid" role="list" aria-label="Styles de cadre">
        {IMAGE_FRAME_PRESETS.map((preset) => <button
          type="button"
          role="listitem"
          key={preset.id}
          className={frame.type === preset.id ? "selected" : ""}
          onClick={() => choosePreset(preset.id)}
          aria-pressed={frame.type === preset.id}
        ><span className={`image-frame-preset image-frame-preset-${preset.id}`}><i /></span><small>{preset.name}</small></button>)}
      </div>
      <div className="field-row"><Field label="Couleur du cadre"><ColorAlphaInput value={frame.color} onChange={(color) => updateFrame({ color })} /></Field><Field label="Style de bordure"><select value={frame.borderStyle} onChange={(event) => updateFrame({ borderStyle: event.target.value as ImageFrameBorderStyle })}><option value="solid">Pleine</option><option value="double">Double</option><option value="dotted">Pointillée</option><option value="dashed">Tirets</option></select></Field></div>
      <div className="field-row"><Field label="Épaisseur"><input type="number" min="1" max="60" value={frame.width} onChange={(event) => updateFrame({ width: Number(event.target.value) })} /></Field><Field label="Rayon des coins"><input type="number" min="0" max="160" value={frame.radius} onChange={(event) => updateFrame({ radius: Number(event.target.value) })} /></Field></div>
      <Field label={`Opacité du cadre · ${Math.round(frame.opacity * 100)} %`}><input type="range" min="0.05" max="1" step="0.05" value={frame.opacity} onChange={(event) => updateFrame({ opacity: Number(event.target.value) })} /></Field>
      <label className="compact-check"><input type="checkbox" checked={frame.shadowEnabled} onChange={(event) => updateFrame({ shadowEnabled: event.target.checked })} /> Afficher une ombre</label>
      {frame.shadowEnabled && <><div className="field-row"><Field label="Flou"><input type="number" min="0" max="80" value={frame.shadowBlur} onChange={(event) => updateFrame({ shadowBlur: Number(event.target.value) })} /></Field><Field label="Distance"><input type="number" min="-40" max="80" value={frame.shadowDistance} onChange={(event) => updateFrame({ shadowDistance: Number(event.target.value) })} /></Field></div><Field label={`Opacité de l’ombre · ${Math.round(frame.shadowOpacity * 100)} %`}><input type="range" min="0" max="0.8" step="0.02" value={frame.shadowOpacity} onChange={(event) => updateFrame({ shadowOpacity: Number(event.target.value) })} /></Field></>}
    </>}
  </section>;
}
