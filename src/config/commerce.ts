import { PRICING } from "./pricing";

export const COMMERCE = {
  publicationPriceCents: PRICING.basePriceCents,
  customInvitationPriceCents: 5000,
  rsvpAddonPriceCents: PRICING.formPriceCents,
} as const;

export const formatPrice = (priceCents: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
}).format(priceCents / 100);
