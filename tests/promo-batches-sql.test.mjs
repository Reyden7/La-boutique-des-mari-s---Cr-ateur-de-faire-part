import test from 'node:test';import assert from 'node:assert/strict';
import {partnerFixture} from './partner-commissions-db.fixture.mjs';
const migration='20261102125927_promo_code_batches.sql';
async function fixture(t){
 const f=await partnerFixture(t);await f.db.exec(await f.file(migration));const partner=await f.partner();
 const input={partnerId:partner.id,prefix:'Vos Précieux Moments',department:'71',quantity:10,discount:10,commission:15,maxUses:1,active:true};
 const args=p=>[p.partnerId,p.prefix,p.department,p.quantity,p.discount,p.commission,p.maxUses,p.active];
 const preview=(overrides={})=>f.call('admin_preview_promo_batch',args({...input,...overrides}));
 const generate=(overrides={},id=crypto.randomUUID())=>f.call('admin_generate_promo_batch',[id,...args({...input,...overrides})]);
 return {...f,partnerRecord:partner,input,preview,generate};
}

test('batch preview is read-only, normalizes accents/ligatures and creates exactly 1 / 10 / 100 codes with separate departments',async t=>{
 const f=await fixture(t);const before=(await f.db.query('select count(*)::int n from public.promo_codes')).rows[0].n;
 const p=await f.preview();assert.equal(p.prefix,'VOSPRECIEUXMOMENTS');assert.equal(p.codes[0],'VOSPRECIEUXMOMENTS7101');assert.equal(p.codes.at(-1),'VOSPRECIEUXMOMENTS7110');
 assert.equal((await f.db.query('select count(*)::int n from public.promo_codes')).rows[0].n,before);assert.equal((await f.db.query('select count(*)::int n from public.promo_code_batch_sequences')).rows[0].n,0);
 for(const [quantity,department] of [[1,'71'],[10,'21'],[100,'971'],[1,'2a'],[1,'2B']]){
  const b=await f.generate({quantity,department});assert.equal(b.codes.length,quantity);assert.equal(new Set(b.codes.map(c=>c.code)).size,quantity);
  assert.equal(b.codes[0].department,department.toUpperCase());assert.equal(b.codes[0].batch_id,b.batchId);assert.equal(b.codes[0].max_uses,1);assert.equal(b.codes[0].partner_commission_rate,15);
  if(quantity===100)assert.equal(b.codes.at(-1).code,'VOSPRECIEUXMOMENTS971100');
 }
 assert.equal((await f.preview({prefix:'Cœur & Æther 42'})).prefix,'COEURAETHER42');
});

test('existing manual / disabled / consumed codes determine the next number and are never overwritten',async t=>{
 const f=await fixture(t);for(let i=1;i<=10;i++)await f.db.query('insert into public.promo_codes(code,discount_value,partner_id,partner_commission_rate,is_active,max_uses) values($1,10,$2,15,$3,1)',['VOSPRECIEUXMOMENTS71'+String(i).padStart(2,'0'),f.partnerRecord.id,i!==5]);
 const sale=await f.quote('VOSPRECIEUXMOMENTS7110');await f.pay(sale);
 await f.db.query("insert into public.promo_codes(code,discount_value) values('VOSPRECIEUXMOMENTS71LEGACY',10)");
 const before=(await f.db.query("select to_jsonb(c) d from public.promo_codes c order by code")).rows;
 const b=await f.generate({quantity:5});assert.deepEqual(b.codes.map(c=>c.code),[11,12,13,14,15].map(n=>'VOSPRECIEUXMOMENTS71'+n));
 const ids=before.map(r=>r.d.id);const after=(await f.db.query('select to_jsonb(c) d from public.promo_codes c where id=any($1::uuid[]) order by code',['{'+ids.join(',')+'}'])).rows;assert.deepEqual(after,before);
 assert.equal((await f.db.query('select count(*)::int n from public.promo_code_uses')).rows[0].n,1);
});

test('server serializes concurrent generation, global prefix collisions across partners and idempotent retries',async t=>{
 const f=await fixture(t);const outcomes=await Promise.all([f.generate(),f.generate()]);const codes=outcomes.flatMap(b=>b.codes.map(c=>c.code));assert.equal(new Set(codes).size,20);assert.ok(codes.includes('VOSPRECIEUXMOMENTS7120'));
 const key=crypto.randomUUID();const a=await f.generate({},key),b=await f.generate({},key);assert.deepEqual(b.codes,a.codes);
 await assert.rejects(()=>f.generate({quantity:5},key),/BATCH_REPLAY_MISMATCH/);
 const other=await f.partner('Autre partenaire');const c=await f.generate({partnerId:other.id,quantity:1});assert.equal(c.codes[0].code,'VOSPRECIEUXMOMENTS7131');
 await f.db.query('update public.promo_codes set code=$2 where id=$1',[c.codes[0].id,'CODE_MANUEL_RENOMME']);
 const next=await f.generate({partnerId:other.id,quantity:1});assert.equal(next.codes[0].code,'VOSPRECIEUXMOMENTS7132','persistent counter never rewinds even after rename');
});

test('SQL failure rolls back the complete batch, sequence counter and code inserts',async t=>{
 const f=await fixture(t);
 await f.db.exec(`create function public.synthetic_batch_failure() returns trigger language plpgsql as $$begin if new.batch_number=3 then raise exception 'SYNTHETIC_BATCH_FAILURE';end if;return new;end$$;
 create trigger synthetic_batch_failure before insert on public.promo_codes for each row execute function public.synthetic_batch_failure();`);
 await assert.rejects(()=>f.generate(),/SYNTHETIC_BATCH_FAILURE/);
 for(const table of ['promo_codes','promo_code_batches','promo_code_batch_sequences'])assert.equal((await f.db.query('select count(*)::int n from public.'+table)).rows[0].n,0);
 await f.db.exec('drop trigger synthetic_batch_failure on public.promo_codes');assert.equal((await f.generate({quantity:1})).codes[0].code,'VOSPRECIEUXMOMENTS7101');
});

test('administrator guard, active partner and all server bounds are enforced',async t=>{
 const f=await fixture(t);
 for(const overrides of [{quantity:0},{quantity:101},{department:'7'},{department:'2-A'},{department:'1234'},{prefix:'!!!'},{discount:0},{discount:101},{discount:1.001},{commission:-1},{commission:100.001},{maxUses:0},{active:null}])await assert.rejects(()=>f.generate(overrides),/BATCH_/);
 await f.asOwner(f.other);await assert.rejects(()=>f.generate(),/ADMIN_REQUIRED/);await assert.rejects(()=>f.preview(),/ADMIN_REQUIRED/);
 assert.equal((await f.db.query('select * from public.promo_code_batches')).rows.length,0);await assert.rejects(()=>f.db.query('select * from public.promo_code_batch_sequences'),/permission denied/);
 await f.asOwner();await f.call('admin_save_partner',[f.partnerRecord.id,f.partnerRecord.name,null,null,false]);await assert.rejects(()=>f.generate(),/BATCH_PARTNER_INACTIVE/);
 await f.root();const exposed=(await f.db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin_%promo_batch' and has_function_privilege('anon',p.oid,'execute')")).rows;assert.deepEqual(exposed,[]);
});

test('generated 100% code reuses atomic free publication, global usage and partner commission rules',async t=>{
 const f=await fixture(t),b=await f.generate({quantity:1,discount:100});const code=b.codes[0].code,project=await f.project();
 const proof=await f.call('complete_free_initial_publication',[project.id,f.owner,code,null,'paid-versions-v1',0]);assert.equal(proof.completed,true);
 const again=await f.call('complete_free_initial_publication',[project.id,f.owner,code,null,'paid-versions-v1',0]);assert.equal(again.transactionId,proof.transactionId);
 assert.equal((await f.call('promo_code_availability',[code])).reason,'PROMO_USED');
 const c=(await f.db.query('select commission_cents,commission_rate from public.partner_commissions')).rows[0];assert.equal(c.commission_cents,0);assert.equal(c.commission_rate,'15');
 const token=(await f.db.query('select public_token from public.invitation_recipients where id=$1',[project.recipient])).rows[0].public_token;assert.ok(token);
 await f.asOwner();const history=await f.call('admin_promo_codes',[]);assert.equal(history.find(c=>c.code===code).confirmed_uses,1);assert.equal(history.find(c=>c.code===code).batch_id,b.batchId);
});

test('long / huge-number manual codes fail safely, multiuse and inactive batches preserve manual creation',async t=>{
 const f=await fixture(t);await f.db.query("insert into public.promo_codes(code,discount_value) values('HUGE7199999999999999999999999999999999999999',10)");
 await assert.rejects(()=>f.generate({prefix:'HUGE'}),/BATCH_SEQUENCE_EXHAUSTED/);
 await assert.rejects(()=>f.generate({prefix:'A'.repeat(60),department:'71',quantity:100}),/BATCH_SEQUENCE_EXHAUSTED/);
 const b=await f.generate({quantity:2,maxUses:null,active:false});assert.ok(b.codes.every(c=>c.max_uses===null&&!c.is_active));
 await f.db.query("insert into public.promo_codes(code,discount_value) values('ANCIEN_MANUEL',100)");
 assert.equal((await f.db.query("select batch_id from public.promo_codes where code='ANCIEN_MANUEL'")).rows[0].batch_id,null);
});
