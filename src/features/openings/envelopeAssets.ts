import type { EnvelopeAssetRef, EnvelopeConfig } from "../../types/editor";
import type { EnvelopeGlobalAssetType, GlobalAssetRecord } from "../../types/globalAssets";

export type EnvelopePart = "base" | "flap" | "seal";
export const ENVELOPE_PARTS = ["base", "flap", "seal"] as const;
export const ENVELOPE_GLOBAL_TYPES: Record<EnvelopePart, EnvelopeGlobalAssetType> = { base: "envelope_base", flap: "envelope_flap", seal: "envelope_seal" };
export function globalEnvelopeChoices(assets: GlobalAssetRecord[], part: EnvelopePart): EnvelopeAssetRef[] {
  return [...new Map(assets.filter((asset) => asset.isPublished && asset.type === ENVELOPE_GLOBAL_TYPES[part]).map((asset) => [asset.id, asset])).values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((asset) => ({ type: "global", id: asset.id, url: asset.url, name: asset.name }));
}
export const ENVELOPE_PART_FIELDS = {
  base: { active: "baseAsset", library: "customBases", folder: "envelope/bases", label: "Base", plural: "Mes bases", noun: "une base", guide: "base", width: 941, height: 1672 },
  flap: { active: "flapAsset", library: "customFlaps", folder: "envelope/flaps", label: "Rabat", plural: "Mes rabats", noun: "un rabat", guide: "flap", width: 941, height: 1672 },
  seal: { active: "sealAsset", library: "customSeals", folder: "envelope/seals", label: "Cachet", plural: "Mes cachets", noun: "un cachet", guide: "seal", width: 1254, height: 1254 },
} as const;

const preset = (id: string, name: string, filename: string, width: number, height: number): EnvelopeAssetRef => ({ type: "preset", id, name, url: `/assets/openings/envelope/${filename}.png`, width, height });
export const ENVELOPE_PRESETS: Record<EnvelopePart, EnvelopeAssetRef[]> = {
  base: [preset("base-natural", "Papier naturel", "base1", 941, 1672), preset("base-burgundy", "Papier bordeaux", "base2", 948, 1659), preset("base-olive", "Papier olive", "base3", 941, 1672)],
  flap: [preset("flap-natural", "Papier naturel", "rabat1", 941, 1672), preset("flap-burgundy", "Papier bordeaux", "rabat2", 948, 1659), preset("flap-olive", "Papier olive", "rabat3", 941, 1672)],
  seal: [preset("seal-gold-rings", "Or alliances", "cachet1", 1254, 1254), preset("seal-red-rings", "Bordeaux alliances", "cachet2", 1254, 1254), preset("seal-green-rings", "Vert alliances", "cachet3", 1254, 1254)],
};

/** Explicit refs, not filenames: global and custom URLs remain independent. */
export function resolveEnvelopeAsset(config: EnvelopeConfig | undefined, part: EnvelopePart): EnvelopeAssetRef {
  const ref = config?.[ENVELOPE_PART_FIELDS[part].active];
  if (ref?.type === "preset") return ENVELOPE_PRESETS[part].find((item) => item.id === ref.id) ?? ENVELOPE_PRESETS[part][0];
  if ((ref?.type === "custom" || ref?.type === "global") && /^https?:\/\//i.test(ref.url)) return ref;
  return ENVELOPE_PRESETS[part][0];
}

export const ENVELOPE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export function validateEnvelopeFile(file: Pick<File, "name" | "type" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : null;
  if (!mime || file.type !== mime) throw new Error("Format non pris en charge. Utilisez une image PNG ou WebP.");
  if (!file.size || file.size > ENVELOPE_MAX_FILE_BYTES) throw new Error("L’image doit peser entre 1 octet et 5 Mo maximum.");
  return mime;
}

export async function decodeEnvelopeFile(file: File) {
  validateEnvelopeFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Dimensions de l’image invalides.");
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}

export function removeEnvelopeCustom(config: EnvelopeConfig | undefined, part: EnvelopePart, id: string): EnvelopeConfig {
  const fields = ENVELOPE_PART_FIELDS[part];
  const next = { ...config, [fields.library]: (config?.[fields.library] ?? []).filter((asset) => asset.id !== id) };
  if (config?.[fields.active]?.type === "custom" && config[fields.active]?.id === id) next[fields.active] = ENVELOPE_PRESETS[part][0];
  return next;
}
