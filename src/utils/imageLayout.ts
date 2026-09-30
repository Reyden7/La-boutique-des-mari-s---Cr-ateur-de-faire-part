import type { ImageFit } from "../types/editor";

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageRenderLayout extends ImageDimensions {
  x: number;
  y: number;
  crop?: { x: number; y: number; width: number; height: number };
}

/** Old projects did not persist a fit mode and historically rendered with cover. */
export const resolveImageFit = (fit?: ImageFit): ImageFit => fit ?? "cover";

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
): ImageRenderLayout => {
  const sourceWidth = Math.max(1, naturalWidth);
  const sourceHeight = Math.max(1, naturalHeight);
  const width = Math.max(1, boxWidth);
  const height = Math.max(1, boxHeight);
  const sourceRatio = sourceWidth / sourceHeight;
  const boxRatio = width / height;

  if (fit === "contain") {
    const renderedWidth = sourceRatio > boxRatio ? width : height * sourceRatio;
    const renderedHeight = sourceRatio > boxRatio ? width / sourceRatio : height;
    return {
      x: (width - renderedWidth) / 2,
      y: (height - renderedHeight) / 2,
      width: renderedWidth,
      height: renderedHeight,
    };
  }

  if (sourceRatio > boxRatio) {
    const cropWidth = sourceHeight * boxRatio;
    return {
      x: 0,
      y: 0,
      width,
      height,
      crop: { x: (sourceWidth - cropWidth) / 2, y: 0, width: cropWidth, height: sourceHeight },
    };
  }

  const cropHeight = sourceWidth / boxRatio;
  return {
    x: 0,
    y: 0,
    width,
    height,
    crop: { x: 0, y: (sourceHeight - cropHeight) / 2, width: sourceWidth, height: cropHeight },
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
