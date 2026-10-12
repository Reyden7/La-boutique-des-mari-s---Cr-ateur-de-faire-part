import type { DoorConfig, DoorDeviceSettings, EnvelopeAssetRef, EnvelopeOffset } from "../../types/editor";
import type { DoorGlobalAssetType, GlobalAssetRecord } from "../../types/globalAssets";
import type { PreviewDevice } from "../../config/previewDevices";
import { resolveEnvelopeOffset } from "./pngEnvelopeLayout";

export type DoorPart = "left" | "right";
export const DOOR_PARTS = ["left", "right"] as const;
export const DOOR_GLOBAL_TYPES: Record<DoorPart, DoorGlobalAssetType> = { left: "door_left", right: "door_right" };
export const DOOR_PART_FIELDS = {
  left: { active: "leftAsset", library: "customLefts", folder: "doors/left", label: "Porte gauche", plural: "Mes portes gauches", noun: "une porte gauche", guide: "left", width: 941, height: 1672, offset: "leftClosedOffset" },
  right: { active: "rightAsset", library: "customRights", folder: "doors/right", label: "Porte droite", plural: "Mes portes droites", noun: "une porte droite", guide: "right", width: 941, height: 1672, offset: "rightClosedOffset" },
} as const;
const names = ["Ivoire et or", "Bois et lierre", "Ivoire botanique", "Noir et magnolias", "Glycine dorée", "Vert et roses"];
export const DOOR_PRESETS = Object.fromEntries(DOOR_PARTS.map((part) => [part, [
  { type: "preset", id: `${part}-generated`, name: "Classique / couleurs personnalisables", url: "" },
  ...names.map((name, index) => ({ type: "preset", id: `${part}-p${index + 1}`, name,
    url: `/assets/openings/doors/p${index + 1}.${part === "left" ? "Gauche" : "Droite"}.png`, width: index ? 793 : 941, height: index ? 1983 : 1672 })),
]])) as Record<DoorPart, EnvelopeAssetRef[]>;

/** No refs in an old project means its original style/colours, now rendered as sliding PNGs. */
export function resolveDoorAsset(config: DoorConfig | undefined, part: DoorPart): EnvelopeAssetRef {
  const ref = config?.[DOOR_PART_FIELDS[part].active];
  if (ref?.type === "preset") return DOOR_PRESETS[part].find((item) => item.id === ref.id) ?? DOOR_PRESETS[part][0];
  if ((ref?.type === "custom" || ref?.type === "global") && /^https?:\/\//i.test(ref.url)) return ref;
  return DOOR_PRESETS[part][0];
}
export function globalDoorChoices(assets: GlobalAssetRecord[], part: DoorPart): EnvelopeAssetRef[] {
  return [...new Map(assets.filter((asset) => asset.isPublished && asset.type === DOOR_GLOBAL_TYPES[part]).map((asset) => [asset.id, asset])).values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((asset) => ({ type: "global", id: asset.id, url: asset.url, name: asset.name }));
}
export function removeDoorCustom(config: DoorConfig | undefined, part: DoorPart, id: string): DoorConfig {
  const fields = DOOR_PART_FIELDS[part];
  const next = { ...config, [fields.library]: (config?.[fields.library] ?? []).filter((asset) => asset.id !== id) };
  if (config?.[fields.active]?.type === "custom" && config[fields.active]?.id === id) next[fields.active] = DOOR_PRESETS[part][0];
  return next;
}
export function resolveDoorOffset(config: DoorConfig | undefined, part: DoorPart, device: PreviewDevice): EnvelopeOffset {
  return resolveEnvelopeOffset(config?.responsive?.[device]?.[DOOR_PART_FIELDS[part].offset]);
}
export function resolveDoorScale(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(.5, Math.min(1.5, value)) : 1;
}
export function resolveDoorDeviceScale(config: DoorConfig | undefined, device: PreviewDevice) {
  return resolveDoorScale(config?.responsive?.[device]?.scale ?? (device === "mobile" ? config?.doorScale : undefined));
}
export function updateDoorDeviceSettings(config: DoorConfig | undefined, device: PreviewDevice, patch: Partial<DoorDeviceSettings>): DoorConfig {
  return { ...config, responsive: { ...config?.responsive, [device]: { ...config?.responsive?.[device], ...patch } } };
}
