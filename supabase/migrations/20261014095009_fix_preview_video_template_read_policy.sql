-- Explicitly correlate against the outer Storage row. public.templates also
-- has a name column: an unqualified "name" inside the subquery binds to t.name.
alter policy "preview videos owner or published template reads" on storage.objects
using (bucket_id = 'card-preview-videos' and (
  (name like 'projects/%' and (select auth.uid()) is not null
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
    and pg_catalog.split_part(name,'/',2) = (select auth.uid())::text)
  or (name like 'templates/%' and exists (
    select 1 from public.templates t
    where t.preview_video_path = storage.objects.name and t.is_published
  ))
  or (name like 'templates/%' and (select private.is_admin()))
));

-- The same name collision applies to the parent lookup in INSERT policies.
-- Both public.projects and public.templates have their own name column.
alter policy "preview videos immutable uploads" on storage.objects
with check (bucket_id = 'card-preview-videos' and (
  (private.preview_video_owned('project',name) and exists (
    select 1 from public.projects p
    where p.id::text = pg_catalog.split_part(storage.objects.name,'/',3)
      and p.owner_id = (select auth.uid())
  ))
  or (private.preview_video_owned('template',name) and exists (
    select 1 from public.templates t
    where t.id::text = pg_catalog.split_part(storage.objects.name,'/',2)
  ))
));
