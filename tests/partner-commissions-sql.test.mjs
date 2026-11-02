import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture,partnerMigration} from './partner-commissions-db.fixture.mjs';

test('partner creation deduplicates normalized names; admin permissions and decimal boundaries',async t=>{
 const f=await partnerFixture(t),p=await f.partner();const again=await f.partner(' vos précieux moments ');assert.equal(again.id,p.id);
 assert.equal((await f.db.query('select count(*)::int n from public.partners')).rows[0].n,1);
 await assert.rejects(()=>f.code(p,100.001),/check constraint/);await assert.rejects(()=>f.code(p,-1),/check constraint/);
 for(const rate of [0,15.25,100])assert.ok(await f.code(p,rate));
 await f.asOwner(f.other);await assert.rejects(()=>f.call('admin_save_partner',[null,'Attaque',null,null,true]),/ADMIN_REQUIRED/);
 assert.equal((await f.db.query('select * from public.partners')).rows.length,0);
});

test('discount and partner rate are independent; paid sale uses ex-tax cents, idempotent webhook and frozen quote rate',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),code=await f.code(p),sale=await f.quote(code);
 assert.equal(sale.receipt.amount_cents,2969);assert.equal((await f.db.query('select * from public.partner_commissions')).rows.length,0,'Apply/quote does not generate commission');
 await f.db.query('update public.promo_codes set partner_commission_rate=50 where code=$1',[code]);
 const c=await f.pay(sale);assert.equal(c.commission_rate,'15');assert.equal(c.commission_cents,445);assert.equal(c.status,'payable');
 await f.pay(sale);assert.equal((await f.db.query('select count(*)::int n from public.partner_commissions')).rows[0].n,1);
 const next=await f.quote(code);const d=await f.pay(next,495);assert.equal(d.base_cents,2474);assert.equal(d.commission_cents,1237);
 assert.equal((await f.commission(sale.receipt.id)).commission_cents,445);
 await assert.rejects(()=>f.call('confirm_partner_commission',[sale.receipt.id,sale.session,sale.intent,2969,1]),/COMMISSION_TAX_MISMATCH/);
});

test('confirmed sale remains pending until trusted tax evidence; free publication records zero; no partner no commission',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),code=await f.code(p),sale=await f.quote(code);
 await f.call('finalize_guest_checkout',[sale.receipt.id,f.owner,sale.session,sale.intent,2969]);assert.equal((await f.commission(sale.receipt.id)).status,'pending');
 await assert.rejects(()=>f.call('confirm_partner_commission',[sale.receipt.id,'wrong',sale.intent,2969,0]),/COMMISSION_PAYMENT_MISMATCH/);
 await f.pay(sale);
 const freeCode=await f.code(p,100,100),project=await f.project();const proof=await f.call('complete_free_initial_publication',[project.id,f.owner,freeCode,null,'paid-versions-v1',0]);assert.equal(proof.completed,true);
 const free=(await f.db.query('select * from public.partner_commissions where gross_cents=0')).rows[0];assert.equal(free.commission_cents,0);assert.equal(free.base_cents,0);
 const noPartner=await f.quote(await f.code(null));await f.pay(noPartner);assert.equal(await f.commission(noPartner.receipt.id),undefined);
});

test('partial/full refunds before settlement adjust or cancel without losing ledger; replay and older events do not double-adjust',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),sale=await f.quote(await f.code(p));const c=await f.pay(sale);
 await f.refund(sale,1000,'evt_partial');assert.equal((await f.commission(sale.receipt.id)).commission_cents,295);
 await f.refund(sale,1000,'evt_partial');await f.refund(sale,500,'evt_old');
 assert.equal((await f.db.query('select count(*)::int n from public.partner_commission_adjustments')).rows[0].n,1);
 await f.refund(sale,2969,'evt_full');assert.equal((await f.commission(sale.receipt.id)).status,'canceled');
 await assert.rejects(()=>f.settle(p,[c.id]),/COMMISSION_NOT_PAYABLE/);
});

test('manual settlement is admin-only, idempotent and atomic; paid refund preserves payment proof and records regularization',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),sale=await f.quote(await f.code(p)),c=await f.pay(sale),key=crypto.randomUUID();
 await f.asOwner(f.other);await assert.rejects(()=>f.call('admin_settle_partner_commissions',[key,p.id,'{'+c.id+'}',f.today,445,null]),/ADMIN_REQUIRED/);
 const settlement=await f.settle(p,[c.id],key);assert.equal(settlement.amount_cents,445);assert.equal(settlement.administrator_id,f.owner);
 const replay=await f.settle(p,[c.id],key);assert.equal(replay.id,key);
 await assert.rejects(()=>f.settle(p,[c.id]),/COMMISSION_NOT_PAYABLE/);
 await f.root();await f.refund(sale,2969);const after=await f.commission(sale.receipt.id);
 assert.equal(after.status,'paid');assert.equal(after.settled_cents,445);assert.equal(after.commission_cents,0);assert.equal(after.settlement_id,key);
 const adjustment=(await f.db.query('select * from public.partner_commission_adjustments where commission_id=$1',[c.id])).rows[0];assert.equal(adjustment.requires_regularization,true);assert.equal(adjustment.delta_cents,-445);
 await f.settle(p,[c.id],key);assert.equal((await f.db.query('select count(*)::int n from public.partner_settlements')).rows[0].n,1,'retry never repeats settlement after refund');
});

test('mixed partners, duplicate IDs and zero amounts cannot settle; no direct writes or customer ledger access',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),q=await f.partner('Autre partenaire'),a=await f.pay(await f.quote(await f.code(p))),b=await f.pay(await f.quote(await f.code(q)));
 await assert.rejects(()=>f.settle(p,[a.id,b.id]),/COMMISSION_NOT_PAYABLE/);await assert.rejects(()=>f.settle(p,[a.id,a.id]),/INVALID_COMMISSION_SELECTION/);
 await f.root();assert.equal((await f.commission(a.receipt_id)).status,'payable');
 await f.asOwner();await assert.rejects(()=>f.db.query('update public.partner_commissions set commission_cents=99999'),/permission denied/);
 await f.asOwner(f.other);for(const table of ['partners','partner_sale_attributions','partner_commissions','partner_settlements','partner_commission_adjustments'])assert.equal((await f.db.query('select * from public.'+table)).rows.length,0);
 await assert.rejects(()=>f.call('confirm_partner_commission',[a.receipt_id,'cs','pi',2969,0]),/permission denied/);
});

test('migration is additive: old sales have no retroactive attribution and receipts / family tokens / RSVP remain unchanged',async t=>{
 const f=await partnerFixture(t,false),p=await f.project();await f.db.query("insert into public.promo_codes(code,discount_value) values('HISTORY',10)");
 const r=await f.call('reserve_confirmed_initial_publication',[p.id,f.owner,40,null,'HISTORY','paid-versions-v1',2969]);await f.db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[r.id,'cs_historical_partner']);
 await f.call('finalize_guest_checkout',[r.id,f.owner,'cs_historical_partner','pi_historical_partner',2969]);const published=await f.projectRow(p.id);
 const token=(await f.db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token;
 await f.call('submit_recipient_rsvp',[published.public_id,token,'{}','{}','confirmed',1]);
 const old=(await f.db.query('select * from public.guest_license_payments where id=$1',[r.id])).rows[0];
 await f.db.exec(await f.file(partnerMigration));assert.equal((await f.db.query('select count(*)::int n from public.partner_commissions')).rows[0].n,0);
 assert.deepEqual((await f.db.query('select * from public.guest_license_payments where id=$1',[r.id])).rows[0],old);
 assert.equal((await f.db.query('select public_token from public.invitation_recipients where id=$1',[p.recipient])).rows[0].public_token,token);
 assert.equal((await f.db.query('select count(*)::int n from public.rsvp_responses where project_id=$1',[p.id])).rows[0].n,1);
});

test('refund arriving before payment webhook atomically confirms tax and cancels commission; stale settlement selection fails',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),sale=await f.quote(await f.code(p));
 await f.call('refund_guest_checkout',[sale.receipt.id,f.owner,sale.session,sale.intent,2969]);
 const pending=await f.commission(sale.receipt.id);assert.equal(pending.status,'pending');
 await f.refund(sale,2969);const canceled=await f.commission(sale.receipt.id);assert.equal(canceled.status,'canceled');assert.equal(canceled.commission_cents,0);
 await assert.rejects(()=>f.settle(p,[canceled.id]),/COMMISSION_NOT_PAYABLE/);
});

test('partner deactivation stops new attributions while existing quotes and paid versions keep their rules',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),code=await f.code(p),sale=await f.quote(code);
 await f.asOwner();await f.call('admin_save_partner',[p.id,p.name,null,null,false]);await f.root();
 const c=await f.pay(sale);assert.equal(c.commission_cents,445);
 const next=await f.quote(code);await f.pay(next);assert.equal(await f.commission(next.receipt.id),undefined);
 const published=await f.projectRow(sale.id);await f.asOwner();await f.call('begin_publication_revision',[sale.id,null]);await f.root();
 const version=await f.call('reserve_version_publication',[sale.id,f.owner,null,'paid-versions-v1',3299]);assert.equal(version.amount_cents,3299);
 await f.db.query('update public.publication_version_payments set stripe_checkout_session_id=$2 where id=$1',[version.id,'cs_partner_revision']);
 await f.call('finalize_version_publication',[version.id,f.owner,'cs_partner_revision','pi_partner_revision',3299]);
 assert.notEqual((await f.projectRow(sale.id)).active_version_id,published.active_version_id);
 assert.equal((await f.db.query('select count(*)::int n from public.partner_commissions')).rows[0].n,1);
});

test('refund changes the settlement total: stale confirmation is rejected instead of recording a different amount',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),sale=await f.quote(await f.code(p)),c=await f.pay(sale);
 await f.refund(sale,1000);
 await assert.rejects(()=>f.settle(p,[c.id],crypto.randomUUID(),445),/COMMISSION_TOTAL_CHANGED/);
 await f.root();assert.equal((await f.commission(sale.receipt.id)).status,'payable');assert.equal((await f.db.query('select count(*)::int n from public.partner_settlements')).rows[0].n,0);
 assert.equal((await f.settle(p,[c.id])).amount_cents,295);
});

test('abandoned checkout creates no commission; no new definer RPC is callable anonymously or ledger writable by browsers',async t=>{
 const f=await partnerFixture(t),p=await f.partner(),sale=await f.quote(await f.code(p));
 await f.call('fail_guest_checkout',[sale.receipt.id,sale.session]);assert.equal(await f.commission(sale.receipt.id),undefined);
 const exposed=(await f.db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('admin_save_partner','admin_settle_partner_commissions','confirm_partner_commission','refund_partner_commission')
  and has_function_privilege('anon',p.oid,'execute')`)).rows;assert.deepEqual(exposed,[]);
 const receipt=(await f.db.query('select to_jsonb(r) data from public.guest_license_payments r where id=$1',[sale.receipt.id])).rows[0].data;
 assert.equal(Object.keys(receipt).some(key=>/partner|commission/.test(key)),false);
 for(const table of ['partners','partner_sale_attributions','partner_commissions','partner_settlements','partner_commission_adjustments']){
  assert.equal((await f.db.query("select has_table_privilege('authenticated',$1,'update') allowed",['public.'+table])).rows[0].allowed,false);
 }
});
