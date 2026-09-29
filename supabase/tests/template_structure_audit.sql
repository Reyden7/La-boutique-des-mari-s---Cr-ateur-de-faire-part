select jsonb_build_object(
  'table', (
    select jsonb_build_object(
      'exists', true,
      'rls_enabled', c.relrowsecurity,
      'columns', (
        select jsonb_agg(column_name order by ordinal_position)
        from information_schema.columns
        where table_schema = 'public' and table_name = 'templates'
      )
    ) from pg_class c where c.oid = 'public.templates'::regclass
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef) order by indexname)
    from pg_indexes where schemaname = 'public' and tablename = 'templates'
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'arguments', pg_get_function_identity_arguments(p.oid)
    ) order by n.nspname, p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' and p.proname in ('is_admin', 'sanitize_template_data'))
       or (n.nspname = 'public' and p.proname in ('publish_project_as_template', 'instantiate_project_from_template', 'duplicate_template'))
  ),
  'template_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by policyname)
    from pg_policies where schemaname = 'public' and tablename = 'templates'
  ),
  'bucket', (
    select to_jsonb(bucket) from (
      select id, name, public, file_size_limit, allowed_mime_types
      from storage.buckets where id = 'template-assets'
    ) bucket
  ),
  'storage_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%template assets%'
  ),
  'grants', (
    select jsonb_agg(jsonb_build_object('role', grantee, 'privilege', privilege_type) order by grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'templates' and grantee in ('anon', 'authenticated')
  )
) as audit;
