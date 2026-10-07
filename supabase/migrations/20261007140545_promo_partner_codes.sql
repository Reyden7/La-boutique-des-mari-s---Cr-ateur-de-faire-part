-- Promo/partner MVP. No Stripe resources or existing paid rows are changed.
begin;

create table public.promo_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique check (length(code) between 1 and 64 and code = upper(btrim(code))),
  discount_type text not null default 'percentage' check (discount_type = 'percentage'),
  discount_value numeric(5,2) not null check (discount_value between 1 and 90),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index promo_codes_active_idx on public.promo_codes(is_active,created_at desc);

create function public.normalize_promo_code()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.code := upper(btrim(new.code));
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.normalize_promo_code() from public,anon,authenticated;
create trigger normalize_promo_code before insert or update on public.promo_codes
  for each row execute function public.normalize_promo_code();

create table public.promo_code_uses (
  id uuid primary key default extensions.gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
  -- Audit survives project/account deletion; these IDs are historical snapshots.
  project_id uuid not null,
  user_id uuid,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text not null unique,
  promo_code text not null,
  discount_value numeric(5,2) not null check (discount_value between 1 and 90),
  subtotal_amount integer not null check (subtotal_amount > 0),
  discount_amount integer not null,
  final_amount integer not null check (final_amount > 0),
  created_at timestamptz not null default now(),
  constraint promo_use_amounts_check check (
    discount_amount = round(subtotal_amount * discount_value / 100)::integer
    and final_amount = subtotal_amount - discount_amount
  )
);
create index promo_code_uses_promo_idx on public.promo_code_uses(promo_code_id);
create index promo_code_uses_project_idx on public.promo_code_uses(project_id);
create index promo_code_uses_user_idx on public.promo_code_uses(user_id);

alter table public.promo_codes enable row level security;
alter table public.promo_code_uses enable row level security;
revoke all on public.promo_codes,public.promo_code_uses from public,anon,authenticated;
grant select,insert,update on public.promo_codes to authenticated;
grant select on public.promo_code_uses to authenticated;
grant select,insert,update on public.promo_codes to service_role;
grant select,insert on public.promo_code_uses to service_role;
create policy "admins read promo codes" on public.promo_codes for select to authenticated
  using ((select private.is_admin()));
create policy "admins create promo codes" on public.promo_codes for insert to authenticated
  with check ((select private.is_admin()));
create policy "admins update promo codes" on public.promo_codes for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins read promo usage" on public.promo_code_uses for select to authenticated
  using ((select private.is_admin()));
-- No browser writes to usage, no physical browser deletion of codes/history.

alter table public.guest_license_payments
  add column promo_code_id uuid references public.promo_codes(id) on delete restrict,
  add column promo_code text,
  add column discount_value numeric(5,2),
  add column subtotal_amount integer generated always as (
    case when purchase_type = 'initial_publication'
      then 2450 + extra_blocks * 450 + case when has_form then 990 else 0 end
      else additional_blocks * 450 end
  ) stored,
  add column discount_amount integer not null default 0,
  drop constraint guest_license_quote_check,
  add constraint guest_license_quote_check check (
    guest_capacity = 40 + extra_blocks * 7
    and extra_blocks = greatest(0,(guest_count - 40 + 6) / 7)
    and additional_blocks = extra_blocks - previous_extra_blocks
    and ((purchase_type = 'initial_publication' and previous_extra_blocks = 0)
      or (purchase_type = 'guest_capacity_upgrade' and additional_blocks > 0 and not has_form))
    and amount_cents = subtotal_amount - discount_amount
    and (
      (promo_code_id is null and promo_code is null and discount_value is null and discount_amount = 0)
      or (purchase_type = 'initial_publication' and promo_code_id is not null and promo_code is not null
        and discount_value is not null and discount_value between 1 and 90
        and discount_amount = round(subtotal_amount * discount_value / 100)::integer)
    )
  );
create index guest_license_promo_idx on public.guest_license_payments(promo_code_id);

alter table public.project_payments
  add column discount_amount integer not null default 0,
  add column form_amount_cents integer,
  drop constraint project_payments_guest_quote_check,
  add constraint project_payments_guest_quote_check check (
    (pricing_version = 'legacy' and discount_amount = 0 and form_amount_cents is null)
    or (pricing_version = 'guest-v1' and guest_count is not null and guest_capacity is not null
      and guest_extra_blocks is not null and guest_count between 1 and 100000
      and guest_extra_blocks = greatest(0,(guest_count - 40 + 6) / 7)
      and guest_capacity = 40 + guest_extra_blocks * 7
      and discount_amount >= 0
      and discount_amount <= round((2450 + guest_extra_blocks * 450 + case when includes_rsvp then 990 else 0 end) * 0.9)::integer
      and amount_cents = 2450 + guest_extra_blocks * 450 + case when includes_rsvp then 990 else 0 end - discount_amount
      and (form_amount_cents is null or (includes_rsvp and form_amount_cents between 99 and 990)
        or (not includes_rsvp and form_amount_cents = 0)))
  );

-- Keep the four-argument RPC for in-flight/old guest-v1 callers.
create function public.reserve_guest_checkout(
  p_project_id uuid,p_owner_id uuid,p_guest_count integer,p_previous_session_id text,p_promo_code text
)
returns public.guest_license_payments language plpgsql security definer set search_path = '' as $$
declare
  v_receipt public.guest_license_payments%rowtype;
  v_promo public.promo_codes%rowtype;
  v_code text := upper(btrim(coalesce(p_promo_code,'')));
  v_discount integer;
begin
  -- Existing routine locks the project and independently recalculates all pricing.
  v_receipt := public.reserve_guest_checkout(p_project_id,p_owner_id,p_guest_count,p_previous_session_id);
  if v_code = '' then return v_receipt; end if;
  if v_receipt.purchase_type <> 'initial_publication'
    or exists (select 1 from public.guest_license_payments where project_id=p_project_id and status in ('paid','refunded'))
    or exists (select 1 from public.promo_code_uses where project_id=p_project_id) then
    raise exception 'PROMO_FIRST_PURCHASE_ONLY';
  end if;
  select * into v_promo from public.promo_codes where code=v_code and is_active for share;
  if not found then raise exception 'PROMO_UNAVAILABLE'; end if;
  v_discount := round(v_receipt.subtotal_amount * v_promo.discount_value / 100)::integer;
  update public.guest_license_payments set promo_code_id=v_promo.id,promo_code=v_promo.code,
    discount_value=v_promo.discount_value,discount_amount=v_discount,
    amount_cents=subtotal_amount-v_discount where id=v_receipt.id returning * into v_receipt;
  return v_receipt;
end;
$$;
revoke all on function public.reserve_guest_checkout(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_guest_checkout(uuid,uuid,integer,text,text) to service_role;

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
      p_session_id, 'guest-v1', v_receipt.guest_count, v_receipt.guest_capacity, v_receipt.extra_blocks,
      v_receipt.discount_amount, case when v_receipt.has_form then 990 - round(990 * coalesce(v_receipt.discount_value,0) / 100)::integer else 0 end)
    on conflict (project_id) do update set status = excluded.status, amount_cents = excluded.amount_cents,
      includes_rsvp = excluded.includes_rsvp, stripe_checkout_session_id = excluded.stripe_checkout_session_id,
      stripe_payment_intent_id = null, paid_at = null, pricing_version = excluded.pricing_version,
      guest_count = excluded.guest_count, guest_capacity = excluded.guest_capacity, guest_extra_blocks = excluded.guest_extra_blocks,
      discount_amount = excluded.discount_amount, form_amount_cents = excluded.form_amount_cents
    where project_payments.status in ('unpaid', 'pending');
    if not found then raise exception 'PUBLICATION_ALREADY_SETTLED'; end if;
    perform public.finalize_project_payment(v_receipt.project_id, p_owner_id, p_session_id, p_payment_intent_id);
  elsif v_project.payment_status <> 'paid' or v_project.purchased_extra_blocks is null then
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
    if v_payment.pricing_version = 'guest-v1' then
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

-- Existing finalize/refund EXECUTE grants and refund ordering are retained.
comment on table public.promo_code_uses is 'Immutable paid-only promo snapshots. Refunds retain this historical audit.';
commit;

