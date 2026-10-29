-- Local preparation: apply only with explicit deployment approval.
-- Envelope categories reuse global_assets (its existing type column is text).
alter table public.global_assets add column delete_pending boolean not null default false;
alter table public.global_assets add constraint global_assets_pending_unpublished check (not delete_pending or not is_published);
grant usage on schema private to service_role;
create index global_assets_envelope_url_idx on public.global_assets(url)
  where type in ('envelope_base','envelope_flap','envelope_seal');

-- Short per-asset advisory locks synchronize project/template saves and deletion.
-- Storage remains outside SQL transactions and is removed only via the Storage API.
create or replace function private.envelope_asset_usage(p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.global_assets; project_count bigint; template_count bigint;
begin
  if not coalesce(private.is_admin(), false) and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select * into a from public.global_assets where id=p_asset_id and type in ('envelope_base','envelope_flap','envelope_seal');
  if not found then raise exception 'ENVELOPE_ASSET_NOT_FOUND'; end if;
  select count(*) into project_count from public.projects
    where strpos(project_data::text, a.url)>0 or strpos(project_data::text, a.id::text)>0;
  select count(*) into template_count from public.templates
    where strpos(template_data::text, a.url)>0 or strpos(template_data::text, a.id::text)>0;
  return jsonb_build_object('projects',project_count,'templates',template_count);
end $$;

create or replace function public.envelope_asset_usage(p_asset_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.envelope_asset_usage(p_asset_id)
$$;

create or replace function private.reserve_envelope_asset_deletion(p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.global_assets; usage jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_asset_id::text, 731));
  select * into a from public.global_assets where id=p_asset_id and type in ('envelope_base','envelope_flap','envelope_seal') for update;
  if not found then raise exception 'ENVELOPE_ASSET_NOT_FOUND'; end if;
  usage := private.envelope_asset_usage(p_asset_id);
  if (usage->>'projects')::bigint + (usage->>'templates')::bigint > 0 then
    return usage || jsonb_build_object('blocked',true);
  end if;
  if exists(select 1 from public.global_assets other where other.id<>a.id and (other.url=a.url or other.storage_path=a.storage_path)) then
    raise exception 'ENVELOPE_STORAGE_SHARED_USE_DEPUBLISH';
  end if;
  if a.storage_path is null or a.storage_path !~ '^envelope/(bases|flaps|seals)/[a-zA-Z0-9_.-]+$' then
    raise exception 'UNSAFE_ENVELOPE_STORAGE_PATH';
  end if;
  update public.global_assets set delete_pending=true,is_published=false,updated_at=now() where id=p_asset_id;
  return usage || jsonb_build_object('blocked',false,'storagePath',a.storage_path);
end $$;

create or replace function public.reserve_envelope_asset_deletion(p_asset_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.reserve_envelope_asset_deletion(p_asset_id)
$$;

create or replace function private.finish_envelope_asset_deletion(p_asset_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare usage jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_asset_id::text, 731));
  usage := private.envelope_asset_usage(p_asset_id);
  if (usage->>'projects')::bigint + (usage->>'templates')::bigint > 0 then raise exception 'ENVELOPE_ASSET_IN_USE'; end if;
  delete from public.global_assets where id=p_asset_id and delete_pending and type in ('envelope_base','envelope_flap','envelope_seal');
  if not found then raise exception 'ENVELOPE_DELETION_NOT_RESERVED'; end if;
  return true;
end $$;

create or replace function public.finish_envelope_asset_deletion(p_asset_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.finish_envelope_asset_deletion(p_asset_id)
$$;

create or replace function private.protect_envelope_asset_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if old.type in ('envelope_base','envelope_flap','envelope_seal') and
      (not old.delete_pending or coalesce(auth.jwt()->>'role','') <> 'service_role') then
      raise exception 'USE_ENVELOPE_DELETE_FUNCTION' using errcode='42501';
    end if;
    return old;
  end if;
  if (tg_op='INSERT' and new.delete_pending) or
    (tg_op='UPDATE' and new.delete_pending is distinct from old.delete_pending) then
    if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'SERVER_ONLY_DELETE_STATE' using errcode='42501'; end if;
  end if;
  if tg_op='UPDATE' and (old.type in ('envelope_base','envelope_flap','envelope_seal') or new.type in ('envelope_base','envelope_flap','envelope_seal')) and
    (new.id is distinct from old.id or new.url is distinct from old.url or new.storage_path is distinct from old.storage_path or new.type is distinct from old.type or new.created_by is distinct from old.created_by) then
    raise exception 'ENVELOPE_ASSET_IDENTITY_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger protect_envelope_asset_identity before insert or update or delete on public.global_assets
for each row execute function private.protect_envelope_asset_identity();

-- Reject references saved while deletion is pending, AND stale cached URLs saved
-- after deletion. Other asset categories and existing payment/RSVP triggers are untouched.
create or replace function private.check_envelope_asset_references()
returns trigger language plpgsql security definer set search_path = '' as $$
declare document jsonb; matched text[]; asset_id uuid; asset_pending boolean;
begin
  document := case when tg_table_name='projects' then to_jsonb(new)->'project_data' else to_jsonb(new)->'template_data' end;
  for matched in select regexp_matches(document::text,
    'https?://[^"[:space:]]+/storage/v1/object/public/global-assets/envelope/(?:bases|flaps|seals)/[^"[:space:]]+', 'g') loop
    select id into asset_id from public.global_assets where url=matched[1] and type in ('envelope_base','envelope_flap','envelope_seal');
    if not found then raise exception 'ENVELOPE_ASSET_UNAVAILABLE'; end if;
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(asset_id::text, 731));
    select delete_pending into asset_pending from public.global_assets where id=asset_id;
    if not found or asset_pending then raise exception 'ENVELOPE_ASSET_UNAVAILABLE'; end if;
  end loop;
  return new;
end $$;
create trigger check_project_envelope_assets before insert or update of project_data on public.projects
for each row execute function private.check_envelope_asset_references();
create trigger check_template_envelope_assets before insert or update of template_data on public.templates
for each row execute function private.check_envelope_asset_references();

revoke all on function private.envelope_asset_usage(uuid),public.envelope_asset_usage(uuid) from public,anon;
grant execute on function private.envelope_asset_usage(uuid),public.envelope_asset_usage(uuid) to authenticated,service_role;
revoke all on function private.reserve_envelope_asset_deletion(uuid),public.reserve_envelope_asset_deletion(uuid),
  private.finish_envelope_asset_deletion(uuid),public.finish_envelope_asset_deletion(uuid) from public,anon,authenticated;
grant execute on function private.reserve_envelope_asset_deletion(uuid),public.reserve_envelope_asset_deletion(uuid),
  private.finish_envelope_asset_deletion(uuid),public.finish_envelope_asset_deletion(uuid) to service_role;
revoke all on function private.protect_envelope_asset_identity(),private.check_envelope_asset_references() from public,anon,authenticated;
