/** Shared by the UI and Edge Functions. Amounts are integer euro cents. */
export const PRICING = {
  version: "guest-v3",
  basePriceCents: 3299,
  includedGuests: 40,
  extraGuestPriceCents: 70,
  formPriceCents: 0,
  minimumCheckoutCents: 50,
  // Operational bound, not a visitor counter. Keeps Stripe/SQL integers safe.
  maxGuestCount: 100000,
} as const;

// Frozen historical grid: validate pending/settled v2 receipts without repricing them.
export const HISTORICAL_PRICING_V2 = { ...PRICING, version: "guest-v2", basePriceCents: 2450, extraGuestPriceCents: 100, formPriceCents: 990 } as const;
export const pricingForVersion = (version: string) => {
  if (version === PRICING.version) return PRICING;
  if (version === "guest-v2") return HISTORICAL_PRICING_V2;
  throw new Error("Unknown pricing version");
};

export const PAYMENT_MINIMUM_MESSAGE = "Le montant après réduction est inférieur au minimum de paiement (0,50 €). Choisissez un autre code ou une publication gratuite à 100 %.";
export const PRICING_CHANGED_MESSAGE = "La tarification a été mise à jour. Rechargez la page avant de payer.";

export function isValidGuestCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 1 && value <= PRICING.maxGuestCount;
}

export function calculateGuestPricing(guestCount: number, grid = PRICING as ReturnType<typeof pricingForVersion>) {
  if (!isValidGuestCount(guestCount)) throw new Error("Nombre d’invités invalide.");
  const extraGuests = Math.max(0, guestCount - grid.includedGuests);
  return {
    guestCount,
    extraGuests,
    guestCapacity: Math.max(grid.includedGuests, guestCount),
    invitationPriceCents: grid.basePriceCents + extraGuests * grid.extraGuestPriceCents,
  };
}

export function calculateTotalPricing(guestCount: number, hasForm: boolean, grid = PRICING as ReturnType<typeof pricingForVersion>) {
  const pricing = calculateGuestPricing(guestCount, grid);
  const formPriceCents = hasForm ? grid.formPriceCents : 0;
  return { ...pricing, hasForm, formPriceCents, totalPriceCents: pricing.invitationPriceCents + formPriceCents };
}

export function calculateGuestUpgrade(currentCapacity: number, requestedGuestCount: number, grid = PRICING as ReturnType<typeof pricingForVersion>) {
  if (!Number.isSafeInteger(currentCapacity) || currentCapacity < PRICING.includedGuests || currentCapacity > PRICING.maxGuestCount) {
    throw new Error("Capacité achetée invalide.");
  }
  const requested = calculateGuestPricing(requestedGuestCount, grid);
  const additionalGuests = Math.max(0, requestedGuestCount - currentCapacity);
  return {
    requestedGuestCount,
    additionalGuests,
    guestCapacity: Math.max(currentCapacity, requested.guestCapacity),
    upgradePriceCents: additionalGuests * grid.extraGuestPriceCents,
  };
}

export const calculateInvitationPrice = (guestCount: number) => calculateGuestPricing(guestCount).invitationPriceCents;
export const calculateGuestUpgradePrice = (currentPaidCapacity: number, requestedGuestCount: number) =>
  calculateGuestUpgrade(currentPaidCapacity, requestedGuestCount).upgradePriceCents;
