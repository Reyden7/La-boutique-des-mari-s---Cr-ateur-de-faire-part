import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ImageFit, ImageTransformConfig } from "../../types/editor";
import { getImageRenderLayout } from "../../utils/imageLayout";

interface ImageContentRendererProps {
  src: string;
  alt: string;
  fit: ImageFit;
  transform: ImageTransformConfig;
  boxWidth: number;
  boxHeight: number;
  style?: CSSProperties;
  onImageLoad?: (width: number, height: number) => void;
}

export function ImageContentRenderer({ src, alt, fit, transform, boxWidth, boxHeight, style, onImageLoad }: ImageContentRendererProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const onImageLoadRef = useRef(onImageLoad);
  onImageLoadRef.current = onImageLoad;
  const [loaded, setLoaded] = useState<{ src: string; width: number; height: number } | null>(null);
  const dimensions = loaded?.src === src ? loaded : null;

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth && image.naturalHeight) {
      setLoaded({ src, width: image.naturalWidth, height: image.naturalHeight });
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
      src={src}
      alt={alt}
      draggable={false}
      style={imageStyle}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        setLoaded({ src, width: naturalWidth, height: naturalHeight });
        onImageLoad?.(naturalWidth, naturalHeight);
      }}
    />
  </div>;
}
