-- Run only AFTER the envelope_global_assets_admin migration. All fixtures/roles
-- are rolled back. No Storage API call and no persisted audit data.
begin;
create temporary table envelope_audit_context as
select (select id from auth.users where not coalesce(is_anonymous,false) order by created_at limit 1) owner_id,
       (select id from auth.users where not coalesce(is_anonymous,false) order by created_at desc limit 1) other_id,
       extensions.gen_random_uuid() base_id,extensions.gen_random_uuid() flap_id,extensions.gen_random_uuid() seal_id,
       extensions.gen_random_uuid() project_id,extensions.gen_random_uuid() template_id;
create temporary table envelope_audit_results(test text,passed boolean) on commit drop;
grant select on envelope_audit_context to authenticated,service_role,anon;
grant insert,select on envelope_audit_results to authenticated,service_role,anon;
create function pg_temp.check_test(test_name text, condition boolean) returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then raise exception 'Audit failed: %',test_name; end if;
  insert into envelope_audit_results values(test_name,true);
end $$;
create function pg_temp.reject_test(test_name text, statement text, expected text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
  begin execute statement; exception when others then
    if sqlerrm !~ expected then raise; end if;
    rejected := true;
  end;
  perform pg_temp.check_test(test_name,rejected);
end $$;
do $$ begin if (select owner_id is null from envelope_audit_context) then raise exception 'Existing Auth account required'; end if; end $$;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')-'role' where id=(select owner_id from envelope_audit_context);
insert into public.global_assets(id,type,name,slug,url,storage_path,is_published,created_by)
select base_id,'envelope_base','QA base','qa-base-'||base_id,'https://example.invalid/storage/v1/object/public/global-assets/envelope/bases/'||base_id||'.png','envelope/bases/'||base_id||'.png',true,owner_id from envelope_audit_context
union all select flap_id,'envelope_flap','QA flap','qa-flap-'||flap_id,'https://example.invalid/storage/v1/object/public/global-assets/envelope/flaps/'||flap_id||'.webp','envelope/flaps/'||flap_id||'.webp',false,owner_id from envelope_audit_context
union all select seal_id,'envelope_seal','QA seal','qa-seal-'||seal_id,'https://example.invalid/storage/v1/object/public/global-assets/envelope/seals/'||seal_id||'.png','envelope/seals/'||seal_id||'.png',true,owner_id from envelope_audit_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','is_anonymous',false)::text,true) from envelope_audit_context;
set local role authenticated;
select pg_temp.check_test('non_admin_only_published',(select count(*)=2 from public.global_assets where id in (select base_id from envelope_audit_context union select flap_id from envelope_audit_context union select seal_id from envelope_audit_context)));
select pg_temp.reject_test('non_admin_insert',format('insert into public.global_assets(type,name,slug,url,created_by) values(%L,%L,%L,%L,%L)','envelope_base','Forbidden','forbidden-envelope','https://example.invalid/no',owner_id),'row-level security') from envelope_audit_context;
with changed as (update public.global_assets set name='Forbidden' where id=(select base_id from envelope_audit_context) returning id)
select pg_temp.check_test('non_admin_update',(select count(*)=0 from changed));
with changed as (update public.global_assets set is_published=false where id=(select base_id from envelope_audit_context) returning id)
select pg_temp.check_test('non_admin_publish_denied',(select count(*)=0 from changed));
with removed as (delete from public.global_assets where id=(select base_id from envelope_audit_context) returning id)
select pg_temp.check_test('non_admin_delete',(select count(*)=0 from removed));
select pg_temp.reject_test('non_admin_usage',format('select public.envelope_asset_usage(%L)',base_id),'ADMIN_REQUIRED') from envelope_audit_context;
select pg_temp.reject_test('non_admin_reserve_delete',format('select public.reserve_envelope_asset_deletion(%L)',base_id),'permission denied') from envelope_audit_context;
select pg_temp.reject_test('no_browser_storage_upload','insert into storage.objects(bucket_id,name) values (''global-assets'',''envelope/bases/forbidden.png'')','permission denied|row-level security');
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||'{"role":"admin"}' where id=(select owner_id from envelope_audit_context);
set local role authenticated;
select pg_temp.check_test('admin_reads_drafts',(select count(*)=3 from public.global_assets where id in (select base_id from envelope_audit_context union select flap_id from envelope_audit_context union select seal_id from envelope_audit_context)));
with added as (insert into public.global_assets(type,name,slug,url,storage_path,created_by) select 'envelope_seal','QA added','qa-added-'||base_id,'https://example.invalid/added.png','envelope/seals/added.png',owner_id from envelope_audit_context returning id)
select pg_temp.check_test('admin_insert_allowed',(select count(*)=1 from added));
update public.global_assets set name='Renamed',sort_order=8,is_published=false where id=(select base_id from envelope_audit_context);
select pg_temp.check_test('rename_order_depublish_stable_url',(select name='Renamed' and sort_order=8 and not is_published and url like '%/'||base_id||'.png' from public.global_assets,envelope_audit_context where id=base_id));
select pg_temp.reject_test('admin_cannot_change_url',format('update public.global_assets set url=%L where id=%L','https://example.invalid/new',base_id),'ENVELOPE_ASSET_IDENTITY_IMMUTABLE') from envelope_audit_context;
select pg_temp.reject_test('admin_cannot_direct_delete',format('delete from public.global_assets where id=%L',base_id),'USE_ENVELOPE_DELETE_FUNCTION') from envelope_audit_context;
select pg_temp.reject_test('admin_cannot_reserve_via_rpc',format('select public.reserve_envelope_asset_deletion(%L)',base_id),'permission denied') from envelope_audit_context;
select pg_temp.reject_test('admin_cannot_set_delete_state',format('update public.global_assets set delete_pending=true where id=%L',base_id),'SERVER_ONLY_DELETE_STATE') from envelope_audit_context;
reset role;
insert into public.projects(id,owner_id,name,project_data)
select project_id,other_id,'QA envelope references',jsonb_build_object('opening',jsonb_build_object('envelope',jsonb_build_object('baseAsset',jsonb_build_object('type','global','id',base_id,'url',url)))) from envelope_audit_context,public.global_assets where id=base_id;
insert into public.templates(id,name,slug,template_data,created_by)
select template_id,'QA envelope template','qa-envelope-'||template_id,jsonb_build_object('opening',jsonb_build_object('envelope',jsonb_build_object('baseAsset',jsonb_build_object('type','global','id',base_id,'url',url)))),other_id from envelope_audit_context,public.global_assets where id=base_id;
set local role authenticated;
select pg_temp.check_test('cross_owner_project_template_usage',(public.envelope_asset_usage(base_id)->>'projects')::int=1 and (public.envelope_asset_usage(base_id)->>'templates')::int=1) from envelope_audit_context;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select pg_temp.check_test('used_asset_deletion_blocked',(public.reserve_envelope_asset_deletion(base_id)->>'blocked')::boolean) from envelope_audit_context;
select pg_temp.check_test('unused_deletion_reserved',not (public.reserve_envelope_asset_deletion(seal_id)->>'blocked')::boolean) from envelope_audit_context;
select pg_temp.reject_test('cannot_publish_reserved',format('update public.global_assets set is_published=true where id=%L',seal_id),'global_assets_pending_unpublished') from envelope_audit_context;
select pg_temp.reject_test('cannot_save_pending_url',format('update public.projects set project_data=jsonb_build_object(''asset'',%L) where id=%L','https://example.invalid/storage/v1/object/public/global-assets/envelope/seals/'||seal_id||'.png',project_id),'ENVELOPE_ASSET_UNAVAILABLE') from envelope_audit_context;
-- Simulate successful Storage API removal; this audit never removes real objects.
select pg_temp.check_test('unused_delete_finalized',public.finish_envelope_asset_deletion(seal_id)) from envelope_audit_context;
select pg_temp.reject_test('cannot_save_deleted_cached_url',format('update public.projects set project_data=jsonb_build_object(''asset'',%L) where id=%L','https://example.invalid/storage/v1/object/public/global-assets/envelope/seals/'||seal_id||'.png',project_id),'ENVELOPE_ASSET_UNAVAILABLE') from envelope_audit_context;
select pg_temp.check_test('existing_unpublished_url_kept',(select project_data::text like '%'||a.url||'%' from public.projects p,public.global_assets a,envelope_audit_context c where p.id=c.project_id and a.id=c.base_id));
reset role;
select pg_temp.check_test('storage_bucket_unchanged',(select public and file_size_limit=20971520 from storage.buckets where id='global-assets'));
select * from envelope_audit_results order by test;
rollback;
