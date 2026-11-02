-- Additive partner ledger. Requires promo_usage_limits_reservations. No historical attribution/backfill.
begin;
create table public.partners (
 id uuid primary key default extensions.gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 160),
 contact_name text check(length(contact_name)<=160), professional_email text check(length(professional_email)<=254),
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index partners_name_unique on public.partners(lower(btrim(name)));
alter table public.promo_codes add column partner_id uuid references public.partners(id) on delete restrict,
 add column partner_commission_rate numeric not null default 0 check(partner_commission_rate between 0 and 100 and partner_commission_rate=round(partner_commission_rate,2)),
 add constraint promo_partner_rate check(partner_id is not null or partner_commission_rate=0);

-- Kept separate from owner-readable guest receipts: no commercial data in customer APIs/Stripe metadata.
create table public.partner_sale_attributions (
 receipt_id uuid primary key, -- Immutable audit ID; do not introduce a new project-deletion dependency.
 partner_id uuid not null references public.partners(id) on delete restrict,
 partner_name text not null, promo_code text not null,
 commission_rate numeric not null check(commission_rate between 0 and 100), created_at timestamptz not null default now()
);
create table public.partner_settlements (
 id uuid primary key, partner_id uuid not null references public.partners(id) on delete restrict,
 amount_cents bigint not null check(amount_cents>0), paid_on date not null, reference text check(length(reference)<=250),
 administrator_id uuid not null, created_at timestamptz not null default now()
);
create table public.partner_commissions (
 id uuid primary key default extensions.gen_random_uuid(),
 receipt_id uuid not null unique,
 promo_use_id uuid not null unique references public.promo_code_uses(id) on delete restrict,
 partner_id uuid not null references public.partners(id) on delete restrict, partner_name text not null, promo_code text not null,
 sale_at timestamptz not null default now(), gross_cents integer not null check(gross_cents>=0),
 discount_cents integer not null check(discount_cents>=0), tax_cents integer, base_cents integer,
 commission_rate numeric not null check(commission_rate between 0 and 100), original_commission_cents integer,
 commission_cents integer not null default 0 check(commission_cents>=0), refunded_cents integer not null default 0,
 status text not null default 'pending' check(status in ('pending','payable','paid','canceled')),
 settlement_id uuid references public.partner_settlements(id), settled_at timestamptz,
 settled_cents integer not null default 0 check(settled_cents>=0),
 check(tax_cents between 0 and gross_cents and base_cents=gross_cents-tax_cents),
 check(refunded_cents between 0 and gross_cents),
 check((status='paid' and settlement_id is not null and settled_at is not null) or (status<>'paid' and settlement_id is null and settled_cents=0))
);
create index partner_commissions_date on public.partner_commissions(partner_id,sale_at desc);
create table public.partner_commission_adjustments (
 id uuid primary key default extensions.gen_random_uuid(), commission_id uuid not null references public.partner_commissions(id),
 stripe_event_id text not null, refunded_cents integer not null check(refunded_cents>=0),
 previous_commission_cents integer not null, new_commission_cents integer not null,
 delta_cents integer not null, requires_regularization boolean not null,
 created_at timestamptz not null default now(), unique(commission_id,stripe_event_id)
);

-- Read only to administrators, no direct browser write access to any ledger/partner table.
do $$declare t text;begin
 foreach t in array array['partners','partner_sale_attributions','partner_commissions','partner_settlements','partner_commission_adjustments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
  execute format('create policy "admins read partner ledger" on public.%I for select to authenticated using((select private.is_admin()))',t);
 end loop;
end $$;

create function public.admin_save_partner(p_id uuid,p_name text,p_contact_name text default null,p_email text default null,p_active boolean default true)
returns public.partners language plpgsql security definer set search_path='' as $$
declare result public.partners%rowtype;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_active is null then raise exception 'INVALID_PARTNER'; end if;
 if p_id is null then
  insert into public.partners(name,contact_name,professional_email,is_active)
  values(btrim(p_name),nullif(btrim(p_contact_name),''),nullif(btrim(p_email),''),p_active)
  on conflict(lower(btrim(name))) do nothing returning * into result;
  if not found then select * into result from public.partners where lower(btrim(name))=lower(btrim(p_name)); end if;
 else
  update public.partners set name=btrim(p_name),contact_name=nullif(btrim(p_contact_name),''),professional_email=nullif(btrim(p_email),''),is_active=p_active,updated_at=now()
   where id=p_id returning * into result;
  if not found then raise exception 'PARTNER_NOT_FOUND'; end if;
 end if;
 return result;
end $$;
revoke all on function public.admin_save_partner(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.admin_save_partner(uuid,text,text,text,boolean) to authenticated;

create function private.snapshot_partner_attribution() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.promo_code_id is not distinct from new.promo_code_id then return new; end if;
 if new.promo_code_id is not null and new.purchase_type='initial_publication' then
  insert into public.partner_sale_attributions(receipt_id,partner_id,partner_name,promo_code,commission_rate)
   select new.id,p.id,p.name,new.promo_code,c.partner_commission_rate from public.promo_codes c join public.partners p on p.id=c.partner_id
   where c.id=new.promo_code_id and p.is_active on conflict(receipt_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.snapshot_partner_attribution() from public,anon,authenticated,service_role;
create trigger snapshot_partner_attribution after insert or update of promo_code_id on public.guest_license_payments
 for each row execute function private.snapshot_partner_attribution();

create function private.record_partner_sale() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.partner_commissions(receipt_id,promo_use_id,partner_id,partner_name,promo_code,sale_at,gross_cents,discount_cents,commission_rate,
  tax_cents,base_cents,original_commission_cents,status)
 select a.receipt_id,new.id,a.partner_id,a.partner_name,a.promo_code,new.created_at,new.final_amount,new.discount_amount,a.commission_rate,
  case when new.final_amount=0 then 0 end,case when new.final_amount=0 then 0 end,case when new.final_amount=0 then 0 end,
  case when new.final_amount=0 then 'payable' else 'pending' end
 from public.partner_sale_attributions a join public.guest_license_payments r on r.id=a.receipt_id
 where r.promo_code_id=new.promo_code_id and r.project_id=new.project_id and
  (r.stripe_checkout_session_id=new.stripe_checkout_session_id or r.free_transaction_id=new.free_transaction_id)
 on conflict(promo_use_id) do nothing;
 return new;
end $$;
revoke all on function private.record_partner_sale() from public,anon,authenticated,service_role;
create trigger record_partner_sale after insert on public.promo_code_uses for each row execute function private.record_partner_sale();

-- Webhook evidence, supplied exclusively by service_role after signed event and receipt checks.
create function public.confirm_partner_commission(p_receipt_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer,p_tax_cents integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.guest_license_payments%rowtype; c public.partner_commissions%rowtype; amount integer;
begin
 select * into c from public.partner_commissions where receipt_id=p_receipt_id for update;
 if not found then return; end if; -- Historical/non-partner sales: never create retroactive commissions.
 select * into r from public.guest_license_payments where id=p_receipt_id;
 if p_session_id is null or p_payment_intent_id is null or r.status not in ('paid','refunded') or r.amount_cents is distinct from p_amount_cents
  or r.stripe_checkout_session_id is distinct from p_session_id or r.stripe_payment_intent_id is distinct from p_payment_intent_id
  or p_tax_cents is null or p_tax_cents not between 0 and p_amount_cents then raise exception 'COMMISSION_PAYMENT_MISMATCH'; end if;
 if c.tax_cents is not null then
  if c.tax_cents<>p_tax_cents then raise exception 'COMMISSION_TAX_MISMATCH'; end if;return;
 end if;
 amount:=round((c.gross_cents-p_tax_cents)::numeric*c.commission_rate/100)::integer;
 update public.partner_commissions set tax_cents=p_tax_cents,base_cents=gross_cents-p_tax_cents,original_commission_cents=amount,commission_cents=amount,status='payable' where id=c.id;
end $$;
revoke all on function public.confirm_partner_commission(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.confirm_partner_commission(uuid,text,text,integer,integer) to service_role;

create function public.refund_partner_commission(p_receipt_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer,p_refunded_cents integer,p_event_id text,p_tax_cents integer)
returns void language plpgsql security definer set search_path='' as $$
declare c public.partner_commissions%rowtype; r public.guest_license_payments%rowtype; target integer;
begin
 select * into c from public.partner_commissions where receipt_id=p_receipt_id for update;
 if not found then return; end if;
 -- Tax confirmation and refund adjustment are one transaction: no payable window between them.
 perform public.confirm_partner_commission(p_receipt_id,p_session_id,p_payment_intent_id,p_amount_cents,p_tax_cents);
 select * into c from public.partner_commissions where receipt_id=p_receipt_id;
 select * into r from public.guest_license_payments where id=p_receipt_id;
 if p_event_id is null or length(p_event_id) not between 1 and 255 or p_refunded_cents is null or p_refunded_cents not between 0 and c.gross_cents
  or r.stripe_checkout_session_id is distinct from p_session_id or p_session_id is null or p_payment_intent_id is null
  or r.stripe_payment_intent_id is distinct from p_payment_intent_id or r.amount_cents is distinct from p_amount_cents then raise exception 'COMMISSION_REFUND_MISMATCH'; end if;
 if c.tax_cents is null then raise exception 'COMMISSION_TAX_PENDING'; end if;
 if p_refunded_cents<=c.refunded_cents then return; end if; -- Cumulative amount, safe against stale/replayed events.
 -- Prorate ex-tax base on cumulative gross refund; recalculate once to avoid per-refund rounding drift.
 target:=round(round(c.base_cents::numeric*(c.gross_cents-p_refunded_cents)/c.gross_cents)*c.commission_rate/100)::integer;
 insert into public.partner_commission_adjustments(commission_id,stripe_event_id,refunded_cents,previous_commission_cents,new_commission_cents,delta_cents,requires_regularization)
 values(c.id,p_event_id,p_refunded_cents,c.commission_cents,target,target-c.commission_cents,c.status='paid');
 update public.partner_commissions set refunded_cents=p_refunded_cents,commission_cents=target,
  status=case when status='paid' then 'paid' when p_refunded_cents=gross_cents then 'canceled' else 'payable' end where id=c.id;
end $$;
revoke all on function public.refund_partner_commission(uuid,text,text,integer,integer,text,integer) from public,anon,authenticated;
grant execute on function public.refund_partner_commission(uuid,text,text,integer,integer,text,integer) to service_role;

create function public.admin_settle_partner_commissions(p_request_id uuid,p_partner_id uuid,p_commission_ids uuid[],p_paid_on date,p_expected_total bigint,p_reference text default null)
returns public.partner_settlements language plpgsql security definer set search_path='' as $$
declare result public.partner_settlements%rowtype; total bigint; n integer; c public.partner_commissions%rowtype;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 if p_request_id is null or p_partner_id is null or p_paid_on is null or p_paid_on>current_date
  or cardinality(p_commission_ids) not between 1 and 500 or p_commission_ids is null
  or length(coalesce(p_reference,''))>250 then raise exception 'INVALID_SETTLEMENT'; end if;
 -- Serialize same-partner settlement requests; idempotency key binds exact selection and details.
 perform 1 from public.partners where id=p_partner_id for update;
 if not found then raise exception 'PARTNER_NOT_FOUND'; end if;
 select * into result from public.partner_settlements where id=p_request_id;
 if found then
  if result.partner_id<>p_partner_id or result.paid_on<>p_paid_on or result.amount_cents is distinct from p_expected_total or result.reference is distinct from nullif(btrim(p_reference),'')
   or (select array_agg(id order by id) from public.partner_commissions where settlement_id=result.id)
     is distinct from (select array_agg(x order by x) from unnest(p_commission_ids) x) then raise exception 'SETTLEMENT_REPLAY_MISMATCH'; end if;
  return result;
 end if;
 total:=0;n:=0;
 for c in select * from public.partner_commissions where id=any(p_commission_ids) order by id for update loop
  if c.partner_id<>p_partner_id or c.status<>'payable' or c.commission_cents<=0 or c.settlement_id is not null then raise exception 'COMMISSION_NOT_PAYABLE'; end if;
  total:=total+c.commission_cents;n:=n+1;
 end loop;
 if n<>cardinality(p_commission_ids) then raise exception 'INVALID_COMMISSION_SELECTION'; end if;
 -- The browser total is an optimistic assertion only, never the source of the payout amount.
 if p_expected_total is distinct from total then raise exception 'COMMISSION_TOTAL_CHANGED'; end if;
 insert into public.partner_settlements(id,partner_id,amount_cents,paid_on,reference,administrator_id)
 values(p_request_id,p_partner_id,total,p_paid_on,nullif(btrim(p_reference),''),auth.uid()) returning * into result;
 update public.partner_commissions set status='paid',settled_cents=commission_cents,settled_at=p_paid_on::timestamptz,settlement_id=p_request_id where id=any(p_commission_ids);
 return result;
end $$;
revoke all on function public.admin_settle_partner_commissions(uuid,uuid,uuid[],date,bigint,text) from public,anon;
grant execute on function public.admin_settle_partner_commissions(uuid,uuid,uuid[],date,bigint,text) to authenticated;
commit;
