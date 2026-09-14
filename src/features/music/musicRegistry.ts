export interface MusicTrackDefinition {
  id: string;
  name: string;
  category: "Romantique" | "Piano" | "Classique";
  durationLabel: string;
  description: string;
  notes: number[];
  tempo: number;
  license: {
    type: "CC0-1.0";
    owner: string;
    commercialUse: true;
    attributionRequired: false;
  };
}

export const musicLibrary: MusicTrackDefinition[] = [
  {
    id: "premier-regard", name: "Premier regard", category: "Romantique", durationLabel: "00:24",
    description: "Piano feutré et lumineux", notes: [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65], tempo: 72,
    license: { type: "CC0-1.0", owner: "Le Bureau des Mariés Studio", commercialUse: true, attributionRequired: false },
  },
  {
    id: "tendresse", name: "Tendresse", category: "Piano", durationLabel: "00:22",
    description: "Mélodie intime et délicate", notes: [57, 60, 64, 69, 64, 60, 55, 59, 62, 67, 62, 59], tempo: 66,
    license: { type: "CC0-1.0", owner: "Le Bureau des Mariés Studio", commercialUse: true, attributionRequired: false },
  },
  {
    id: "notre-histoire", name: "Notre histoire", category: "Classique", durationLabel: "00:26",
    description: "Cordes douces et mouvement cinématique", notes: [52, 59, 64, 67, 64, 59, 50, 57, 62, 65, 62, 57], tempo: 76,
    license: { type: "CC0-1.0", owner: "Le Bureau des Mariés Studio", commercialUse: true, attributionRequired: false },
  },
];

export const getMusicTrack = (id?: string) => musicLibrary.find((track) => track.id === id);
