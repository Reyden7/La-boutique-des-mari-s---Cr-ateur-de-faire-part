import type Stripe from "npm:stripe@22.6.0";
import { matchesGuestCheckout } from "./guestPayment.ts";

import { PROMO_USED_MESSAGE, PROMO_RESERVED_MESSAGE } from "./promo.ts";
export const promoFailureMessage = (reason: string = "") => reason.includes("PROMO_USED") ? PROMO_USED_MESSAGE
  : reason.includes("PROMO_RESERVED") ? PROMO_RESERVED_MESSAGE : null;

/** Provider state is authoritative. A deadline, cancel URL or stale event is never proof of failure. */
export async function reconcilePromoSession(admin: any, stripe: Stripe, receiptId: string, sessionId: string, deadline?: string, failedEvent = false) {
  let session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "paid") return false;
  if (session.status === "open" && deadline && Date.parse(deadline) <= Date.now()) {
    session = await stripe.checkout.sessions.expire(session.id);
  }
  let reason: string | null = session.status === "expired" && session.payment_status === "unpaid" ? "stripe_expired" : null;
  if (!reason && session.status === "complete" && session.payment_status === "unpaid" && failedEvent && session.payment_intent) {
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
    let intent = await stripe.paymentIntents.retrieve(intentId);
    // Definitively cancel a failed asynchronous attempt. Never cancel processing/requires_action.
    if (intent.status === "requires_payment_method") intent = await stripe.paymentIntents.cancel(intentId);
    if (intent.status === "canceled") reason = "stripe_payment_canceled";
  }
  if (!reason) return false;
  const result = await admin.rpc("release_promo_reservation", {p_receipt_id:receiptId,p_session_id:sessionId,p_reason:reason});
  if (result.error) throw result.error;
  return true;
}

export async function reconcilePromoReservations(admin: any, stripe: () => Stripe, promoId: string) {
  const result = await admin.from("promo_code_reservations").select("receipt_id,stripe_checkout_session_id,expires_at")
    .eq("promo_code_id",promoId).eq("state","reserved");
  if (result.error) throw result.error;
  for (const reservation of result.data ?? []) {
    if (!reservation.stripe_checkout_session_id) {
      const lookup=await admin.from("guest_license_payments").select("*").eq("id",reservation.receipt_id).maybeSingle();
      if(lookup.error)throw lookup.error;
      const receipt=lookup.data;
      if(!receipt)continue;
      // Recover a lost create/attach response from provider metadata, never from browser input.
      // Bounded scan: if uncertain, keep the reservation and require operator reconciliation.
      let after: string | undefined;
      for(let page=0;page<10&&!reservation.stripe_checkout_session_id;page++) {
        const sessions=await stripe().checkout.sessions.list({created:{gte:Math.floor(Date.parse(receipt.created_at)/1000)-60},limit:100,...(after?{starting_after:after}:{})});
        const session=sessions.data.find(session=>matchesGuestCheckout(session,{...receipt,stripe_checkout_session_id:session.id}));
        if(session) {
          const attached=await admin.from("guest_license_payments").update({stripe_checkout_session_id:session.id}).eq("id",receipt.id).is("stripe_checkout_session_id",null);
          if(attached.error)throw attached.error;
          reservation.stripe_checkout_session_id=session.id;
        }
        if(!sessions.has_more)break;
        after=sessions.data.at(-1)?.id;
      }
      // No elapsed-time release: a provider request with unknown outcome may still succeed.
      if(!reservation.stripe_checkout_session_id)continue;
    }
    await reconcilePromoSession(admin,stripe(),reservation.receipt_id,reservation.stripe_checkout_session_id,reservation.expires_at);
  }
}
