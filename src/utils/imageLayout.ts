import type { PreviewDevice } from "../config/previewDevices";
import type { ImageElement, ImageFit, ImageTransformConfig } from "../types/editor";

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageRenderLayout extends ImageDimensions {
  x: number;
  y: number;
}

/** Old projects did not persist a fit mode and historically rendered with cover. */
export const resolveImageFit = (fit?: ImageFit): ImageFit => fit ?? "cover";

export const DEFAULT_IMAGE_TRANSFORM: ImageTransformConfig = {
  cropX: .5,
  cropY: .5,
  cropScale: 1,
  flipX: false,
  flipY: false,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;

export const resolveImageTransform = (element: ImageElement, device: PreviewDevice): ImageTransformConfig => {
  const base = element.imageStyle?.transform;
  const override = device === "mobile" ? undefined : element.imageStyle?.responsive?.[device];
  const transform = { ...DEFAULT_IMAGE_TRANSFORM, ...base, ...override };
  return {
    cropX: clamp(transform.cropX, 0, 1),
    cropY: clamp(transform.cropY, 0, 1),
    cropScale: clamp(transform.cropScale, 1, 4),
    flipX: Boolean(transform.flipX),
    flipY: Boolean(transform.flipY),
  };
};

export const setImageTransformForDevice = (
  element: ImageElement,
  device: PreviewDevice,
  changes: Partial<ImageTransformConfig>,
): Pick<ImageElement, "imageStyle"> => {
  const imageStyle = element.imageStyle ?? {};
  if (device === "mobile") return {
    imageStyle: { ...imageStyle, transform: { ...resolveImageTransform(element, device), ...changes } },
  };
  return {
    imageStyle: {
      ...imageStyle,
      responsive: {
        ...imageStyle.responsive,
        [device]: { ...imageStyle.responsive?.[device], ...resolveImageTransform(element, device), ...changes },
      },
    },
  };
};

export const getImageInitialSize = (
  naturalWidth: number,
  naturalHeight: number,
  maximumWidth: number,
  maximumHeight: number,
): ImageDimensions => {
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);
  const ratio = safeWidth / safeHeight;
  let width = Math.max(1, maximumWidth);
  let height = width / ratio;

  if (height > maximumHeight) {
    height = Math.max(1, maximumHeight);
    width = height * ratio;
  }

  return { width, height };
};

export const getImageRenderLayout = (
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  fit: ImageFit,
  transform: Pick<ImageTransformConfig, "cropX" | "cropY" | "cropScale"> = DEFAULT_IMAGE_TRANSFORM,
): ImageRenderLayout => {
  const sourceWidth = Math.max(1, naturalWidth);
  const sourceHeight = Math.max(1, naturalHeight);
  const width = Math.max(1, boxWidth);
  const height = Math.max(1, boxHeight);
  const fitScale = fit === "contain"
    ? Math.min(width / sourceWidth, height / sourceHeight)
    : Math.max(width / sourceWidth, height / sourceHeight);
  const zoom = clamp(transform.cropScale, 1, 4);
  const renderedWidth = sourceWidth * fitScale * zoom;
  const renderedHeight = sourceHeight * fitScale * zoom;
  return {
    x: (width - renderedWidth) * clamp(transform.cropX, 0, 1),
    y: (height - renderedHeight) * clamp(transform.cropY, 0, 1),
    width: renderedWidth,
    height: renderedHeight,
  };
};

export const loadImageDimensions = (src: string) => new Promise<ImageDimensions>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
  image.onerror = () => reject(new Error("Impossible de lire les dimensions de l’image."));
  image.src = src;
});

export const readImageFileDimensions = (file: File) => new Promise<ImageDimensions>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  loadImageDimensions(objectUrl)
    .then(resolve, reject)
    .finally(() => URL.revokeObjectURL(objectUrl));
});
