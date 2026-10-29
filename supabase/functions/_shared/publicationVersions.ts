/** A separate receipt ledger: design republication never masquerades as a capacity upgrade. */
export const PUBLICATION_TERMS = "paid-versions-v1";
export interface VersionPayment {
  id: string; project_id: string; owner_id: string; version_id: string; base_version_id: string;
  guest_count: number; guest_capacity: number; has_form: boolean; amount_cents: number;
  currency: string; terms_version: string; status: string;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id?: string | null;
}
export function versionPaymentMetadata(receipt: VersionPayment) {
  if (!Number.isSafeInteger(receipt.guest_count) || receipt.guest_count < 1
    || !Number.isSafeInteger(receipt.guest_capacity) || receipt.guest_capacity < Math.max(40, receipt.guest_count)
    || receipt.guest_capacity > 100000 || typeof receipt.has_form !== "boolean"
    || receipt.terms_version !== PUBLICATION_TERMS
    || receipt.amount_cents !== 2450 + (receipt.guest_capacity - 40) * 100 + (receipt.has_form ? 990 : 0)) {
    throw new Error("Invalid version receipt");
  }
  return { purchase_type: "paid_version", receipt_id: receipt.id, project_id: receipt.project_id,
    owner_id: receipt.owner_id, version_id: receipt.version_id, base_version_id: receipt.base_version_id,
    guest_capacity: String(receipt.guest_capacity), amount_cents: String(receipt.amount_cents), terms_version: receipt.terms_version };
}
export function matchesVersionPayment(session: { id: string; currency: string | null; amount_total: number | null; metadata: Record<string,string> | null }, receipt: VersionPayment) {
  try {
    return receipt.stripe_checkout_session_id === session.id && receipt.currency === "eur" && session.currency === "eur"
      && session.amount_total === receipt.amount_cents
      && Object.entries(versionPaymentMetadata(receipt)).every(([key,value]) => session.metadata?.[key] === value);
  } catch { return false; }
}

// The injected clients are also used by executable Edge tests; no real payment is needed.
export async function prepareVersionCheckout(admin: any, stripe: any, project: {id:string;owner_id:string}, body: {publicationTerms?:unknown;expectedAmount?:unknown}, siteUrl: string, integrationIdentifier: string) {
  if (body.publicationTerms !== PUBLICATION_TERMS || !Number.isSafeInteger(body.expectedAmount)) {
    return { status: 400, body: { error: "Confirmez les conditions et le montant de la nouvelle publication." } };
  }
  const lookup = await admin.from("publication_version_payments").select("*").eq("project_id",project.id).eq("status","pending").maybeSingle();
  if (lookup.error) throw lookup.error;
  const pending = lookup.data;
  if (pending?.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
    if (session.status === "complete" || session.payment_status === "paid") return {status:409,body:{error:"La confirmation du paiement est en cours."}};
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
  }
  const reserved = await admin.rpc("reserve_version_publication",{p_project_id:project.id,p_owner_id:project.owner_id,
    p_previous_session_id:pending?.stripe_checkout_session_id??null,p_terms:body.publicationTerms,p_expected_amount:body.expectedAmount});
  if (reserved.error) return {status:409,body:{error:"Le prix ou le brouillon a changé. Vérifiez le récapitulatif et réessayez."}};
  const receipt = reserved.data as VersionPayment;
  try {
    if(receipt.amount_cents!==body.expectedAmount)throw new Error("Reviewed amount differs from server quote");
    const metadata = versionPaymentMetadata(receipt);
    const session = await stripe.checkout.sessions.create({ mode:"payment",managed_payments:{enabled:false},integration_identifier:integrationIdentifier,
      client_reference_id:project.id,metadata,payment_intent_data:{metadata},
      line_items:[{quantity:1,price_data:{currency:"eur",unit_amount:receipt.amount_cents,product_data:{name:`Nouvelle version du faire-part — ${receipt.guest_capacity} invités${receipt.has_form?" + Formulaire invité":""}`}}}],
      success_url:`${siteUrl}/payment/success?projectId=${encodeURIComponent(project.id)}&kind=paid_version&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${siteUrl}/payment/cancel?projectId=${encodeURIComponent(project.id)}&kind=paid_version`,
    },{idempotencyKey:`publication-version-${receipt.id}`});
    if (!session.url) throw new Error("Checkout URL missing");
    const attached = await admin.from("publication_version_payments").update({stripe_checkout_session_id:session.id})
      .eq("id",receipt.id).eq("status","pending").is("stripe_checkout_session_id",null).select("id").single();
    if (attached.error) { await stripe.checkout.sessions.expire(session.id); throw attached.error; }
    return {status:200,body:{url:session.url,pricingVersion:"guest-v2"}};
  } catch {
    await admin.rpc("fail_version_publication",{p_receipt_id:receipt.id,p_session_id:null});
    return {status:502,body:{error:"La préparation du paiement a échoué. Votre version publiée reste inchangée."}};
  }
}
