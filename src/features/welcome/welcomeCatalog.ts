export interface WelcomeArchPreset {
  id: string;
  name: string;
  thumbnailUrl: string;
  imageUrl: string;
}

export interface WelcomeBackgroundPreset {
  id: string;
  name: string;
  thumbnailUrl: string;
  imageUrl: string;
}

const asset = (folder: "arches" | "backgrounds", filename: string) =>
  `/assets/welcome/${folder}/${filename}`;

export const WELCOME_ARCHES: WelcomeArchPreset[] = [
  ["wheat", "Arche de blé", "wheat-arch.png"],
  ["cherry", "Arche cerisier", "cherry-arch.png"],
  ["lantern", "Arche aux lanternes", "lantern-arch.png"],
  ["ivy", "Arche de lierre", "ivy-arch.png"],
  ["white-bow", "Arche nœud blanc", "white-bow-arch.png"],
  ["floral-columns", "Colonnes fleuries", "floral-columns.png"],
  ["white-curtain", "Fleurs et rideau", "white-curtain-arch.png"],
  ["white-curtain-2", "Rideau ivoire", "white-curtain-arch-2.png"],
  ["pink-curtain", "Fleurs roses", "pink-curtain-arch.png"],
  ["lilac", "Arche lilas", "lilac-arch.png"],
].map(([id, name, filename]) => {
  const url = asset("arches", filename);
  return { id, name, thumbnailUrl: url, imageUrl: url };
});

export const WELCOME_BACKGROUNDS: WelcomeBackgroundPreset[] = [
  ["wheat-field", "Dans les champs", "wheat-field.png"],
  ["forest", "Forêt lumineuse", "forest.png"],
  ["greece", "Grèce", "greece.png"],
  ["italy", "Italie", "italy.png"],
  ["cherry-forest", "Cerisiers fleuris", "cherry-forest.png"],
  ["village", "Village", "village.png"],
  ["castle", "Vue sur le château", "castle-view.png"],
  ["autumn-lake", "Lac en automne", "autumn-lake.png"],
  ["lake", "Vue sur le lac", "lake.png"],
  ["sea", "Vue sur mer", "sea-view.png"],
].map(([id, name, filename]) => {
  const url = asset("backgrounds", filename);
  return { id, name, thumbnailUrl: url, imageUrl: url };
});

export const getWelcomeArch = (id?: string) =>
  WELCOME_ARCHES.find((preset) => preset.id === id);

export const getWelcomeBackground = (id?: string) =>
  WELCOME_BACKGROUNDS.find((preset) => preset.id === id);
