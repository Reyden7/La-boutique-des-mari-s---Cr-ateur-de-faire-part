import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { setupGuestPricingDb } from "./guest-pricing-db.fixture.mjs";

test("guest-v2 PostgreSQL: exact capacity, promos, historical rights, refunds, RLS and ROLLBACK", {skip:!process.env.PGLITE_MODULE_PATH}, async (t) => {
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
  const db=new PGlite(); t.after(()=>db.close());
  const {file,owner,other,legacy}=await setupGuestPricingDb(db);
  const scalar=async(sql)=>(await db.query(sql)).rows[0];
  const id=async()=> (await scalar("select gen_random_uuid() as id")).id;
  const create=async(form=false)=>{
    const project=await id();
    await db.exec(`insert into public.projects(id,owner_id,name,project_data) values('${project}','${owner}','QA per guest','{"rsvp":{"enabled":${form}}}');`);
    return project;
  };
  const reserve=async(project,count,promo=null,previous=null)=>scalar(`select * from public.reserve_guest_checkout_v2('${project}','${owner}',${count},${previous?"'"+previous+"'":"null"},${promo?"'"+promo+"'":"null"})`);
  const attach=async(receipt)=>db.exec(`update public.guest_license_payments set stripe_checkout_session_id='cs_${receipt.id}' where id='${receipt.id}'`);
  const finalize=async(receipt)=>db.exec(`select public.finalize_guest_checkout('${receipt.id}','${owner}','cs_${receipt.id}','pi_${receipt.id}',${receipt.amount_cents})`);
  const refund=async(receipt)=>db.exec(`select public.refund_guest_checkout('${receipt.id}','${owner}','cs_${receipt.id}','pi_${receipt.id}',${receipt.amount_cents})`);
  const state=async(project)=>scalar(`select purchased_guest_capacity,purchased_extra_blocks,status,payment_status,project_data #>> '{rsvp,purchased}' as form,public_id from public.projects where id='${project}'`);
  const failure=async(operation,pattern)=>{
    await db.exec("savepoint rejection");
    try {await assert.rejects(operation,pattern);} finally {await db.exec("rollback to savepoint rejection; release savepoint rejection");}
  };
  // Historical paid and in-flight quotes BEFORE applying the new migration.
  const historical=await create(true);
  const old=await scalar(`select * from public.reserve_guest_checkout('${historical}','${owner}',53,null)`);
  await attach(old);await finalize(old);
  const pendingProject=await create();
  const pending=await scalar(`select * from public.reserve_guest_checkout('${pendingProject}','${owner}',41,null)`);
  await attach(pending);
  const snapshot=async()=> (await db.query(`
    select 'project' as source,to_jsonb(p) as data from public.projects p
    union all select 'publication',to_jsonb(p) from public.project_payments p
    union all select 'form',to_jsonb(p) from public.rsvp_addon_purchases p
    union all select 'receipt',to_jsonb(p)-'extra_guests'-'previous_guest_capacity'-'additional_guests' from public.guest_license_payments p
    order by source,data`)).rows;
  const before=await snapshot();
  await db.exec(await file("20261012061830_guest_per_person_pricing.sql"));
  assert.deepEqual(await snapshot(),before,"Migration must not alter historical amounts or rights");
  assert.equal((await state(historical)).purchased_guest_capacity,54);
  assert.equal((await state(legacy)).purchased_guest_capacity,null,"No retroactive quota on legacy publication");
  assert.equal((await scalar("select has_function_privilege('authenticated','public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text)','execute') as allowed")).allowed,false);
  assert.equal((await scalar("select has_function_privilege('anon','public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text)','execute') as allowed")).allowed,false);
  assert.equal((await scalar("select has_function_privilege('service_role','public.reserve_guest_checkout_v2(uuid,uuid,integer,text,text)','execute') as allowed")).allowed,true);
  await db.exec("begin");
  // In-flight v1 still finalizes with its original 29.00 amount and 47 rights.
  await finalize(pending);await finalize(pending);
  assert.equal((await state(pendingProject)).purchased_guest_capacity,47);
  assert.equal((await scalar(`select amount_cents from public.project_payments where project_id='${pendingProject}'`)).amount_cents,2900);
  await db.exec("insert into public.promo_codes(code,discount_value) values('QA10',10),('QA3333',33.33),('QA90',90)");
  let checks=0;
  for(const [count,price] of [[1,2450],[40,2450],[41,2550],[42,2650],[45,2950],[50,3450],[53,3750],[54,3850],[55,3950],[60,4450],[80,6450],[100,8450]]) {
    for(const form of [false,true]) for(const [promo,rate] of [[null,0],['QA10',10],['QA3333',33.33],['QA90',90]]) {
      const project=await create(form), quote=await reserve(project,count,promo);
      const subtotal=price+(form?990:0), discount=Math.round(subtotal*rate/100);
      assert.equal(quote.pricing_version,"guest-v2");assert.equal(quote.amount_cents,subtotal-discount);
      assert.equal(quote.subtotal_amount,subtotal);assert.equal(quote.discount_amount,discount);
      assert.equal(quote.guest_capacity,Math.max(40,count));assert.equal(quote.extra_guests,Math.max(0,count-40));
      assert.equal(quote.previous_guest_capacity,0);assert.equal(quote.additional_guests,Math.max(0,count-40));
      assert.equal(quote.extra_blocks,null);assert.equal(quote.previous_extra_blocks,null);assert.equal(quote.additional_blocks,null);
      await failure(()=>reserve(project,count),/CHECKOUT_BUSY/);
      await failure(()=>db.exec(`update public.guest_license_payments set amount_cents=1 where id='${quote.id}'`),/check constraint/);
      await failure(()=>db.exec(`update public.guest_license_payments set guest_capacity=999 where id='${quote.id}'`),/check constraint/);
      await attach(quote);await finalize(quote);await finalize(quote);
      const paid=await state(project);assert.equal(paid.purchased_guest_capacity,Math.max(40,count));assert.equal(paid.purchased_extra_blocks,null);
      assert.equal(paid.status,"published");assert.equal(paid.payment_status,"paid");assert.equal(paid.form,form?"true":"false");assert.ok(paid.public_id);
      if(form)assert.equal((await scalar(`select amount_cents from public.rsvp_addon_purchases where project_id='${project}'`)).amount_cents,990-Math.round(990*rate/100));
      if(promo)assert.equal((await scalar(`select count(*)::integer as n from public.promo_code_uses where project_id='${project}'`)).n,1);
      if(count===55&&form&&rate===10)assert.equal(quote.amount_cents,4446);
      checks++;
    }
  }
  for(const [current,requested,price] of [[40,41,100],[40,47,700],[40,54,1400],[47,54,700],[54,60,600],[53,54,100],[54,45,0]]) {
    const project=await create();const initial=await reserve(project,current);await attach(initial);await finalize(initial);
    if(!price){await failure(()=>reserve(project,requested),/CAPACITY_ALREADY_COVERED/);assert.equal((await state(project)).purchased_guest_capacity,current);continue;}
    const upgrade=await reserve(project,requested);assert.equal(upgrade.amount_cents,price);assert.equal(upgrade.previous_guest_capacity,current);assert.equal(upgrade.additional_guests,requested-current);
    assert.equal(upgrade.has_form,false);await failure(()=>reserve(project,requested,'QA10'),/PROMO_FIRST_PURCHASE_ONLY/);
    await attach(upgrade);await finalize(upgrade);await finalize(upgrade);assert.equal((await state(project)).purchased_guest_capacity,requested);
    await db.exec(`update public.projects set project_data=project_data||'{"requestedGuestCount":1}' where id='${project}'`);
    assert.equal((await state(project)).purchased_guest_capacity,requested);
    await refund(upgrade);await refund(upgrade);await finalize(upgrade);assert.equal((await state(project)).purchased_guest_capacity,current);
  }
  // Upgrade an old paid 54 capacity: ONLY 6 new guests, not a new base licence.
  const oldUpgrade=await reserve(historical,60);assert.equal(oldUpgrade.amount_cents,600);assert.equal(oldUpgrade.previous_guest_capacity,54);
  await attach(oldUpgrade);await finalize(oldUpgrade);assert.equal((await state(historical)).purchased_guest_capacity,60);
  await refund(oldUpgrade);assert.equal((await state(historical)).purchased_guest_capacity,54);
  assert.equal((await scalar(`select amount_cents from public.project_payments where project_id='${historical}'`)).amount_cents,4340);
  // Refund an intermediate upgrade: only its paid increment is revoked.
  const chainProject=await create();const base=await reserve(chainProject,40);await attach(base);await finalize(base);
  const mid=await reserve(chainProject,47);await attach(mid);await finalize(mid);
  const last=await reserve(chainProject,54);await attach(last);await finalize(last);
  await refund(mid);await finalize(mid);assert.equal((await state(chainProject)).purchased_guest_capacity,47);
  const earlyProject=await create(true);const early=await reserve(earlyProject,55,'QA10');await attach(early);await refund(early);await finalize(early);
  const refunded=await state(earlyProject);assert.equal(refunded.payment_status,'refunded');assert.equal(refunded.status,'draft');assert.equal(refunded.form,'false');assert.equal(refunded.purchased_guest_capacity,null);
  assert.equal((await scalar(`select count(*)::integer as n from public.promo_code_uses where project_id='${earlyProject}'`)).n,1,"Refund retains immutable promo audit");
  // Separate form purchase retains 9.90; initial quote must not charge it again.
  const separateProject=await create(true);
  await db.exec(`insert into public.rsvp_addon_purchases(project_id,owner_id,status,stripe_checkout_session_id) values('${separateProject}','${owner}','pending','cs_form_separate'); select public.finalize_rsvp_addon_payment('${separateProject}','${owner}','cs_form_separate','pi_form_separate',990);`);
  const separate=await reserve(separateProject,55);assert.equal(separate.amount_cents,3950);assert.equal(separate.has_form,false);
  await attach(separate);await finalize(separate);await refund(separate);assert.equal((await state(separateProject)).form,'true');
  await db.exec(`set local role authenticated;set request.jwt.claim.sub='${owner}';set request.jwt.claims='{"is_anonymous":false}';`);
  assert.ok((await db.query("select * from public.guest_license_payments")).rows.length>0);
  await failure(()=>db.exec(`update public.projects set purchased_guest_capacity=999 where id='${chainProject}'`),/permission denied/);
  await failure(()=>db.exec("update public.guest_license_payments set status='paid'"),/permission denied/);
  await failure(()=>reserve(chainProject,100),/permission denied/);
  await db.exec(`update public.projects set project_data=project_data||'{"purchasedGuestCapacity":999,"purchasedExtraBlocks":999,"publicationLicenseId":"forged"}' where id='${chainProject}'`);
  assert.equal((await scalar(`select project_data ? 'purchasedGuestCapacity' as forged from public.projects where id='${chainProject}'`)).forged,false);
  await db.exec(`set request.jwt.claim.sub='${other}';`);assert.equal((await db.query("select * from public.guest_license_payments")).rows.length,0);
  await db.exec("reset role;set local role anon");await failure(()=>db.query("select * from public.guest_license_payments"),/permission denied/);
  await db.exec("reset role;rollback");
  assert.deepEqual(await snapshot(),before,"ROLLBACK must restore every fixture, right and audit row");
  assert.equal((await scalar("select count(*)::integer as n from public.guest_license_payments where pricing_version='guest-v2'")).n,0);
  assert.equal((await db.query("select * from public.promo_code_uses")).rows.length,0);
  t.diagnostic(`${checks} SQL price/form/promo combinations, upgrades/refunds, v1 compatibility and RLS passed; ROLLBACK confirmed; no persistent audit rows`);
});
