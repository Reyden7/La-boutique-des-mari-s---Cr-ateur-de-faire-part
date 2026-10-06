import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ImageFit, ImageTransformConfig } from "../../types/editor";
import { getImageRenderLayout } from "../../utils/imageLayout";
import { hasImageAppearance, type ResolvedImageAppearance } from "../../utils/imageAppearance";
import { useImageAppearance } from "./useImageAppearance";

interface ImageContentRendererProps {
  src: string;
  alt: string;
  fit: ImageFit;
  transform: ImageTransformConfig;
  boxWidth: number;
  boxHeight: number;
  style?: CSSProperties;
  appearance?: ResolvedImageAppearance;
  onImageLoad?: (width: number, height: number) => void;
}

export function ImageContentRenderer({ src, alt, fit, transform, boxWidth, boxHeight, style, appearance, onImageLoad }: ImageContentRendererProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const onImageLoadRef = useRef(onImageLoad);
  onImageLoadRef.current = onImageLoad;
  const [loaded, setLoaded] = useState<{ src: string; width: number; height: number; revision: number } | null>(null);
  const [corsFallbackSrc, setCorsFallbackSrc] = useState<string>();
  const cors = appearance && hasImageAppearance(appearance) && corsFallbackSrc !== src;
  const dimensions = loaded?.src === src ? loaded : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const composite = useImageAppearance(dimensions ? imageRef.current : null, boxWidth, boxHeight, fit, transform, appearance, dimensions?.revision);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !composite) return;
    canvas.width = composite.width; canvas.height = composite.height;
    canvas.getContext("2d")!.drawImage(composite, 0, 0);
  }, [composite]);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth && image.naturalHeight) {
      setLoaded((previous) => ({ src, width: image.naturalWidth, height: image.naturalHeight, revision: (previous?.revision ?? 0) + 1 }));
      onImageLoadRef.current?.(image.naturalWidth, image.naturalHeight);
    }
  }, [src]);

  const rendered = dimensions
    ? getImageRenderLayout(dimensions.width, dimensions.height, boxWidth, boxHeight, fit, transform)
    : null;
  const imageStyle: CSSProperties = rendered ? {
    left: `${rendered.x / boxWidth * 100}%`,
    top: `${rendered.y / boxHeight * 100}%`,
    width: `${rendered.width / boxWidth * 100}%`,
    height: `${rendered.height / boxHeight * 100}%`,
    transform: `scale(${transform.flipX ? -1 : 1}, ${transform.flipY ? -1 : 1})`,
  } : { left: 0, top: 0, width: "100%", height: "100%", objectFit: fit, transform: `scale(${transform.flipX ? -1 : 1}, ${transform.flipY ? -1 : 1})` };

  return <div className="image-content-viewport" style={style}>
    <img
      ref={imageRef}
      crossOrigin={cors ? "anonymous" : undefined}
      src={src}
      alt={alt}
      aria-hidden={composite ? true : undefined}
      draggable={false}
      style={{ ...imageStyle, visibility: composite ? "hidden" : undefined }}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        setLoaded((previous) => ({ src, width: naturalWidth, height: naturalHeight, revision: (previous?.revision ?? 0) + 1 }));
        onImageLoad?.(naturalWidth, naturalHeight);
      }}
      onError={(event) => {
        setLoaded(null);
        if (event.currentTarget.crossOrigin === "anonymous") setCorsFallbackSrc(src);
      }}
    />
    {composite && <canvas ref={canvasRef} className="image-appearance-canvas" role="img" aria-label={alt} />}
  </div>;
}
