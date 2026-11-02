import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPublicationVersionsDb} from './publication-versions-db.fixture.mjs';
const migration='20261102075451_rsvp_included_pricing_v3.sql';
async function fixture(t) {
 const f=await setupPublicationVersionsDb(t);
 await f.db.exec(await f.file('20261029145330_promo_full_discount_free_publication.sql'));
 const before=(await f.db.query('select to_jsonb(p) data from public.project_payments p')).rows;
 await f.db.exec(await f.file(migration));
 assert.deepEqual((await f.db.query('select to_jsonb(p) data from public.project_payments p')).rows,before,'historic orders untouched');
 return f;
}
async function create(f,count=40,enabled=true) {
 const id=crypto.randomUUID(),recipient=crypto.randomUUID();
 const design={pages:[{text:'Published'}],rsvp:{enabled,fields:[{id:'food',label:'Repas',type:'short_text'}]}};
 await f.asOwner();await f.db.query("insert into public.projects(id,owner_id,name,project_data) values($1,$2,'Synthetic v3',$3)",[id,f.owner,JSON.stringify(design)]);
 await f.call('save_invitation_recipients',[id,0,JSON.stringify([{id:recipient,display_name:'Famille Synthétique',guest_count:count,is_active:true}])]);await f.root();
 return {id,recipient,design};
}
test('v3 SQL: exact new prices, RSVP optional/included, persisted guest count and minimum capacity',async t=>{
 const f=await fixture(t);
 for(const [count,price] of [[1,3299],[40,3299],[41,3369],[50,3999],[100,7499]]) for(const form of [false,true]) {
  const p=await create(f,count,form);
  const r=await f.call('reserve_confirmed_initial_publication',[p.id,f.owner,999,null,null,'paid-versions-v1',price]);
  assert.equal(r.amount_cents,price);assert.equal(r.guest_count,count);assert.equal(r.guest_capacity,Math.max(40,count));assert.equal(r.has_form,false);assert.equal(r.pricing_version,'guest-v3');
 }
});
test('v3 SQL: free first snapshot, atomic replay, stable family tokens, paid revision, capacity and RSVP history',async t=>{
 const f=await fixture(t),{db,call,owner}=f;const p=await create(f);
 await db.exec("insert into public.promo_codes(code,discount_value) values('FREE_V3',100)");
 const args=[p.id,owner,'FREE_V3',null,'paid-versions-v1',0];
 const first=await call('complete_free_initial_publication',args);assert.equal(first.completed,true);
 assert.deepEqual(await call('complete_free_initial_publication',args),first);
 const receipt=(await db.query('select * from public.guest_license_payments where project_id=$1',[p.id])).rows[0];
 assert.equal(receipt.subtotal_amount,3299);assert.equal(receipt.amount_cents,0);assert.equal(receipt.stripe_checkout_session_id,null);
 assert.equal((await db.query('select * from public.rsvp_addon_purchases where project_id=$1',[p.id])).rows.length,0,'no fictitious add-on receipt');
 let row=await f.projectRow(p.id);const token=(await db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token;
 const live=await call('get_recipient_invitation',[row.public_id,token]);assert.equal(live.project.project_data.rsvp.purchased,true);
 await call('submit_recipient_rsvp',[row.public_id,token,'{"Repas":"Vegan"}','{"food":"Vegan"}','confirmed',4]);
 await assert.rejects(()=>call('submit_rsvp_response',[p.id,owner,'{}','synthetic']),/RSVP_UNAVAILABLE/,'household-only cannot use common route');
 await f.asOwner();assert.equal((await call('get_owner_rsvp_status',[p.id])).has_form,true);
 await call('begin_publication_revision',[p.id,null]);p.design.rsvp.enabled=false;
 await db.query('update public.projects set project_data=$2 where id=$1',[p.id,JSON.stringify(p.design)]);
 assert.equal((await call('get_owner_rsvp_status',[p.id])).has_form,true,'unpaid draft does not change published presence');
 await f.root();
 await assert.rejects(()=>call('reserve_guest_checkout_v2',[p.id,owner,999,null,'FREE_V3']),/PROMO_FIRST_PURCHASE_ONLY|CAPACITY_ALREADY_COVERED/);
 const version=await call('reserve_version_publication',[p.id,owner,null,'paid-versions-v1',3299]);
 assert.equal(version.has_form,false);assert.equal(version.pricing_version,'guest-v3');
 await db.query('update public.publication_version_payments set stripe_checkout_session_id=$2 where id=$1',[version.id,'cs_v3_revision']);
 await call('finalize_version_publication',[version.id,owner,'cs_v3_revision','pi_v3_revision',3299]);
 await assert.rejects(()=>call('submit_recipient_rsvp',[row.public_id,token,'{}','{}','confirmed',1]),/RSVP_UNAVAILABLE/);
 await f.asOwner();const status=await call('get_owner_rsvp_status',[p.id]);assert.equal(status.has_form,false);assert.equal(status.has_history,true);
 await f.asOwner(f.other);assert.deepEqual((await db.query('select * from public.get_owner_rsvp_status($1)',[p.id])).rows,[]);
 await f.root();await db.query('update public.invitation_recipients set guest_count=45 where id=$1',[p.recipient]);
 const upgrade=await call('reserve_guest_checkout_v2',[p.id,owner,1,null,null]);assert.equal(upgrade.amount_cents,350);assert.equal(upgrade.purchase_type,'guest_capacity_upgrade');
 await db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[upgrade.id,'cs_v3_upgrade']);
 await call('finalize_guest_checkout',[upgrade.id,owner,'cs_v3_upgrade','pi_v3_upgrade',350]);
 assert.equal((await f.projectRow(p.id)).purchased_guest_capacity,45);
 assert.equal((await db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token,token);
 assert.equal((await db.query('select count(*)::int n from public.rsvp_responses where project_id=$1',[p.id])).rows[0].n,1);
});
test('v3 migration preserves in-flight v2 receipts and delayed webhook finalization',async t=>{
 const f=await setupPublicationVersionsDb(t);await f.db.exec(await f.file('20261029145330_promo_full_discount_free_publication.sql'));
 const p=await create(f,50,true);
 const old=await f.call('reserve_confirmed_initial_publication',[p.id,f.owner,50,null,null,'paid-versions-v1',4440]);
 await f.db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[old.id,'cs_old_v2']);
 const original=(await f.db.query('select * from public.guest_license_payments where id=$1',[old.id])).rows[0];
 await f.db.exec(await f.file(migration));
 assert.deepEqual((await f.db.query('select * from public.guest_license_payments where id=$1',[old.id])).rows[0],original);
 await f.call('finalize_guest_checkout',[old.id,f.owner,'cs_old_v2','pi_old_v2',4440]);
 assert.equal((await f.projectRow(p.id)).purchased_guest_capacity,50);
 assert.equal((await f.db.query('select amount_cents from public.rsvp_addon_purchases where project_id=$1',[p.id])).rows[0].amount_cents,990);
});
test('v3 paid finalization uses server receipt, preserves snapshots on cancellation and exposes only owner status',async t=>{
 const f=await fixture(t),{db,owner,call}=f,p=await create(f,50,true);
 const receipt=await call('reserve_confirmed_initial_publication',[p.id,owner,1,null,null,'paid-versions-v1',3999]);
 await db.exec('set role service_role');
 await db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[receipt.id,'cs_v3_normal']);
 await call('finalize_guest_checkout',[receipt.id,owner,'cs_v3_normal','pi_v3_normal',3999]);
 await f.root();const paid=await f.projectRow(p.id);assert.equal(paid.payment_status,'paid');assert.equal(paid.purchased_guest_capacity,50);
 assert.equal((await call('get_public_project',[paid.public_id])).project_data.rsvp.purchased,false,'common URL cannot bypass personal invitation');
 const token=(await db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token;
 assert.equal((await call('get_recipient_invitation',[paid.public_id,token])).project.project_data.rsvp.purchased,true);
 await f.asOwner();await call('begin_publication_revision',[p.id,null]);
 await f.root();const version=await call('reserve_version_publication',[p.id,owner,null,'paid-versions-v1',3999]);
 await call('fail_version_publication',[version.id,null]);assert.equal((await f.projectRow(p.id)).active_version_id,paid.active_version_id);
 const first=await db.query('select * from public.project_payments where project_id=$1',[p.id]);
 assert.equal(first.rows[0].amount_cents,3999);assert.equal(first.rows[0].form_amount_cents,0);assert.equal(first.rows[0].includes_rsvp,false);
 await f.asOwner();await assert.rejects(()=>call('reserve_guest_checkout_v2',[p.id,owner,100,null,null]),/permission denied/);
 await assert.rejects(()=>call('complete_free_initial_publication',[p.id,owner,'FREE',null,'paid-versions-v1',0]),/permission denied/);
 await f.root();await db.exec('set role anon');await assert.rejects(()=>call('get_owner_rsvp_status',[p.id]),/permission denied/);
});
