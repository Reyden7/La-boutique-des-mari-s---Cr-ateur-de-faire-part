/** A project image defines the scratch silhouette; only its alpha is retained. */
export interface ScratchMask {
  canvas: HTMLCanvasElement;
  url: string;
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  source: "alpha" | "background";
}

export interface ScratchMaskAnalysis {
  alpha: Uint8ClampedArray;
  source: ScratchMask["source"];
  coverage: number;
}

const MAX_MASK_SIDE = 1024;
const BACKGROUND_DISTANCE = 62;

/** Transparent assets use their exact alpha. For opaque images, remove only a
 * near-uniform background connected to the image edge. A photograph with no
 * separable background is rejected rather than pretending its rectangle is a shape.
 */
export function analyzeScratchMaskPixels(pixels: Uint8ClampedArray, width: number, height: number): ScratchMaskAnalysis {
  const count = width * height;
  const alpha = new Uint8ClampedArray(count);
  let translucent = 0;
  for (let i = 0; i < count; i++) {
    alpha[i] = pixels[i * 4 + 3];
    if (alpha[i] < 245) translucent++;
  }
  if (translucent > count * .001) {
    let active = 0;
    for (const value of alpha) if (value > 40) active++;
    return { alpha, source: "alpha", coverage: active / count };
  }

  const corners = [0, width - 1, (height - 1) * width, count - 1].map((i) => [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
  const isBackground = (i: number) => corners.some(([r, g, b]) => {
    const p = i * 4;
    return Math.hypot(pixels[p] - r, pixels[p + 1] - g, pixels[p + 2] - b) < BACKGROUND_DISTANCE;
  });
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const enqueue = (i: number) => {
    if (visited[i] || !isBackground(i)) return;
    visited[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++];
    alpha[i] = 0;
    const x = i % width;
    if (x > 0) enqueue(i - 1);
    if (x + 1 < width) enqueue(i + 1);
    if (i >= width) enqueue(i - width);
    if (i + width < count) enqueue(i + width);
  }
  return { alpha, source: "background", coverage: (count - tail) / count };
}

export function getScratchMaskPlacement(mask: Pick<ScratchMask, "width" | "height">, width: number, height: number) {
  const scale = Math.min(width / mask.width, height / mask.height);
  const imageWidth = mask.width * scale;
  const imageHeight = mask.height * scale;
  return { x: (width - imageWidth) / 2, y: (height - imageHeight) / 2, width: imageWidth, height: imageHeight };
}

export function isScratchMaskPointActive(mask: ScratchMask, x: number, y: number, width: number, height: number) {
  const placement = getScratchMaskPlacement(mask, width, height);
  const mx = Math.floor((x - placement.x) / placement.width * mask.width);
  const my = Math.floor((y - placement.y) / placement.height * mask.height);
  return mx >= 0 && mx < mask.width && my >= 0 && my < mask.height && mask.alpha[my * mask.width + mx] > 40;
}

export function applyScratchMask(context: CanvasRenderingContext2D, mask: ScratchMask, width: number, height: number) {
  const placement = getScratchMaskPlacement(mask, width, height);
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask.canvas, placement.x, placement.y, placement.width, placement.height);
  context.restore();
}

export function makeMaskedScratchCanvas(mask: ScratchMask, width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  paint(context);
  applyScratchMask(context, mask, canvas.width, canvas.height);
  return canvas;
}

const cache = new Map<string, Promise<ScratchMask>>();

export function loadScratchMask(url: string): Promise<ScratchMask> {
  const existing = cache.get(url);
  if (existing) return existing;
  const loading = new Promise<ScratchMask>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const scale = Math.min(1, MAX_MASK_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Le masque ne peut pas être lu.");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height);
        const analysis = analyzeScratchMaskPixels(data.data, width, height);
        if (analysis.coverage < .001 || analysis.coverage > .98) {
          throw new Error("La silhouette ne peut pas être isolée. Utilisez un PNG ou WebP transparent, ou une image sur fond uni.");
        }
        for (let i = 0; i < analysis.alpha.length; i++) {
          const p = i * 4;
          data.data[p] = 255;
          data.data[p + 1] = 255;
          data.data[p + 2] = 255;
          data.data[p + 3] = analysis.alpha[i];
        }
        context.putImageData(data, 0, 0);
        resolve({ canvas, url: canvas.toDataURL("image/png"), alpha: analysis.alpha, width, height, source: analysis.source });
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Impossible de charger le modèle à gratter."));
    image.src = url;
  });
  cache.set(url, loading);
  void loading.catch(() => { cache.delete(url); });
  return loading;
}
