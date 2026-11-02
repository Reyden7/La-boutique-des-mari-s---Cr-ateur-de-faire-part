-- Additive metadata only: no existing project/template content or paid snapshot changes.
begin;
alter table public.templates add column invitation_category text not null default 'wedding'
 check(invitation_category in ('wedding','birth'));
create index templates_invitation_category_idx on public.templates(invitation_category,is_featured desc,sort_order) where is_published;
-- Existing admin-only policies and table privileges already cover this column.
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
    jsonb_set(private.sanitize_template_data(v_template.template_data),'{invitationCategory}',to_jsonb(v_template.invitation_category),true),
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
    name, slug, description, category, invitation_category, tags, theme, thumbnail_url, preview_image_url,
    template_data, is_published, is_featured, sort_order, version, source_project_id, created_by
  ) values (
    v_source.name || ' — copie', v_source.slug || '-copie-' || v_suffix, v_source.description,
    v_source.category, v_source.invitation_category, v_source.tags, v_source.theme, v_source.thumbnail_url, v_source.preview_image_url,
    v_source.template_data, false, false, v_source.sort_order + 1, 1, v_source.source_project_id,
    (select auth.uid())
  ) returning * into v_copy;
  return v_copy;
end;
$$;
-- CREATE OR REPLACE preserves the current function grants and ownership checks.
notify pgrst,'reload schema';
commit;
