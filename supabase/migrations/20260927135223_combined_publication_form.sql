-- Combine the optional form add-on with the initial publication payment while
-- preserving the separate add-on checkout for projects that are already live.

alter table public.project_payments
  drop constraint if exists project_payments_amount_cents_check;

alter table public.project_payments
  add constraint project_payments_amount_cents_check
  check (amount_cents > 0);

alter table public.project_payments
  add column if not exists includes_rsvp boolean not null default false;

create or replace function public.finalize_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.project_payments%rowtype;
  v_purchase public.rsvp_addon_purchases%rowtype;
  v_rsvp_amount integer;
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

  if v_payment.stripe_payment_intent_id is not null
     and v_payment.stripe_payment_intent_id <> p_payment_intent_id then
    raise exception 'Publication PaymentIntent mismatch';
  end if;

  if v_payment.includes_rsvp then
    if v_payment.amount_cents <= 2490 then
      raise exception 'Combined publication amount is invalid';
    end if;
    v_rsvp_amount := v_payment.amount_cents - 2490;

    select * into v_purchase
    from public.rsvp_addon_purchases
    where project_id = p_project_id
    for update;

    if found then
      if v_purchase.owner_id <> p_owner_id then
        raise exception 'Form purchase owner mismatch';
      end if;
      if v_purchase.status = 'refunded' then
        raise exception 'A refunded form purchase requires support';
      end if;
      if v_purchase.status = 'paid'
         and v_purchase.stripe_checkout_session_id <> p_checkout_session_id then
        raise exception 'Form has already been paid separately';
      end if;

      update public.rsvp_addon_purchases
      set status = 'paid',
          amount_cents = v_rsvp_amount,
          currency = 'eur',
          stripe_checkout_session_id = p_checkout_session_id,
          stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
          paid_at = coalesce(paid_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      where id = v_purchase.id;
    else
      insert into public.rsvp_addon_purchases (
        project_id,
        owner_id,
        status,
        amount_cents,
        currency,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        paid_at
      ) values (
        p_project_id,
        p_owner_id,
        'paid',
        v_rsvp_amount,
        'eur',
        p_checkout_session_id,
        p_payment_intent_id,
        pg_catalog.now()
      );
    end if;
  end if;

  update public.project_payments
  set status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      paid_at = coalesce(paid_at, pg_catalog.now())
  where id = v_payment.id;

  update public.projects
  set payment_status = 'paid',
      status = 'published',
      project_data = case
        when v_payment.includes_rsvp then
          pg_catalog.jsonb_set(
            coalesce(project_data, '{}'::jsonb),
            '{rsvp,purchased}',
            'true'::jsonb,
            true
          )
        else project_data
      end,
      public_id = coalesce(
        public_id,
        pg_catalog.encode(extensions.gen_random_bytes(18), 'hex')
      ),
      published_at = coalesce(published_at, pg_catalog.now())
  where id = p_project_id and owner_id = p_owner_id;

  if not found then
    raise exception 'Project does not match payment owner';
  end if;
end;
$$;

create or replace function public.refund_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.project_payments%rowtype;
begin
  select * into v_payment
  from public.project_payments
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
    and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_payment_intent_id)
  for update;

  if not found then
    raise exception 'No project payment matches this refund';
  end if;

  if v_payment.status = 'refunded' then
    return;
  end if;

  update public.project_payments
  set status = 'refunded',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id)
  where id = v_payment.id;

  if v_payment.includes_rsvp then
    update public.rsvp_addon_purchases
    set status = 'refunded', updated_at = pg_catalog.now()
    where project_id = p_project_id
      and owner_id = p_owner_id
      and stripe_checkout_session_id = p_checkout_session_id
      and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_payment_intent_id)
      and status = 'paid';

    if not found then
      raise exception 'Included form purchase does not match this refund';
    end if;
  end if;

  update public.projects
  set payment_status = 'refunded',
      status = 'draft',
      project_data = case
        when v_payment.includes_rsvp then
          pg_catalog.jsonb_set(
            coalesce(project_data, '{}'::jsonb),
            '{rsvp,purchased}',
            'false'::jsonb,
            true
          )
        else project_data
      end
  where id = p_project_id and owner_id = p_owner_id;
end;
$$;

revoke all on function public.finalize_project_payment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.refund_project_payment(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_project_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.refund_project_payment(uuid, uuid, text, text) to service_role;
