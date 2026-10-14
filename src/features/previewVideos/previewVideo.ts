export const PREVIEW_VIDEO_BUCKET = "card-preview-videos";
export const MAX_PREVIEW_VIDEO_BYTES = 15 * 1024 * 1024;
export const PREVIEW_VIDEO_ADVICE = "5 à 15 s · 480p/720p · 24/30 images/s · sans audio. MP4 H.264 recommandé. Aucune compression automatique.";

export async function validatePreviewVideo(file: Pick<File, "name" | "type" | "size" | "slice">) {
  if (!file.size || file.size > MAX_PREVIEW_VIDEO_BYTES) throw new Error("La vidéo doit faire entre 1 octet et 15 Mo maximum.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const mime = extension === "mp4" ? "video/mp4" : extension === "webm" ? "video/webm" : null;
  if (!mime || (file.type && file.type !== mime)) throw new Error("Formats acceptés : MP4 ou WebM uniquement.");
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const valid = mime === "video/mp4" ? bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    : bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (!valid) throw new Error("Le contenu du fichier ne correspond pas à une vidéo MP4/WebM.");
  return { mime, extension: extension! };
}

/** One playback owner for the whole gallery, including manual/touch playback. */
export function createPreviewPlaybackCoordinator() {
  let current: { id: symbol; stop: () => void } | undefined;
  return {
    claim(id: symbol, stop: () => void) { if (current?.id !== id) current?.stop(); current = { id, stop }; },
    release(id: symbol) { if (current?.id === id) current = undefined; },
  };
}
export const previewPlayback = createPreviewPlaybackCoordinator();
