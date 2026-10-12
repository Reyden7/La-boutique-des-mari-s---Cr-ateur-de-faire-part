/** Shared by the UI and Edge Functions. Amounts are integer euro cents. */
export const PRICING = {
  version: "guest-v2",
  basePriceCents: 2450,
  includedGuests: 40,
  extraGuestPriceCents: 100,
  formPriceCents: 990,
  // Operational bound, not a visitor counter. Keeps Stripe/SQL integers safe.
  maxGuestCount: 100000,
} as const;

export const PRICING_CHANGED_MESSAGE = "La tarification a été mise à jour. Rechargez la page avant de payer.";

export function isValidGuestCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 1 && value <= PRICING.maxGuestCount;
}

export function calculateGuestPricing(guestCount: number) {
  if (!isValidGuestCount(guestCount)) throw new Error("Nombre d’invités invalide.");
  const extraGuests = Math.max(0, guestCount - PRICING.includedGuests);
  return {
    guestCount,
    extraGuests,
    guestCapacity: Math.max(PRICING.includedGuests, guestCount),
    invitationPriceCents: PRICING.basePriceCents + extraGuests * PRICING.extraGuestPriceCents,
  };
}

export function calculateTotalPricing(guestCount: number, hasForm: boolean) {
  const pricing = calculateGuestPricing(guestCount);
  const formPriceCents = hasForm ? PRICING.formPriceCents : 0;
  return { ...pricing, hasForm, formPriceCents, totalPriceCents: pricing.invitationPriceCents + formPriceCents };
}

export function calculateGuestUpgrade(currentCapacity: number, requestedGuestCount: number) {
  if (!Number.isSafeInteger(currentCapacity) || currentCapacity < PRICING.includedGuests || currentCapacity > PRICING.maxGuestCount) {
    throw new Error("Capacité achetée invalide.");
  }
  const requested = calculateGuestPricing(requestedGuestCount);
  const additionalGuests = Math.max(0, requestedGuestCount - currentCapacity);
  return {
    requestedGuestCount,
    additionalGuests,
    guestCapacity: Math.max(currentCapacity, requested.guestCapacity),
    upgradePriceCents: additionalGuests * PRICING.extraGuestPriceCents,
  };
}

export const calculateInvitationPrice = (guestCount: number) => calculateGuestPricing(guestCount).invitationPriceCents;
export const calculateGuestUpgradePrice = (currentPaidCapacity: number, requestedGuestCount: number) =>
  calculateGuestUpgrade(currentPaidCapacity, requestedGuestCount).upgradePriceCents;
