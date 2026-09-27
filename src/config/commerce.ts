const parsedRsvpPrice = Number(import.meta.env.VITE_RSVP_ADDON_PRICE_CENTS ?? "");

export const COMMERCE = {
  publicationPriceCents: 2490,
  customInvitationPriceCents: 5000,
  rsvpAddonPriceCents: Number.isFinite(parsedRsvpPrice) && parsedRsvpPrice > 0
    ? parsedRsvpPrice
    : null,
} as const;

export const formatPrice = (priceCents: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
}).format(priceCents / 100);
