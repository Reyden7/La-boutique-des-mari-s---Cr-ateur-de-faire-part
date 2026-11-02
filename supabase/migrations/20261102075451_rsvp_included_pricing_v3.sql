-- New purchases only. Existing financial amounts, snapshots and RSVP history are retained.
-- Apply with checkout maintenance enabled and compatible webhooks before checkout.
begin;
-- Retain stored historical values; calculate only new/edited quote dimensions.
alter table public.guest_license_payments alter column subtotal_amount drop expression;
create function private.license_subtotal(version text,kind text,extras integer,blocks integer,additional integer,additional_blocks integer,form boolean)
returns integer language sql immutable set search_path='' as $$
 select case version
 when 'guest-v1' then case when kind='initial_publication' then 2450+blocks*450+case when form then 990 else 0 end else additional_blocks*450 end
 when 'guest-v2' then case when kind='initial_publication' then 2450+extras*100+case when form then 990 else 0 end else additional*100 end
 when 'guest-v3' then case when kind='initial_publication' then 3299+extras*70 else additional*70 end end
$$;
revoke all on function private.license_subtotal(text,text,integer,integer,integer,integer,boolean) from public,anon,authenticated;
create function private.set_license_subtotal() returns trigger language plpgsql set search_path='' as $$
begin
 new.subtotal_amount:=private.license_subtotal(new.pricing_version,new.purchase_type,new.extra_guests,new.extra_blocks,new.additional_guests,new.additional_blocks,new.has_form);
 return new;
end $$;
revoke all on function private.set_license_subtotal() from public,anon,authenticated;
create trigger set_license_subtotal before insert or update of subtotal_amount,pricing_version,purchase_type,extra_guests,extra_blocks,additional_guests,additional_blocks,has_form
 on public.guest_license_payments for each row execute function private.set_license_subtotal();
alter table public.guest_license_payments drop constraint guest_license_pricing_version_check,
 add constraint guest_license_pricing_version_check check(pricing_version in ('guest-v1','guest-v2','guest-v3'));
-- Extend the exact historic checks, preserving v1/v2 invariants.
do $$
declare definition text;
begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.guest_license_payments'::regclass and conname='guest_license_quote_check';
 definition:=substring(definition from 8 for length(definition)-8);
 execute 'alter table public.guest_license_payments drop constraint guest_license_quote_check';
 execute 'alter table public.guest_license_payments add constraint guest_license_quote_check check (('||definition||') or (pricing_version=''guest-v3'' and not has_form and ('||replace(definition,'''guest-v2''','''guest-v3''')||')))';
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.project_payments'::regclass and conname='project_payments_guest_quote_check';
 definition:=substring(definition from 8 for length(definition)-8);
 execute 'alter table public.project_payments drop constraint project_payments_guest_quote_check';
 execute 'alter table public.project_payments add constraint project_payments_guest_quote_check check (('||definition||') or (pricing_version=''guest-v3'' and not includes_rsvp and form_amount_cents=0 and guest_count between 1 and 100000 and guest_capacity=greatest(40,guest_count) and guest_extra_blocks is null and discount_amount between 0 and 3299+greatest(0,guest_count-40)*70 and amount_cents=3299+greatest(0,guest_count-40)*70-discount_amount))';
end $$;
alter table public.guest_license_payments add constraint license_subtotal_version_check check(subtotal_amount=private.license_subtotal(pricing_version,purchase_type,extra_guests,extra_blocks,additional_guests,additional_blocks,has_form));
-- Existing version/free receipts are explicitly v2, without changing money.
alter table public.publication_version_payments add column pricing_version text not null default 'guest-v2';
alter table public.publication_version_payments alter column pricing_version set default 'guest-v3';
do $$
declare item record;
begin
 for item in select conname from pg_constraint where conrelid='public.publication_version_payments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%2450%'
 loop execute format('alter table public.publication_version_payments drop constraint %I',item.conname); end loop;
end $$;
alter table public.publication_version_payments add constraint version_price_grid_check check(
 (pricing_version='guest-v2' and amount_cents=2450+greatest(0,guest_capacity-40)*100+case when has_form then 990 else 0 end)
 or (pricing_version='guest-v3' and not has_form and amount_cents=3299+greatest(0,guest_capacity-40)*70));
alter table public.free_publication_transactions add column pricing_version text not null default 'guest-v2';
alter table public.free_publication_transactions alter column pricing_version set default 'guest-v3';

create or replace function public.reserve_guest_checkout_before_recipients(
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
    v_form := false; -- Included, regardless of whether the design uses it.
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
    p_project_id,p_owner_id,v_type,'guest-v3',p_guest_count,greatest(40,p_guest_count),
    v_extra,v_previous,v_additional,v_form,
    case when v_type = 'initial_publication' then 3299 + v_extra * 70
      else v_additional * 70 end
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
create or replace function public.reserve_version_publication(p_project_id uuid,p_owner_id uuid,p_previous_session_id text,p_terms text,p_expected_amount integer)
returns public.publication_version_payments language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; pending public.publication_version_payments%rowtype; r public.publication_version_payments%rowtype; total integer; capacity integer; form boolean; amount integer;
begin
 select * into p from public.projects where id=p_project_id and owner_id=p_owner_id for update;
 if not found or p.payment_status<>'paid' or p.status<>'published' or p.publication_policy<>'paid_versions' or p.active_version_id is null or not p.has_version_draft then raise exception 'VERSION_NOT_PAYABLE'; end if;
 if p_terms is distinct from 'paid-versions-v1' then raise exception 'PUBLICATION_TERMS_REQUIRED'; end if;
 select coalesce(sum(guest_count),0)::integer into total from public.invitation_recipients where project_id=p.id and is_active;
 if total not between 1 and 100000 or p.purchased_guest_capacity is null then raise exception 'INVALID_CAPACITY'; end if;
 capacity:=greatest(40,total,p.purchased_guest_capacity);
 form:=false; -- No RSVP charge.
 amount:=3299+greatest(0,capacity-40)*70;
 if amount is distinct from p_expected_amount then raise exception 'PUBLICATION_PRICE_CHANGED'; end if;
 if exists(select 1 from public.guest_license_payments where project_id=p.id and status='pending') then raise exception 'CAPACITY_CHECKOUT_PENDING'; end if;
 select * into pending from public.publication_version_payments where project_id=p.id and status='pending' for update;
 if found then
  if pending.stripe_checkout_session_id is distinct from p_previous_session_id or (pending.stripe_checkout_session_id is null and pending.created_at>now()-interval '10 minutes') then raise exception 'CHECKOUT_BUSY'; end if;
  update public.publication_version_payments set status='cancelled' where id=pending.id;
 elsif p_previous_session_id is not null then raise exception 'CHECKOUT_CHANGED'; end if;
 insert into public.publication_version_payments(project_id,owner_id,version_id,base_version_id,guest_count,guest_capacity,has_form,amount_cents,terms_version)
 values(p.id,p.owner_id,private.capture_publication(p.id),p.active_version_id,total,capacity,form,amount,p_terms) returning * into r;
 return r;
end $$;
create or replace function private.refresh_guest_capacity(p_project_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare baseline integer; baseline_at timestamptz; version_sale public.publication_version_payments%rowtype;
begin
 select guest_capacity,paid_at into baseline,baseline_at from public.project_payments where project_id=p_project_id and status='paid' and pricing_version in ('guest-v1','guest-v2','guest-v3');
 if baseline is null then return; end if;
 select * into version_sale from public.publication_version_payments where project_id=p_project_id and status='paid' order by paid_at desc,id desc limit 1;
 if found then baseline:=greatest(baseline,version_sale.guest_capacity);baseline_at:=version_sale.paid_at; end if;
 update public.projects set purchased_guest_capacity=baseline+coalesce((select sum(case when pricing_version='guest-v1' then additional_blocks*7 else additional_guests end)::integer
 from public.guest_license_payments where project_id=p_project_id and purchase_type='guest_capacity_upgrade' and status='paid' and (version_sale.id is null or paid_at>baseline_at)),0)
 where id=p_project_id;
end $$;

-- RSVP entitlement belongs to paid publications, including historical licences.
-- It is not a new zero-price add-on receipt. Historic receipts remain auditable.
create function private.has_published_rsvp(snapshot jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(snapshot#>'{rsvp,enabled}'='true'::jsonb,false)
 and case when jsonb_typeof(snapshot#>'{rsvp,fields}')='array' then jsonb_array_length(snapshot#>'{rsvp,fields}') between 1 and 30 else false end
$$;
revoke all on function private.has_published_rsvp(jsonb) from public,anon,authenticated;
alter function public.get_public_project_before_recipients(text) rename to get_public_project_before_rsvp_included;
revoke all on function public.get_public_project_before_rsvp_included(text) from public,anon,authenticated,service_role;
create function public.get_public_project_before_recipients(p_public_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when data is null then null else jsonb_set(data,'{project_data,rsvp}',coalesce(data#>'{project_data,rsvp}','{}'::jsonb)||'{"purchased":true}'::jsonb,true) end
 from (select public.get_public_project_before_rsvp_included(p_public_id) data) live
$$;
revoke all on function public.get_public_project_before_recipients(text) from public,anon,authenticated;
create function public.get_owner_rsvp_status(p_project_id uuid default null)
returns table(project_id uuid,has_form boolean,has_history boolean)
language sql stable security definer set search_path='' as $$
 select p.id,private.has_published_rsvp(public.get_public_project_before_recipients(p.public_id)->'project_data'),
 exists(select 1 from public.rsvp_responses r where r.project_id=p.id) or exists(select 1 from public.rsvp_response_history r where r.project_id=p.id)
 from public.projects p where p.owner_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and (p_project_id is null or p.id=p_project_id)
$$;
revoke all on function public.get_owner_rsvp_status(uuid) from public,anon;
grant execute on function public.get_owner_rsvp_status(uuid) to authenticated;

create or replace function public.submit_recipient_rsvp(p_public_id text,p_token text,p_answers jsonb,p_answers_by_id jsonb,p_attendance text,p_present_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; r public.invitation_recipients%rowtype; previous public.rsvp_responses%rowtype; config jsonb;
begin
 select * into p from public.projects where public_id=p_public_id for update;
 if public.get_recipient_invitation(p_public_id,p_token) is null then raise exception 'INVITATION_UNAVAILABLE'; end if;
 select * into r from public.invitation_recipients where project_id=p.id and public_token=p_token for update;
 config:=public.get_public_project_before_recipients(p_public_id)#>'{project_data,rsvp}';
 if not private.has_published_rsvp(public.get_public_project_before_recipients(p_public_id)->'project_data') then raise exception 'RSVP_UNAVAILABLE'; end if;
 if p_attendance is null or p_attendance not in ('confirmed','declined') or p_present_count is null or p_present_count<0 or p_present_count>least(r.guest_count,r.allocated_guest_count)
 or (p_attendance='declined' and p_present_count<>0) or (p_attendance='confirmed' and p_present_count<1) then raise exception 'INVALID_ATTENDANCE'; end if;
 select * into previous from public.rsvp_responses where recipient_id=r.id;
 if found and coalesce((config->>'allowResponseEditing')::boolean,true)=false then raise exception 'RESPONSE_LOCKED'; end if;
 if previous.updated_at>now()-interval '2 seconds' then raise exception 'RSVP_RATE_LIMIT'; end if;
 insert into public.rsvp_responses(project_id,owner_id,recipient_id,answers,answers_by_id,attendance,present_count)
 values(p.id,p.owner_id,r.id,p_answers,p_answers_by_id,p_attendance,p_present_count)
 on conflict(recipient_id) where recipient_id is not null do update set answers=excluded.answers,answers_by_id=excluded.answers_by_id,attendance=excluded.attendance,present_count=excluded.present_count,updated_at=now();
end $$;
create or replace function public.submit_rsvp_response(
  p_project_id uuid,
  p_owner_id uuid,
  p_answers jsonb,
  p_client_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response_id uuid;
  v_recent_count integer;
begin
  if not exists (
    select 1
    from public.projects project
    where project.id = p_project_id
      and project.owner_id = p_owner_id
      and project.status = 'published'
      and project.payment_status = 'paid'
      and (project.expires_at is null or project.expires_at > pg_catalog.now())
      and not project.recipient_links_required
      and private.has_published_rsvp(public.get_public_project_before_recipients(project.public_id)->'project_data')
  ) then
    raise exception 'RSVP_UNAVAILABLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_project_id::text || ':' || p_client_fingerprint, 0)
  );

  select pg_catalog.count(*) into v_recent_count
  from public.rsvp_responses response
  where response.project_id = p_project_id
    and response.client_fingerprint = p_client_fingerprint
    and response.created_at >= pg_catalog.now() - interval '10 minutes';

  if v_recent_count >= 5 then
    raise exception 'RSVP_RATE_LIMIT';
  end if;

  insert into public.rsvp_responses (
    project_id,
    owner_id,
    answers,
    client_fingerprint
  ) values (
    p_project_id,
    p_owner_id,
    p_answers,
    p_client_fingerprint
  ) returning id into v_response_id;

  return v_response_id;
end;
$$;
revoke all on function public.submit_rsvp_response(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_rsvp_response(uuid,uuid,jsonb,text) to service_role;
grant usage on schema private to service_role;
grant execute on function private.license_subtotal(text,text,integer,integer,integer,integer,boolean) to service_role;
-- Replaced functions retain existing ACLs, service-only finalization and RLS.
notify pgrst,'reload schema';
commit;
