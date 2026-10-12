import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setupGuestPricingDb } from "./guest-pricing-db.fixture.mjs";

// Optional standalone PostgreSQL runtime for a real local transactional audit.
// Does not contact Supabase. Example: PGLITE_MODULE_PATH=/tmp/.../dist/index.js
test("PostgreSQL migration, RLS, publication/form, upgrades, refund and replay audit", { skip: !process.env.PGLITE_MODULE_PATH }, async (t) => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
  const db = new PGlite();
  t.after(() => db.close());
  const { file, owner, other, legacy } = await setupGuestPricingDb(db);
  const promoAudit = await readFile(new URL("../supabase/tests/promo_codes_rls_audit.sql", import.meta.url), "utf8");
  const audit = await db.exec(promoAudit);
  const auditRows = audit.flatMap((result) => result.rows ?? []);
  const summary = auditRows.find((row) => row.passed != null && row.total != null);
  assert.ok(summary && summary.passed === summary.total && summary.total >= 100, JSON.stringify(auditRows));
  t.diagnostic(`Promo SQL/RLS audit: ${summary.passed}/${summary.total} assertions; ROLLBACK confirmed`);
  assert.equal((await db.query("select * from public.promo_codes")).rows.length,0);
  assert.equal((await db.query("select * from public.promo_code_uses")).rows.length,0);
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
