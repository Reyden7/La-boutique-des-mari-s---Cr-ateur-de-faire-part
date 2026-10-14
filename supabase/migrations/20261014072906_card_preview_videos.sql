-- Card-only media. No publication/payment/content migration; old rows stay NULL.
alter table public.projects add column preview_video_path text;
alter table public.templates add column preview_video_path text;
grant update (preview_video_path) on public.projects to authenticated;
create unique index projects_preview_video_path_idx on public.projects(preview_video_path) where preview_video_path is not null;
create unique index templates_preview_video_path_idx on public.templates(preview_video_path) where preview_video_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('card-preview-videos','card-preview-videos',false,15728640,array['video/mp4','video/webm']);

-- Indexed, durable retirement queue. Only the corresponding owner/admin can
-- process a job; the actual byte deletion is performed by the Storage API.
create table public.preview_video_cleanup (
  storage_path text primary key,
  kind text not null check(kind in ('project','template')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(storage_path ~ '^(projects/[a-f0-9-]{36}/[a-f0-9-]{36}|templates/[a-f0-9-]{36})/[a-f0-9-]{36}\.(mp4|webm)$')
);
create index preview_video_cleanup_owner_idx on public.preview_video_cleanup(owner_id,created_at);
alter table public.preview_video_cleanup enable row level security;
revoke all on public.preview_video_cleanup from public,anon,authenticated;
grant select,insert,delete on public.preview_video_cleanup to authenticated;

create function private.preview_video_owned(p_kind text,p_path text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
    and case when p_kind = 'project' then
      p_path ~ '^projects/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(mp4|webm)$'
      and pg_catalog.split_part(p_path,'/',2) = (select auth.uid())::text
    when p_kind = 'template' then
      p_path ~ '^templates/[a-f0-9-]{36}/[a-f0-9-]{36}\.(mp4|webm)$'
      and (select private.is_admin())
    else false end;
$$;
revoke all on function private.preview_video_owned(text,text) from public,anon,authenticated;
grant execute on function private.preview_video_owned(text,text) to authenticated;

create policy "preview retirement reads" on public.preview_video_cleanup for select to authenticated
using (private.preview_video_owned(kind,storage_path));
create policy "preview retirement acknowledgements" on public.preview_video_cleanup for delete to authenticated
using (private.preview_video_owned(kind,storage_path));
-- This also permits queuing a successfully uploaded but unattached candidate
-- after a failed optimistic update, including network failures.
create policy "preview retirement rollback candidates" on public.preview_video_cleanup for insert to authenticated
with check(owner_id = (select auth.uid()) and private.preview_video_owned(kind,storage_path)
  and not exists(select 1 from public.projects where preview_video_path = storage_path)
  and not exists(select 1 from public.templates where preview_video_path = storage_path));

create policy "preview videos owner or published template reads" on storage.objects for select to anon,authenticated
using (bucket_id = 'card-preview-videos' and (
  (name like 'projects/%' and (select auth.uid()) is not null
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
    and pg_catalog.split_part(name,'/',2) = (select auth.uid())::text)
  or (name like 'templates/%' and exists(select 1 from public.templates t where t.preview_video_path = name and t.is_published))
  or (name like 'templates/%' and (select private.is_admin()))
));
create policy "preview videos immutable uploads" on storage.objects for insert to authenticated
with check(bucket_id = 'card-preview-videos' and (
  (private.preview_video_owned('project',name) and exists(select 1 from public.projects p
    where p.id::text = pg_catalog.split_part(name,'/',3) and p.owner_id = (select auth.uid())))
  or (private.preview_video_owned('template',name) and exists(select 1 from public.templates t
    where t.id::text = pg_catalog.split_part(name,'/',2)))
));
create policy "preview videos owner or admin cleanup" on storage.objects for delete to authenticated
using(bucket_id = 'card-preview-videos' and (private.preview_video_owned('project',name) or private.preview_video_owned('template',name)));
-- No UPDATE policy: replacements use a fresh UUID, never overwrite a CDN key.

create function private.validate_card_preview_path()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare prefix text; object_metadata jsonb;
begin
  if tg_op = 'UPDATE' and new.preview_video_path is not distinct from old.preview_video_path then return new; end if;
  if new.preview_video_path is null then return new; end if;
  if tg_table_name = 'projects' then prefix := 'projects/' || new.owner_id::text || '/' || new.id::text || '/';
  else prefix := 'templates/' || new.id::text || '/'; end if;
  if new.preview_video_path not like prefix || '%'
    or pg_catalog.substr(new.preview_video_path,pg_catalog.length(prefix)+1) !~ '^[a-f0-9-]{36}\.(mp4|webm)$' then
    raise exception 'Invalid preview video path' using errcode = '23514';
  end if;
  if exists(select 1 from public.preview_video_cleanup where storage_path = new.preview_video_path) then
    raise exception 'Retired preview path cannot be attached again' using errcode = '23514';
  end if;
  select metadata into object_metadata from storage.objects where bucket_id = 'card-preview-videos' and name = new.preview_video_path;
  if object_metadata is null or coalesce((object_metadata->>'size')::bigint,0) not between 1 and 15728640
    or (object_metadata->>'mimetype') is distinct from (case when new.preview_video_path like '%.mp4' then 'video/mp4' else 'video/webm' end) then
    raise exception 'Upload a valid preview video before attaching it' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_card_preview_path() from public,anon,authenticated;
create trigger validate_project_preview before insert or update of preview_video_path on public.projects
for each row execute function private.validate_card_preview_path();
create trigger validate_template_preview before insert or update of preview_video_path on public.templates
for each row execute function private.validate_card_preview_path();

-- Definer is narrowly scoped to inserting retirement jobs from trusted OLD
-- rows. It is private, has no callable client API and grants no Storage access.
create function private.queue_card_preview_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.preview_video_path is null then return null; end if;
  if tg_op = 'UPDATE' then
    if old.preview_video_path is not distinct from new.preview_video_path then return null; end if;
  end if;
    insert into public.preview_video_cleanup(storage_path,kind,owner_id)
    values(old.preview_video_path,case when tg_table_name = 'projects' then 'project' else 'template' end,
      (pg_catalog.to_jsonb(old)->>case when tg_table_name = 'projects' then 'owner_id' else 'created_by' end)::uuid)
    on conflict(storage_path) do nothing;
  return null;
end;
$$;
revoke all on function private.queue_card_preview_cleanup() from public,anon,authenticated;
create trigger retire_project_preview after update of preview_video_path or delete on public.projects
for each row execute function private.queue_card_preview_cleanup();
create trigger retire_template_preview after update of preview_video_path or delete on public.templates
for each row execute function private.queue_card_preview_cleanup();
