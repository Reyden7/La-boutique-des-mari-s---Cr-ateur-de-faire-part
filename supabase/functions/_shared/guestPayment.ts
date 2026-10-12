import { calculateGuestPricing, calculateTotalPricing, calculateGuestUpgrade, PRICING } from "./pricing.ts";
import { calculatePromoDiscount } from "./promo.ts";
import { legacyGuestReceiptSubtotal } from "./legacyGuestPayment.ts";

export interface GuestPaymentReceipt {
  id: string;
  project_id: string;
  owner_id: string;
  purchase_type: "initial_publication" | "guest_capacity_upgrade";
  pricing_version: string;
  guest_count: number;
  guest_capacity: number;
  extra_blocks?: number | null;
  previous_extra_blocks?: number | null;
  additional_blocks?: number | null;
  extra_guests?: number | null;
  previous_guest_capacity?: number | null;
  additional_guests?: number | null;
  has_form: boolean;
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id?: string | null;
  status: string;
  created_at: string;
  promo_code_id?: string | null;
  promo_code?: string | null;
  discount_value?: number | null;
  subtotal_amount?: number;
  discount_amount?: number;
}

function guestReceiptSubtotal(receipt: GuestPaymentReceipt) {
  if (typeof receipt.has_form !== "boolean") throw new Error("Invalid form flag");
  if (receipt.pricing_version === "guest-v1") return legacyGuestReceiptSubtotal(receipt);
  if (receipt.pricing_version !== PRICING.version) throw new Error("Unknown pricing version");
  const quote = calculateTotalPricing(receipt.guest_count, receipt.has_form);
  if (receipt.guest_capacity !== quote.guestCapacity || receipt.extra_guests !== quote.extraGuests
    || receipt.extra_blocks != null || receipt.previous_extra_blocks != null || receipt.additional_blocks != null) {
    throw new Error("Invalid guest payment quote");
  }
  if (receipt.purchase_type === "initial_publication" && receipt.previous_guest_capacity === 0
    && receipt.additional_guests === quote.extraGuests) {
    return quote.totalPriceCents;
  }
  if (receipt.purchase_type === "guest_capacity_upgrade" && !receipt.has_form) {
    const upgrade = calculateGuestUpgrade(receipt.previous_guest_capacity!, receipt.guest_count);
    if (upgrade.additionalGuests <= 0 || receipt.additional_guests !== upgrade.additionalGuests) throw new Error("Invalid upgrade quote");
    return upgrade.upgradePriceCents;
  }
  throw new Error("Invalid guest purchase type");
}

export function guestReceiptAmount(receipt: GuestPaymentReceipt) {
  const subtotal = guestReceiptSubtotal(receipt);
  if (receipt.subtotal_amount != null && receipt.subtotal_amount !== subtotal) throw new Error("Invalid subtotal");
  if (receipt.promo_code_id) {
    if (receipt.purchase_type !== "initial_publication" || !receipt.promo_code || receipt.discount_value == null) throw new Error("Invalid promo snapshot");
    const discount = calculatePromoDiscount(subtotal, receipt.discount_value);
    if (receipt.discount_amount !== discount.discountAmount) throw new Error("Invalid discount amount");
    return discount.finalAmount;
  }
  if (receipt.promo_code || receipt.discount_value != null || (receipt.discount_amount ?? 0) !== 0) throw new Error("Unbound discount");
  return subtotal;
}

export function guestCheckoutMetadata(receipt: GuestPaymentReceipt) {
  const legacy = receipt.pricing_version === "guest-v1";
  return {
    receipt_id: receipt.id, project_id: receipt.project_id, owner_id: receipt.owner_id,
    purchase_type: receipt.purchase_type, pricing_version: receipt.pricing_version,
    guest_count: String(receipt.guest_count), guest_capacity: String(receipt.guest_capacity),
    ...(legacy ? {
      extra_blocks: String(receipt.extra_blocks), previous_extra_blocks: String(receipt.previous_extra_blocks),
      additional_blocks: String(receipt.additional_blocks),
    } : {
      included_guests: String(PRICING.includedGuests), extra_guests: String(receipt.extra_guests),
      extra_guest_unit_price: String(PRICING.extraGuestPriceCents),
      previous_guest_capacity: String(receipt.previous_guest_capacity), additional_guests: String(receipt.additional_guests),
      invitation_price: String(calculateGuestPricing(receipt.guest_count).invitationPriceCents),
      form_price: String(receipt.has_form ? PRICING.formPriceCents : 0),
      subtotal: String(guestReceiptSubtotal(receipt)), subtotal_amount: String(guestReceiptSubtotal(receipt)),
      discount_amount: String(receipt.discount_amount ?? 0), final_amount: String(receipt.amount_cents),
    }), has_form: String(receipt.has_form),
    includes_form: String(receipt.has_form), form_amount_cents: String(receipt.has_form ? PRICING.formPriceCents : 0),
    ...(receipt.promo_code_id ? {
      promo_code_id: receipt.promo_code_id, promo_code: receipt.promo_code!, discount_type: "percentage",
      discount_value: String(receipt.discount_value), subtotal_amount: String(receipt.subtotal_amount),
      discount_amount: String(receipt.discount_amount), final_amount: String(receipt.amount_cents),
    } : {}),
  };
}

/** Never validate by metadata or price alone: bind to the persisted server quote. */
export function matchesGuestCheckout(
  session: { id: string; metadata: Record<string, string> | null; amount_total: number | null; currency: string | null },
  receipt: GuestPaymentReceipt,
) {
  try {
    const expected = guestCheckoutMetadata(receipt);
    return receipt.stripe_checkout_session_id === session.id
      && receipt.currency === "eur" && session.currency === "eur"
      && receipt.amount_cents === guestReceiptAmount(receipt) && session.amount_total === receipt.amount_cents
      && Object.entries(expected).every(([key, value]) => session.metadata?.[key] === value);
  } catch { return false; }
}
