alter table public.projects
  add column if not exists payment_status text not null default 'unpaid';

alter table public.projects
  drop constraint if exists projects_payment_status_check;

alter table public.projects
  add constraint projects_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'refunded'));

-- Legacy browser-published rows have no verifiable payment. They return to draft
-- and can go through Checkout normally; their editor data is preserved.
update public.projects
set status = 'draft', public_id = null, published_at = null
where payment_status = 'unpaid' and status = 'published';

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  amount_cents integer not null default 2490 check (amount_cents = 2490),
  currency text not null default 'eur' check (currency = 'eur'),
  status text not null default 'unpaid' check (status in ('unpaid', 'pending', 'paid', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists projects_id_owner_idx
  on public.projects (id, owner_id);

alter table public.project_payments
  drop constraint if exists project_payments_project_owner_fkey;
alter table public.project_payments
  add constraint project_payments_project_owner_fkey
  foreign key (project_id, owner_id)
  references public.projects (id, owner_id)
  on delete cascade;

create index if not exists project_payments_owner_idx
  on public.project_payments (owner_id, updated_at desc);

alter table public.project_payments enable row level security;

drop policy if exists "owners can read their project payments" on public.project_payments;
create policy "owners can read their project payments" on public.project_payments
  for select to authenticated
  using (owner_id = auth.uid());

revoke all on table public.project_payments from anon;
revoke insert, update, delete on table public.project_payments from authenticated;
grant select on table public.project_payments to authenticated;

-- Public rows are exposed only through get_public_project(public_id). This prevents
-- listing every published project through the projects REST endpoint.
drop policy if exists "published projects are publicly readable" on public.projects;

drop policy if exists "owners can update projects" on public.projects;
create policy "owners can update editable project fields" on public.projects
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke insert, update on table public.projects from anon;
revoke insert, update on table public.projects from authenticated;
grant insert (id, owner_id, name, project_data, created_at, updated_at, expires_at)
  on table public.projects to authenticated;
grant update (name, project_data, updated_at, expires_at)
  on table public.projects to authenticated;

create or replace function public.reject_client_publication_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status
     or new.public_id is distinct from old.public_id
     or new.published_at is distinct from old.published_at then
    raise exception 'Publication fields are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_project_publication_fields on public.projects;
create trigger protect_project_publication_fields
  before update on public.projects
  for each row execute function public.reject_client_publication_changes();

create or replace function public.touch_project_payment_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_payment_updated_at on public.project_payments;
create trigger set_project_payment_updated_at
  before update on public.project_payments
  for each row execute function public.touch_project_payment_updated_at();

create or replace function public.get_public_project(p_public_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'project_data', p.project_data,
    'status', p.status,
    'payment_status', p.payment_status,
    'public_id', p.public_id,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'published_at', p.published_at,
    'expires_at', p.expires_at
  )
  from public.projects p
  where p.public_id = p_public_id
    and p.status = 'published'
    and p.payment_status = 'paid'
    and (p.expires_at is null or p.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_public_project(text) from public;
grant execute on function public.get_public_project(text) to anon, authenticated;

create or replace function public.finalize_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.project_payments%rowtype;
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

  update public.project_payments
  set status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      paid_at = coalesce(paid_at, now())
  where id = v_payment.id;

  update public.projects
  set payment_status = 'paid',
      status = 'published',
      public_id = coalesce(public_id, encode(gen_random_bytes(18), 'hex')),
      published_at = coalesce(published_at, now())
  where id = p_project_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'Project does not match payment owner';
  end if;
end;
$$;

create or replace function public.fail_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.project_payments
  set status = 'unpaid'
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
    and status = 'pending';

  update public.projects
  set payment_status = 'unpaid'
  where id = p_project_id
    and owner_id = p_owner_id
    and payment_status = 'pending';
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
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
begin
  select id into v_payment_id
  from public.project_payments
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
    and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_payment_intent_id)
  for update;

  if v_payment_id is null then
    raise exception 'No project payment matches this refund';
  end if;

  update public.project_payments
  set status = 'refunded',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id)
  where id = v_payment_id;

  update public.projects
  set payment_status = 'refunded',
      status = 'draft'
  where id = p_project_id
    and owner_id = p_owner_id;
end;
$$;

revoke all on function public.finalize_project_payment(uuid, uuid, text, text) from public;
revoke all on function public.fail_project_payment(uuid, uuid, text) from public;
revoke all on function public.refund_project_payment(uuid, uuid, text, text) from public;
grant execute on function public.finalize_project_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_project_payment(uuid, uuid, text) to service_role;
grant execute on function public.refund_project_payment(uuid, uuid, text, text) to service_role;

drop policy if exists "published project assets are publicly readable" on public.assets;
create policy "paid published project assets are publicly readable" on public.assets
  for select using (exists (
    select 1 from public.projects
    where projects.id = assets.project_id
      and projects.status = 'published'
      and projects.payment_status = 'paid'
      and projects.public_id is not null
  ));
