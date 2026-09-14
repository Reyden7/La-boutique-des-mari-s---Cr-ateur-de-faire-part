create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  project_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'expired')),
  public_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create unique index projects_public_id_idx on public.projects (public_id) where public_id is not null;

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio')),
  storage_path text not null unique,
  public_url text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index assets_project_idx on public.assets (project_id);

alter table public.projects enable row level security;
alter table public.assets enable row level security;

create policy "owners can read their projects" on public.projects
  for select using (owner_id = auth.uid());

create policy "published projects are publicly readable" on public.projects
  for select using (status = 'published' and public_id is not null);

create policy "owners can create projects" on public.projects
  for insert with check (owner_id = auth.uid());

create policy "owners can update projects" on public.projects
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners can delete projects" on public.projects
  for delete using (owner_id = auth.uid());

create policy "owners can read project assets" on public.assets
  for select using (owner_id = auth.uid());

create policy "published project assets are publicly readable" on public.assets
  for select using (exists (
    select 1 from public.projects
    where projects.id = assets.project_id
      and projects.status = 'published'
      and projects.public_id is not null
  ));

create policy "owners can create project assets" on public.assets
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from public.projects where projects.id = project_id and projects.owner_id = auth.uid())
  );

create policy "owners can update project assets" on public.assets
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners can delete project assets" on public.assets
  for delete using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wedding-assets',
  'wedding-assets',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav']
);

create policy "public invitation assets" on storage.objects
  for select using (bucket_id = 'wedding-assets');

create policy "users upload into their own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'wedding-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own assets" on storage.objects
  for update to authenticated using (
    bucket_id = 'wedding-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own assets" on storage.objects
  for delete to authenticated using (
    bucket_id = 'wedding-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
