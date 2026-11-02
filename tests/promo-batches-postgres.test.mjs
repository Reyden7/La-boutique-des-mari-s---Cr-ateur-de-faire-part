import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import {existsSync} from 'node:fs';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import net from 'node:net';
const run=promisify(execFile);
const bin=process.env.PROMO_BATCH_PG_BIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'');
const exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
test('native PostgreSQL: independent administrator sessions, manual insertion race, idempotency and full rollback',
 {skip:!bin||!existsSync(exe('initdb')),timeout:90000},async()=>{
 const root=path.resolve('.sites-runtime');await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'promo-batch-pg-'));
 const data=path.join(dir,'data'),log=path.join(dir,'postgres.log');
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const env={...process.env,PGPASSWORD:'',PGPASSFILE:path.join(dir,'no-password-file'),PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'};
 const opts={windowsHide:true,env,maxBuffer:4*1024*1024,timeout:30000};let started=false;
 const psql=async(sql)=>{const {stdout}=await run(exe('psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','promo_batch_local','-d','postgres','-c',sql],opts);return stdout.trim();};
 const uid='11111111-1111-4111-8111-111111111111',partner='22222222-2222-4222-8222-222222222222';
 const asAdmin=`set request.jwt.claim.sub='${uid}';set role authenticated;`;
 const generate=(prefix,quantity=10,id=crypto.randomUUID())=>psql(`${asAdmin}select public.admin_generate_promo_batch('${id}','${partner}','${prefix}','71',${quantity},10,15,1,true);`).then(JSON.parse);
 try{
  await run(exe('initdb'),['-D',data,'-U','promo_batch_local','-A','trust','--encoding=UTF8','--no-locale'],opts);
  await run(exe('pg_ctl'),['start','-D',data,'-l',log,'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','20'],opts);started=true;
  const bootstrap=`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema private;create schema extensions;
   create table auth.users(id uuid primary key,raw_app_meta_data jsonb);
   insert into auth.users values('${uid}','{"role":"admin"}');
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='admin')$$;
   grant usage on schema private to authenticated;
   create function extensions.gen_random_uuid() returns uuid language sql as $$select pg_catalog.gen_random_uuid()$$;
   create table public.partners(id uuid primary key,name text not null,is_active boolean not null);
   insert into public.partners values('${partner}','Partenaire synthétique natif',true);
   create table public.promo_codes(id uuid primary key default gen_random_uuid(),code text not null unique,discount_type text default 'percentage',discount_value numeric not null,
    partner_id uuid references public.partners(id),partner_commission_rate numeric default 0,max_uses integer,is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now());
   alter table public.promo_codes enable row level security;grant select,insert,update on public.promo_codes to authenticated;
   create policy admin_codes on public.promo_codes for all to authenticated using(private.is_admin()) with check(private.is_admin());`;
  const file=path.join(dir,'schema.sql');await fs.writeFile(file,bootstrap+'\n'+await fs.readFile(new URL('../supabase/migrations/20261102125927_promo_code_batches.sql',import.meta.url),'utf8'));
  await run(exe('psql'),['-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','promo_batch_local','-d','postgres','-f',file],opts);
  const batches=await Promise.all(Array.from({length:6},()=>generate('CONCURRENT',20)));
  assert.equal(new Set(batches.flatMap(b=>b.codes.map(c=>c.code))).size,120);
  assert.equal(await psql("select count(*) from public.promo_codes where batch_prefix='CONCURRENT'"),'120');
  const id=crypto.randomUUID(),replays=await Promise.all(Array.from({length:4},()=>generate('REPLAY',10,id)));
  assert.ok(replays.every(b=>b.batchId===id));assert.deepEqual(replays[0].codes,replays[3].codes);
  assert.equal(await psql("select count(*) from public.promo_codes where batch_prefix='REPLAY'"),'10');

  // Hold a manual code uncommitted. The batch cannot see it in its initial scan;
  // its ON CONFLICT must wait for commit, skip that code and still create the full lot.
  const manual=psql("begin;insert into public.promo_codes(code,discount_value) values('RACE7101',10);select pg_advisory_xact_lock(731245);select pg_sleep(2);commit;");
  let locked=false;
  for(let i=0;i<15&&!locked;i++){
   locked=await psql("select not pg_try_advisory_lock(731245)")==='t';
   if(!locked)await new Promise(resolve=>setTimeout(resolve,30));
  }
  assert.equal(locked,true,'manual insertion is held in an independent transaction');
  const raced=await generate('RACE',10);await manual;
  assert.equal(raced.codes.length,10);assert.equal(raced.codes[0].code,'RACE7102');assert.equal(raced.codes.at(-1).code,'RACE7111');
  await psql(`create function public.fail_batch() returns trigger language plpgsql as $$begin if new.batch_prefix='FAIL' and new.batch_number=3 then raise exception 'SYNTHETIC_FAILURE';end if;return new;end$$;
   create trigger fail_batch before insert on public.promo_codes for each row execute function public.fail_batch();`);
  await assert.rejects(()=>generate('FAIL',10),/SYNTHETIC_FAILURE/);
  assert.equal(await psql("select (select count(*) from public.promo_codes where batch_prefix='FAIL')+(select count(*) from public.promo_code_batches where prefix='FAIL')+(select count(*) from public.promo_code_batch_sequences where prefix='FAIL')"),'0');
 }finally{
  if(started)await run(exe('pg_ctl'),['stop','-D',data,'-m','fast','-w','-t','20'],opts);
  // Keep only this newly-created local cluster/logs for review. Nothing is deleted remotely or locally.
 }
});
