-- Global administrator-managed asset library.
-- Prepared locally only. Do not apply without explicit production approval.

create table public.global_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  type text not null check (char_length(type) between 2 and 60),
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  storage_path text,
  url text not null,
  thumbnail_url text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  category text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  source_asset_id uuid references public.assets(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index global_assets_library_idx
  on public.global_assets (type, is_published, is_featured desc, sort_order, created_at desc);
create index global_assets_creator_idx
  on public.global_assets (created_by, updated_at desc);
create unique index global_assets_source_type_idx
  on public.global_assets (source_asset_id, type)
  where source_asset_id is not null;

alter table public.global_assets enable row level security;
revoke all on table public.global_assets from anon, authenticated;
grant select on table public.global_assets to anon, authenticated;
grant insert, update, delete on table public.global_assets to authenticated;

create policy "published global assets are public"
on public.global_assets for select
to anon, authenticated
using (is_published or (select private.is_admin()));

create policy "admins create global assets"
on public.global_assets for insert
to authenticated
with check ((select private.is_admin()) and created_by = (select auth.uid()));

create policy "admins update global assets"
on public.global_assets for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins delete global assets"
on public.global_assets for delete
to authenticated
using ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'global-assets', 'global-assets', true, 20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav',
    'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
    'application/font-sfnt', 'application/font-woff'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public downloads use the public object endpoint. This policy also permits
-- authenticated/anonymous listing reads without granting any browser writes.
create policy "public reads global asset objects"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'global-assets');
