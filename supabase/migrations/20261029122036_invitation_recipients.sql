-- Coordinated release: prepare and test locally before applying with the Edge Functions.
begin;
create table public.invitation_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  guest_count integer not null check (guest_count between 1 and 100000),
  allocated_guest_count integer not null default 0 check (allocated_guest_count between 0 and 100000),
  public_token text unique check (public_token is null or public_token ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,project_id)
);
create index invitation_recipients_project_idx on public.invitation_recipients(project_id);
alter table public.invitation_recipients enable row level security;
revoke all on public.invitation_recipients from public,anon,authenticated;
grant select on public.invitation_recipients to authenticated;
grant all on public.invitation_recipients to service_role;
create policy "owners read their recipients" on public.invitation_recipients for select to authenticated
using (not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false) and exists (
 select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())
));

alter table public.projects add column recipient_list_revision integer not null default 0,
 add column recipient_links_required boolean not null default false;
alter table public.rsvp_responses add column recipient_id uuid,
 add column attendance text check (attendance in ('confirmed','declined')),
 add column present_count integer check (present_count between 0 and 100000),
 add column answers_by_id jsonb,
 add column updated_at timestamptz not null default now(),
 add constraint rsvp_recipient_project_fk foreign key (recipient_id,project_id)
 references public.invitation_recipients(id,project_id) on delete cascade;
create unique index rsvp_current_recipient_idx on public.rsvp_responses(recipient_id) where recipient_id is not null;

create function private.allocate_invitation_tokens(p_project_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; total bigint;
begin
 select * into p from public.projects where id=p_project_id for update;
 if p.payment_status <> 'paid' or p.status <> 'published' or p.purchased_guest_capacity is null then return; end if;
 select coalesce(sum(guest_count),0) into total from public.invitation_recipients where project_id=p.id and is_active;
 if total <= p.purchased_guest_capacity then
   update public.invitation_recipients set public_token=coalesce(public_token,encode(extensions.gen_random_bytes(32),'hex')),
    allocated_guest_count=guest_count where project_id=p.id and is_active;
 else
   -- Existing paid allocations survive. Extra requested places are never usable before payment.
   update public.invitation_recipients set allocated_guest_count=least(allocated_guest_count,guest_count)
    where project_id=p.id;
 end if;
end $$;
revoke all on function private.allocate_invitation_tokens(uuid) from public,anon,authenticated;

create function public.protect_recipient_project_fields() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') then
  if (tg_op='INSERT' and (new.recipient_list_revision<>0 or new.recipient_links_required)) or
   (tg_op='UPDATE' and (new.recipient_list_revision is distinct from old.recipient_list_revision or new.recipient_links_required is distinct from old.recipient_links_required))
   then raise exception 'Recipient metadata is server-managed' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger protect_recipient_project_fields before insert or update on public.projects for each row execute function public.protect_recipient_project_fields();
revoke all on function public.protect_recipient_project_fields() from public,anon,authenticated;

create function public.read_invitation_recipients(p_project_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 select * into p from public.projects where id=p_project_id and owner_id=auth.uid();
 if not found or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('revision',p.recipient_list_revision,'recipients',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from public.invitation_recipients r where r.project_id=p.id),'[]'::jsonb));
end $$;
revoke all on function public.read_invitation_recipients(uuid) from public,anon;
grant execute on function public.read_invitation_recipients(uuid) to authenticated;

create function public.save_invitation_recipients(p_project_id uuid,p_revision integer,p_recipients jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; item jsonb; recipient uuid; total bigint;
begin
 select * into p from public.projects where id=p_project_id and owner_id=auth.uid() for update;
 if not found or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p.recipient_list_revision is distinct from p_revision then raise exception 'RECIPIENT_LIST_CHANGED'; end if;
 if jsonb_typeof(p_recipients) is distinct from 'array' or jsonb_array_length(p_recipients)>10000 then raise exception 'INVALID_RECIPIENTS'; end if;
 if exists(select 1 from jsonb_array_elements(p_recipients) x group by x->>'id' having count(*)>1) then raise exception 'DUPLICATE_IDS'; end if;
 select coalesce(sum((x->>'guest_count')::bigint) filter(where coalesce((x->>'is_active')::boolean,true)),0) into total from jsonb_array_elements(p_recipients) x;
 if total>100000 then raise exception 'INVALID_GUEST_TOTAL'; end if;
 -- Removing a recipient is always soft deletion: preserve token and former responses.
 update public.invitation_recipients set is_active=false,updated_at=now() where project_id=p.id
 and id not in (select (x->>'id')::uuid from jsonb_array_elements(p_recipients) x);
 for item in select value from jsonb_array_elements(p_recipients) loop
  recipient := (item->>'id')::uuid;
  if recipient is null or jsonb_typeof(item->'guest_count')<>'number' or (item->>'guest_count')!~'^[0-9]+$' then raise exception 'INVALID_RECIPIENT'; end if;
  if exists(select 1 from public.invitation_recipients where id=recipient and project_id<>p.id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.invitation_recipients(id,project_id,display_name,guest_count,is_active)
  values(recipient,p.id,btrim(item->>'display_name'),(item->>'guest_count')::integer,coalesce((item->>'is_active')::boolean,true))
  on conflict(id) do update set display_name=excluded.display_name,guest_count=excluded.guest_count,is_active=excluded.is_active,updated_at=now()
   where invitation_recipients.project_id=excluded.project_id;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 end loop;
 update public.projects set recipient_list_revision=recipient_list_revision+1 where id=p.id;
 perform private.allocate_invitation_tokens(p.id);
 return public.read_invitation_recipients(p.id);
end $$;
revoke all on function public.save_invitation_recipients(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_invitation_recipients(uuid,integer,jsonb) to authenticated;

create function public.recipient_checkout_total(p_project_id uuid,p_owner_id uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(r.guest_count),0)::integer from public.invitation_recipients r
 join public.projects p on p.id=r.project_id where p.id=p_project_id and p.owner_id=p_owner_id and r.is_active;
$$;
revoke all on function public.recipient_checkout_total(uuid,uuid) from public,anon,authenticated;
grant execute on function public.recipient_checkout_total(uuid,uuid) to service_role;

-- Keep the proven price/promo/receipt logic; replace only its source of guest count.
alter function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) rename to reserve_guest_checkout_before_recipients;
revoke all on function public.reserve_guest_checkout_before_recipients(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
create function public.reserve_guest_checkout_v2(p_project_id uuid,p_owner_id uuid,p_guest_count integer,p_previous_session_id text,p_promo_code text)
returns public.guest_license_payments language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 perform 1 from public.projects where id=p_project_id and owner_id=p_owner_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 select coalesce(sum(guest_count),0)::integer into total from public.invitation_recipients where project_id=p_project_id and is_active;
 if total<1 or total>100000 then raise exception 'RECIPIENT_LIST_REQUIRED'; end if;
 update public.projects set recipient_links_required=true where id=p_project_id and payment_status<>'paid';
 return public.reserve_guest_checkout_before_recipients(p_project_id,p_owner_id,total,p_previous_session_id,p_promo_code);
end $$;
revoke all on function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text) to service_role;

create function public.allocate_paid_recipient_links() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.allocate_invitation_tokens(new.id); return new; end $$;
revoke all on function public.allocate_paid_recipient_links() from public,anon,authenticated;
create trigger allocate_paid_recipient_links after update of payment_status,purchased_guest_capacity,status on public.projects
 for each row when (new.payment_status='paid') execute function public.allocate_paid_recipient_links();

-- Old common URLs are retained. Only new recipient-based publications require a token for RSVP.
alter function public.get_public_project(text) rename to get_public_project_before_recipients;
revoke all on function public.get_public_project_before_recipients(text) from public,anon,authenticated;
create function public.get_public_project(p_public_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p.recipient_links_required then jsonb_set(public.get_public_project_before_recipients(p_public_id),'{project_data,rsvp,purchased}','false'::jsonb,true)
 else public.get_public_project_before_recipients(p_public_id) end from public.projects p where p.public_id=p_public_id;
$$;
revoke all on function public.get_public_project(text) from public;
grant execute on function public.get_public_project(text) to anon,authenticated;

create function public.get_recipient_invitation(p_public_id text,p_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'public_id',p.public_id,'expires_at',p.expires_at,
   'project_data',(public.get_public_project_before_recipients(p_public_id)->'project_data')
     - array['ownerId','owner_id','paymentStatus','payment_status','requestedGuestCount','purchasedGuestCapacity','purchasedExtraBlocks','publicationLicenseId','guestList','recipients','invitationRecipients','recipientTokens','responses','orders','stripe_checkout_session_id','stripe_payment_intent_id']::text[]),
   'recipient',jsonb_build_object(
  'id',r.id,'displayName',r.display_name,'guestCount',least(r.guest_count,r.allocated_guest_count),
  'answers',s.answers_by_id,'attendance',s.attendance,'presentCount',s.present_count,
  'canEdit',coalesce((p.project_data#>>'{rsvp,allowResponseEditing}')::boolean,true)))
 from public.invitation_recipients r join public.projects p on p.id=r.project_id
 left join public.rsvp_responses s on s.recipient_id=r.id
 where p.public_id=p_public_id and r.public_token=p_token and length(p_token)=64 and r.is_active
 and r.allocated_guest_count>0 and p.status='published' and p.payment_status='paid'
 and (p.expires_at is null or p.expires_at>now())
 and (select coalesce(sum(least(x.guest_count,x.allocated_guest_count)),0) from public.invitation_recipients x where x.project_id=p.id and x.is_active)<=p.purchased_guest_capacity;
$$;
revoke all on function public.get_recipient_invitation(text,text) from public;
grant execute on function public.get_recipient_invitation(text,text) to anon,authenticated,service_role;

create function public.submit_recipient_rsvp(p_public_id text,p_token text,p_answers jsonb,p_answers_by_id jsonb,p_attendance text,p_present_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; r public.invitation_recipients%rowtype; previous public.rsvp_responses%rowtype;
begin
 select * into p from public.projects where public_id=p_public_id for update;
 if public.get_recipient_invitation(p_public_id,p_token) is null then raise exception 'INVITATION_UNAVAILABLE'; end if;
 select * into r from public.invitation_recipients where project_id=p.id and public_token=p_token for update;
 if not exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='paid') or coalesce(p.project_data#>>'{rsvp,enabled}','false')<>'true' then raise exception 'RSVP_UNAVAILABLE'; end if;
 if p_attendance is null or p_attendance not in ('confirmed','declined') or p_present_count is null or p_present_count<0 or p_present_count>least(r.guest_count,r.allocated_guest_count)
 or (p_attendance='declined' and p_present_count<>0) or (p_attendance='confirmed' and p_present_count<1) then raise exception 'INVALID_ATTENDANCE'; end if;
 select * into previous from public.rsvp_responses where recipient_id=r.id;
 if found and coalesce((p.project_data#>>'{rsvp,allowResponseEditing}')::boolean,true)=false then raise exception 'RESPONSE_LOCKED'; end if;
 if previous.updated_at > now()-interval '2 seconds' then raise exception 'RSVP_RATE_LIMIT'; end if;
 insert into public.rsvp_responses(project_id,owner_id,recipient_id,answers,answers_by_id,attendance,present_count)
 values(p.id,p.owner_id,r.id,p_answers,p_answers_by_id,p_attendance,p_present_count)
 on conflict(recipient_id) where recipient_id is not null do update set answers=excluded.answers,answers_by_id=excluded.answers_by_id,attendance=excluded.attendance,present_count=excluded.present_count,updated_at=now();
end $$;
revoke all on function public.submit_recipient_rsvp(text,text,jsonb,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.submit_recipient_rsvp(text,text,jsonb,jsonb,text,integer) to service_role;

alter function private.sanitize_template_data(jsonb) rename to sanitize_template_data_before_recipients;
create function private.sanitize_template_data(p_project_data jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select private.sanitize_template_data_before_recipients(p_project_data) - 'guestList' - 'recipients' - 'invitationRecipients' - 'recipientTokens';
$$;
revoke all on function private.sanitize_template_data(jsonb) from public,anon,authenticated;
commit;
