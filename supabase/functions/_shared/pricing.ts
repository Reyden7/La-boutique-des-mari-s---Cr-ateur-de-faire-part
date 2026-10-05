/** Shared by the UI and Edge Functions. Amounts are integer euro cents. */
export const PRICING = {
  version: "guest-v1",
  basePriceCents: 2450,
  includedGuests: 40,
  extraGuestsPerBlock: 7,
  extraBlockPriceCents: 450,
  formPriceCents: 990,
  // Operational bound, not a visitor counter. Keeps Stripe/SQL integers safe.
  maxGuestCount: 100000,
} as const;

export function isValidGuestCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 1 && value <= PRICING.maxGuestCount;
}

export function calculateGuestPricing(guestCount: number) {
  if (!isValidGuestCount(guestCount)) throw new Error("Nombre d’invités invalide.");
  const extraBlocks = Math.max(0, Math.ceil((guestCount - PRICING.includedGuests) / PRICING.extraGuestsPerBlock));
  return {
    guestCount,
    extraBlocks,
    guestCapacity: PRICING.includedGuests + extraBlocks * PRICING.extraGuestsPerBlock,
    invitationPriceCents: PRICING.basePriceCents + extraBlocks * PRICING.extraBlockPriceCents,
  };
}

export function calculateTotalPricing(guestCount: number, hasForm: boolean) {
  const pricing = calculateGuestPricing(guestCount);
  const formPriceCents = hasForm ? PRICING.formPriceCents : 0;
  return { ...pricing, hasForm, formPriceCents, totalPriceCents: pricing.invitationPriceCents + formPriceCents };
}

export function calculateGuestUpgrade(currentCapacity: number, requestedGuestCount: number) {
  if (!Number.isSafeInteger(currentCapacity) || currentCapacity < PRICING.includedGuests
    || (currentCapacity - PRICING.includedGuests) % PRICING.extraGuestsPerBlock !== 0) {
    throw new Error("Capacité achetée invalide.");
  }
  const requested = calculateGuestPricing(requestedGuestCount);
  const purchasedExtraBlocks = (currentCapacity - PRICING.includedGuests) / PRICING.extraGuestsPerBlock;
  const additionalBlocks = Math.max(0, requested.extraBlocks - purchasedExtraBlocks);
  return {
    requestedGuestCount,
    additionalBlocks,
    extraBlocks: purchasedExtraBlocks + additionalBlocks,
    guestCapacity: Math.max(currentCapacity, requested.guestCapacity),
    upgradePriceCents: additionalBlocks * PRICING.extraBlockPriceCents,
  };
}
