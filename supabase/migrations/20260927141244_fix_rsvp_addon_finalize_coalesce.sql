-- COALESCE is SQL syntax, not a pg_catalog function. The qualified form in
-- migration 007 only fails at runtime when a separate form payment completes.
create or replace function public.finalize_rsvp_addon_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.rsvp_addon_purchases%rowtype;
begin
  select * into v_purchase
  from public.rsvp_addon_purchases
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_session_id
    and amount_cents = p_amount_cents
  for update;

  if not found then
    raise exception 'RSVP add-on payment mismatch';
  end if;

  if v_purchase.status = 'paid' then
    if v_purchase.stripe_payment_intent_id is distinct from p_payment_intent_id then
      raise exception 'RSVP add-on PaymentIntent mismatch';
    end if;
  elsif v_purchase.status = 'pending' then
    update public.rsvp_addon_purchases
    set status = 'paid',
        stripe_payment_intent_id = p_payment_intent_id,
        paid_at = coalesce(paid_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_purchase.id;
  else
    raise exception 'RSVP add-on is not awaiting payment';
  end if;

  update public.projects
  set project_data = pg_catalog.jsonb_set(
        coalesce(project_data, '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'rsvp',
            coalesce(project_data -> 'rsvp', '{}'::jsonb)
          ),
        '{rsvp,purchased}',
        'true'::jsonb,
        true
      ),
      updated_at = pg_catalog.now()
  where id = p_project_id and owner_id = p_owner_id;

  if not found then
    raise exception 'RSVP project owner mismatch';
  end if;
end;
$$;

revoke all on function public.finalize_rsvp_addon_payment(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_rsvp_addon_payment(uuid, uuid, text, text, integer)
  to service_role;
