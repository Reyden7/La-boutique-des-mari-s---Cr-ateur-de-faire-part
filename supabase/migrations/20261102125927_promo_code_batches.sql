-- Administrative creation only. No pricing, purchase, reservation or commission-finalization changes.
begin;
create table public.promo_code_batches (
 id uuid primary key, partner_id uuid not null references public.partners(id) on delete restrict,
 partner_name text not null, prefix text not null check(prefix ~ '^[A-Z0-9]+$'),
 department text not null check(department ~ '^[A-Z0-9]{2,3}$'),
 quantity integer not null check(quantity between 1 and 100),
 discount_value numeric not null check(discount_value between 1 and 100 and discount_value=round(discount_value,2)),
 commission_rate numeric not null check(commission_rate between 0 and 100 and commission_rate=round(commission_rate,2)),
 max_uses integer check(max_uses between 1 and 1000000), is_active boolean not null,
 created_by uuid not null, created_at timestamptz not null default now()
);
create index promo_batches_partner_date on public.promo_code_batches(partner_id,created_at desc);
create table public.promo_code_batch_sequences (
 partner_id uuid not null references public.partners(id) on delete restrict, prefix text not null, department text not null,
 last_number bigint not null check(last_number between 0 and 999999999999999999),
 primary key(partner_id,prefix,department)
);
alter table public.promo_codes
 add column batch_id uuid references public.promo_code_batches(id) on delete restrict,
 add column batch_prefix text, add column department text, add column batch_number bigint,
 add constraint promo_batch_metadata check (
  (batch_id is null and batch_prefix is null and department is null and batch_number is null)
  or (batch_id is not null and batch_prefix is not null and department is not null and batch_number is not null
   and batch_prefix ~ '^[A-Z0-9]+$' and department ~ '^[A-Z0-9]{2,3}$' and batch_number between 1 and 999999999999999999)),
 add constraint promo_batch_number_unique unique(batch_id,batch_number);
create index promo_codes_batch_idx on public.promo_codes(batch_id) where batch_id is not null;
alter table public.promo_code_batches enable row level security;
alter table public.promo_code_batch_sequences enable row level security;
revoke all on public.promo_code_batches,public.promo_code_batch_sequences from public,anon,authenticated,service_role;
grant select on public.promo_code_batches to authenticated;
create policy "admins read promo batches" on public.promo_code_batches for select to authenticated using((select private.is_admin()));
-- Sequence allocation has no browser grant/policy. Only the guarded generation RPC writes it.

create function private.normalize_promo_batch_prefix(p_prefix text) returns text language sql immutable strict set search_path='' as $$
 select regexp_replace(normalize(upper(replace(replace(replace(replace(replace(p_prefix,'œ','OE'),'Œ','OE'),'æ','AE'),'Æ','AE'),'ß','SS')),NFKD),'[^A-Z0-9]','','g');
$$;
revoke all on function private.normalize_promo_batch_prefix(text) from public,anon,authenticated,service_role;

create function private.validate_promo_batch(p_partner_id uuid,p_prefix text,p_department text,p_quantity integer,p_discount numeric,p_commission numeric,p_max_uses integer,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.partners%rowtype; prefix text; department text;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 select * into p from public.partners where id=p_partner_id;
 if not found or not p.is_active then raise exception 'BATCH_PARTNER_INACTIVE'; end if;
 prefix:=private.normalize_promo_batch_prefix(p_prefix);department:=upper(btrim(p_department));
 if prefix is null or prefix='' or length(prefix)>60 then raise exception 'BATCH_PREFIX_INVALID'; end if;
 if department is null or department !~ '^[A-Z0-9]{2,3}$' then raise exception 'BATCH_DEPARTMENT_INVALID'; end if;
 if p_quantity is null or p_quantity not between 1 and 100 then raise exception 'BATCH_QUANTITY_INVALID'; end if;
 if p_discount is null or p_discount not between 1 and 100 or p_discount<>round(p_discount,2)
  or p_commission is null or p_commission not between 0 and 100 or p_commission<>round(p_commission,2) then raise exception 'BATCH_RATE_INVALID'; end if;
 if p_max_uses is not null and p_max_uses not between 1 and 1000000 then raise exception 'BATCH_USAGE_INVALID'; end if;
 if p_active is null or length(prefix||department)>62 then raise exception 'BATCH_PREFIX_INVALID'; end if;
 return jsonb_build_object('partnerId',p.id,'partnerName',p.name,'prefix',prefix,'department',department,'quantity',p_quantity,
  'discountValue',p_discount,'commissionRate',p_commission,'maxUses',p_max_uses,'isActive',p_active);
end $$;
revoke all on function private.validate_promo_batch(uuid,text,text,integer,numeric,numeric,integer,boolean) from public,anon,authenticated,service_role;

create function private.next_promo_batch_number(p_partner_id uuid,p_prefix text,p_department text) returns bigint
language plpgsql security definer set search_path='' as $$
declare highest numeric; base text:=p_prefix||p_department;
begin
 -- Includes manual/used/disabled codes belonging to ANY partner: the final code is globally unique.
 select greatest(coalesce((select last_number from public.promo_code_batch_sequences where partner_id=p_partner_id and prefix=p_prefix and department=p_department),0),
  coalesce((select max(batch_number) from public.promo_codes where partner_id=p_partner_id and batch_prefix=p_prefix and department=p_department),0),
  coalesce((select max(substring(code from length(base)+1)::numeric) from public.promo_codes
   where left(code,length(base))=base and substring(code from length(base)+1) ~ '^[0-9]+$'),0)) into highest;
 if highest>=999999999999999999 then raise exception 'BATCH_SEQUENCE_EXHAUSTED'; end if;
 return highest::bigint+1;
end $$;
revoke all on function private.next_promo_batch_number(uuid,text,text) from public,anon,authenticated,service_role;

create function public.admin_preview_promo_batch(p_partner_id uuid,p_prefix text,p_department text,p_quantity integer,p_discount numeric,p_commission numeric,p_max_uses integer default 1,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare spec jsonb; n bigint; code text; codes jsonb:='[]'; i integer;
begin
 spec:=private.validate_promo_batch(p_partner_id,p_prefix,p_department,p_quantity,p_discount,p_commission,p_max_uses,p_active);
 n:=private.next_promo_batch_number(p_partner_id,spec->>'prefix',spec->>'department');
 for i in 1..p_quantity loop
  code:=(spec->>'prefix')||(spec->>'department')||lpad(n::text,greatest(2,length(n::text)),'0');
  if length(code)>64 or n>999999999999999999 then raise exception 'BATCH_SEQUENCE_EXHAUSTED'; end if;
  codes:=codes||jsonb_build_array(code);n:=n+1;
 end loop;
 return spec||jsonb_build_object('codes',codes);
end $$;
revoke all on function public.admin_preview_promo_batch(uuid,text,text,integer,numeric,numeric,integer,boolean) from public,anon;
grant execute on function public.admin_preview_promo_batch(uuid,text,text,integer,numeric,numeric,integer,boolean) to authenticated;

create function public.admin_generate_promo_batch(p_request_id uuid,p_partner_id uuid,p_prefix text,p_department text,p_quantity integer,p_discount numeric,p_commission numeric,p_max_uses integer default 1,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare spec jsonb; b public.promo_code_batches%rowtype; n bigint; v_code text; inserted uuid; created integer:=0; codes jsonb;
begin
 -- Authenticate before any access and validate the request without trusting browser-generated codes.
 spec:=private.validate_promo_batch(p_partner_id,p_prefix,p_department,p_quantity,p_discount,p_commission,p_max_uses,p_active);
 if p_request_id is null then raise exception 'BATCH_REQUEST_INVALID'; end if;
 -- Same textual stem is serialized even when assigned to different partners.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promo-batch:'||(spec->>'prefix')||(spec->>'department'),53417));
 select * into b from public.promo_code_batches where id=p_request_id;
 if found then
  if b.partner_id<>p_partner_id or b.prefix<>spec->>'prefix' or b.department<>spec->>'department' or b.quantity<>p_quantity
   or b.discount_value<>p_discount or b.commission_rate<>p_commission or b.max_uses is distinct from p_max_uses or b.is_active<>p_active then raise exception 'BATCH_REPLAY_MISMATCH'; end if;
 else
  -- Hold the active partner through commit; deactivation cannot race the generation.
  perform 1 from public.partners where id=p_partner_id and is_active for share;
  if not found then raise exception 'BATCH_PARTNER_INACTIVE'; end if;
  insert into public.promo_code_batch_sequences(partner_id,prefix,department,last_number)
   values(p_partner_id,spec->>'prefix',spec->>'department',0) on conflict do nothing;
  perform 1 from public.promo_code_batch_sequences where partner_id=p_partner_id and prefix=spec->>'prefix' and department=spec->>'department' for update;
  n:=private.next_promo_batch_number(p_partner_id,spec->>'prefix',spec->>'department');
  insert into public.promo_code_batches(id,partner_id,partner_name,prefix,department,quantity,discount_value,commission_rate,max_uses,is_active,created_by)
   values(p_request_id,p_partner_id,spec->>'partnerName',spec->>'prefix',spec->>'department',p_quantity,p_discount,p_commission,p_max_uses,p_active,auth.uid());
  while created<p_quantity loop
   v_code:=(spec->>'prefix')||(spec->>'department')||lpad(n::text,greatest(2,length(n::text)),'0');
   if length(v_code)>64 or n>999999999999999999 then raise exception 'BATCH_SEQUENCE_EXHAUSTED'; end if;
   inserted:=null;
   insert into public.promo_codes(code,discount_value,partner_id,partner_commission_rate,max_uses,is_active,batch_id,batch_prefix,department,batch_number)
    values(v_code,p_discount,p_partner_id,p_commission,p_max_uses,p_active,p_request_id,spec->>'prefix',spec->>'department',n)
    on conflict(code) do nothing returning id into inserted;
   if inserted is not null then created:=created+1; end if;
   -- A concurrent manual insert can take a number; never overwrite/reactivate it.
   update public.promo_code_batch_sequences set last_number=n where partner_id=p_partner_id and prefix=spec->>'prefix' and department=spec->>'department';
   n:=n+1;
  end loop;
 end if;
 select jsonb_agg(to_jsonb(c) order by c.batch_number) into codes from public.promo_codes c where c.batch_id=p_request_id;
 return spec||jsonb_build_object('batchId',p_request_id,'codes',coalesce(codes,'[]'::jsonb));
end $$;
revoke all on function public.admin_generate_promo_batch(uuid,uuid,text,text,integer,numeric,numeric,integer,boolean) from public,anon;
grant execute on function public.admin_generate_promo_batch(uuid,uuid,text,text,integer,numeric,numeric,integer,boolean) to authenticated;
commit;
