import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPublicationVersionsDb} from './publication-versions-db.fixture.mjs';

const migration='20261029145330_promo_full_discount_free_publication.sql';
test('100% codes: admin bounds, atomic free publication, repeat/concurrent requests, paid snapshots, household links and RSVP',async t=>{
 const {db,file,owner,other,call,asOwner,root,projectRow}=await setupPublicationVersionsDb(t);
 await db.exec(await file(migration));
 await asOwner();
 await db.exec("insert into public.promo_codes(code,discount_value) values('FREE',100)");
 await assert.rejects(()=>db.exec("insert into public.promo_codes(code,discount_value) values('INVALID',101)"),/check constraint/);
 await assert.rejects(()=>db.exec("insert into public.promo_codes(code,discount_value) values('INVALID',0)"),/check constraint/);
 await asOwner(other);await assert.rejects(()=>db.exec("insert into public.promo_codes(code,discount_value) values('BYPASS',100)"),/row-level security/);
 const project=crypto.randomUUID(),recipient=crypto.randomUUID();
 const design={pages:[{text:'Original'}],rsvp:{enabled:true,allowResponseEditing:true,fields:[{id:'food',label:'Repas',type:'short_text'}]}};
 await asOwner();await db.query("insert into public.projects(id,owner_id,name,project_data) values($1,$2,'Gratuit',$3)",[project,owner,JSON.stringify(design)]);
 await call('save_invitation_recipients',[project,0,JSON.stringify([{id:recipient,display_name:'Famille',guest_count:4,is_active:true}])]);
 const args=[project,owner,'FREE',null,'paid-versions-v1',0];
 await assert.rejects(()=>call('complete_free_initial_publication',args),/permission denied/);
 await root();
 await assert.rejects(()=>call('complete_free_initial_publication',[project,other,'FREE',null,'paid-versions-v1',0]),/FORBIDDEN/);
 await assert.rejects(()=>call('complete_free_initial_publication',[project,owner,'FREE',null,'',0]),/PUBLICATION_TERMS_REQUIRED/);
 await assert.rejects(()=>call('complete_free_initial_publication',[project,owner,'MISSING',null,'paid-versions-v1',0]),/PROMO_UNAVAILABLE/);
 await db.exec("update public.promo_codes set is_active=false where code='FREE'");
 await assert.rejects(()=>call('complete_free_initial_publication',args),/PROMO_UNAVAILABLE/);
 await db.exec("update public.promo_codes set is_active=true where code='FREE'");
 // Inject a late failure, after evidence/usage/rights work has begun: everything rolls back.
 await db.exec("create function public.fail_free_test() returns trigger language plpgsql as $$begin if new.active_version_id is not null then raise exception 'SIMULATED_FAILURE'; end if; return new; end$$; create trigger fail_free_test before update on public.projects for each row execute function public.fail_free_test()");
 await assert.rejects(()=>call('complete_free_initial_publication',args),/SIMULATED_FAILURE/);
 assert.equal((await db.query('select count(*)::int n from public.promo_code_uses where project_id=$1',[project])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from public.free_publication_transactions where project_id=$1',[project])).rows[0].n,0);
 assert.equal((await projectRow(project)).payment_status,'unpaid');
 await db.exec('drop trigger fail_free_test on public.projects;drop function public.fail_free_test()');
 const [a,b]=await Promise.all([call('complete_free_initial_publication',args),call('complete_free_initial_publication',args)]);
 assert.equal(a.transactionId,b.transactionId);assert.equal(a.completed,true);
 let p=await projectRow(project);assert.equal(p.purchased_guest_capacity,40);assert.equal(p.active_version_id,a.publicationVersionId);assert.equal(p.payment_status,'paid');
 const receipt=(await db.query('select * from public.guest_license_payments where project_id=$1',[project])).rows[0];
 assert.equal(receipt.amount_cents,0);assert.equal(receipt.free_transaction_id,a.transactionId);assert.equal(receipt.stripe_checkout_session_id,null);assert.equal(receipt.stripe_payment_intent_id,null);
 const form=(await db.query('select * from public.rsvp_addon_purchases where project_id=$1',[project])).rows[0];assert.equal(form.amount_cents,0);assert.equal(form.status,'paid');
 const token=(await db.query('select public_token from public.invitation_recipients where id=$1',[recipient])).rows[0].public_token;assert.ok(token);
 assert.equal((await call('get_recipient_invitation',[p.public_id,token])).project.project_data.pages[0].text,'Original');
 await call('submit_recipient_rsvp',[p.public_id,token,'{"Repas":"Vegan"}','{"food":"Vegan"}','confirmed',4]);
 await assert.rejects(()=>call('finalize_guest_checkout',[receipt.id,owner,null,'pi_forged',0]),/STRIPE_REQUIRES_POSITIVE_ORDER/);
 await asOwner();await call('begin_publication_revision',[project,null]);design.pages[0].text='Unpaid draft';await db.query('update public.projects set project_data=$2 where id=$1',[project,JSON.stringify(design)]);
 await root();await call('complete_free_initial_publication',args);
 assert.equal((await call('get_recipient_invitation',[p.public_id,token])).project.project_data.pages[0].text,'Original');
 await db.query('update public.invitation_recipients set guest_count=41 where id=$1',[recipient]);
 await assert.rejects(()=>call('reserve_guest_checkout_v2',[project,owner,41,null,'FREE']),/PROMO_FIRST_PURCHASE_ONLY/);
 await db.query('update public.invitation_recipients set guest_count=4 where id=$1',[recipient]);
 // An ordinary paid new version excludes the already acquired RSVP option.
 const version=await call('reserve_version_publication',[project,owner,null,'paid-versions-v1',2450]);assert.equal(version.has_form,false);
 await db.query('update public.publication_version_payments set stripe_checkout_session_id=$2 where id=$1',[version.id,'cs_paid_version']);
 await call('finalize_version_publication',[version.id,owner,'cs_paid_version','pi_paid_version',2450]);
 await assert.rejects(()=>call('complete_free_initial_publication',args),/FREE_REPLAY_CONFLICT/);
 assert.equal((await projectRow(project)).active_version_id,version.version_id);
 assert.equal((await db.query('select public_token from public.invitation_recipients where id=$1',[recipient])).rows[0].public_token,token);
 assert.equal((await db.query('select count(*)::int n from public.rsvp_responses where recipient_id=$1',[recipient])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from public.promo_code_uses where project_id=$1',[project])).rows[0].n,1);
 await asOwner(other);assert.equal((await db.query('select * from public.free_publication_transactions')).rows.length,0);
 await asOwner();await assert.rejects(()=>db.query('delete from public.free_publication_transactions where project_id=$1',[project]),/permission denied/);
});

test('free initial publication: no form, legacy compatibility, separate form rights, partial discount rounded to zero',async t=>{
 const {db,file,owner,legacy,call,asOwner,root,projectRow}=await setupPublicationVersionsDb(t);await db.exec(await file(migration));
 const before=await projectRow(legacy);
 await db.exec("insert into public.promo_codes(code,discount_value) values('FREE',100),('ROUND',99.99),('HALF',50)");
 for(const [code,enabled,policy] of [['FREE',false,'paid_versions'],['ROUND',true,'paid_versions'],['FREE',false,'legacy']]){
  const id=crypto.randomUUID();await asOwner();await db.query("insert into public.projects(id,owner_id,name,project_data) values($1,$2,'Test',$3)",[id,owner,JSON.stringify({pages:[],rsvp:{enabled}})]);
  await call('save_invitation_recipients',[id,0,JSON.stringify([{id:crypto.randomUUID(),display_name:'Famille',guest_count:40,is_active:true}])]);
  await root();if(policy==='legacy')await db.query("update public.projects set publication_policy='legacy' where id=$1",[id]);
  await assert.rejects(()=>call('complete_free_initial_publication',[id,owner,'HALF',null,'paid-versions-v1',0]),/PUBLICATION_PRICE_CHANGED|FREE_QUOTE_REQUIRED/);
  const proof=await call('complete_free_initial_publication',[id,owner,code,null,'paid-versions-v1',0]);assert.equal(proof.completed,true);assert.equal((await projectRow(id)).purchased_guest_capacity,40);
 }
 assert.deepEqual(await projectRow(legacy),before);
 await assert.rejects(()=>call('complete_free_initial_publication',[legacy,owner,'FREE',null,'paid-versions-v1',0]),/PROMO_FIRST_PURCHASE_ONLY/);
});
