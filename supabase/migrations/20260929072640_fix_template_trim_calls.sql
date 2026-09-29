-- PostgreSQL exposes the SQL TRIM implementation as pg_catalog.btrim(text).
-- Qualifying pg_catalog.trim(text) therefore fails at runtime.

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
      pg_catalog.btrim(p_name), pg_catalog.lower(pg_catalog.btrim(p_slug)), coalesce(p_description, ''),
      coalesce(nullif(pg_catalog.btrim(p_category), ''), 'Autre'), coalesce(p_tags, '{}'),
      p_thumbnail_url, p_preview_image_url, private.sanitize_template_data(v_project.project_data),
      coalesce(p_is_published, false), coalesce(p_is_featured, false), coalesce(p_sort_order, 0),
      v_project.id, v_user_id
    ) returning * into v_template;
  else
    update public.templates template
    set name = pg_catalog.btrim(p_name),
        slug = pg_catalog.lower(pg_catalog.btrim(p_slug)),
        description = coalesce(p_description, ''),
        category = coalesce(nullif(pg_catalog.btrim(p_category), ''), 'Autre'),
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
    coalesce(nullif(pg_catalog.btrim(p_name), ''), v_template.name),
    private.sanitize_template_data(v_template.template_data),
    'draft', 'unpaid', null, null, v_now, v_now, null
  ) returning * into v_project;

  return v_project;
end;
$$;

revoke all on function public.publish_project_as_template(uuid, uuid, text, text, text, text, text[], text, text, boolean, integer, boolean) from public, anon, authenticated;
revoke all on function public.instantiate_project_from_template(uuid, text) from public, anon, authenticated;
grant execute on function public.publish_project_as_template(uuid, uuid, text, text, text, text, text[], text, text, boolean, integer, boolean) to authenticated;
grant execute on function public.instantiate_project_from_template(uuid, text) to authenticated;
