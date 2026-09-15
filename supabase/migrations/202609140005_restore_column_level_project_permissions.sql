-- Keep row access governed by RLS while preventing authenticated clients from
-- writing server-managed publication and payment fields.
revoke insert, update on table public.projects from authenticated;

grant select, delete on table public.projects to authenticated;

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

grant update (
  name,
  project_data,
  updated_at,
  expires_at
) on table public.projects to authenticated;

revoke insert, update, delete on table public.project_payments from authenticated;
grant select on table public.project_payments to authenticated;
