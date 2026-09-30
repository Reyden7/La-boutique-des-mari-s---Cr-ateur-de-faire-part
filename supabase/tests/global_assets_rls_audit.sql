-- Run after applying 20260930061120_global_admin_assets.sql.
-- Every mutation, including the temporary admin role, is rolled back.
begin;

create temporary table global_asset_test_results (
  test_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;
grant select, insert on global_asset_test_results to anon, authenticated;

create temporary table global_asset_test_context (user_id uuid, published_id uuid, draft_id uuid) on commit drop;
grant select on global_asset_test_context to anon, authenticated;

do $$
declare
  v_user uuid;
  v_published uuid := extensions.gen_random_uuid();
  v_draft uuid := extensions.gen_random_uuid();
begin
  select id into v_user from auth.users where coalesce(is_anonymous, false) = false order by created_at limit 1;
  if v_user is null then raise exception 'No authenticated user available for transactional audit'; end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' where id = v_user;
  insert into public.global_assets (id, type, name, slug, url, is_published, created_by) values
    (v_published, 'font', 'Audit published', 'global-audit-published-' || substr(v_published::text, 1, 8), 'https://example.invalid/published.woff2', true, v_user),
    (v_draft, 'font', 'Audit draft', 'global-audit-draft-' || substr(v_draft::text, 1, 8), 'https://example.invalid/draft.woff2', false, v_user);
  insert into global_asset_test_context values (v_user, v_published, v_draft);
end $$;

select set_config('request.jwt.claims', jsonb_build_object('sub', (select user_id from global_asset_test_context), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;

insert into global_asset_test_results
select 'non_admin_reads_only_published', count(*) = 1 and bool_and(is_published), format('visible=%s', count(*))
from public.global_assets where id in ((select published_id from global_asset_test_context), (select draft_id from global_asset_test_context));

do $$ declare v_allowed boolean := false; begin
  begin insert into public.global_assets (type, name, slug, url, created_by) values ('font', 'Forbidden', 'forbidden-global-audit', 'https://example.invalid/x', (select user_id from global_asset_test_context)); v_allowed := true; exception when others then null; end;
  insert into global_asset_test_results values ('non_admin_insert_denied', not v_allowed, format('allowed=%s', v_allowed));
end $$;

do $$ declare v_count integer := 0; begin
  begin update public.global_assets set is_published = false where id = (select published_id from global_asset_test_context); get diagnostics v_count = row_count; exception when others then v_count := 0; end;
  insert into global_asset_test_results values ('non_admin_update_denied', v_count = 0, format('updated=%s', v_count));
end $$;

do $$ declare v_count integer := 0; begin
  begin delete from public.global_assets where id = (select published_id from global_asset_test_context); get diagnostics v_count = row_count; exception when others then v_count := 0; end;
  insert into global_asset_test_results values ('non_admin_delete_denied', v_count = 0, format('deleted=%s', v_count));
end $$;

reset role;
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb where id = (select user_id from global_asset_test_context);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select user_id from global_asset_test_context), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;

insert into global_asset_test_results
select 'admin_reads_published_and_draft', count(*) = 2, format('visible=%s', count(*))
from public.global_assets where id in ((select published_id from global_asset_test_context), (select draft_id from global_asset_test_context));

do $$ declare v_id uuid; v_count integer; begin
  insert into public.global_assets (type, name, slug, url, created_by) values ('decoration', 'Admin CRUD', 'admin-global-' || substr(extensions.gen_random_uuid()::text, 1, 8), 'https://example.invalid/admin.webp', (select user_id from global_asset_test_context)) returning id into v_id;
  insert into global_asset_test_results values ('admin_insert_allowed', v_id is not null, 'insert returned id');
  update public.global_assets set name = 'Admin updated', is_published = true where id = v_id; get diagnostics v_count = row_count;
  insert into global_asset_test_results values ('admin_update_publish_allowed', v_count = 1, format('updated=%s', v_count));
  update public.global_assets set is_published = false where id = v_id; get diagnostics v_count = row_count;
  insert into global_asset_test_results values ('admin_unpublish_allowed', v_count = 1, format('updated=%s', v_count));
end $$;

reset role;
select * from global_asset_test_results order by test_name;
rollback;

