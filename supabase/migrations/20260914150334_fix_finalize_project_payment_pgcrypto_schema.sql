create or replace function public.finalize_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payment public.project_payments%rowtype;
begin
  select * into v_payment
  from public.project_payments
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
  for update;

  if not found then
    raise exception 'Payment does not match project, owner and Checkout Session';
  end if;

  if v_payment.status = 'refunded' then
    raise exception 'A refunded payment cannot publish a project';
  end if;

  update public.project_payments
  set status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      paid_at = coalesce(paid_at, now())
  where id = v_payment.id;

  update public.projects
  set payment_status = 'paid',
      status = 'published',
      public_id = coalesce(public_id, encode(extensions.gen_random_bytes(18), 'hex')),
      published_at = coalesce(published_at, now())
  where id = p_project_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'Project does not match payment owner';
  end if;
end;
$function$;;
