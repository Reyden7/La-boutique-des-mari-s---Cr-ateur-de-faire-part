import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPublicationVersionsDb} from './publication-versions-db.fixture.mjs';
const migration='20261102100112_promo_usage_limits_reservations.sql';
async function fixture(t,apply=true) {
 const f=await setupPublicationVersionsDb(t);
 await f.db.exec(await f.file('20261029145330_promo_full_discount_free_publication.sql'));
 await f.db.exec(await f.file('20261102075451_rsvp_included_pricing_v3.sql'));
 if(apply)await f.db.exec(await f.file(migration));
 return f;
}
async function project(f,owner=f.owner) {
 const id=crypto.randomUUID(),recipient=crypto.randomUUID();await f.asOwner(owner);
 await f.db.query("insert into public.projects(id,owner_id,name,project_data) values($1,$2,'Synthetic promo', $3)",[id,owner,JSON.stringify({pages:[],rsvp:{enabled:true,fields:[{id:'food',label:'Repas',type:'short_text'}]}})]);
 await f.call('save_invitation_recipients',[id,0,JSON.stringify([{id:recipient,display_name:'Famille synthétique',guest_count:40,is_active:true}])]);await f.root();return {id,recipient,owner};
}
async function promo(f,code,rate=50,limit=1){await f.db.query('insert into public.promo_codes(code,discount_value,max_uses) values($1,$2,$3)',[code,rate,limit]);}
const quote=(f,p,code)=>f.call('reserve_confirmed_initial_publication',[p.id,p.owner,40,null,code,'paid-versions-v1',1649]);
const free=(f,p,code)=>f.call('complete_free_initial_publication',[p.id,p.owner,code,null,'paid-versions-v1',0]);
async function attach(f,r,id){await f.db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[r.id,id]);}

test('global unique: validation does not consume; reservation blocks another account; paid webhook and replay consume once',async t=>{
 const f=await fixture(t),p=await project(f),other=await project(f,f.other);await promo(f,'UNIQUE');
 for(let i=0;i<2;i++)assert.equal((await f.call('promo_code_availability',['unique'])).valid,true);
 assert.equal((await f.db.query('select count(*)::int n from public.promo_code_uses')).rows[0].n,0);
 const outcomes=await Promise.allSettled([quote(f,p,'UNIQUE'),quote(f,other,'UNIQUE')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/PROMO_RESERVED/);
 const r=outcomes.find(r=>r.status==='fulfilled').value;await attach(f,r,'cs_unique');
 assert.equal((await f.call('promo_code_availability',['UNIQUE'])).reason,'PROMO_RESERVED');
 await f.db.query("update public.promo_code_reservations set expires_at=now()-interval '2 days'");
 assert.equal((await f.call('promo_code_availability',['UNIQUE'])).reason,'PROMO_RESERVED','deadline alone cannot release deferred payment');
 await f.db.query('update public.promo_codes set is_active=false');
 await f.call('finalize_guest_checkout',[r.id,r.owner_id,'cs_unique','pi_unique',1649]);
 await f.call('finalize_guest_checkout',[r.id,r.owner_id,'cs_unique','pi_unique',1649]);
 await f.db.query('update public.promo_codes set is_active=true');
 assert.equal((await f.call('promo_code_availability',['UNIQUE'])).reason,'PROMO_USED');
 assert.equal((await f.db.query('select count(*)::int n from public.promo_code_uses')).rows[0].n,1);
 await f.call('release_promo_reservation',[r.id,'cs_unique','stripe_expired']);
 assert.equal((await f.call('promo_code_availability',['UNIQUE'])).reason,'PROMO_USED');
 await assert.rejects(()=>quote(f,other,'UNIQUE'),/PROMO_USED/);
});

test('failed free finalization rolls back both reservation and consumption',async t=>{
 const f=await fixture(t),p=await project(f);await promo(f,'ROLLBACK_FREE',100);
 await f.db.exec(`create function public.synthetic_fail() returns trigger language plpgsql as $$begin
 if new.status='published' then raise exception 'SYNTHETIC_FAILURE'; end if;return new;end$$;
 create trigger synthetic_fail before update on public.projects for each row execute function public.synthetic_fail();`);
 await assert.rejects(()=>free(f,p,'ROLLBACK_FREE'),/SYNTHETIC_FAILURE/);
 assert.equal((await f.call('promo_code_availability',['ROLLBACK_FREE'])).valid,true);
 for(const table of ['promo_code_uses','promo_code_reservations','free_publication_transactions'])assert.equal((await f.db.query(`select count(*)::int n from public.${table}`)).rows[0].n,0);
 await f.db.exec('drop trigger synthetic_fail on public.projects');assert.equal((await free(f,p,'ROLLBACK_FREE')).completed,true);
});

test('migration preserves existing codes and in-flight receipts; backfills reservation without repricing',async t=>{
 const f=await fixture(t,false),p=await project(f);await f.db.query("insert into public.promo_codes(code,discount_value) values('HISTORIC',50)");
 const r=await quote(f,p,'HISTORIC');await attach(f,r,'cs_historic');
 const before=(await f.db.query('select * from public.guest_license_payments where id=$1',[r.id])).rows[0];
 await f.db.exec(await f.file(migration));
 assert.deepEqual((await f.db.query('select * from public.guest_license_payments where id=$1',[r.id])).rows[0],before);
 assert.equal((await f.db.query('select max_uses from public.promo_codes')).rows[0].max_uses,null);
 await f.db.query('update public.promo_codes set max_uses=1');
 assert.equal((await f.call('promo_code_availability',['HISTORIC'])).reason,'PROMO_RESERVED');
 await f.call('finalize_guest_checkout',[r.id,p.owner,'cs_historic','pi_historic',1649]);
 assert.equal((await f.call('promo_code_availability',['HISTORIC'])).reason,'PROMO_USED');
});

test('free unique publication is atomic, idempotent, creates family links and preserves RSVP / paid version boundaries',async t=>{
 const f=await fixture(t),p=await project(f),other=await project(f,f.other);await promo(f,'FREE_UNIQUE',100);
 const first=await free(f,p,'FREE_UNIQUE');assert.equal(first.completed,true);
 const again=await free(f,p,'FREE_UNIQUE');assert.equal(again.transactionId,first.transactionId);
 await assert.rejects(()=>free(f,other,'FREE_UNIQUE'),/PROMO_USED/);
 const published=await f.projectRow(p.id);assert.equal(published.payment_status,'paid');assert.ok(published.active_version_id);
 const token=(await f.db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token;assert.ok(token);
 await f.call('submit_recipient_rsvp',[published.public_id,token,'{}','{}','confirmed',1]);
 await f.asOwner();await f.call('begin_publication_revision',[p.id,null]);await f.root();
 const revision=await f.call('reserve_version_publication',[p.id,p.owner,null,'paid-versions-v1',3299]);assert.equal(revision.amount_cents,3299);
 await free(f,p,'FREE_UNIQUE');
 assert.equal((await f.projectRow(p.id)).active_version_id,published.active_version_id,'replay never activates the unpaid revision');
 assert.equal((await f.db.query('select count(*)::int n from public.rsvp_responses where project_id=$1',[p.id])).rows[0].n,1);
 assert.equal((await f.db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token,token);
});

test('verified expiration releases; no generic failure, browser or anonymous caller can release a reservation',async t=>{
 const f=await fixture(t),p=await project(f),other=await project(f,f.other);await promo(f,'EXPIRED');
 const r=await quote(f,p,'EXPIRED');await attach(f,r,'cs_expired');
 await f.call('fail_guest_checkout',[r.id,'cs_expired']);
 await assert.rejects(()=>quote(f,other,'EXPIRED'),/PROMO_RESERVED/);
 await assert.rejects(()=>f.call('release_promo_reservation',[r.id,null,'timeout']),/PROMO_RELEASE_UNVERIFIED/);
 await assert.rejects(()=>f.call('release_promo_reservation',[r.id,'cs_expired',null]),/PROMO_RELEASE_UNVERIFIED/);
 await f.asOwner();await assert.rejects(()=>f.call('release_promo_reservation',[r.id,'cs_expired','stripe_expired']),/permission denied/);
 await f.root();await f.call('release_promo_reservation',[r.id,'cs_expired','stripe_expired']);
 assert.equal((await f.call('promo_code_availability',['EXPIRED'])).valid,true);
 const next=await quote(f,other,'EXPIRED');assert.ok(next.id);
 await assert.rejects(()=>f.call('finalize_guest_checkout',[r.id,p.owner,'cs_expired','pi_late',1649]),/PROMO_RESERVATION_NOT_ACTIVE/);
 assert.equal((await f.projectRow(p.id)).payment_status,'unpaid','late invalid finalization rolls back rights');
});

test('admin history, limits, disabled code and historical unlimited codes retain correct permissions',async t=>{
 const f=await fixture(t);await promo(f,'MULTI',50,null);await promo(f,'TWO',50,2);await promo(f,'DISABLED',100,1);
 await f.db.query("update public.promo_codes set is_active=false where code='DISABLED'");
 assert.equal((await f.call('promo_code_availability',['DISABLED'])).valid,false);
 await assert.rejects(()=>promo(f,'BAD',100,0),/check constraint/);
 for(let i=0;i<3;i++)await quote(f,await project(f),'MULTI');
 for(let i=0;i<2;i++)await quote(f,await project(f),'TWO');
 const third=await project(f);await assert.rejects(()=>quote(f,third,'TWO'),/PROMO_RESERVED/);
 await assert.rejects(()=>f.db.query("update public.promo_codes set max_uses=1 where code='TWO'"),/PROMO_LIMIT_BELOW_COMMITTED_USES/);
 await f.asOwner(f.other);await assert.rejects(()=>f.call('admin_promo_codes',[]),/ADMIN_REQUIRED/);
 await assert.rejects(()=>promo(f,'NOT_ADMIN',100,1),/row-level security|permission denied/);
 assert.equal((await f.db.query('select * from public.promo_code_reservations')).rows.length,0,'RLS hides reservations');
 await f.root();await f.db.query("update auth.users set raw_app_meta_data='{" + '"role":"admin"' + "}' where id=$1",[f.owner]);await f.asOwner();
 const history=await f.call('admin_promo_codes',[]);assert.equal(history.length,3);assert.equal(history.find(c=>c.code==='DISABLED').is_active,false);
 assert.equal(history.find(c=>c.code==='MULTI').max_uses,null);assert.equal(history.find(c=>c.code==='TWO').reserved_uses,2);
});
