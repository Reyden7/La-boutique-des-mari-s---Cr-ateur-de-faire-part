-- Security and idempotency hardening for publication, custom orders and RSVP.
-- This migration intentionally follows 202609270006 so it is safe for projects
-- where that migration may already have been applied.

alter table public.custom_invitation_requests
  add constraint custom_invitation_reference_count_check
  check (cardinality(reference_urls) <= 5);

alter table public.rsvp_addon_purchases
  add constraint rsvp_addon_project_owner_fkey
  foreign key (project_id, owner_id)
  references public.projects (id, owner_id)
  on delete cascade;

alter table public.rsvp_responses
  add constraint rsvp_responses_project_owner_fkey
  foreign key (project_id, owner_id)
  references public.projects (id, owner_id)
  on delete cascade;

create index rsvp_addon_owner_updated_idx
  on public.rsvp_addon_purchases (owner_id, updated_at desc);

create index custom_invitation_status_created_idx
  on public.custom_invitation_requests (status, created_at desc);

-- Anonymous Supabase users also carry the PostgreSQL `authenticated` role.
-- Explicitly reject them on every owner-only policy.
drop policy if exists "owners can read their projects" on public.projects;
create policy "owners can read their projects" on public.projects
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners can create draft unpaid projects" on public.projects;
create policy "owners can create draft unpaid projects" on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and status = 'draft'
    and payment_status = 'unpaid'
    and public_id is null
    and published_at is null
  );

drop policy if exists "owners can update editable project fields" on public.projects;
create policy "owners can update editable project fields" on public.projects
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  )
  with check (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners can delete projects" on public.projects;
create policy "owners can delete projects" on public.projects
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "paid published project assets are publicly readable" on public.assets;
drop policy if exists "owners can read project assets" on public.assets;
create policy "owners can read project assets" on public.assets
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners can create project assets" on public.assets;
create policy "owners can create project assets" on public.assets
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and exists (
      select 1 from public.projects project
      where project.id = project_id and project.owner_id = (select auth.uid())
    )
  );

drop policy if exists "owners can update project assets" on public.assets;
create policy "owners can update project assets" on public.assets
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  )
  with check (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners can delete project assets" on public.assets;
create policy "owners can delete project assets" on public.assets
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners can read their project payments" on public.project_payments;
create policy "owners can read their project payments" on public.project_payments
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "users upload into their own folder" on storage.objects;
create policy "users upload into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wedding-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "users update their own assets" on storage.objects;
create policy "users update their own assets" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wedding-assets'
    and owner_id = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  )
  with check (
    bucket_id = 'wedding-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "users delete their own assets" on storage.objects;
create policy "users delete their own assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wedding-assets'
    and owner_id = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners read custom invitation requests" on public.custom_invitation_requests;
create policy "owners read custom invitation requests" on public.custom_invitation_requests
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners create custom invitation requests" on public.custom_invitation_requests;
create policy "owners create custom invitation requests" on public.custom_invitation_requests
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'draft'
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners edit unpaid custom invitation requests" on public.custom_invitation_requests;
create policy "owners edit unpaid custom invitation requests" on public.custom_invitation_requests
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and status = 'draft'
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  )
  with check (
    owner_id = (select auth.uid())
    and status = 'draft'
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners read rsvp purchases" on public.rsvp_addon_purchases;
create policy "owners read rsvp purchases" on public.rsvp_addon_purchases
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners read project rsvp responses" on public.rsvp_responses;
create policy "owners read project rsvp responses" on public.rsvp_responses
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and exists (
      select 1 from public.projects project
      where project.id = project_id and project.owner_id = (select auth.uid())
    )
  );

drop policy if exists "owners read custom request assets" on storage.objects;
create policy "owners read custom request assets" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'custom-request-assets'
    and owner_id = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners upload custom request assets" on storage.objects;
create policy "owners upload custom request assets" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'custom-request-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

drop policy if exists "owners delete custom request assets" on storage.objects;
create policy "owners delete custom request assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'custom-request-assets'
    and owner_id = (select auth.uid()::text)
    and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
  );

revoke all on public.assets from anon;

create or replace function public.enforce_rsvp_purchase_flag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.project_data := pg_catalog.jsonb_set(
    coalesce(new.project_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'rsvp',
        coalesce(new.project_data -> 'rsvp', '{}'::jsonb)
      ),
    '{rsvp,purchased}',
    pg_catalog.to_jsonb(exists (
      select 1
      from public.rsvp_addon_purchases purchase
      where purchase.project_id = new.id
        and purchase.owner_id = new.owner_id
        and purchase.status = 'paid'
    )),
    true
  );
  return new;
end;
$$;

revoke all on function public.enforce_rsvp_purchase_flag() from public, anon, authenticated;

create or replace function public.finalize_custom_invitation_payment(
  p_request_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.custom_invitation_requests%rowtype;
begin
  select * into v_request
  from public.custom_invitation_requests
  where id = p_request_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_session_id
    and amount_cents = p_amount_cents
  for update;

  if not found then
    raise exception 'Custom invitation payment mismatch';
  end if;

  if v_request.status in ('paid', 'in_progress', 'completed') then
    if v_request.stripe_payment_intent_id is distinct from p_payment_intent_id then
      raise exception 'Custom invitation PaymentIntent mismatch';
    end if;
    return;
  end if;

  if v_request.status <> 'pending_payment' then
    raise exception 'Custom invitation is not awaiting payment';
  end if;

  update public.custom_invitation_requests
  set status = 'paid',
      stripe_payment_intent_id = p_payment_intent_id,
      paid_at = coalesce(paid_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = v_request.id;
end;
$$;

create or replace function public.finalize_rsvp_addon_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.rsvp_addon_purchases%rowtype;
begin
  select * into v_purchase
  from public.rsvp_addon_purchases
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_session_id
    and amount_cents = p_amount_cents
  for update;

  if not found then
    raise exception 'RSVP add-on payment mismatch';
  end if;

  if v_purchase.status = 'paid' then
    if v_purchase.stripe_payment_intent_id is distinct from p_payment_intent_id then
      raise exception 'RSVP add-on PaymentIntent mismatch';
    end if;
  elsif v_purchase.status = 'pending' then
    update public.rsvp_addon_purchases
    set status = 'paid',
        stripe_payment_intent_id = p_payment_intent_id,
        paid_at = pg_catalog.coalesce(paid_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_purchase.id;
  else
    raise exception 'RSVP add-on is not awaiting payment';
  end if;

  update public.projects
  set project_data = pg_catalog.jsonb_set(
        coalesce(project_data, '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'rsvp',
            coalesce(project_data -> 'rsvp', '{}'::jsonb)
          ),
        '{rsvp,purchased}',
        'true'::jsonb,
        true
      ),
      updated_at = pg_catalog.now()
  where id = p_project_id and owner_id = p_owner_id;

  if not found then
    raise exception 'RSVP project owner mismatch';
  end if;
end;
$$;

create or replace function public.refund_custom_invitation_payment(
  p_request_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.custom_invitation_requests
  set status = 'cancelled',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      updated_at = pg_catalog.now()
  where id = p_request_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_session_id
    and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_payment_intent_id);

  if not found then
    raise exception 'Custom invitation refund mismatch';
  end if;
end;
$$;

create or replace function public.refund_rsvp_addon_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rsvp_addon_purchases
  set status = 'refunded',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      updated_at = pg_catalog.now()
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_session_id
    and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_payment_intent_id);

  if not found then
    raise exception 'RSVP add-on refund mismatch';
  end if;

  update public.projects
  set project_data = pg_catalog.jsonb_set(
        coalesce(project_data, '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'rsvp',
            coalesce(project_data -> 'rsvp', '{}'::jsonb)
          ),
        '{rsvp,purchased}',
        'false'::jsonb,
        true
      ),
      updated_at = pg_catalog.now()
  where id = p_project_id and owner_id = p_owner_id;
end;
$$;

create or replace function public.submit_rsvp_response(
  p_project_id uuid,
  p_owner_id uuid,
  p_answers jsonb,
  p_client_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response_id uuid;
  v_recent_count integer;
begin
  if not exists (
    select 1
    from public.projects project
    where project.id = p_project_id
      and project.owner_id = p_owner_id
      and project.status = 'published'
      and project.payment_status = 'paid'
      and (project.expires_at is null or project.expires_at > pg_catalog.now())
      and exists (
        select 1
        from public.rsvp_addon_purchases purchase
        where purchase.project_id = project.id
          and purchase.owner_id = project.owner_id
          and purchase.status = 'paid'
      )
  ) then
    raise exception 'RSVP_UNAVAILABLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_project_id::text || ':' || p_client_fingerprint, 0)
  );

  select pg_catalog.count(*) into v_recent_count
  from public.rsvp_responses response
  where response.project_id = p_project_id
    and response.client_fingerprint = p_client_fingerprint
    and response.created_at >= pg_catalog.now() - interval '10 minutes';

  if v_recent_count >= 5 then
    raise exception 'RSVP_RATE_LIMIT';
  end if;

  insert into public.rsvp_responses (
    project_id,
    owner_id,
    answers,
    client_fingerprint
  ) values (
    p_project_id,
    p_owner_id,
    p_answers,
    p_client_fingerprint
  ) returning id into v_response_id;

  return v_response_id;
end;
$$;

create or replace function public.get_public_project(p_public_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', project.id,
    'name', project.name,
    'project_data', pg_catalog.jsonb_set(
      coalesce(project.project_data, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'rsvp',
          coalesce(project.project_data -> 'rsvp', '{}'::jsonb)
        ),
      '{rsvp,purchased}',
      pg_catalog.to_jsonb(exists (
        select 1
        from public.rsvp_addon_purchases purchase
        where purchase.project_id = project.id
          and purchase.owner_id = project.owner_id
          and purchase.status = 'paid'
      )),
      true
    ),
    'public_id', project.public_id,
    'expires_at', project.expires_at
  )
  from public.projects project
  where project.public_id = p_public_id
    and project.status = 'published'
    and project.payment_status = 'paid'
    and (project.expires_at is null or project.expires_at > pg_catalog.now())
  limit 1;
$$;

-- Recreate the publication finalizer with a fully-qualified pgcrypto call.
create or replace function public.finalize_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.project_payments%rowtype;
begin
  select * into v_payment
  from public.project_payments
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
  for update;

  if not found then
    raise exception 'Payment does not match project, owner and Checkout Session';
  end if;

  if v_payment.status = 'refunded' then
    raise exception 'A refunded payment cannot publish a project';
  end if;

  if v_payment.stripe_payment_intent_id is not null
     and v_payment.stripe_payment_intent_id <> p_payment_intent_id then
    raise exception 'Publication PaymentIntent mismatch';
  end if;

  update public.project_payments
  set status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      paid_at = coalesce(paid_at, pg_catalog.now())
  where id = v_payment.id;

  update public.projects
  set payment_status = 'paid',
      status = 'published',
      public_id = coalesce(
        public_id,
        pg_catalog.encode(extensions.gen_random_bytes(18), 'hex')
      ),
      published_at = coalesce(published_at, pg_catalog.now())
  where id = p_project_id and owner_id = p_owner_id;

  if not found then
    raise exception 'Project does not match payment owner';
  end if;
end;
$$;

create or replace function public.fail_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.project_payments
  set status = 'unpaid'
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
    and status = 'pending';

  update public.projects
  set payment_status = 'unpaid'
  where id = p_project_id
    and owner_id = p_owner_id
    and payment_status = 'pending';
end;
$$;

create or replace function public.refund_project_payment(
  p_project_id uuid,
  p_owner_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  select id into v_payment_id
  from public.project_payments
  where project_id = p_project_id
    and owner_id = p_owner_id
    and stripe_checkout_session_id = p_checkout_session_id
    and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_payment_intent_id)
  for update;

  if v_payment_id is null then
    raise exception 'No project payment matches this refund';
  end if;

  update public.project_payments
  set status = 'refunded',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id)
  where id = v_payment_id;

  update public.projects
  set payment_status = 'refunded', status = 'draft'
  where id = p_project_id and owner_id = p_owner_id;
end;
$$;

revoke all on function public.finalize_custom_invitation_payment(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.finalize_rsvp_addon_payment(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.refund_custom_invitation_payment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.refund_rsvp_addon_payment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_rsvp_response(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.finalize_project_payment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_project_payment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.refund_project_payment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_public_project(text) from public, anon, authenticated;

grant execute on function public.finalize_custom_invitation_payment(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.finalize_rsvp_addon_payment(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.refund_custom_invitation_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.refund_rsvp_addon_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.submit_rsvp_response(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.finalize_project_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_project_payment(uuid, uuid, text) to service_role;
grant execute on function public.refund_project_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.get_public_project(text) to anon, authenticated;
