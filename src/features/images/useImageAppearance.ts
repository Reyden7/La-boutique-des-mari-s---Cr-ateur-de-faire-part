import { useMemo } from "react";
import type { ImageFit, ImageTransformConfig } from "../../types/editor";
import { composeImageAppearance, hasImageAppearance, type ResolvedImageAppearance } from "../../utils/imageAppearance";

export function useImageAppearance(image: HTMLImageElement | null | undefined, width: number, height: number, fit: ImageFit, transform: ImageTransformConfig, appearance?: ResolvedImageAppearance, imageRevision = 0) {
  const key = appearance && hasImageAppearance(appearance) ? JSON.stringify(appearance) : "";
  return useMemo(() => image?.complete && image.naturalWidth && image.naturalHeight && key ? composeImageAppearance(image, width, height, fit, transform, JSON.parse(key) as ResolvedImageAppearance) : null,
    // Primitive dependencies prevent recompositing on selection, drag, global opacity and rotation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, imageRevision, width, height, fit, transform.cropX, transform.cropY, transform.cropScale, transform.flipX, transform.flipY, key]);
}
