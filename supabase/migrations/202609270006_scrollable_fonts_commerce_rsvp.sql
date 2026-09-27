-- Single-scroll invitations, project fonts, custom orders and paid RSVP option.
-- All exposed tables use explicit grants plus RLS.

alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check check (kind in ('image', 'audio', 'font'));

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav',
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/font-sfnt', 'application/font-woff'
]
where id = 'wedding-assets';

create table public.custom_invitation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  couple_names text not null check (char_length(couple_names) between 1 and 200),
  wedding_date date,
  theme text not null default '',
  desired_colors text not null default '',
  desired_style text not null default '',
  description text not null check (char_length(description) between 1 and 5000),
  reference_urls text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'pending_payment', 'paid', 'in_progress', 'completed', 'cancelled')),
  amount_cents integer not null default 5000 check (amount_cents = 5000),
  currency text not null default 'eur' check (currency = 'eur'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_invitation_requests_owner_idx on public.custom_invitation_requests(owner_id, created_at desc);
alter table public.custom_invitation_requests enable row level security;
revoke all on public.custom_invitation_requests from anon, authenticated;
grant select on public.custom_invitation_requests to authenticated;
grant insert (owner_id, couple_names, wedding_date, theme, desired_colors, desired_style, description, reference_urls) on public.custom_invitation_requests to authenticated;
grant update (couple_names, wedding_date, theme, desired_colors, desired_style, description, reference_urls, updated_at) on public.custom_invitation_requests to authenticated;
create policy "owners read custom invitation requests" on public.custom_invitation_requests for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners create custom invitation requests" on public.custom_invitation_requests for insert to authenticated with check ((select auth.uid()) = owner_id and status = 'draft');
create policy "owners edit unpaid custom invitation requests" on public.custom_invitation_requests for update to authenticated using ((select auth.uid()) = owner_id and status = 'draft') with check ((select auth.uid()) = owner_id and status = 'draft');

create table public.rsvp_addon_purchases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'unpaid' check (status in ('unpaid', 'pending', 'paid', 'refunded')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur' check (currency = 'eur'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rsvp_addon_purchases enable row level security;
revoke all on public.rsvp_addon_purchases from anon, authenticated;
grant select on public.rsvp_addon_purchases to authenticated;
create policy "owners read rsvp purchases" on public.rsvp_addon_purchases for select to authenticated using ((select auth.uid()) = owner_id);

create table public.rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 32768),
  client_fingerprint text,
  created_at timestamptz not null default now()
);
create index rsvp_responses_project_created_idx on public.rsvp_responses(project_id, created_at desc);
create index rsvp_responses_abuse_idx on public.rsvp_responses(project_id, client_fingerprint, created_at desc);
alter table public.rsvp_responses enable row level security;
revoke all on public.rsvp_responses from anon, authenticated;
grant select on public.rsvp_responses to authenticated;
create policy "owners read project rsvp responses" on public.rsvp_responses for select to authenticated using ((select auth.uid()) = owner_id and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

create or replace function public.enforce_rsvp_purchase_flag()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.project_data = jsonb_set(
    coalesce(new.project_data, '{}'::jsonb),
    '{rsvp,purchased}',
    to_jsonb(exists (
      select 1 from public.rsvp_addon_purchases purchase
      where purchase.project_id = new.id and purchase.owner_id = new.owner_id and purchase.status = 'paid'
    )),
    true
  );
  return new;
end; $$;
drop trigger if exists enforce_rsvp_purchase_flag_on_projects on public.projects;
create trigger enforce_rsvp_purchase_flag_on_projects before insert or update of project_data on public.projects for each row execute function public.enforce_rsvp_purchase_flag();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-request-assets', 'custom-request-assets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "owners read custom request assets" on storage.objects for select to authenticated using (bucket_id = 'custom-request-assets' and owner_id = (select auth.uid()::text));
create policy "owners upload custom request assets" on storage.objects for insert to authenticated with check (bucket_id = 'custom-request-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "owners delete custom request assets" on storage.objects for delete to authenticated using (bucket_id = 'custom-request-assets' and owner_id = (select auth.uid()::text));

grant select, insert on public.assets to authenticated;

create or replace function public.finalize_custom_invitation_payment(p_request_id uuid, p_owner_id uuid, p_session_id text, p_payment_intent_id text, p_amount_cents integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.custom_invitation_requests
  set status = 'paid', stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id), paid_at = coalesce(paid_at, now()), updated_at = now()
  where id = p_request_id and owner_id = p_owner_id and stripe_checkout_session_id = p_session_id and amount_cents = p_amount_cents and status = 'pending_payment';
  if not found then raise exception 'Custom invitation payment mismatch'; end if;
end; $$;

create or replace function public.finalize_rsvp_addon_payment(p_project_id uuid, p_owner_id uuid, p_session_id text, p_payment_intent_id text, p_amount_cents integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.rsvp_addon_purchases
  set status = 'paid', stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id), paid_at = coalesce(paid_at, now()), updated_at = now()
  where project_id = p_project_id and owner_id = p_owner_id and stripe_checkout_session_id = p_session_id and amount_cents = p_amount_cents and status = 'pending';
  if not found then raise exception 'RSVP add-on payment mismatch'; end if;
  update public.projects
  set project_data = jsonb_set(coalesce(project_data, '{}'::jsonb), '{rsvp,purchased}', 'true'::jsonb, true), updated_at = now()
  where id = p_project_id and owner_id = p_owner_id;
  if not found then raise exception 'RSVP project owner mismatch'; end if;
end; $$;

revoke all on function public.finalize_custom_invitation_payment(uuid, uuid, text, text, integer) from public;
revoke all on function public.finalize_rsvp_addon_payment(uuid, uuid, text, text, integer) from public;
grant execute on function public.finalize_custom_invitation_payment(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.finalize_rsvp_addon_payment(uuid, uuid, text, text, integer) to service_role;

create or replace function public.refund_custom_invitation_payment(p_request_id uuid, p_owner_id uuid, p_session_id text, p_payment_intent_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.custom_invitation_requests set status = 'cancelled', updated_at = now()
  where id = p_request_id and owner_id = p_owner_id and stripe_checkout_session_id = p_session_id and stripe_payment_intent_id = p_payment_intent_id;
  if not found then raise exception 'Custom invitation refund mismatch'; end if;
end; $$;

create or replace function public.refund_rsvp_addon_payment(p_project_id uuid, p_owner_id uuid, p_session_id text, p_payment_intent_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.rsvp_addon_purchases set status = 'refunded', updated_at = now()
  where project_id = p_project_id and owner_id = p_owner_id and stripe_checkout_session_id = p_session_id and stripe_payment_intent_id = p_payment_intent_id;
  if not found then raise exception 'RSVP add-on refund mismatch'; end if;
  update public.projects set project_data = jsonb_set(project_data, '{rsvp,purchased}', 'false'::jsonb, true), updated_at = now()
  where id = p_project_id and owner_id = p_owner_id;
end; $$;

revoke all on function public.refund_custom_invitation_payment(uuid, uuid, text, text) from public;
revoke all on function public.refund_rsvp_addon_payment(uuid, uuid, text, text) from public;
grant execute on function public.refund_custom_invitation_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.refund_rsvp_addon_payment(uuid, uuid, text, text) to service_role;

create or replace function public.get_public_project(p_public_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'project_data', jsonb_set(
      p.project_data,
      '{rsvp,purchased}',
      to_jsonb(exists (select 1 from public.rsvp_addon_purchases purchase where purchase.project_id = p.id and purchase.status = 'paid')),
      true
    ),
    'status', p.status,
    'payment_status', p.payment_status,
    'public_id', p.public_id,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'published_at', p.published_at,
    'expires_at', p.expires_at
  )
  from public.projects p
  where p.public_id = p_public_id and p.status = 'published' and p.payment_status = 'paid' and (p.expires_at is null or p.expires_at > now())
  limit 1;
$$;
revoke all on function public.get_public_project(text) from public;
grant execute on function public.get_public_project(text) to anon, authenticated;
