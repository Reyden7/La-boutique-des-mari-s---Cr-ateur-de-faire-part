import type { OpeningAnimationDefinition } from "../openingTypes";
import { CurtainsOpening } from "../animations/CurtainsOpening";
import { DoorsOpening } from "../animations/DoorsOpening";
import { VerticalEnvelopeOpening } from "../animations/VerticalEnvelopeOpening";
import { NoneOpening } from "../animations/NoneOpening";

export const openingRegistry: OpeningAnimationDefinition[] = [
  { id: "none", name: "Sans animation", description: "Le faire-part apparaît immédiatement.", thumbnail: "◇", component: NoneOpening, defaultSettings: { type: "none", duration: 0, colors: [] } },
  { id: "envelope", name: "Enveloppe", description: "Une invitation verticale sort doucement de son enveloppe cachetée.", thumbnail: "✉", component: VerticalEnvelopeOpening, defaultSettings: { type: "envelope", duration: 3.4, colors: ["#E7D2C3", "#F5E9DF", "#B58A62"], variant: "classic", customSettings: { flapColor: "#DFC4B1", backgroundColor: "#F5EFEA", hintText: "Touchez pour ouvrir" } } },
  { id: "curtains", name: "Rideaux", description: "Une entrée théâtrale douce et majestueuse.", thumbnail: "◖◗", component: CurtainsOpening, defaultSettings: { type: "curtains", duration: 2.2, colors: ["#7a2330", "#d5b46d"], variant: "velvet" } },
  { id: "doors", name: "Porte", description: "Deux battants s’ouvrent en perspective.", thumbnail: "▥", component: DoorsOpening, defaultSettings: { type: "doors", duration: 2, colors: ["#f4efe7", "#b2905d"], variant: "classic" } },
];

export const getOpeningDefinition = (type: string) => openingRegistry.find((opening) => opening.id === type) ?? openingRegistry[0];
