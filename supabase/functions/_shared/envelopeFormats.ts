export const ENVELOPE_TYPES = ["envelope_base", "envelope_flap", "envelope_seal"] as const;
export const isEnvelopeType = (type: unknown): type is typeof ENVELOPE_TYPES[number] => ENVELOPE_TYPES.includes(type as typeof ENVELOPE_TYPES[number]);

/** Validate extension, declared MIME, size AND file header; never trust browser metadata. */
export async function inspectEnvelopeUpload(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : null;
  if (!mimeType || file.type !== mimeType) throw new Error("Format non pris en charge. Utilisez une image PNG ou WebP.");
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("L’image doit peser entre 1 octet et 5 Mo maximum.");
  const bytes = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  let width = 0, height = 0;
  if (extension === "png" && bytes.length >= 33 && bytes.slice(0, 8).join() === "137,80,78,71,13,10,26,10" && text(12, 16) === "IHDR") {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (extension === "webp" && bytes.length >= 30 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    const kind = text(12, 16);
    if (kind === "VP8X") {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  if (!width || !height || width > 16384 || height > 16384 || width * height > 40_000_000) throw new Error("En-tête ou dimensions de l’image invalides (40 mégapixels maximum).");
  return { width, height, mimeType, extension };
}
