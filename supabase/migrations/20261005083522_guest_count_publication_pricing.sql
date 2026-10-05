-- LOCAL PREPARATION ONLY. Production migration/deployment requires approval.
-- Old receipts keep their amount and have no retroactively imposed guest quota.
begin;

alter table public.projects
  add column purchased_guest_capacity integer,
  add column purchased_extra_blocks integer,
  add column publication_license_id uuid,
  add constraint projects_guest_capacity_check check (
    (purchased_guest_capacity is null and purchased_extra_blocks is null)
    or (purchased_guest_capacity is not null and purchased_extra_blocks is not null
      and purchased_extra_blocks >= 0 and purchased_guest_capacity = 40 + 7 * purchased_extra_blocks)
  );

alter table public.project_payments
  alter column amount_cents drop default,
  add column pricing_version text not null default 'legacy',
  add column guest_count integer,
  add column guest_capacity integer,
  add column guest_extra_blocks integer,
  add constraint project_payments_guest_quote_check check (
    pricing_version = 'legacy'
    or (pricing_version = 'guest-v1' and guest_count is not null
      and guest_capacity is not null and guest_extra_blocks is not null
      and guest_count between 1 and 100000
      and guest_extra_blocks = greatest(0, (guest_count - 40 + 6) / 7)
      and guest_capacity = 40 + guest_extra_blocks * 7
      and amount_cents = 2450 + guest_extra_blocks * 450 + case when includes_rsvp then 990 else 0 end)
  );

-- Immutable quote/receipt for each new Checkout, including upgrades. No browser writes.
create table public.guest_license_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  purchase_type text not null check (purchase_type in ('initial_publication', 'guest_capacity_upgrade')),
  pricing_version text not null default 'guest-v1' check (pricing_version = 'guest-v1'),
  guest_count integer not null check (guest_count between 1 and 100000),
  guest_capacity integer not null,
  extra_blocks integer not null check (extra_blocks >= 0),
  previous_extra_blocks integer not null check (previous_extra_blocks >= 0),
  additional_blocks integer not null check (additional_blocks >= 0),
  has_form boolean not null default false,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur' check (currency = 'eur'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  constraint guest_license_quote_check check (
    guest_capacity = 40 + extra_blocks * 7
    and extra_blocks = greatest(0, (guest_count - 40 + 6) / 7)
    and additional_blocks = extra_blocks - previous_extra_blocks
    and (
      (purchase_type = 'initial_publication' and previous_extra_blocks = 0
        and amount_cents = 2450 + extra_blocks * 450 + case when has_form then 990 else 0 end)
      or (purchase_type = 'guest_capacity_upgrade' and additional_blocks > 0 and not has_form
        and amount_cents = additional_blocks * 450)
    )
  )
);
create index guest_license_owner_idx on public.guest_license_payments(owner_id, created_at desc);
create index guest_license_project_idx on public.guest_license_payments(project_id, status);
create unique index guest_license_one_pending_idx on public.guest_license_payments(project_id) where status = 'pending';
create unique index guest_license_one_initial_paid_idx on public.guest_license_payments(project_id)
  where purchase_type = 'initial_publication' and status = 'paid';
alter table public.guest_license_payments enable row level security;
revoke all on public.guest_license_payments from public, anon, authenticated;
grant select on public.guest_license_payments to authenticated;
grant select, insert, update, delete on public.guest_license_payments to service_role;
create policy "owners read their guest licence receipts" on public.guest_license_payments
  for select to authenticated using (
    owner_id = (select auth.uid())
    and not (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false))
  );

-- Defence in depth in addition to existing column-level grants/RLS.
create function public.protect_guest_license_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' then
      if new.purchased_guest_capacity is not null or new.purchased_extra_blocks is not null or new.publication_license_id is not null then
        raise exception 'Guest rights are server-managed' using errcode = '42501';
      end if;
    elsif new.purchased_guest_capacity is distinct from old.purchased_guest_capacity
      or new.purchased_extra_blocks is distinct from old.purchased_extra_blocks
      or new.publication_license_id is distinct from old.publication_license_id then
      raise exception 'Guest rights are server-managed' using errcode = '42501';
    end if;
  end if;
  -- Editable JSON must never become a second source of paid rights.
  new.project_data := new.project_data - 'purchasedGuestCapacity' - 'purchasedExtraBlocks' - 'publicationLicenseId'
    - 'purchased_guest_capacity' - 'purchased_extra_blocks' - 'publication_license_id';
  return new;
end;
$$;
revoke all on function public.protect_guest_license_fields() from public, anon, authenticated;
create trigger protect_guest_license_fields before insert or update on public.projects
  for each row execute function public.protect_guest_license_fields();

-- Reservation serializes payment attempts before contacting Stripe. A short lease
-- prevents simultaneous double Checkout creation. Old sessions must be expired first.
create function public.reserve_guest_checkout(
  p_project_id uuid, p_owner_id uuid, p_guest_count integer, p_previous_session_id text
)
returns public.guest_license_payments
language plpgsql security definer set search_path = '' as $$
declare
  v_project public.projects%rowtype;
  v_pending public.guest_license_payments%rowtype;
  v_receipt public.guest_license_payments%rowtype;
  v_blocks integer;
  v_previous integer := 0;
  v_type text := 'initial_publication';
  v_form boolean := false;
begin
  if p_guest_count is null or p_guest_count not between 1 and 100000 then
    raise exception 'INVALID_GUEST_COUNT';
  end if;
  select * into v_project from public.projects where id = p_project_id and owner_id = p_owner_id for update;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.payment_status = 'refunded' then raise exception 'REFUNDED_PROJECT_REQUIRES_SUPPORT'; end if;
  if v_project.payment_status = 'paid' then
    if v_project.status <> 'published' or v_project.purchased_extra_blocks is null then
      raise exception 'LEGACY_OR_INACTIVE_LICENSE';
    end if;
    v_type := 'guest_capacity_upgrade';
    v_previous := v_project.purchased_extra_blocks;
  else
    if exists (select 1 from public.project_payments where project_id = p_project_id and status in ('paid','refunded','pending')) then
      raise exception 'PREVIOUS_PUBLICATION_PAYMENT_UNRESOLVED';
    end if;
    v_form := coalesce(v_project.project_data #>> '{rsvp,enabled}', 'false') = 'true'
      and not exists (select 1 from public.rsvp_addon_purchases where project_id = p_project_id and status = 'paid');
  end if;
  v_blocks := greatest(0, (p_guest_count - 40 + 6) / 7);
  if v_type = 'guest_capacity_upgrade' and v_blocks <= v_previous then
    raise exception 'CAPACITY_ALREADY_COVERED';
  end if;
  select * into v_pending from public.guest_license_payments where project_id = p_project_id and status = 'pending' for update;
  if found then
    if v_pending.stripe_checkout_session_id is distinct from p_previous_session_id
      or (v_pending.stripe_checkout_session_id is null and v_pending.created_at > pg_catalog.now() - interval '10 minutes') then
      raise exception 'CHECKOUT_BUSY';
    end if;
    update public.guest_license_payments set status = 'cancelled' where id = v_pending.id;
  elsif p_previous_session_id is not null then
    raise exception 'CHECKOUT_CHANGED';
  end if;
  insert into public.guest_license_payments(
    project_id, owner_id, purchase_type, guest_count, guest_capacity, extra_blocks,
    previous_extra_blocks, additional_blocks, has_form, amount_cents
  ) values (
    p_project_id, p_owner_id, v_type, p_guest_count, 40 + v_blocks * 7, v_blocks,
    v_previous, v_blocks - v_previous, v_form,
    case when v_type = 'initial_publication' then 2450 + v_blocks * 450 + case when v_form then 990 else 0 end
      else (v_blocks - v_previous) * 450 end
  ) returning * into v_receipt;
  if v_type = 'initial_publication' then
    update public.projects set payment_status = 'pending' where id = p_project_id;
  end if;
  return v_receipt;
end;
$$;

-- Capacity is backed by paid blocks, not by the latest declared number. Refunds
-- remove only the refunded blocks; reducing requestedGuestCount does nothing here.
create function private.refresh_guest_capacity(p_project_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.projects project
  set purchased_extra_blocks = receipt.guest_extra_blocks + coalesce((
        select sum(upgrade.additional_blocks)::integer from public.guest_license_payments upgrade
        where upgrade.project_id = project.id and upgrade.purchase_type = 'guest_capacity_upgrade' and upgrade.status = 'paid'
      ), 0),
      purchased_guest_capacity = 40 + 7 * (receipt.guest_extra_blocks + coalesce((
        select sum(upgrade.additional_blocks)::integer from public.guest_license_payments upgrade
        where upgrade.project_id = project.id and upgrade.purchase_type = 'guest_capacity_upgrade' and upgrade.status = 'paid'
      ), 0)),
      publication_license_id = receipt.id
  from public.project_payments receipt
  where project.id = p_project_id and receipt.project_id = project.id
    and receipt.pricing_version = 'guest-v1' and receipt.status = 'paid';
$$;
revoke all on function private.refresh_guest_capacity(uuid) from public, anon, authenticated;

create function public.finalize_guest_checkout(
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
      includes_rsvp, stripe_checkout_session_id, pricing_version, guest_count, guest_capacity, guest_extra_blocks)
    values(v_receipt.project_id, p_owner_id, 'pending', v_receipt.amount_cents, 'eur', v_receipt.has_form,
      p_session_id, 'guest-v1', v_receipt.guest_count, v_receipt.guest_capacity, v_receipt.extra_blocks)
    on conflict (project_id) do update set status = excluded.status, amount_cents = excluded.amount_cents,
      includes_rsvp = excluded.includes_rsvp, stripe_checkout_session_id = excluded.stripe_checkout_session_id,
      stripe_payment_intent_id = null, paid_at = null, pricing_version = excluded.pricing_version,
      guest_count = excluded.guest_count, guest_capacity = excluded.guest_capacity, guest_extra_blocks = excluded.guest_extra_blocks
    where project_payments.status in ('unpaid', 'pending');
    if not found then raise exception 'PUBLICATION_ALREADY_SETTLED'; end if;
    perform public.finalize_project_payment(v_receipt.project_id, p_owner_id, p_session_id, p_payment_intent_id);
  elsif v_project.payment_status <> 'paid' or v_project.purchased_extra_blocks is null then
    raise exception 'UPGRADE_REQUIRES_PAID_LICENSE';
  end if;
  update public.guest_license_payments set status = 'paid', stripe_payment_intent_id = p_payment_intent_id,
    paid_at = pg_catalog.now() where id = v_receipt.id;
  perform private.refresh_guest_capacity(v_receipt.project_id);
end;
$$;

create function public.fail_guest_checkout(p_receipt_id uuid, p_session_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_receipt public.guest_license_payments%rowtype;
begin
  -- Same lock order as reservation, finalization and refund: project first.
  perform 1 from public.projects where id = (select project_id from public.guest_license_payments where id = p_receipt_id) for update;
  update public.guest_license_payments set status = 'failed'
    where id = p_receipt_id and stripe_checkout_session_id is not distinct from p_session_id and status = 'pending'
    returning * into v_receipt;
  if found and v_receipt.purchase_type = 'initial_publication' then
    update public.projects set payment_status = 'unpaid' where id = v_receipt.project_id and payment_status = 'pending';
  end if;
end;
$$;

create function public.refund_guest_checkout(
  p_receipt_id uuid, p_owner_id uuid, p_session_id text, p_payment_intent_id text, p_amount_cents integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_receipt public.guest_license_payments%rowtype;
begin
  perform 1 from public.projects where id = (select project_id from public.guest_license_payments where id = p_receipt_id) for update;
  select * into v_receipt from public.guest_license_payments where id = p_receipt_id and owner_id = p_owner_id for update;
  if not found or v_receipt.stripe_checkout_session_id is distinct from p_session_id
    or v_receipt.amount_cents is distinct from p_amount_cents
    or p_payment_intent_id is null
    or (v_receipt.stripe_payment_intent_id is not null and v_receipt.stripe_payment_intent_id <> p_payment_intent_id) then
    raise exception 'GUEST_REFUND_MISMATCH';
  end if;
  if v_receipt.status = 'refunded' then return; end if;
  -- Handle a refund arriving before its checkout-completed event atomically.
  if v_receipt.status <> 'paid' then
    perform public.finalize_guest_checkout(p_receipt_id, p_owner_id, p_session_id, p_payment_intent_id, p_amount_cents);
  end if;
  update public.guest_license_payments set status = 'refunded' where id = p_receipt_id;
  if v_receipt.purchase_type = 'initial_publication' then
    perform public.refund_project_payment(v_receipt.project_id, p_owner_id, p_session_id, p_payment_intent_id);
    update public.projects set purchased_guest_capacity = null, purchased_extra_blocks = null
      where id = v_receipt.project_id;
  else
    perform private.refresh_guest_capacity(v_receipt.project_id);
  end if;
end;
$$;

revoke all on function public.reserve_guest_checkout(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finalize_guest_checkout(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.fail_guest_checkout(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_guest_checkout(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_guest_checkout(uuid, uuid, integer, text) to service_role;
grant execute on function public.finalize_guest_checkout(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.fail_guest_checkout(uuid, text) to service_role;
grant execute on function public.refund_guest_checkout(uuid, uuid, text, text, integer) to service_role;

-- Existing template sanitizer remains authoritative and strips new commercial state.
alter function private.sanitize_template_data(jsonb) rename to sanitize_template_data_before_guest_pricing;
create function private.sanitize_template_data(p_project_data jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select private.sanitize_template_data_before_guest_pricing(p_project_data)
    - 'requestedGuestCount' - 'purchasedGuestCapacity' - 'purchasedExtraBlocks' - 'publicationLicenseId'
    - 'purchased_guest_capacity' - 'purchased_extra_blocks' - 'publication_license_id';
$$;
revoke all on function private.sanitize_template_data(jsonb) from public, anon, authenticated;

-- Updated atomic publication/form finalizer follows below; legacy receipts are retained.
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
    if v_payment.amount_cents <= (case when v_payment.pricing_version = 'guest-v1' then 2450 + v_payment.guest_extra_blocks * 450 else 2490 end) then
      raise exception 'Combined publication amount is invalid';
    end if;
    v_rsvp_amount := v_payment.amount_cents - (case when v_payment.pricing_version = 'guest-v1' then 2450 + v_payment.guest_extra_blocks * 450 else 2490 end);

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

revoke all on function public.finalize_project_payment(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_project_payment(uuid, uuid, text, text) to service_role;
commit;
