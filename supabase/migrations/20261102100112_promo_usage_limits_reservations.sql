-- Requires pricing v3 and the atomic free-publication migration. No existing receipt is repriced.
begin;
alter table public.promo_codes add column max_uses integer check (max_uses between 1 and 1000000);
create table public.promo_code_reservations (
 receipt_id uuid primary key references public.guest_license_payments(id) on delete restrict,
 promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
 state text not null default 'reserved' check(state in ('reserved','consumed','released')),
 stripe_checkout_session_id text unique,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '1 hour'),
 resolved_at timestamptz,
 release_reason text
);
create index promo_reservations_active on public.promo_code_reservations(promo_code_id) where state='reserved';
alter table public.promo_code_reservations enable row level security;
revoke all on public.promo_code_reservations from public,anon,authenticated;
grant select on public.promo_code_reservations to authenticated;
grant select on public.promo_code_reservations to service_role;
create policy "admins read promo reservations" on public.promo_code_reservations for select to authenticated
 using((select private.is_admin()));

-- Include pre-deployment in-flight Checkouts. Time alone NEVER frees a reservation.
insert into public.promo_code_reservations(receipt_id,promo_code_id,stripe_checkout_session_id,created_at,expires_at)
 select id,promo_code_id,stripe_checkout_session_id,created_at,created_at+interval '1 hour'
 from public.guest_license_payments where promo_code_id is not null and
 (status='pending' or (status='failed' and stripe_checkout_session_id is not null));

-- One transaction-scoped advisory lock per code, shared by limits, reservations and consumption.
-- No upgrade from the historical FOR SHARE row locks, avoiding cross-project lock-upgrade deadlocks.
create function private.lock_promo(p_id uuid) returns void language sql set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,71942));
$$;
revoke all on function private.lock_promo(uuid) from public,anon,authenticated,service_role;

create function private.guard_promo_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare occupied bigint;
begin
 perform private.lock_promo(new.id);
 if new.max_uses is not null then
  select (select count(*) from public.promo_code_uses where promo_code_id=new.id)
   +(select count(*) from public.promo_code_reservations where promo_code_id=new.id and state='reserved') into occupied;
  if new.max_uses<occupied then raise exception 'PROMO_LIMIT_BELOW_COMMITTED_USES'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_promo_limit() from public,anon,authenticated,service_role;
create trigger guard_promo_limit before insert or update of max_uses on public.promo_codes
 for each row execute function private.guard_promo_limit();

create function private.reserve_promo_for_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.promo_codes%rowtype; used bigint; held bigint;
begin
 if new.promo_code_id is null then return new; end if;
 if tg_op='UPDATE' and old.promo_code_id is not distinct from new.promo_code_id then
  if old.stripe_checkout_session_id is distinct from new.stripe_checkout_session_id then
   update public.promo_code_reservations set stripe_checkout_session_id=new.stripe_checkout_session_id
    where receipt_id=new.id and state='reserved';
  end if;
  return new;
 end if;
 perform private.lock_promo(new.promo_code_id);
 select * into c from public.promo_codes where id=new.promo_code_id;
 if not found or not c.is_active or c.discount_value not between 1 and 100 then raise exception 'PROMO_UNAVAILABLE'; end if;
 if new.purchase_type<>'initial_publication' then raise exception 'PROMO_FIRST_PURCHASE_ONLY'; end if;
 select count(*) into used from public.promo_code_uses where promo_code_id=c.id;
 select count(*) into held from public.promo_code_reservations where promo_code_id=c.id and state='reserved';
 if c.max_uses is not null and used>=c.max_uses then raise exception 'PROMO_USED'; end if;
 if c.max_uses is not null and used+held>=c.max_uses then raise exception 'PROMO_RESERVED'; end if;
 insert into public.promo_code_reservations(receipt_id,promo_code_id,stripe_checkout_session_id)
  values(new.id,c.id,new.stripe_checkout_session_id);
 return new;
end $$;
revoke all on function private.reserve_promo_for_receipt() from public,anon,authenticated,service_role;
create trigger reserve_promo_for_receipt after insert or update of promo_code_id,stripe_checkout_session_id on public.guest_license_payments
 for each row execute function private.reserve_promo_for_receipt();

create function private.consume_reserved_promo() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.guest_license_payments%rowtype; reservation public.promo_code_reservations%rowtype;
begin
 perform private.lock_promo(new.promo_code_id);
 -- Idempotent historical INSERT ... ON CONFLICT retries must not reconsume.
 if exists(select 1 from public.promo_code_uses where stripe_checkout_session_id=new.stripe_checkout_session_id
   or free_transaction_id=new.free_transaction_id) then return new; end if;
 select * into r from public.guest_license_payments where promo_code_id=new.promo_code_id and project_id=new.project_id
  and (stripe_checkout_session_id=new.stripe_checkout_session_id or free_transaction_id=new.free_transaction_id);
 if not found then raise exception 'PROMO_RECEIPT_MISMATCH'; end if;
 select * into reservation from public.promo_code_reservations where receipt_id=r.id;
 if found then
  if reservation.state<>'reserved' then raise exception 'PROMO_RESERVATION_NOT_ACTIVE'; end if;
  if r.amount_cents<>new.final_amount or r.discount_amount<>new.discount_amount or r.owner_id is distinct from new.user_id then
   raise exception 'PROMO_RECEIPT_MISMATCH'; end if;
  -- Honour valid in-flight reservations even if an admin subsequently disables/edits the code.
  update public.promo_code_reservations set state='consumed',resolved_at=now() where receipt_id=r.id;
 elsif (select max_uses from public.promo_codes where id=new.promo_code_id) is not null then
  raise exception 'PROMO_RESERVATION_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function private.consume_reserved_promo() from public,anon,authenticated,service_role;
create trigger consume_reserved_promo before insert on public.promo_code_uses for each row execute function private.consume_reserved_promo();

-- Called ONLY by trusted Edge code after retrieving terminal status from Stripe.
-- Pending/processing sessions and unknown creation outcomes must remain reserved.
create function public.release_promo_reservation(p_receipt_id uuid,p_session_id text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.guest_license_payments%rowtype;
begin
 select * into r from public.guest_license_payments where id=p_receipt_id;
 if not found then return; end if;
 -- Same project -> receipt -> code lock order as quote/finalization.
 perform 1 from public.projects where id=r.project_id for update;
 select * into r from public.guest_license_payments where id=p_receipt_id for update;
 if r.promo_code_id is null or r.status in ('paid','refunded') then return; end if;
 if p_reason is null or r.stripe_checkout_session_id is distinct from p_session_id
   or (p_session_id is null and p_reason not in ('stripe_creation_rejected','server_not_started'))
   or (p_session_id is not null and p_reason not in ('stripe_expired','stripe_payment_canceled')) then raise exception 'PROMO_RELEASE_UNVERIFIED'; end if;
 perform private.lock_promo(r.promo_code_id);
 update public.promo_code_reservations set state='released',resolved_at=now(),release_reason=p_reason
  where receipt_id=r.id and state='reserved' and stripe_checkout_session_id is not distinct from p_session_id;
 perform public.fail_guest_checkout(r.id,p_session_id);
end $$;
revoke all on function public.release_promo_reservation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.release_promo_reservation(uuid,text,text) to service_role;

create function public.promo_code_availability(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.promo_codes%rowtype; used bigint; held bigint;
begin
 select * into c from public.promo_codes where code=upper(btrim(p_code)) and is_active;
 if not found then return jsonb_build_object('valid',false); end if;
 select count(*) into used from public.promo_code_uses where promo_code_id=c.id;
 select count(*) into held from public.promo_code_reservations where promo_code_id=c.id and state='reserved';
 if c.max_uses is not null and used>=c.max_uses then return jsonb_build_object('valid',false,'reason','PROMO_USED'); end if;
 if c.max_uses is not null and used+held>=c.max_uses then return jsonb_build_object('valid',false,'reason','PROMO_RESERVED'); end if;
 return jsonb_build_object('valid',true,'code',c.code,'discountType','percentage','discountValue',c.discount_value);
end $$;
revoke all on function public.promo_code_availability(text) from public,anon,authenticated;
grant execute on function public.promo_code_availability(text) to service_role;

create function public.admin_promo_codes() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 return coalesce((select jsonb_agg(row_data order by created_at desc) from (
  select c.created_at,to_jsonb(c)||jsonb_build_object('confirmed_uses',
   (select count(*) from public.promo_code_uses u where u.promo_code_id=c.id),'reserved_uses',
   (select count(*) from public.promo_code_reservations r where r.promo_code_id=c.id and r.state='reserved')) row_data
  from public.promo_codes c) s),'[]'::jsonb);
end $$;
revoke all on function public.admin_promo_codes() from public,anon;
grant execute on function public.admin_promo_codes() to authenticated;
commit;
