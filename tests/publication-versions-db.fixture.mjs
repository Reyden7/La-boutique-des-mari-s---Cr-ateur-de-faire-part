import { PGlite } from '@electric-sql/pglite';
import { setupGuestPricingDb } from './guest-pricing-db.fixture.mjs';
export async function setupPublicationVersionsDb(t) {
  const db=new PGlite();t.after(()=>db.close());
  const base=await setupGuestPricingDb(db);
  await db.exec(await base.file('20261029122005_guest_per_person_pricing.sql'));
  await db.exec(`create table public.rsvp_responses(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id) on delete cascade,owner_id uuid references auth.users(id) on delete cascade,answers jsonb not null,client_fingerprint text,created_at timestamptz default now());
    alter table public.rsvp_responses enable row level security; grant select on public.rsvp_responses to authenticated;
    create policy owner_response on public.rsvp_responses to authenticated using(owner_id=auth.uid());
    create function public.get_public_project(p_public_id text) returns jsonb language sql security definer set search_path='' as $$
      select jsonb_build_object('id',p.id,'name',p.name,'public_id',p.public_id,'project_data',jsonb_set(p.project_data,'{rsvp,purchased}',to_jsonb(exists(select 1 from public.rsvp_addon_purchases where project_id=p.id and status='paid')),true))
      from public.projects p where p.public_id=p_public_id and p.status='published' and p.payment_status='paid' and (p.expires_at is null or p.expires_at>now()) $$;
    create table public.global_assets(id uuid primary key,url text);
    create function private.envelope_asset_usage(p_asset_id uuid) returns jsonb language sql security definer set search_path='' as $$select jsonb_build_object('projects',0,'templates',0)$$;
    create schema storage;create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated;grant usage on schema storage to authenticated;
    create policy object_access on storage.objects for all to authenticated using(true) with check(true);`);
  await db.exec(await base.file('20261029122036_invitation_recipients.sql'));
  await db.exec(await base.file('20261029131916_paid_publication_versions.sql'));
  const call=async(name,args)=>(await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as result`,args)).rows[0].result;
  const asOwner=async(id=base.owner,anonymous=false)=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"is_anonymous":${anonymous}}';set role authenticated;`);
  const root=()=>db.exec('reset role');
  const projectRow=async id=>(await db.query('select * from public.projects where id=$1',[id])).rows[0];
  return {db,...base,call,asOwner,root,projectRow};
}
