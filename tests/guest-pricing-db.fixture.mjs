import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/** In-memory test schema only; never contacts a hosted Supabase project. */
export async function setupGuestPricingDb(db) {
  const file = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
  const functionSql = (sql, name) => {
    const start = sql.indexOf(`create or replace function ${name}(`);
    assert.notEqual(start,-1,name);
    return sql.slice(start,sql.indexOf("$$;",start)+3);
  };
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema private;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb not null default '{}', is_anonymous boolean default false, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='admin') and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) $$;
    grant usage on schema private to authenticated;
    grant execute on function private.is_admin() to authenticated;
    create function extensions.gen_random_uuid() returns uuid language sql as $$ select pg_catalog.gen_random_uuid() $$;
    -- Only entropy helper is stubbed locally; production uses pgcrypto.
    create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$ select substring(decode(md5(random()::text)||md5(random()::text),'hex') from 1 for n) $$;
    create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id),name text not null,
      project_data jsonb not null default '{}',status text not null default 'draft',payment_status text not null default 'unpaid',
      public_id text unique,published_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),expires_at timestamptz,
      unique(id,owner_id));
    create table public.project_payments(id uuid primary key default extensions.gen_random_uuid(),project_id uuid not null unique references public.projects(id),
      owner_id uuid not null,amount_cents integer not null default 2490,currency text not null default 'eur',status text not null default 'unpaid',
      stripe_checkout_session_id text unique,stripe_payment_intent_id text unique,paid_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),
      constraint project_payments_amount_cents_check check(amount_cents=2490));
    create table public.rsvp_addon_purchases(id uuid primary key default extensions.gen_random_uuid(),project_id uuid not null unique references public.projects(id),
      owner_id uuid not null,status text not null default 'unpaid',amount_cents integer not null default 990,currency text not null default 'eur',
      stripe_checkout_session_id text unique,stripe_payment_intent_id text unique,paid_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.projects enable row level security;
    alter table public.project_payments enable row level security;
    alter table public.rsvp_addon_purchases enable row level security;
    create policy owner_select on public.projects for select to authenticated using(owner_id=(select auth.uid()));
    create policy owner_insert on public.projects for insert to authenticated with check(owner_id=(select auth.uid()) and status='draft' and payment_status='unpaid' and public_id is null and published_at is null);
    create policy owner_update on public.projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
    create policy owner_form_select on public.rsvp_addon_purchases for select to authenticated using(owner_id=(select auth.uid()));
    grant usage on schema public,auth to authenticated,service_role;
    grant select on public.projects,public.project_payments,public.rsvp_addon_purchases to authenticated;
    grant insert(id,owner_id,name,project_data,status,payment_status,public_id,created_at,updated_at,published_at,expires_at) on public.projects to authenticated;
    grant update(name,project_data,updated_at,expires_at) on public.projects to authenticated;
    grant all on public.projects,public.project_payments,public.rsvp_addon_purchases to service_role;
    create function private.sanitize_template_data(p_project_data jsonb) returns jsonb language sql immutable as $$
      select p_project_data - 'status' - 'paymentStatus' - 'ownerId' - 'publicId' $$;
  `);
  const hardening = await file("202609270007_backend_security_hardening.sql");
  await db.exec(functionSql(hardening,"public.enforce_rsvp_purchase_flag") + `
    create trigger enforce_rsvp_purchase_flag_on_projects before insert or update of project_data on public.projects
    for each row execute function public.enforce_rsvp_purchase_flag();
  ` + functionSql(hardening,"public.fail_project_payment"));
  await db.exec(functionSql(hardening,"public.finalize_rsvp_addon_payment"));
  await db.exec(await file("20260927135223_combined_publication_form.sql"));
  await db.exec(await file("20260927141244_fix_rsvp_addon_finalize_coalesce.sql"));
  // Existing paid orders must remain byte-for-byte unchanged by the migration.
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const legacy = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`insert into auth.users(id,raw_app_meta_data) values('${owner}','{"role":"admin"}'),('${other}','{}');
    insert into public.projects(id,owner_id,name,project_data,status,payment_status,public_id) values('${legacy}','${owner}','Legacy','{}','published','paid','legacy-public');
    insert into public.project_payments(project_id,owner_id,amount_cents,status,stripe_checkout_session_id) values('${legacy}','${owner}',2490,'paid','legacy-cs');`);
  await db.exec(await file("20261005083522_guest_count_publication_pricing.sql"));
  await db.exec(await file("20261007140545_promo_partner_codes.sql"));
  return { file, owner, other, legacy };
}
