import {matchesGuestCheckout, type GuestPaymentReceipt} from "./guestPayment.ts";

/** Server-only: never include attribution/rates in a customer response or Stripe metadata. */
export async function confirmPartnerSale(admin: any, stripe: any, session: any, receipt: GuestPaymentReceipt) {
  if(receipt.purchase_type!=="initial_publication")return false;
  const attribution=await admin.from("partner_sale_attributions").select("receipt_id").eq("receipt_id",receipt.id).maybeSingle();
  if(attribution.error)throw attribution.error;
  if(!attribution.data)return false;
  const evidence=Number.isSafeInteger(session.total_details?.amount_tax)?session:await stripe.checkout.sessions.retrieve(session.id);
  if(!matchesGuestCheckout(evidence,receipt)||evidence.payment_status!=="paid"||!Number.isSafeInteger(evidence.total_details?.amount_tax))throw new Error("Partner tax evidence missing");
  const intent=typeof evidence.payment_intent==="string"?evidence.payment_intent:evidence.payment_intent?.id;
  const result=await admin.rpc("confirm_partner_commission",{p_receipt_id:receipt.id,p_session_id:session.id,p_payment_intent_id:intent,
    p_amount_cents:evidence.amount_total,p_tax_cents:evidence.total_details.amount_tax});
  if(result.error)throw result.error;
  return true;
}

export async function refundPartnerSale(admin: any, stripe: any, session: any, refundedCents: number, eventId: string) {
  const lookup=await admin.from("guest_license_payments").select("*").eq("id",session.metadata?.receipt_id).maybeSingle();
  if(lookup.error)throw lookup.error;
  const receipt=lookup.data as GuestPaymentReceipt;
  if(!receipt||!matchesGuestCheckout(session,receipt))throw new Error("Partner refund receipt mismatch");
  const attribution=await admin.from("partner_sale_attributions").select("receipt_id").eq("receipt_id",receipt.id).maybeSingle();
  if(attribution.error)throw attribution.error;
  if(!attribution.data)return;
  const evidence=Number.isSafeInteger(session.total_details?.amount_tax)?session:await stripe.checkout.sessions.retrieve(session.id);
  if(!matchesGuestCheckout(evidence,receipt)||evidence.payment_status!=="paid"||!Number.isSafeInteger(evidence.total_details?.amount_tax))throw new Error("Partner refund tax evidence missing");
  const intent=typeof evidence.payment_intent==="string"?evidence.payment_intent:evidence.payment_intent?.id;
  const result=await admin.rpc("refund_partner_commission",{p_receipt_id:receipt.id,p_session_id:session.id,p_payment_intent_id:intent,
    p_amount_cents:session.amount_total,p_refunded_cents:refundedCents,p_event_id:eventId,p_tax_cents:evidence.total_details.amount_tax});
  if(result.error)throw result.error;
}
