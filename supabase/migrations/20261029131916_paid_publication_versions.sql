-- PREPARED ONLY: commercial release requires review before any hosted deployment.
begin;
alter table public.projects
 add column publication_policy text not null default 'paid_versions' check(publication_policy in ('legacy','paid_versions')),
 add column active_version_id uuid,
 add column active_version_number integer not null default 0,
 add column has_version_draft boolean not null default false;
-- The old UI explicitly promised unlimited changes. Preserve existing purchases,
-- including already reserved/paid sessions that may complete after the release.
update public.projects p set publication_policy='legacy'
 where p.payment_status in ('paid','pending','refunded') or p.status='published'
 or exists(select 1 from public.project_payments x where x.project_id=p.id)
 or exists(select 1 from public.guest_license_payments x where x.project_id=p.id);

create table public.project_publication_versions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 version_number integer not null check(version_number>0), name text not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 status text not null default 'candidate' check(status in ('candidate','published')),
 created_at timestamptz not null default now(), published_at timestamptz,
 unique(project_id,version_number), unique(id,project_id)
);
alter table public.projects add constraint project_active_version_fk foreign key(active_version_id,id)
 references public.project_publication_versions(id,project_id) deferrable initially deferred;
alter table public.guest_license_payments add column publication_version_id uuid references public.project_publication_versions(id),
 add column publication_terms_version text, add column publication_accepted_at timestamptz;

create table public.publication_version_payments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 version_id uuid not null unique, base_version_id uuid not null,
 guest_count integer not null check(guest_count between 1 and 100000),
 guest_capacity integer not null check(guest_capacity between 40 and 100000),
 has_form boolean not null, amount_cents integer not null,
 terms_version text not null check(terms_version='paid-versions-v1'), accepted_at timestamptz not null default now(),
 currency text not null default 'eur' check(currency='eur'),
 status text not null default 'pending' check(status in ('pending','paid','failed','cancelled','refunded')),
 stripe_checkout_session_id text unique, stripe_payment_intent_id text unique,
 created_at timestamptz not null default now(), paid_at timestamptz,
 foreign key(version_id,project_id) references public.project_publication_versions(id,project_id),
 foreign key(base_version_id,project_id) references public.project_publication_versions(id,project_id),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade,
 check(guest_capacity>=guest_count),
 check(amount_cents=2450+greatest(0,guest_capacity-40)*100+case when has_form then 990 else 0 end)
);
create unique index one_pending_version_payment on public.publication_version_payments(project_id) where status='pending';

alter table public.project_publication_versions enable row level security;
alter table public.publication_version_payments enable row level security;
revoke all on public.project_publication_versions,public.publication_version_payments from public,anon,authenticated;
grant select on public.project_publication_versions,public.publication_version_payments to authenticated;
grant all on public.project_publication_versions,public.publication_version_payments to service_role;
grant update(stripe_checkout_session_id) on public.publication_version_payments to service_role;
create policy "owners read publication history" on public.project_publication_versions for select to authenticated using(
 not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy "owners read version payments" on public.publication_version_payments for select to authenticated using(
 not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false) and owner_id=(select auth.uid()));

create function private.publication_content(data jsonb) returns jsonb language sql immutable set search_path='' as $$
 select (data-array['id','ownerId','owner_id','name','createdAt','updatedAt','status','paymentStatus','publicId','publishedAt','expiresAt','requestedGuestCount','purchasedGuestCapacity','purchasedExtraBlocks','publicationLicenseId','publicationPolicy','activeVersionId','activeVersionNumber','hasVersionDraft','previewVideoPath','guestList','recipients','invitationRecipients','recipientTokens','responses','orders','stripe_checkout_session_id','stripe_payment_intent_id']::text[]) #- '{rsvp,purchased}';
$$;
revoke all on function private.publication_content(jsonb) from public,anon,authenticated;

-- Snapshot fields never change, even through a service-role update. Project
-- deletion still cascades, as required for account erasure.
create function public.immutable_publication_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.project_id is distinct from old.project_id or new.version_number is distinct from old.version_number
 or new.name is distinct from old.name or new.snapshot is distinct from old.snapshot or new.created_at is distinct from old.created_at
 or (old.status='published' and (new.status is distinct from old.status or new.published_at is distinct from old.published_at)) then
 raise exception 'IMMUTABLE_PUBLICATION_SNAPSHOT' using errcode='42501'; end if; return new;
end $$;
revoke all on function public.immutable_publication_snapshot() from public,anon,authenticated;
create trigger immutable_publication_snapshot before update on public.project_publication_versions for each row execute function public.immutable_publication_snapshot();

create function public.protect_publication_versions() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') then
  if tg_op='INSERT' then
   if new.publication_policy<>'paid_versions' or new.active_version_id is not null or new.active_version_number<>0 or new.has_version_draft then raise exception 'PUBLICATION_FIELDS_SERVER_MANAGED' using errcode='42501'; end if;
  else
   if new.publication_policy is distinct from old.publication_policy or new.active_version_id is distinct from old.active_version_id or new.active_version_number is distinct from old.active_version_number or new.has_version_draft is distinct from old.has_version_draft then raise exception 'PUBLICATION_FIELDS_SERVER_MANAGED' using errcode='42501'; end if;
   if old.publication_policy='paid_versions' and old.active_version_id is not null and not old.has_version_draft
    and (new.name is distinct from old.name or private.publication_content(new.project_data) is distinct from private.publication_content(old.project_data))
    then raise exception 'PUBLISHED_DESIGN_LOCKED' using errcode='42501'; end if;
  end if;
 end if; return new;
end $$;
-- Invoker trigger must be allowed to use this pure canonicalization helper.
grant execute on function private.publication_content(jsonb) to authenticated;
revoke all on function public.protect_publication_versions() from public,anon,authenticated;
create trigger protect_publication_versions before insert or update on public.projects for each row execute function public.protect_publication_versions();

-- Historical snapshots for consultation; legacy editing rights remain intact.
insert into public.project_publication_versions(project_id,version_number,name,snapshot,status,published_at)
 select id,1,name,private.publication_content(project_data),'published',coalesce(published_at,now()) from public.projects where payment_status='paid' and status='published';
update public.projects p set active_version_id=v.id,active_version_number=v.version_number from public.project_publication_versions v where v.project_id=p.id;

create function public.begin_publication_revision(p_project_id uuid,p_source_version_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; v public.project_publication_versions%rowtype;
begin
 select * into p from public.projects where id=p_project_id and owner_id=auth.uid() for update;
 if not found or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p.publication_policy<>'paid_versions' then raise exception 'LEGACY_TERMS_PRESERVED'; end if;
 if p.payment_status<>'paid' or p.active_version_id is null then raise exception 'PAID_PUBLICATION_REQUIRED'; end if;
 if exists(select 1 from public.publication_version_payments where project_id=p.id and status='pending') then raise exception 'VERSION_CHECKOUT_PENDING'; end if;
 if p.has_version_draft and p_source_version_id is null then return; end if;
 select * into v from public.project_publication_versions where id=coalesce(p_source_version_id,p.active_version_id) and project_id=p.id and status='published';
 if not found then raise exception 'VERSION_UNAVAILABLE'; end if;
 update public.projects set project_data=v.snapshot,name=v.name,has_version_draft=true,updated_at=now() where id=p.id;
end $$;
revoke all on function public.begin_publication_revision(uuid,uuid) from public,anon;
grant execute on function public.begin_publication_revision(uuid,uuid) to authenticated;

create function private.capture_publication(p_project_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; result uuid;
begin
 select * into p from public.projects where id=p_project_id for update;
 insert into public.project_publication_versions(project_id,version_number,name,snapshot)
 values(p.id,(select coalesce(max(version_number),0)+1 from public.project_publication_versions where project_id=p.id),p.name,private.publication_content(p.project_data)) returning id into result;
 return result;
end $$;
revoke all on function private.capture_publication(uuid) from public,anon,authenticated;

create function private.activate_publication(p_project_id uuid,p_version_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v public.project_publication_versions%rowtype;
begin
 select * into v from public.project_publication_versions where id=p_version_id and project_id=p_project_id;
 if not found then raise exception 'SNAPSHOT_MISSING'; end if;
 update public.project_publication_versions set status='published',published_at=now() where id=v.id and status='candidate';
 update public.projects set active_version_id=v.id,active_version_number=v.version_number,
  has_version_draft=(private.publication_content(project_data) is distinct from v.snapshot or name is distinct from v.name)
 where id=p_project_id;
end $$;
revoke all on function private.activate_publication(uuid,uuid) from public,anon,authenticated;

-- Initial/upgrade receipts keep their existing append-only ledger. Confirmation
-- is checked here, not just in React. Legacy purchases remain accepted.
alter function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) rename to reserve_guest_checkout_before_versions;
revoke all on function public.reserve_guest_checkout_before_versions(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
create function public.reserve_guest_checkout_v2(p_project_id uuid,p_owner_id uuid,p_guest_count integer,p_previous_session_id text,p_promo_code text)
returns public.guest_license_payments language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; r public.guest_license_payments%rowtype; v uuid;
begin
 select * into p from public.projects where id=p_project_id and owner_id=p_owner_id for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from public.publication_version_payments where project_id=p.id and status='pending') then raise exception 'VERSION_CHECKOUT_PENDING'; end if;
 if p.publication_policy='paid_versions' and p.payment_status<>'paid' and current_setting('app.publication_terms',true) is distinct from 'paid-versions-v1' then raise exception 'PUBLICATION_TERMS_REQUIRED'; end if;
 r:=public.reserve_guest_checkout_before_versions(p_project_id,p_owner_id,p_guest_count,p_previous_session_id,p_promo_code);
 if p.publication_policy='paid_versions' and r.purchase_type='initial_publication' then
  v:=private.capture_publication(p.id);
  update public.guest_license_payments set publication_version_id=v where id=r.id returning * into r;
 end if; return r;
end $$;
revoke all on function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) to service_role;

create function public.reserve_confirmed_initial_publication(p_project_id uuid,p_owner_id uuid,p_guest_count integer,p_previous_session_id text,p_promo_code text,p_terms text,p_expected_amount integer)
returns public.guest_license_payments language plpgsql security definer set search_path='' as $$
declare r public.guest_license_payments%rowtype;
begin
 if p_terms is distinct from 'paid-versions-v1' then raise exception 'PUBLICATION_TERMS_REQUIRED'; end if;
 perform set_config('app.publication_terms',p_terms,true);
 r:=public.reserve_guest_checkout_v2(p_project_id,p_owner_id,p_guest_count,p_previous_session_id,p_promo_code);
 if r.amount_cents is distinct from p_expected_amount then raise exception 'PUBLICATION_PRICE_CHANGED'; end if;
 update public.guest_license_payments set publication_terms_version=p_terms,publication_accepted_at=now() where id=r.id returning * into r;
 return r;
end $$;
revoke all on function public.reserve_confirmed_initial_publication(uuid,uuid,integer,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_confirmed_initial_publication(uuid,uuid,integer,text,text,text,integer) to service_role;

alter function public.finalize_guest_checkout(uuid,uuid,text,text,integer) rename to finalize_guest_checkout_before_versions;
revoke all on function public.finalize_guest_checkout_before_versions(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
create function public.finalize_guest_checkout(p_receipt_id uuid,p_owner_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.guest_license_payments%rowtype; p public.projects%rowtype;
begin
 select * into r from public.guest_license_payments where id=p_receipt_id;
 select * into p from public.projects where id=r.project_id for update;
 select * into r from public.guest_license_payments where id=p_receipt_id for update;
 if r.status in ('paid','refunded') then
  -- Delegate identity/amount checks, but never switch the active version on replay.
  perform public.finalize_guest_checkout_before_versions(p_receipt_id,p_owner_id,p_session_id,p_payment_intent_id,p_amount_cents); return;
 end if;
 if p.publication_policy='paid_versions' and r.purchase_type='initial_publication' and r.publication_version_id is null then raise exception 'SNAPSHOT_REQUIRED'; end if;
 perform public.finalize_guest_checkout_before_versions(p_receipt_id,p_owner_id,p_session_id,p_payment_intent_id,p_amount_cents);
 if r.purchase_type='initial_publication' and r.publication_version_id is not null then perform private.activate_publication(p.id,r.publication_version_id); end if;
end $$;
revoke all on function public.finalize_guest_checkout(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.finalize_guest_checkout(uuid,uuid,text,text,integer) to service_role;

create function public.reserve_version_publication(p_project_id uuid,p_owner_id uuid,p_previous_session_id text,p_terms text,p_expected_amount integer)
returns public.publication_version_payments language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; pending public.publication_version_payments%rowtype; r public.publication_version_payments%rowtype; total integer; capacity integer; form boolean; amount integer;
begin
 select * into p from public.projects where id=p_project_id and owner_id=p_owner_id for update;
 if not found or p.payment_status<>'paid' or p.status<>'published' or p.publication_policy<>'paid_versions' or p.active_version_id is null or not p.has_version_draft then raise exception 'VERSION_NOT_PAYABLE'; end if;
 if p_terms is distinct from 'paid-versions-v1' then raise exception 'PUBLICATION_TERMS_REQUIRED'; end if;
 select coalesce(sum(guest_count),0)::integer into total from public.invitation_recipients where project_id=p.id and is_active;
 if total not between 1 and 100000 or p.purchased_guest_capacity is null then raise exception 'INVALID_CAPACITY'; end if;
 capacity:=greatest(40,total,p.purchased_guest_capacity);
 form:=coalesce(p.project_data#>>'{rsvp,enabled}','false')='true' and not exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='paid');
 if form and exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='refunded') then raise exception 'REFUNDED_FORM_REQUIRES_SUPPORT'; end if;
 amount:=2450+greatest(0,capacity-40)*100+case when form then 990 else 0 end;
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
revoke all on function public.reserve_version_publication(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_version_publication(uuid,uuid,text,text,integer) to service_role;

-- Binding to a paid receipt is mandatory; neither restoring nor selecting a
-- historic snapshot can call this from an authenticated browser.
create function public.finalize_version_publication(p_receipt_id uuid,p_owner_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.publication_version_payments%rowtype; p public.projects%rowtype;
begin
 select * into r from public.publication_version_payments where id=p_receipt_id;
 select * into p from public.projects where id=r.project_id for update;
 select * into r from public.publication_version_payments where id=p_receipt_id for update;
 if not found or r.owner_id is distinct from p_owner_id or r.stripe_checkout_session_id is distinct from p_session_id or r.amount_cents is distinct from p_amount_cents
 or coalesce(p_payment_intent_id,'')='' or (r.stripe_payment_intent_id is not null and r.stripe_payment_intent_id<>p_payment_intent_id) then raise exception 'VERSION_PAYMENT_MISMATCH'; end if;
 if r.status in ('paid','refunded') then return; end if;
 if r.status not in ('pending','failed') or p.active_version_id is distinct from r.base_version_id or p.payment_status<>'paid' then raise exception 'VERSION_PAYMENT_STALE'; end if;
 if r.has_form then
  insert into public.rsvp_addon_purchases(project_id,owner_id,status,amount_cents,currency,stripe_checkout_session_id,stripe_payment_intent_id,paid_at)
  values(p.id,p.owner_id,'paid',990,'eur',p_session_id,p_payment_intent_id,now())
  on conflict(project_id) do update set status='paid',amount_cents=990,stripe_checkout_session_id=excluded.stripe_checkout_session_id,stripe_payment_intent_id=excluded.stripe_payment_intent_id,paid_at=now()
  where rsvp_addon_purchases.status in ('unpaid','pending');
  if not found then raise exception 'FORM_PURCHASE_CONFLICT'; end if;
 end if;
 update public.publication_version_payments set status='paid',stripe_payment_intent_id=p_payment_intent_id,paid_at=now() where id=r.id;
 update public.projects set purchased_guest_capacity=greatest(purchased_guest_capacity,r.guest_capacity),purchased_extra_blocks=null,
 project_data=jsonb_set(project_data,'{rsvp,purchased}',to_jsonb(exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='paid')),true) where id=p.id;
 perform private.activate_publication(p.id,r.version_id);
end $$;
revoke all on function public.finalize_version_publication(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.finalize_version_publication(uuid,uuid,text,text,integer) to service_role;

create function public.fail_version_publication(p_receipt_id uuid,p_session_id text) returns void language sql security definer set search_path='' as $$
 update public.publication_version_payments set status='failed' where id=p_receipt_id and status='pending' and stripe_checkout_session_id is not distinct from p_session_id;
$$;
revoke all on function public.fail_version_publication(uuid,text) from public,anon,authenticated;
grant execute on function public.fail_version_publication(uuid,text) to service_role;

create function public.refund_version_publication(p_receipt_id uuid,p_owner_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.publication_version_payments%rowtype;
begin
 select * into r from public.publication_version_payments where id=p_receipt_id;
 perform 1 from public.projects where id=r.project_id for update;
 select * into r from public.publication_version_payments where id=p_receipt_id for update;
 if not found or r.owner_id is distinct from p_owner_id or r.stripe_checkout_session_id is distinct from p_session_id or r.stripe_payment_intent_id is distinct from p_payment_intent_id or r.amount_cents is distinct from p_amount_cents then raise exception 'VERSION_REFUND_MISMATCH'; end if;
 if r.status='refunded' then return; end if;
 if r.status<>'paid' then raise exception 'VERSION_REFUND_NOT_PAID'; end if;
 update public.publication_version_payments set status='refunded' where id=r.id;
 if r.has_form then
  update public.rsvp_addon_purchases set status='refunded',updated_at=now() where project_id=r.project_id and stripe_checkout_session_id=r.stripe_checkout_session_id;
 end if;
 perform private.refresh_guest_capacity(r.project_id);
 update public.projects set project_data=jsonb_set(project_data,'{rsvp,purchased}',to_jsonb(exists(select 1 from public.rsvp_addon_purchases where project_id=r.project_id and status='paid')),true) where id=r.project_id;
 -- Do not freely reactivate an old design. Refunded active content is withheld.
end $$;
revoke all on function public.refund_version_publication(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.refund_version_publication(uuid,uuid,text,text,integer) to service_role;

-- A paid republication includes all existing capacity. Only increments purchased
-- after that baseline are added; upgrades can never reset it to the first sale.
create or replace function private.refresh_guest_capacity(p_project_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare baseline integer; baseline_at timestamptz; version_sale public.publication_version_payments%rowtype;
begin
 select guest_capacity,paid_at into baseline,baseline_at from public.project_payments where project_id=p_project_id and status='paid' and pricing_version in ('guest-v1','guest-v2');
 if baseline is null then return; end if;
 select * into version_sale from public.publication_version_payments where project_id=p_project_id and status='paid' order by paid_at desc,id desc limit 1;
 if found then baseline:=greatest(baseline,version_sale.guest_capacity);baseline_at:=version_sale.paid_at; end if;
 update public.projects set purchased_guest_capacity=baseline+coalesce((select sum(case when pricing_version='guest-v1' then additional_blocks*7 else additional_guests end)::integer
 from public.guest_license_payments where project_id=p_project_id and purchase_type='guest_capacity_upgrade' and status='paid' and (version_sale.id is null or paid_at>baseline_at)),0)
 where id=p_project_id;
end $$;

-- Live content lookup is the single source used by common and household URLs.
alter function public.get_public_project_before_recipients(text) rename to get_public_project_legacy_versions;
revoke all on function public.get_public_project_legacy_versions(text) from public,anon,authenticated;
create function public.get_public_project_before_recipients(p_public_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p.publication_policy='legacy' then public.get_public_project_legacy_versions(p_public_id)
 else jsonb_build_object('id',p.id,'name',v.name,'public_id',p.public_id,'expires_at',p.expires_at,
  'project_data',jsonb_set(v.snapshot||jsonb_build_object('rsvp',coalesce(v.snapshot->'rsvp','{}'::jsonb)),'{rsvp,purchased}',to_jsonb(exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='paid')),true)) end
 from public.projects p left join public.project_publication_versions v on v.id=p.active_version_id and v.project_id=p.id and v.status='published'
 where p.public_id=p_public_id and p.payment_status='paid' and p.status='published' and (p.expires_at is null or p.expires_at>now())
 and (p.publication_policy='legacy' or (v.id is not null and (
  exists(select 1 from public.guest_license_payments where publication_version_id=v.id and status='paid')
  or exists(select 1 from public.publication_version_payments where version_id=v.id and status='paid'))));
$$;
revoke all on function public.get_public_project_before_recipients(text) from public,anon,authenticated;

-- RSVP answers keep the questionnaire that gave them meaning; every edited
-- answer is archived before replacement, including across paid design versions.
alter table public.rsvp_responses add column publication_version_id uuid references public.project_publication_versions(id), add column questionnaire_snapshot jsonb;
create table public.rsvp_response_history (
 id uuid primary key default gen_random_uuid(), response_id uuid not null references public.rsvp_responses(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, recipient_id uuid references public.invitation_recipients(id) on delete cascade,
 answers jsonb not null, answers_by_id jsonb, questionnaire_snapshot jsonb, publication_version_id uuid references public.project_publication_versions(id),
 attendance text, present_count integer, answered_at timestamptz not null, archived_at timestamptz not null default now()
);
create index response_history_project_idx on public.rsvp_response_history(project_id,response_id);
alter table public.rsvp_response_history enable row level security;
revoke all on public.rsvp_response_history from public,anon,authenticated;
grant select on public.rsvp_response_history to authenticated; grant all on public.rsvp_response_history to service_role;
create policy "owners read response history" on public.rsvp_response_history for select to authenticated using(
 not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create function public.preserve_response_questionnaire() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 if tg_op='UPDATE' and new.answers is not distinct from old.answers and new.answers_by_id is not distinct from old.answers_by_id
  and new.attendance is not distinct from old.attendance and new.present_count is not distinct from old.present_count then return new; end if;
 if tg_op='UPDATE' then
  insert into public.rsvp_response_history(response_id,project_id,recipient_id,answers,answers_by_id,questionnaire_snapshot,publication_version_id,attendance,present_count,answered_at)
  values(old.id,old.project_id,old.recipient_id,old.answers,old.answers_by_id,old.questionnaire_snapshot,old.publication_version_id,old.attendance,old.present_count,coalesce(old.updated_at,old.created_at));
 end if;
 select * into p from public.projects where id=new.project_id;
 new.publication_version_id:=p.active_version_id;
 new.questionnaire_snapshot:=public.get_public_project_before_recipients(p.public_id)#>'{project_data,rsvp}';
 return new;
end $$;
revoke all on function public.preserve_response_questionnaire() from public,anon,authenticated;
create trigger preserve_response_questionnaire before insert or update on public.rsvp_responses for each row execute function public.preserve_response_questionnaire();

-- Always use the published configuration for public editing permissions.
create or replace function public.get_recipient_invitation(p_public_id text,p_token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project',jsonb_set(live.data,'{project_data}',(live.data->'project_data')-array['ownerId','owner_id','paymentStatus','payment_status','guestList','recipients','invitationRecipients','recipientTokens','responses','orders','requestedGuestCount','purchasedGuestCapacity','purchasedExtraBlocks','publicationLicenseId']::text[]),'recipient',jsonb_build_object('id',r.id,'displayName',r.display_name,'guestCount',least(r.guest_count,r.allocated_guest_count),
 'answers',s.answers_by_id,'attendance',s.attendance,'presentCount',s.present_count,'canEdit',coalesce((live.data#>>'{project_data,rsvp,allowResponseEditing}')::boolean,true)))
 from public.invitation_recipients r join public.projects p on p.id=r.project_id
 cross join lateral(select public.get_public_project_before_recipients(p_public_id) as data) live
 left join public.rsvp_responses s on s.recipient_id=r.id
 where p.public_id=p_public_id and live.data is not null and r.public_token=p_token and length(p_token)=64 and r.is_active and r.allocated_guest_count>0
 and (select coalesce(sum(least(x.guest_count,x.allocated_guest_count)),0) from public.invitation_recipients x where x.project_id=p.id and x.is_active)<=p.purchased_guest_capacity;
$$;
-- The minimal live helper above contains no ownership/payment metadata.
create or replace function public.submit_recipient_rsvp(p_public_id text,p_token text,p_answers jsonb,p_answers_by_id jsonb,p_attendance text,p_present_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; r public.invitation_recipients%rowtype; previous public.rsvp_responses%rowtype; config jsonb;
begin
 select * into p from public.projects where public_id=p_public_id for update;
 if public.get_recipient_invitation(p_public_id,p_token) is null then raise exception 'INVITATION_UNAVAILABLE'; end if;
 select * into r from public.invitation_recipients where project_id=p.id and public_token=p_token for update;
 config:=public.get_public_project_before_recipients(p_public_id)#>'{project_data,rsvp}';
 if not exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='paid') or coalesce(config->>'enabled','false')<>'true' then raise exception 'RSVP_UNAVAILABLE'; end if;
 if p_attendance is null or p_attendance not in ('confirmed','declined') or p_present_count is null or p_present_count<0 or p_present_count>least(r.guest_count,r.allocated_guest_count)
 or (p_attendance='declined' and p_present_count<>0) or (p_attendance='confirmed' and p_present_count<1) then raise exception 'INVALID_ATTENDANCE'; end if;
 select * into previous from public.rsvp_responses where recipient_id=r.id;
 if found and coalesce((config->>'allowResponseEditing')::boolean,true)=false then raise exception 'RESPONSE_LOCKED'; end if;
 if previous.updated_at>now()-interval '2 seconds' then raise exception 'RSVP_RATE_LIMIT'; end if;
 insert into public.rsvp_responses(project_id,owner_id,recipient_id,answers,answers_by_id,attendance,present_count)
 values(p.id,p.owner_id,r.id,p_answers,p_answers_by_id,p_attendance,p_present_count)
 on conflict(recipient_id) where recipient_id is not null do update set answers=excluded.answers,answers_by_id=excluded.answers_by_id,attendance=excluded.attendance,present_count=excluded.present_count,updated_at=now();
end $$;

-- Protect stored image/music/font bytes referenced by any immutable snapshot.
create function public.publication_asset_locked(p_bucket text,p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_publication_versions where position('/storage/v1/object/public/'||p_bucket||'/'||p_name in snapshot::text)>0
 or position('/storage/v1/object/public/'||p_bucket||'/'||replace(p_name,' ','%20') in snapshot::text)>0);
$$;
revoke all on function public.publication_asset_locked(text,text) from public,anon;
grant execute on function public.publication_asset_locked(text,text) to authenticated;
create policy "immutable published asset updates" on storage.objects as restrictive for update to authenticated
 using(not public.publication_asset_locked(bucket_id,name)) with check(not public.publication_asset_locked(bucket_id,name));
create policy "immutable published asset removal" on storage.objects as restrictive for delete to authenticated using(not public.publication_asset_locked(bucket_id,name));

-- The admin deletion Edge Function uses service_role and therefore bypasses
-- Storage RLS. Extend its existing usage check to include immutable history.
do $migration$
begin
 if to_regprocedure('private.envelope_asset_usage(uuid)') is not null then
  alter function private.envelope_asset_usage(uuid) rename to envelope_asset_usage_before_versions;
  execute $ddl$create function private.envelope_asset_usage(p_asset_id uuid) returns jsonb language plpgsql security definer set search_path='' as $fn$
   declare usage jsonb; asset_url text; additional bigint;
   begin
    usage:=private.envelope_asset_usage_before_versions(p_asset_id);
    select url into asset_url from public.global_assets where id=p_asset_id;
    select count(distinct v.project_id) into additional from public.project_publication_versions v join public.projects p on p.id=v.project_id
     where (strpos(v.snapshot::text,asset_url)>0 or strpos(v.snapshot::text,p_asset_id::text)>0)
     and not (strpos(p.project_data::text,asset_url)>0 or strpos(p.project_data::text,p_asset_id::text)>0);
    return usage||jsonb_build_object('projects',(usage->>'projects')::bigint+additional);
   end $fn$ $ddl$;
  revoke all on function private.envelope_asset_usage_before_versions(uuid) from public,anon,authenticated,service_role;
  revoke all on function private.envelope_asset_usage(uuid) from public,anon;
  grant execute on function private.envelope_asset_usage(uuid) to authenticated,service_role;
 end if;
end $migration$;

alter function private.sanitize_template_data(jsonb) rename to sanitize_template_data_before_publication_versions;
create function private.sanitize_template_data(p_project_data jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select private.sanitize_template_data_before_publication_versions(p_project_data)-array['publicationPolicy','activeVersionId','activeVersionNumber','hasVersionDraft']::text[];
$$;
revoke all on function private.sanitize_template_data(jsonb),private.sanitize_template_data_before_publication_versions(jsonb) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
