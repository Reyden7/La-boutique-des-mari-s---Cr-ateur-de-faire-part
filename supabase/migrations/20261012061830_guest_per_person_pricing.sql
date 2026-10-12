-- Prepared locally. Apply only during an approved coordinated release.
-- guest-v1 receipts/amounts and already-purchased rights are NOT rewritten.
begin;

alter table public.projects drop constraint projects_guest_capacity_check;
alter table public.projects add constraint projects_guest_capacity_check check (
  (purchased_guest_capacity is null and purchased_extra_blocks is null)
  or (purchased_guest_capacity is not null and purchased_guest_capacity between 40 and 100000
    and (purchased_extra_blocks is null or purchased_extra_blocks >= 0))
);

alter table public.guest_license_payments
  drop constraint guest_license_quote_check,
  drop constraint guest_license_payments_pricing_version_check,
  alter column extra_blocks drop not null,
  alter column previous_extra_blocks drop not null,
  alter column additional_blocks drop not null,
  add column extra_guests integer,
  add column previous_guest_capacity integer,
  add column additional_guests integer,
  add constraint guest_license_pricing_version_check check (pricing_version in ('guest-v1','guest-v2'));

-- Preserve automatic subtotal generation for old RPCs during rollout as well
-- as for v2. No existing amount, discount or entitlement is recalculated.
alter table public.guest_license_payments drop column subtotal_amount;
alter table public.guest_license_payments add column subtotal_amount integer generated always as (
  case when pricing_version = 'guest-v1' then
    case when purchase_type = 'initial_publication'
      then 2450 + extra_blocks * 450 + case when has_form then 990 else 0 end
      else additional_blocks * 450 end
  else case when purchase_type = 'initial_publication'
    then 2450 + extra_guests * 100 + case when has_form then 990 else 0 end
    else additional_guests * 100 end
  end
) stored;

alter table public.guest_license_payments add constraint guest_license_quote_check check (
  (
    (pricing_version = 'guest-v1'
      and extra_guests is null and previous_guest_capacity is null and additional_guests is null
      and extra_blocks is not null and previous_extra_blocks is not null and additional_blocks is not null
      and guest_capacity = 40 + extra_blocks * 7
      and extra_blocks = greatest(0,(guest_count - 40 + 6) / 7)
      and additional_blocks = extra_blocks - previous_extra_blocks
      and ((purchase_type = 'initial_publication' and previous_extra_blocks = 0)
        or (purchase_type = 'guest_capacity_upgrade' and additional_blocks > 0 and not has_form)))
    or
    (pricing_version = 'guest-v2'
      and extra_blocks is null and previous_extra_blocks is null and additional_blocks is null
      and extra_guests is not null and previous_guest_capacity is not null and additional_guests is not null
      and extra_guests = greatest(0,guest_count - 40)
      and guest_capacity = greatest(40,guest_count)
      and ((purchase_type = 'initial_publication' and previous_guest_capacity = 0 and additional_guests = extra_guests)
        or (purchase_type = 'guest_capacity_upgrade' and not has_form
          and previous_guest_capacity between 40 and 100000
          and additional_guests = guest_capacity - previous_guest_capacity and additional_guests > 0)))
  )
  and amount_cents = subtotal_amount - discount_amount
  and (
    (promo_code_id is null and promo_code is null and discount_value is null and discount_amount = 0)
    or (purchase_type = 'initial_publication' and promo_code_id is not null and promo_code is not null
      and discount_value is not null and discount_value between 1 and 90
      and discount_amount = round(subtotal_amount * discount_value / 100)::integer)
  )
);

alter table public.project_payments drop constraint project_payments_guest_quote_check;
alter table public.project_payments add constraint project_payments_guest_quote_check check (
  (pricing_version = 'legacy' and discount_amount = 0 and form_amount_cents is null)
  or
  (pricing_version in ('guest-v1','guest-v2') and guest_count is not null and guest_capacity is not null
    and guest_count between 1 and 100000 and discount_amount >= 0
    and (
      (pricing_version = 'guest-v1' and guest_extra_blocks is not null
        and guest_extra_blocks = greatest(0,(guest_count - 40 + 6) / 7)
        and guest_capacity = 40 + guest_extra_blocks * 7
        and discount_amount <= round((2450 + guest_extra_blocks * 450 + case when includes_rsvp then 990 else 0 end) * 0.9)::integer
        and amount_cents = 2450 + guest_extra_blocks * 450 + case when includes_rsvp then 990 else 0 end - discount_amount)
      or
      (pricing_version = 'guest-v2' and guest_extra_blocks is null and guest_capacity = greatest(40,guest_count)
        and discount_amount <= round((2450 + greatest(0,guest_count - 40) * 100 + case when includes_rsvp then 990 else 0 end) * 0.9)::integer
        and amount_cents = 2450 + greatest(0,guest_count - 40) * 100 + case when includes_rsvp then 990 else 0 end - discount_amount)
    )
    and (form_amount_cents is null or (includes_rsvp and form_amount_cents between 99 and 990)
      or (not includes_rsvp and form_amount_cents = 0)))
);

-- Separate entry point prevents the migration changing the quote returned to an
-- old deployed Checkout function. New Checkout calls ONLY this v2 routine.
create function public.reserve_guest_checkout_v2(
  p_project_id uuid, p_owner_id uuid, p_guest_count integer, p_previous_session_id text, p_promo_code text
)
returns public.guest_license_payments
language plpgsql security definer set search_path = '' as $$
declare
  v_project public.projects%rowtype;
  v_pending public.guest_license_payments%rowtype;
  v_receipt public.guest_license_payments%rowtype;
  v_promo public.promo_codes%rowtype;
  v_previous integer := 0;
  v_extra integer;
  v_additional integer;
  v_type text := 'initial_publication';
  v_form boolean := false;
  v_code text := upper(btrim(coalesce(p_promo_code,'')));
begin
  if p_guest_count is null or p_guest_count not between 1 and 100000 then raise exception 'INVALID_GUEST_COUNT'; end if;
  select * into v_project from public.projects where id = p_project_id and owner_id = p_owner_id for update;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.payment_status = 'refunded' then raise exception 'REFUNDED_PROJECT_REQUIRES_SUPPORT'; end if;
  if v_project.payment_status = 'paid' then
    if v_project.status <> 'published' or v_project.purchased_guest_capacity is null then raise exception 'LEGACY_OR_INACTIVE_LICENSE'; end if;
    v_type := 'guest_capacity_upgrade';
    v_previous := v_project.purchased_guest_capacity;
    if p_guest_count <= v_previous then raise exception 'CAPACITY_ALREADY_COVERED'; end if;
  else
    if v_project.status = 'published' then raise exception 'PROJECT_ALREADY_PUBLISHED'; end if;
    if exists (select 1 from public.project_payments where project_id = p_project_id and status in ('paid','refunded','pending'))
      then raise exception 'PREVIOUS_PUBLICATION_PAYMENT_UNRESOLVED'; end if;
    v_form := coalesce(v_project.project_data #>> '{rsvp,enabled}', 'false') = 'true'
      and not exists (select 1 from public.rsvp_addon_purchases where project_id = p_project_id and status = 'paid');
  end if;
  if v_code <> '' then
    if v_type <> 'initial_publication'
      or exists (select 1 from public.guest_license_payments where project_id=p_project_id and status in ('paid','refunded'))
      or exists (select 1 from public.promo_code_uses where project_id=p_project_id) then raise exception 'PROMO_FIRST_PURCHASE_ONLY'; end if;
    select * into v_promo from public.promo_codes where code=v_code and is_active for share;
    if not found then raise exception 'PROMO_UNAVAILABLE'; end if;
  end if;
  select * into v_pending from public.guest_license_payments where project_id = p_project_id and status = 'pending' for update;
  if found then
    if v_pending.stripe_checkout_session_id is distinct from p_previous_session_id
      or (v_pending.stripe_checkout_session_id is null and v_pending.created_at > pg_catalog.now() - interval '10 minutes')
      then raise exception 'CHECKOUT_BUSY'; end if;
    update public.guest_license_payments set status = 'cancelled' where id = v_pending.id;
  elsif p_previous_session_id is not null then raise exception 'CHECKOUT_CHANGED';
  end if;
  v_extra := greatest(0,p_guest_count - 40);
  v_additional := case when v_type = 'initial_publication' then v_extra else p_guest_count - v_previous end;
  insert into public.guest_license_payments(
    project_id,owner_id,purchase_type,pricing_version,guest_count,guest_capacity,
    extra_guests,previous_guest_capacity,additional_guests,has_form,amount_cents
  ) values (
    p_project_id,p_owner_id,v_type,'guest-v2',p_guest_count,greatest(40,p_guest_count),
    v_extra,v_previous,v_additional,v_form,
    case when v_type = 'initial_publication' then 2450 + v_extra * 100 + case when v_form then 990 else 0 end
      else v_additional * 100 end
  ) returning * into v_receipt;
  if v_code <> '' then
    update public.guest_license_payments set promo_code_id=v_promo.id,promo_code=v_promo.code,
      discount_value=v_promo.discount_value,
      discount_amount=round(subtotal_amount * v_promo.discount_value / 100)::integer,
      amount_cents=subtotal_amount-round(subtotal_amount * v_promo.discount_value / 100)::integer
      where id=v_receipt.id returning * into v_receipt;
  end if;
  if v_type = 'initial_publication' then update public.projects set payment_status='pending' where id=p_project_id; end if;
  return v_receipt;
end;
$$;
revoke all on function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) to service_role;

-- Sum only paid increments. Neither a declaration decrease nor a later
-- requested count can recreate refunded rights. Historical increments remain 7.
create or replace function private.refresh_guest_capacity(p_project_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.projects project
  set purchased_guest_capacity = receipt.guest_capacity + coalesce((
        select sum(case when upgrade.pricing_version='guest-v1' then upgrade.additional_blocks * 7 else upgrade.additional_guests end)::integer
        from public.guest_license_payments upgrade
        where upgrade.project_id=project.id and upgrade.purchase_type='guest_capacity_upgrade' and upgrade.status='paid'
      ),0),
      purchased_extra_blocks = case when receipt.pricing_version='guest-v1' then receipt.guest_extra_blocks + coalesce((
        select sum(upgrade.additional_blocks)::integer from public.guest_license_payments upgrade
        where upgrade.project_id=project.id and upgrade.purchase_type='guest_capacity_upgrade'
          and upgrade.pricing_version='guest-v1' and upgrade.status='paid'
      ),0) else null end,
      publication_license_id=receipt.id
  from public.project_payments receipt
  where project.id=p_project_id and receipt.project_id=project.id
    and receipt.pricing_version in ('guest-v1','guest-v2') and receipt.status='paid';
$$;
revoke all on function private.refresh_guest_capacity(uuid) from public,anon,authenticated;

create or replace function public.finalize_guest_checkout(
  p_receipt_id uuid, p_owner_id uuid, p_session_id text, p_payment_intent_id text, p_amount_cents integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_receipt public.guest_license_payments%rowtype;
  v_project public.projects%rowtype;
  v_project_id uuid;
begin
  select project_id into v_project_id from public.guest_license_payments where id = p_receipt_id;
  select * into v_project from public.projects where id = v_project_id and owner_id = p_owner_id for update;
  if not found then raise exception 'PROJECT_OWNER_MISMATCH'; end if;
  select * into v_receipt from public.guest_license_payments where id = p_receipt_id and owner_id = p_owner_id for update;
  if not found or v_receipt.stripe_checkout_session_id is distinct from p_session_id
    or v_receipt.amount_cents is distinct from p_amount_cents
    or p_payment_intent_id is null or p_payment_intent_id = ''
    or (v_receipt.stripe_payment_intent_id is not null and v_receipt.stripe_payment_intent_id <> p_payment_intent_id) then
    raise exception 'GUEST_PAYMENT_MISMATCH';
  end if;
  -- Late completion after refund must never reinstate paid rights.
  if v_receipt.status = 'refunded' then return; end if;
  if v_receipt.status = 'paid' then return; end if;
  if v_receipt.status not in ('pending', 'failed') then raise exception 'CHECKOUT_NOT_PAYABLE'; end if;
  if v_receipt.purchase_type = 'initial_publication' then
    insert into public.project_payments(project_id, owner_id, status, amount_cents, currency,
      includes_rsvp, stripe_checkout_session_id, pricing_version, guest_count, guest_capacity, guest_extra_blocks,
      discount_amount, form_amount_cents)
    values(v_receipt.project_id, p_owner_id, 'pending', v_receipt.amount_cents, 'eur', v_receipt.has_form,
      p_session_id, v_receipt.pricing_version, v_receipt.guest_count, v_receipt.guest_capacity, v_receipt.extra_blocks,
      v_receipt.discount_amount, case when v_receipt.has_form then 990 - round(990 * coalesce(v_receipt.discount_value,0) / 100)::integer else 0 end)
    on conflict (project_id) do update set status = excluded.status, amount_cents = excluded.amount_cents,
      includes_rsvp = excluded.includes_rsvp, stripe_checkout_session_id = excluded.stripe_checkout_session_id,
      stripe_payment_intent_id = null, paid_at = null, pricing_version = excluded.pricing_version,
      guest_count = excluded.guest_count, guest_capacity = excluded.guest_capacity, guest_extra_blocks = excluded.guest_extra_blocks,
      discount_amount = excluded.discount_amount, form_amount_cents = excluded.form_amount_cents
    where project_payments.status in ('unpaid', 'pending');
    if not found then raise exception 'PUBLICATION_ALREADY_SETTLED'; end if;
    perform public.finalize_project_payment(v_receipt.project_id, p_owner_id, p_session_id, p_payment_intent_id);
  elsif v_project.payment_status <> 'paid' or v_project.purchased_guest_capacity is null then
    raise exception 'UPGRADE_REQUIRES_PAID_LICENSE';
  end if;
  update public.guest_license_payments set status = 'paid', stripe_payment_intent_id = p_payment_intent_id,
    paid_at = pg_catalog.now() where id = v_receipt.id;
  -- Atomic with entitlement finalization. Never recorded on validation or reservation.
  if v_receipt.promo_code_id is not null then
    insert into public.promo_code_uses(promo_code_id,project_id,user_id,stripe_checkout_session_id,
      stripe_payment_intent_id,promo_code,discount_value,subtotal_amount,discount_amount,final_amount)
    values(v_receipt.promo_code_id,v_receipt.project_id,v_receipt.owner_id,p_session_id,
      p_payment_intent_id,v_receipt.promo_code,v_receipt.discount_value,v_receipt.subtotal_amount,
      v_receipt.discount_amount,v_receipt.amount_cents)
    on conflict (stripe_checkout_session_id) do nothing;
  end if;
  perform private.refresh_guest_capacity(v_receipt.project_id);
end;
$$;

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
    if v_payment.pricing_version in ('guest-v1', 'guest-v2') then
      -- Preserve the independently purchased form tariff; initial combined sales
      -- allocate its discount at the snapshot rate, not the current promo rate.
      v_rsvp_amount := coalesce(v_payment.form_amount_cents,990);
      if v_rsvp_amount <= 0 or v_rsvp_amount > 990 then raise exception 'Combined form amount is invalid'; end if;
    else
      if v_payment.amount_cents <= 2490 then raise exception 'Combined publication amount is invalid'; end if;
      v_rsvp_amount := v_payment.amount_cents - 2490;
    end if;

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

-- Existing finalization/refund grants, RLS, indices and rights-protection trigger
-- remain in force. No grant permitting browser writes is added.
notify pgrst, 'reload schema';
commit;
