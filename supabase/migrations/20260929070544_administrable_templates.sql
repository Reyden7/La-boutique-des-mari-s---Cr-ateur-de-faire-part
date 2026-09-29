-- Administrable, immutable template snapshots.
-- Prepared locally only: do not apply without explicit production approval.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users account
    where account.id = (select auth.uid())
      and account.raw_app_meta_data ->> 'role' = 'admin'
      and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  );
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

create table public.templates (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default 'Autre' check (char_length(category) between 1 and 80),
  tags text[] not null default '{}',
  theme text,
  thumbnail_url text,
  preview_image_url text,
  template_data jsonb not null check (jsonb_typeof(template_data) = 'object'),
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  version integer not null default 1 check (version > 0),
  source_project_id uuid references public.projects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index templates_gallery_order_idx
  on public.templates (is_published, is_featured desc, sort_order, created_at desc);
create index templates_category_idx
  on public.templates (category) where is_published;
create index templates_creator_idx
  on public.templates (created_by, updated_at desc);
create index templates_source_project_idx
  on public.templates (source_project_id) where source_project_id is not null;

alter table public.templates enable row level security;
revoke all on table public.templates from anon, authenticated;
grant select on table public.templates to anon, authenticated;
grant insert, update, delete on table public.templates to authenticated;

create policy "published templates are public"
on public.templates for select
to anon, authenticated
using (is_published or (select private.is_admin()));

create policy "admins create templates"
on public.templates for insert
to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
);

create policy "admins update templates"
on public.templates for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins delete templates"
on public.templates for delete
to authenticated
using ((select private.is_admin()));

create or replace function private.sanitize_template_data(p_project_data jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when clean ? 'rsvp' then pg_catalog.jsonb_set(
      clean,
      '{rsvp}',
      coalesce(clean -> 'rsvp', '{}'::jsonb) - 'responses' - 'submissions' || '{"purchased":false}'::jsonb,
      true
    )
    else clean
  end
  from (
    select coalesce(p_project_data, '{}'::jsonb)
      - 'id'
      - 'ownerId'
      - 'owner_id'
      - 'name'
      - 'createdAt'
      - 'created_at'
      - 'updatedAt'
      - 'updated_at'
      - 'status'
      - 'paymentStatus'
      - 'payment_status'
      - 'publicId'
      - 'public_id'
      - 'publishedAt'
      - 'published_at'
      - 'expiresAt'
      - 'expires_at'
      - 'stripe_checkout_session_id'
      - 'stripe_payment_intent_id'
      - 'responses'
      - 'orders' as clean
  ) sanitized;
$$;

revoke all on function private.sanitize_template_data(jsonb) from public, anon, authenticated;

create or replace function public.publish_project_as_template(
  p_project_id uuid,
  p_template_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_category text,
  p_tags text[],
  p_thumbnail_url text,
  p_preview_image_url text,
  p_is_featured boolean,
  p_sort_order integer,
  p_is_published boolean
)
returns public.templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project public.projects%rowtype;
  v_template public.templates%rowtype;
begin
  if v_user_id is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_project
  from public.projects project
  where project.id = p_project_id and project.owner_id = v_user_id;

  if not found then
    raise exception 'SOURCE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_template_id is null then
    insert into public.templates (
      name, slug, description, category, tags, thumbnail_url, preview_image_url,
      template_data, is_published, is_featured, sort_order, source_project_id, created_by
    ) values (
      pg_catalog.trim(p_name), pg_catalog.lower(pg_catalog.trim(p_slug)), coalesce(p_description, ''),
      coalesce(nullif(pg_catalog.trim(p_category), ''), 'Autre'), coalesce(p_tags, '{}'),
      p_thumbnail_url, p_preview_image_url, private.sanitize_template_data(v_project.project_data),
      coalesce(p_is_published, false), coalesce(p_is_featured, false), coalesce(p_sort_order, 0),
      v_project.id, v_user_id
    ) returning * into v_template;
  else
    update public.templates template
    set name = pg_catalog.trim(p_name),
        slug = pg_catalog.lower(pg_catalog.trim(p_slug)),
        description = coalesce(p_description, ''),
        category = coalesce(nullif(pg_catalog.trim(p_category), ''), 'Autre'),
        tags = coalesce(p_tags, '{}'),
        thumbnail_url = coalesce(p_thumbnail_url, template.thumbnail_url),
        preview_image_url = coalesce(p_preview_image_url, template.preview_image_url),
        template_data = private.sanitize_template_data(v_project.project_data),
        is_published = coalesce(p_is_published, false),
        is_featured = coalesce(p_is_featured, false),
        sort_order = coalesce(p_sort_order, 0),
        source_project_id = v_project.id,
        version = template.version + 1,
        updated_at = pg_catalog.now()
    where template.id = p_template_id
    returning * into v_template;

    if not found then
      raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_template;
end;
$$;

create or replace function public.instantiate_project_from_template(
  p_template_id uuid,
  p_name text default null
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_template public.templates%rowtype;
  v_project public.projects%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  if v_user_id is null
     or coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_template
  from public.templates template
  where template.id = p_template_id and template.is_published;

  if not found then
    raise exception 'TEMPLATE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.projects (
    id, owner_id, name, project_data, status, payment_status,
    public_id, published_at, created_at, updated_at, expires_at
  ) values (
    extensions.gen_random_uuid(),
    v_user_id,
    coalesce(nullif(pg_catalog.trim(p_name), ''), v_template.name),
    private.sanitize_template_data(v_template.template_data),
    'draft', 'unpaid', null, null, v_now, v_now, null
  ) returning * into v_project;

  return v_project;
end;
$$;

create or replace function public.duplicate_template(p_template_id uuid)
returns public.templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.templates%rowtype;
  v_copy public.templates%rowtype;
  v_suffix text := pg_catalog.substr(extensions.gen_random_uuid()::text, 1, 8);
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_source from public.templates where id = p_template_id;
  if not found then raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.templates (
    name, slug, description, category, tags, theme, thumbnail_url, preview_image_url,
    template_data, is_published, is_featured, sort_order, version, source_project_id, created_by
  ) values (
    v_source.name || ' — copie', v_source.slug || '-copie-' || v_suffix, v_source.description,
    v_source.category, v_source.tags, v_source.theme, v_source.thumbnail_url, v_source.preview_image_url,
    v_source.template_data, false, false, v_source.sort_order + 1, 1, v_source.source_project_id,
    (select auth.uid())
  ) returning * into v_copy;
  return v_copy;
end;
$$;

revoke all on function public.publish_project_as_template(uuid, uuid, text, text, text, text, text[], text, text, boolean, integer, boolean) from public, anon, authenticated;
revoke all on function public.instantiate_project_from_template(uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_template(uuid) from public, anon, authenticated;
grant execute on function public.publish_project_as_template(uuid, uuid, text, text, text, text, text[], text, text, boolean, integer, boolean) to authenticated;
grant execute on function public.instantiate_project_from_template(uuid, text) to authenticated;
grant execute on function public.duplicate_template(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'template-assets', 'template-assets', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-sfnt', 'application/font-woff']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload template assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'template-assets' and (select private.is_admin()));

create policy "admins update template assets"
on storage.objects for update to authenticated
using (bucket_id = 'template-assets' and (select private.is_admin()))
with check (bucket_id = 'template-assets' and (select private.is_admin()));

create policy "admins delete template assets"
on storage.objects for delete to authenticated
using (bucket_id = 'template-assets' and (select private.is_admin()));
