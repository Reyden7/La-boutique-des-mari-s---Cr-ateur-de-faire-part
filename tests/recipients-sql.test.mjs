import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {setupGuestPricingDb} from './guest-pricing-db.fixture.mjs';

test('recipient PostgreSQL: isolation, server pricing, stable tokens, paid capacity and current RSVP',async t=>{
 const db=new PGlite();t.after(()=>db.close());const {file,owner,other,legacy}=await setupGuestPricingDb(db);
 await db.exec(await file('20261029122005_guest_per_person_pricing.sql'));
 await db.exec(`create table public.rsvp_responses(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id) on delete cascade,owner_id uuid references auth.users(id) on delete cascade,answers jsonb not null,client_fingerprint text,created_at timestamptz default now());
 alter table public.rsvp_responses enable row level security;grant select on public.rsvp_responses to authenticated;
 create policy owner_response on public.rsvp_responses to authenticated using(owner_id=auth.uid());
 create function public.get_public_project(p_public_id text) returns jsonb language sql security definer set search_path='' as $$select jsonb_build_object('id',p.id,'name',p.name,'public_id',p.public_id,'project_data',p.project_data) from public.projects p where p.public_id=p_public_id and p.status='published' and p.payment_status='paid' and (p.expires_at is null or p.expires_at>now())$$;`);
 await db.exec(await file('20261029122036_invitation_recipients.sql'));
 const project=crypto.randomUUID(),r1=crypto.randomUUID(),r2=crypto.randomUUID();
 await db.query(`insert into public.projects(id,owner_id,name,project_data) values($1,$2,'Test recipients','{"rsvp":{"enabled":true}}')`,[project,owner]);
 const call=async(name,args)=>(await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as result`,args)).rows[0].result;
 const asOwner=async(id=owner,anon=false)=>{await db.exec(`reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"is_anonymous":${anon}}';set role authenticated;`);};
 const root=()=>db.exec('reset role');
 const rows=[{id:r1,display_name:'Famille Martin',guest_count:4,is_active:true},{id:r2,display_name:'Sophie Bernard',guest_count:44,is_active:true}];
 await asOwner();let list=await call('save_invitation_recipients',[project,0,JSON.stringify(rows)]);assert.equal(list.revision,1);assert.equal(list.recipients[0].public_token,null);
 await assert.rejects(()=>call('save_invitation_recipients',[project,0,JSON.stringify(rows)]),/RECIPIENT_LIST_CHANGED/);
 await asOwner(other);assert.equal((await db.query('select * from public.invitation_recipients')).rows.length,0);await assert.rejects(()=>call('read_invitation_recipients',[project]),/FORBIDDEN/);await assert.rejects(()=>call('save_invitation_recipients',[project,1,JSON.stringify(rows)]),/FORBIDDEN/);
 await asOwner(owner,true);await assert.rejects(()=>call('read_invitation_recipients',[project]),/FORBIDDEN/);
 await root();await db.exec('set role anon');await assert.rejects(()=>db.query('select * from public.invitation_recipients'),/permission denied/);await assert.rejects(()=>call('reserve_guest_checkout_v2',[project,owner,1,null,null]),/permission denied/);
 await root();const quote=await call('reserve_guest_checkout_v2',[project,owner,1,null,null]);assert.equal(quote.guest_count,48);assert.equal(quote.amount_cents,4240);assert.equal(quote.guest_capacity,48);
 await db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[quote.id,'cs_'+quote.id]);
 const pay=()=>call('finalize_guest_checkout',[quote.id,owner,'cs_'+quote.id,'pi_'+quote.id,quote.amount_cents]);await pay();await pay();
 await asOwner();list=await call('read_invitation_recipients',[project]);const token=list.recipients.find(r=>r.id===r1).public_token;assert.match(token,/^[a-f0-9]{64}$/);assert.equal(new Set(list.recipients.map(r=>r.public_token)).size,2);
 const publicId=(await db.query('select public_id from public.projects where id=$1',[project])).rows[0].public_id;
 await root();await db.exec('set role anon');let invitation=await call('get_recipient_invitation',[publicId,token]);assert.equal(invitation.recipient.displayName,'Famille Martin');assert.equal(invitation.recipient.guestCount,4);assert.ok(!JSON.stringify(invitation).includes('Sophie Bernard'));assert.ok(!JSON.stringify(invitation).includes(list.recipients.find(r=>r.id===r2).public_token));assert.equal(await call('get_recipient_invitation',[publicId,'f'.repeat(64)]),null);
 await root();await call('submit_recipient_rsvp',[publicId,token,JSON.stringify({'Question personnalisée':'Oui'}),JSON.stringify({q:'Oui'}),'confirmed',4]);await assert.rejects(()=>call('submit_recipient_rsvp',[publicId,token,'{}','{}','confirmed',5]),/INVALID_ATTENDANCE/);
 await db.exec("update public.rsvp_responses set updated_at=now()-interval '3 seconds'");await call('submit_recipient_rsvp',[publicId,token,'{"Question personnalisée":"Non"}','{"q":"Non"}','declined',0]);assert.equal((await db.query('select count(*)::int as n from public.rsvp_responses where recipient_id=$1',[r1])).rows[0].n,1);
 await asOwner();rows[0].display_name='Martin renommé';list=await call('save_invitation_recipients',[project,list.revision,JSON.stringify(rows)]);assert.equal(list.recipients.find(r=>r.id===r1).public_token,token);
 const extra={id:crypto.randomUUID(),display_name:'Foyer ajouté',guest_count:1,is_active:true};rows.push(extra);list=await call('save_invitation_recipients',[project,list.revision,JSON.stringify(rows)]);assert.equal(list.recipients.find(r=>r.id===extra.id).public_token,null);
 await root();const upgrade=await call('reserve_guest_checkout_v2',[project,owner,1,null,null]);assert.equal(upgrade.amount_cents,100);await db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[upgrade.id,'cs_'+upgrade.id]);await call('finalize_guest_checkout',[upgrade.id,owner,'cs_'+upgrade.id,'pi_'+upgrade.id,100]);
 await asOwner();list=await call('read_invitation_recipients',[project]);assert.ok(list.recipients.find(r=>r.id===extra.id).public_token);rows[0].is_active=false;list=await call('save_invitation_recipients',[project,list.revision,JSON.stringify(rows)]);
 await root();assert.equal(await call('get_recipient_invitation',[publicId,token]),null);assert.equal((await db.query('select count(*)::int as n from public.rsvp_responses where recipient_id=$1',[r1])).rows[0].n,1);assert.ok(await call('get_public_project',['legacy-public']));
 // Match production's cascading FKs (the shared pricing fixture uses simpler references).
 await db.exec('alter table public.project_payments drop constraint project_payments_project_id_fkey;alter table public.project_payments add foreign key(project_id) references public.projects(id) on delete cascade;alter table public.rsvp_addon_purchases drop constraint rsvp_addon_purchases_project_id_fkey;alter table public.rsvp_addon_purchases add foreign key(project_id) references public.projects(id) on delete cascade;');
 await db.query('delete from public.projects where id=$1',[project]);assert.equal((await db.query('select count(*)::int as n from public.invitation_recipients where project_id=$1',[project])).rows[0].n,0);
});
