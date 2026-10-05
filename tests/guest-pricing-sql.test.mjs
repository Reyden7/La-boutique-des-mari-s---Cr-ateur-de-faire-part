import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Optional standalone PostgreSQL runtime for a real local transactional audit.
// Does not contact Supabase. Example: PGLITE_MODULE_PATH=/tmp/.../dist/index.js
test("PostgreSQL migration, RLS, publication/form, upgrades, refund and replay audit", { skip: !process.env.PGLITE_MODULE_PATH }, async (t) => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
  const db = new PGlite();
  t.after(() => db.close());
  const file = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
  const functionSql = (sql, name) => {
    const start = sql.indexOf(`create or replace function ${name}(`);
    assert.notEqual(start,-1,name);
    return sql.slice(start,sql.indexOf("$$;",start)+3);
  };
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
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
  await db.exec(`insert into auth.users values('${owner}'),('${other}');
    insert into public.projects(id,owner_id,name,project_data,status,payment_status,public_id) values('${legacy}','${owner}','Legacy','{}','published','paid','legacy-public');
    insert into public.project_payments(project_id,owner_id,amount_cents,status,stripe_checkout_session_id) values('${legacy}','${owner}',2490,'paid','legacy-cs');`);
  await db.exec(await file("20261005083522_guest_count_publication_pricing.sql"));
  const scalar = async (sql) => (await db.query(sql)).rows[0];
  assert.deepEqual(await scalar(`select amount_cents,pricing_version from public.project_payments where project_id='${legacy}'`),{amount_cents:2490,pricing_version:"legacy"});
  assert.equal((await scalar(`select purchased_guest_capacity from public.projects where id='${legacy}'`)).purchased_guest_capacity,null);
  await db.exec("begin");
  const expectFailure = async (operation, pattern) => {
    await db.exec("savepoint expected_rejection");
    try { await assert.rejects(operation, pattern); }
    finally { await db.exec("rollback to savepoint expected_rejection; release savepoint expected_rejection;"); }
  };
  // SQL independently recomputes every threshold; JavaScript is not its authority.
  for (const [guests,amount,capacity] of [[1,2450,40],[40,2450,40],[41,2900,47],[47,2900,47],[48,3350,54],[54,3350,54],[55,3800,61],[61,3800,61],[62,4250,68]]) {
    for (const form of [false,true]) {
      await db.exec("savepoint pricing_tier");
      const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      await db.exec(`insert into public.projects(id,owner_id,name,project_data) values('${id}','${owner}','Tier','{"rsvp":{"enabled":${form}}}');`);
      const quote = await scalar(`select * from public.reserve_guest_checkout('${id}','${owner}',${guests},null)`);
      assert.equal(quote.amount_cents,amount+(form?990:0)); assert.equal(quote.guest_capacity,capacity);
      await db.exec("rollback to savepoint pricing_tier; release savepoint pricing_tier");
    }
  }
  const project = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.exec(`insert into public.projects(id,owner_id,name,project_data) values('${project}','${owner}','Guest test','{"rsvp":{"enabled":true,"purchased":true}}');`);
  assert.equal((await scalar(`select project_data #>> '{rsvp,purchased}' as purchased from public.projects where id='${project}'`)).purchased,"false");
  const reserve = async (count) => scalar(`select * from public.reserve_guest_checkout('${project}','${owner}',${count},null)`);
  const attach = async (receipt,session) => db.exec(`update public.guest_license_payments set stripe_checkout_session_id='${session}' where id='${receipt.id}'`);
  const finalize = async (receipt,session,intent) => db.exec(`select public.finalize_guest_checkout('${receipt.id}','${owner}','${session}','${intent}',${receipt.amount_cents})`);
  const refund = async (receipt,session,intent) => db.exec(`select public.refund_guest_checkout('${receipt.id}','${owner}','${session}','${intent}',${receipt.amount_cents})`);
  const first = await reserve(53);
  assert.equal(first.amount_cents,4340); assert.equal(first.guest_capacity,54); assert.equal(first.has_form,true);
  await expectFailure(() => reserve(54),/CHECKOUT_BUSY/);
  await attach(first,"cs_first"); await finalize(first,"cs_first","pi_first"); await finalize(first,"cs_first","pi_first");
  let state = await scalar(`select status,payment_status,purchased_guest_capacity,purchased_extra_blocks,project_data #>> '{rsvp,purchased}' as form,public_id from public.projects where id='${project}'`);
  assert.equal(state.status,"published"); assert.equal(state.payment_status,"paid"); assert.equal(state.purchased_guest_capacity,54);
  assert.equal(state.purchased_extra_blocks,2); assert.equal(state.form,"true"); assert.ok(state.public_id);
  assert.equal((await scalar(`select amount_cents from public.rsvp_addon_purchases where project_id='${project}'`)).amount_cents,990);
  await expectFailure(() => reserve(50),/CAPACITY_ALREADY_COVERED/);
  const second = await reserve(68); assert.equal(second.amount_cents,900); assert.equal(second.has_form,false);
  await attach(second,"cs_second"); await finalize(second,"cs_second","pi_second");
  const third = await reserve(75); assert.equal(third.amount_cents,450);
  await attach(third,"cs_third"); await finalize(third,"cs_third","pi_third");
  await db.exec(`update public.projects set project_data=project_data || '{"requestedGuestCount":1}' where id='${project}'`);
  assert.equal((await scalar(`select purchased_guest_capacity from public.projects where id='${project}'`)).purchased_guest_capacity,75);
  await refund(second,"cs_second","pi_second"); await refund(second,"cs_second","pi_second");
  assert.equal((await scalar(`select purchased_guest_capacity from public.projects where id='${project}'`)).purchased_guest_capacity,61);
  await finalize(second,"cs_second","pi_second"); // Late replay cannot restore refunded blocks.
  assert.equal((await scalar(`select purchased_guest_capacity from public.projects where id='${project}'`)).purchased_guest_capacity,61);
  assert.equal((await scalar(`select public_id from public.projects where id='${project}'`)).public_id,state.public_id);
  // Owner can read receipts but not mutate paid rights, even in project_data.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}';`);
  assert.equal((await db.query("select * from public.guest_license_payments")).rows.length,3);
  await expectFailure(() => db.exec(`update public.projects set purchased_guest_capacity=999 where id='${project}'`),/permission denied/);
  await expectFailure(() => db.exec(`update public.guest_license_payments set status='paid'`),/permission denied/);
  await expectFailure(() => db.exec(`select public.reserve_guest_checkout('${project}','${owner}',100,null)`),/permission denied/);
  await db.exec(`update public.projects set project_data=project_data || '{"purchasedGuestCapacity":999,"rsvp":{"purchased":false}}' where id='${project}'`);
  const data = (await scalar(`select project_data from public.projects where id='${project}'`)).project_data;
  assert.equal(data.purchasedGuestCapacity,undefined); assert.equal(data.rsvp.purchased,true);
  await db.exec(`set request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query("select * from public.guest_license_payments")).rows.length,0);
  await db.exec("reset role; set role anon;");
  await expectFailure(() => db.query("select * from public.guest_license_payments"),/permission denied/);
  await db.exec("reset role");
  // Without an initial form, the independent 9.90 purchase still activates it.
  await db.exec("savepoint separate_form");
  const separateId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await db.exec(`insert into public.projects(id,owner_id,name,project_data) values('${separateId}','${owner}','Separate form','{"rsvp":{"enabled":false}}');`);
  const separate = await scalar(`select * from public.reserve_guest_checkout('${separateId}','${owner}',40,null)`);
  assert.equal(separate.amount_cents,2450);
  await attach(separate,"cs_separate_publication"); await finalize(separate,"cs_separate_publication","pi_separate_publication");
  await db.exec(`insert into public.rsvp_addon_purchases(project_id,owner_id,status,stripe_checkout_session_id) values('${separateId}','${owner}','pending','cs_form');
    select public.finalize_rsvp_addon_payment('${separateId}','${owner}','cs_form','pi_form',990);`);
  assert.equal((await scalar(`select project_data #>> '{rsvp,purchased}' as form from public.projects where id='${separateId}'`)).form,"true");
  assert.equal((await scalar(`select amount_cents from public.project_payments where project_id='${separateId}'`)).amount_cents,2450);
  // Full refund before completion is processed atomically; its late replay is inert.
  await refund(separate,"cs_separate_publication","pi_separate_publication");
  assert.equal((await scalar(`select project_data #>> '{rsvp,purchased}' as form from public.projects where id='${separateId}'`)).form,"true");
  await db.exec("rollback to savepoint separate_form; release savepoint separate_form");
  await db.exec("savepoint early_refund");
  await db.exec(`insert into public.projects(id,owner_id,name,project_data) values('${separateId}','${owner}','Early refund','{"rsvp":{"enabled":true}}');`);
  const early = await scalar(`select * from public.reserve_guest_checkout('${separateId}','${owner}',40,null)`);
  await attach(early,"cs_early"); await refund(early,"cs_early","pi_early"); await finalize(early,"cs_early","pi_early");
  assert.equal((await scalar(`select payment_status from public.projects where id='${separateId}'`)).payment_status,"refunded");
  await db.exec("rollback to savepoint early_refund; release savepoint early_refund");
  const snapshot = (await scalar(`select private.sanitize_template_data('{"requestedGuestCount":53,"purchasedGuestCapacity":54,"purchasedExtraBlocks":2,"publicationLicenseId":"source","publicId":"source","pages":[]}'::jsonb) as data`)).data;
  assert.deepEqual(snapshot,{pages:[]});
  await refund(first,"cs_first","pi_first"); await refund(first,"cs_first","pi_first");
  state = await scalar(`select status,payment_status,purchased_guest_capacity,project_data #>> '{rsvp,purchased}' as form from public.projects where id='${project}'`);
  assert.deepEqual(state,{status:"draft",payment_status:"refunded",purchased_guest_capacity:null,form:"false"});
  await finalize(first,"cs_first","pi_first");
  assert.equal((await scalar(`select status from public.projects where id='${project}'`)).status,"draft");
  await db.exec("rollback");
  assert.equal((await db.query(`select * from public.projects where id='${project}'`)).rows.length,0);
  assert.equal((await db.query("select * from public.guest_license_payments")).rows.length,0);
});
