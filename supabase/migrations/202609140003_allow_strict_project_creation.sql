-- Follow-up for databases where 202609140002 was already applied before
-- saveRemoteProject started inserting the protected initial values explicitly.
drop policy if exists "owners can create projects" on public.projects;
drop policy if exists "owners can create draft unpaid projects" on public.projects;

create policy "owners can create draft unpaid projects" on public.projects
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and status = 'draft'
    and payment_status = 'unpaid'
    and public_id is null
    and published_at is null
  );

revoke insert on table public.projects from anon;
revoke insert on table public.projects from authenticated;

grant insert (
  id,
  owner_id,
  name,
  project_data,
  status,
  payment_status,
  public_id,
  created_at,
  updated_at,
  published_at,
  expires_at
) on table public.projects to authenticated;
