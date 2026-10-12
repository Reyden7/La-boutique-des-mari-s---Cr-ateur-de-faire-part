import { isValidGuestCount } from "./pricing.ts";
import type { GuestPaymentReceipt } from "./guestPayment.ts";

/** Read-only compatibility for guest-v1 receipts. NEVER used for a new quote. */
export function legacyGuestReceiptSubtotal(receipt: GuestPaymentReceipt) {
  if (!isValidGuestCount(receipt.guest_count)) throw new Error("Invalid historical guest count");
  const blocks = Math.max(0, Math.ceil((receipt.guest_count - 40) / 7));
  if (receipt.guest_capacity !== 40 + blocks * 7 || receipt.extra_blocks !== blocks
    || !Number.isSafeInteger(receipt.previous_extra_blocks) || receipt.previous_extra_blocks! < 0
    || receipt.additional_blocks !== blocks - receipt.previous_extra_blocks!) throw new Error("Invalid historical guest quote");
  if (receipt.purchase_type === "initial_publication" && receipt.previous_extra_blocks === 0) {
    return 2450 + blocks * 450 + (receipt.has_form ? 990 : 0);
  }
  if (receipt.purchase_type === "guest_capacity_upgrade" && !receipt.has_form && receipt.additional_blocks! > 0) {
    return receipt.additional_blocks! * 450;
  }
  throw new Error("Invalid historical purchase type");
}
