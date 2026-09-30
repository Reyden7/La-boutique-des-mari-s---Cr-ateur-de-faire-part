import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PreviewDevice } from "../../config/previewDevices";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { getImageFrameMetrics, resolveImageFrame } from "../../config/imageFrames";
import type { ImageElement, ImageTransformConfig } from "../../types/editor";
import { getImageRenderLayout, resolveImageFit, resolveImageTransform, setImageTransformForDevice } from "../../utils/imageLayout";
import { ImageContentRenderer } from "./ImageContentRenderer";

type CropDraft = Pick<ImageTransformConfig, "cropX" | "cropY" | "cropScale">;
type DragStart = { pointerId: number; x: number; y: number; cropX: number; cropY: number };

const clampPosition = (value: number) => Math.min(1, Math.max(0, value));

export function ImageTransformProperties({ element, device, width, height, onChange }: {
  element: ImageElement;
  device: PreviewDevice;
  width: number;
  height: number;
  onChange: (changes: Partial<ImageElement>) => void;
}) {
  const transform = resolveImageTransform(element, device);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CropDraft>(() => ({ cropX: transform.cropX, cropY: transform.cropY, cropScale: transform.cropScale }));
  const [naturalSize, setNaturalSize] = useState<{ src: string; width: number; height: number } | null>(null);
  const dragRef = useRef<DragStart | null>(null);
  const frame = resolveImageFrame(element.imageStyle?.frame);
  const metrics = getImageFrameMetrics(frame, width, height);
  const contentWidth = Math.max(1, width - (frame.enabled ? metrics.left + metrics.right : 0));
  const contentHeight = Math.max(1, height - (frame.enabled ? metrics.top + metrics.bottom : 0));
  const previewScale = Math.min(228 / contentWidth, 210 / contentHeight);
  const previewWidth = contentWidth * previewScale;
  const previewHeight = contentHeight * previewScale;
  const fit = resolveImageFit(element.fit);
  const imageSize = naturalSize?.src === element.src ? naturalSize : null;

  const beginCrop = () => {
    setDraft({ cropX: transform.cropX, cropY: transform.cropY, cropScale: transform.cropScale });
    setEditing(true);
  };
  const updateTransform = (changes: Partial<ImageTransformConfig>) =>
    onChange(setImageTransformForDevice(element, device, changes));
  const resetCrop = () => {
    setDraft({ cropX: .5, cropY: .5, cropScale: 1 });
    if (!editing) updateTransform({ cropX: .5, cropY: .5, cropScale: 1 });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cropX: draft.cropX, cropY: draft.cropY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !imageSize) return;
    const rendered = getImageRenderLayout(imageSize.width, imageSize.height, previewWidth, previewHeight, fit, draft);
    const rangeX = previewWidth - rendered.width;
    const rangeY = previewHeight - rendered.height;
    setDraft((current) => ({
      ...current,
      cropX: Math.abs(rangeX) < .01 ? drag.cropX : clampPosition(drag.cropX + (event.clientX - drag.x) / rangeX),
      cropY: Math.abs(rangeY) < .01 ? drag.cropY : clampPosition(drag.cropY + (event.clientY - drag.y) / rangeY),
    }));
    event.preventDefault();
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <section className="image-transform-properties">
    <h3>Recadrage</h3>
    <small className="image-transform-device">Réglages {PREVIEW_DEVICES[device].label} · le fichier original reste intact.</small>
    {!editing ? <div className="image-transform-actions">
      <button type="button" onClick={beginCrop}>Recadrer</button>
      <button type="button" onClick={resetCrop} disabled={transform.cropX === .5 && transform.cropY === .5 && transform.cropScale === 1}>Réinitialiser</button>
    </div> : <>
      <div
        className="image-crop-editor"
        style={{ width: previewWidth, height: previewHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        aria-label="Déplacer l’image dans le cadre de recadrage"
      >
        <ImageContentRenderer
          src={element.src}
          alt={element.alt}
          fit={fit}
          transform={{ ...transform, ...draft }}
          boxWidth={contentWidth}
          boxHeight={contentHeight}
          onImageLoad={(naturalWidth, naturalHeight) => setNaturalSize({ src: element.src, width: naturalWidth, height: naturalHeight })}
        />
      </div>
      <label className="field"><span>Zoom dans le cadre · {Math.round(draft.cropScale * 100)} %</span><input type="range" min="1" max="4" step="0.01" value={draft.cropScale} onChange={(event) => setDraft((current) => ({ ...current, cropScale: Number(event.target.value) }))} /></label>
      <label className="field"><span>Cadrage horizontal · {Math.round(draft.cropX * 100)} %</span><input type="range" min="0" max="1" step="0.01" value={draft.cropX} onChange={(event) => setDraft((current) => ({ ...current, cropX: Number(event.target.value) }))} /></label>
      <label className="field"><span>Cadrage vertical · {Math.round(draft.cropY * 100)} %</span><input type="range" min="0" max="1" step="0.01" value={draft.cropY} onChange={(event) => setDraft((current) => ({ ...current, cropY: Number(event.target.value) }))} /></label>
      <div className="image-transform-actions">
        <button type="button" onClick={resetCrop}>Réinitialiser</button>
        <button type="button" onClick={() => setEditing(false)}>Annuler</button>
        <button type="button" className="primary" onClick={() => { updateTransform(draft); setEditing(false); }}>Valider</button>
      </div>
    </>}
    <h3>Retournement</h3>
    <label className="compact-check"><input type="checkbox" checked={transform.flipX} onChange={(event) => updateTransform({ flipX: event.target.checked })} /> Retourner horizontalement</label>
    <label className="compact-check"><input type="checkbox" checked={transform.flipY} onChange={(event) => updateTransform({ flipY: event.target.checked })} /> Retourner verticalement</label>
  </section>;
}
