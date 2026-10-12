import type { OpeningAnimationDefinition } from "../openingTypes";
import { DOOR_PRESETS } from "../doorAssets";
import { DoorsOpening } from "../animations/DoorsOpening";
import { ResponsiveEnvelopeOpening } from "../animations/ResponsiveEnvelopeOpening";
import { NoneOpening } from "../animations/NoneOpening";

export const openingRegistry: OpeningAnimationDefinition[] = [
  { id: "none", name: "Sans animation", description: "Le faire-part apparaît immédiatement.", thumbnail: "◇", component: NoneOpening, defaultSettings: { type: "none", duration: 0, colors: [] } },
  { id: "envelope", name: "Enveloppe", description: "Une enveloppe personnalisable s’ouvre délicatement pour révéler votre invitation.", thumbnail: "✉", component: ResponsiveEnvelopeOpening, defaultSettings: { type: "envelope", duration: 1.5, colors: ["#E7D2C3", "#F5E9DF", "#B58A62"], variant: "classic", customSettings: { flapColor: "#DFC4B1", backgroundColor: "#F5EFEA", hintText: "Touchez pour ouvrir" } } },
  { id: "doors", name: "Porte", description: "Deux portes personnalisables glissent pour révéler votre invitation.", thumbnail: "▥", component: DoorsOpening, defaultSettings: { type: "doors", duration: 2, colors: ["#f4efe7", "#b2905d"], variant: "classic", doors: { leftAsset: DOOR_PRESETS.left[1], rightAsset: DOOR_PRESETS.right[1] } } },
];

export const getOpeningDefinition = (type: string) => openingRegistry.find((opening) => opening.id === type) ?? openingRegistry[0];
