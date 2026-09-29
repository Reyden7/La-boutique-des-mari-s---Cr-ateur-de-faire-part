begin;

create temporary table template_test_results (
  test_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;
grant select, insert, update on template_test_results to anon, authenticated;

create temporary table template_test_context (
  user_id uuid not null,
  source_project_id uuid not null,
  published_template_id uuid not null,
  draft_template_id uuid not null
) on commit drop;
grant select, update on template_test_context to anon, authenticated;

do $$
declare
  v_user_id uuid;
  v_source_project_id uuid := extensions.gen_random_uuid();
  v_published_template_id uuid := extensions.gen_random_uuid();
  v_draft_template_id uuid := extensions.gen_random_uuid();
begin
  select id into v_user_id
  from auth.users
  where coalesce(is_anonymous, false) = false
  order by created_at
  limit 1;
  if v_user_id is null then raise exception 'No authenticated user available for transactional audit'; end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
  where id = v_user_id;

  insert into public.projects (
    id, owner_id, name, project_data, status, payment_status, public_id, published_at, expires_at
  ) values (
    v_source_project_id,
    v_user_id,
    'Template audit source',
    jsonb_build_object(
      'pages', jsonb_build_array(jsonb_build_object('id', 'page-test', 'name', 'Test', 'background', jsonb_build_object('type', 'color', 'color', '#ffffff'), 'elements', '[]'::jsonb)),
      'opening', jsonb_build_object('type', 'none', 'duration', 1),
      'audio', jsonb_build_object('enabled', false, 'source', null, 'volume', 0.7, 'loop', true, 'startMode', 'manual'),
      'particles', jsonb_build_object('enabled', false),
      'introductionMode', 'none',
      'ownerId', v_user_id,
      'status', 'published',
      'paymentStatus', 'paid',
      'publicId', 'source-public-id',
      'stripe_checkout_session_id', 'cs_forbidden',
      'stripe_payment_intent_id', 'pi_forbidden',
      'responses', jsonb_build_array(jsonb_build_object('email', 'private@example.invalid')),
      'orders', jsonb_build_array(jsonb_build_object('id', 'order-private')),
      'rsvp', jsonb_build_object('enabled', true, 'purchased', true, 'responses', jsonb_build_array('private'))
    ),
    'published', 'paid', 'audit-source-' || v_source_project_id::text, pg_catalog.now(), pg_catalog.now() + interval '1 day'
  );

  insert into public.templates (
    id, name, slug, description, category, template_data, is_published, created_by, source_project_id
  ) values
    (v_published_template_id, 'Audit published', 'audit-published-' || substr(v_published_template_id::text, 1, 8), '', 'Audit', '{"pages":[]}'::jsonb, true, v_user_id, v_source_project_id),
    (v_draft_template_id, 'Audit draft', 'audit-draft-' || substr(v_draft_template_id::text, 1, 8), '', 'Audit', '{"pages":[]}'::jsonb, false, v_user_id, v_source_project_id);

  insert into template_test_context values (v_user_id, v_source_project_id, v_published_template_id, v_draft_template_id);
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select user_id from template_test_context), 'role', 'authenticated', 'is_anonymous', false)::text,
  true
);
set local role authenticated;

insert into template_test_results
select 'non_admin_reads_only_published',
       count(*) = 1 and bool_and(is_published),
       format('visible=%s', count(*))
from public.templates
where id in ((select published_template_id from template_test_context), (select draft_template_id from template_test_context));

do $$
declare v_allowed boolean := false;
begin
  begin
    insert into public.templates (name, slug, category, template_data, created_by)
    values ('Forbidden', 'forbidden-non-admin', 'Audit', '{}'::jsonb, (select user_id from template_test_context));
    v_allowed := true;
  exception when others then null;
  end;
  insert into template_test_results values ('non_admin_insert_denied', not v_allowed, format('insert_allowed=%s', v_allowed));
end $$;

do $$
declare v_count integer := 0;
begin
  begin
    update public.templates set description = 'forbidden'
    where id = (select published_template_id from template_test_context);
    get diagnostics v_count = row_count;
  exception when others then v_count := 0;
  end;
  insert into template_test_results values ('non_admin_update_denied', v_count = 0, format('updated=%s', v_count));
end $$;

do $$
declare v_count integer := 0;
begin
  begin
    update public.templates set is_published = false
    where id = (select published_template_id from template_test_context);
    get diagnostics v_count = row_count;
  exception when others then v_count := 0;
  end;
  insert into template_test_results values ('non_admin_publish_change_denied', v_count = 0, format('updated=%s', v_count));
end $$;

do $$
declare v_count integer := 0;
begin
  begin
    delete from public.templates where id = (select published_template_id from template_test_context);
    get diagnostics v_count = row_count;
  exception when others then v_count := 0;
  end;
  insert into template_test_results values ('non_admin_delete_denied', v_count = 0, format('deleted=%s', v_count));
end $$;

do $$
declare v_allowed boolean := false;
begin
  begin
    perform public.duplicate_template((select published_template_id from template_test_context));
    v_allowed := true;
  exception when others then null;
  end;
  insert into template_test_results values ('non_admin_duplicate_denied', not v_allowed, format('duplicate_allowed=%s', v_allowed));
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare v_allowed boolean := false;
begin
  begin
    perform public.instantiate_project_from_template((select published_template_id from template_test_context), 'Anon forbidden');
    v_allowed := true;
  exception when others then null;
  end;
  insert into template_test_results values ('anonymous_rpc_denied', not v_allowed, format('rpc_allowed=%s', v_allowed));
end $$;

reset role;
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = (select user_id from template_test_context);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select user_id from template_test_context), 'role', 'authenticated', 'is_anonymous', false)::text,
  true
);
set local role authenticated;

insert into template_test_results
select 'admin_reads_published_and_draft', count(*) = 2, format('visible=%s', count(*))
from public.templates
where id in ((select published_template_id from template_test_context), (select draft_template_id from template_test_context));

do $$
declare
  v_admin_template_id uuid;
  v_duplicate_id uuid;
  v_count integer;
begin
  insert into public.templates (name, slug, category, template_data, created_by)
  values ('Admin CRUD', 'admin-crud-' || substr(extensions.gen_random_uuid()::text, 1, 8), 'Audit', '{}'::jsonb, (select user_id from template_test_context))
  returning id into v_admin_template_id;
  insert into template_test_results values ('admin_insert_allowed', v_admin_template_id is not null, 'admin insert returned an id');

  update public.templates set description = 'updated' where id = v_admin_template_id;
  get diagnostics v_count = row_count;
  insert into template_test_results values ('admin_update_allowed', v_count = 1, format('updated=%s', v_count));

  update public.templates set is_published = true where id = v_admin_template_id;
  get diagnostics v_count = row_count;
  insert into template_test_results values ('admin_publish_allowed', v_count = 1, format('updated=%s', v_count));

  update public.templates set is_published = false where id = v_admin_template_id;
  get diagnostics v_count = row_count;
  insert into template_test_results values ('admin_unpublish_allowed', v_count = 1, format('updated=%s', v_count));

  select id into v_duplicate_id
  from public.duplicate_template((select published_template_id from template_test_context));
  insert into template_test_results values ('admin_duplicate_allowed', v_duplicate_id is not null, 'duplicate RPC returned an id');

  delete from public.templates where id in (v_admin_template_id, v_duplicate_id);
  get diagnostics v_count = row_count;
  insert into template_test_results values ('admin_delete_allowed', v_count = 2, format('deleted=%s', v_count));
end $$;

do $$
declare
  v_template_id uuid;
  v_project_id uuid;
  v_template public.templates%rowtype;
  v_project public.projects%rowtype;
  v_forbidden_keys text[] := array[
    'ownerId', 'owner_id', 'status', 'paymentStatus', 'payment_status', 'publicId', 'public_id',
    'stripe_checkout_session_id', 'stripe_payment_intent_id', 'responses', 'orders'
  ];
begin
  select id into v_template_id
  from public.publish_project_as_template(
    (select source_project_id from template_test_context), null,
    'RPC audit', 'rpc-audit-' || substr(extensions.gen_random_uuid()::text, 1, 8),
    'Snapshot audit', 'Audit', array['audit'], null, null, false, 0, true
  );
  select * into v_template from public.templates where id = v_template_id;

  insert into template_test_results values (
    'snapshot_sensitive_fields_removed',
    not (v_template.template_data ?| v_forbidden_keys)
      and not (coalesce(v_template.template_data -> 'rsvp', '{}'::jsonb) ? 'responses'),
    'owner, commerce, Stripe, public id, responses and orders absent'
  );
  insert into template_test_results values (
    'snapshot_rsvp_not_purchased',
    coalesce((v_template.template_data #>> '{rsvp,purchased}')::boolean, false) = false,
    format('purchased=%s', coalesce(v_template.template_data #>> '{rsvp,purchased}', 'false'))
  );

  select id into v_project_id from public.instantiate_project_from_template(v_template_id, 'Instantiated audit');
  select * into v_project from public.projects where id = v_project_id;
  insert into template_test_results values (
    'instantiate_project_security',
    v_project.owner_id = (select user_id from template_test_context)
      and v_project.status = 'draft'
      and v_project.payment_status = 'unpaid'
      and v_project.public_id is null
      and v_project.published_at is null,
    format('owner_match=%s status=%s payment=%s public_id_null=%s',
      v_project.owner_id = (select user_id from template_test_context), v_project.status,
      v_project.payment_status, v_project.public_id is null)
  );
  insert into template_test_results values (
    'instantiate_rsvp_not_purchased',
    coalesce((v_project.project_data #>> '{rsvp,purchased}')::boolean, false) = false,
    format('purchased=%s', coalesce(v_project.project_data #>> '{rsvp,purchased}', 'false'))
  );
end $$;

reset role;

select jsonb_build_object(
  'all_passed', bool_and(passed),
  'tests', jsonb_agg(jsonb_build_object('name', test_name, 'passed', passed, 'detail', detail) order by test_name)
) as audit
from template_test_results;

rollback;
