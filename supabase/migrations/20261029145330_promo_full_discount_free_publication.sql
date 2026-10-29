-- LOCAL ONLY. Requires paid_publication_versions; no existing purchase is rewritten.
begin;

-- Extend only percentage/amount bounds, preserving all quote dimension checks.
do $$
declare item record; definition text;
begin
 for item in select c.oid,c.conname,c.conrelid from pg_constraint c where c.contype='c' and
  ((c.conrelid='public.promo_codes'::regclass and c.conname='promo_codes_discount_value_check')
   or (c.conrelid='public.promo_code_uses'::regclass and c.conname='promo_code_uses_discount_value_check')
   or c.conname in ('guest_license_quote_check','project_payments_guest_quote_check'))
 loop
  definition:=pg_get_constraintdef(item.oid);
  definition:=regexp_replace(definition,'\m90\M','100','g');
  if item.conname='project_payments_guest_quote_check' then
   definition:=replace(definition,'0.9','1.0');
   definition:=regexp_replace(definition,'\m99\M','0','g');
  end if;
  execute format('alter table %s drop constraint %I',item.conrelid::regclass,item.conname);
  execute format('alter table %s add constraint %I %s',item.conrelid::regclass,item.conname,definition);
 end loop;
end $$;

create table public.free_publication_transactions (
 id uuid primary key default extensions.gen_random_uuid(),
 -- Historical identifiers deliberately survive deletion of the project/account.
 project_id uuid not null unique, owner_id uuid not null,
 purchase_type text not null default 'initial_publication' check(purchase_type='initial_publication'),
 receipt_id uuid not null unique, publication_version_id uuid,
 promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
 promo_code text not null, discount_value numeric(5,2) not null check(discount_value between 1 and 100),
 subtotal_amount integer not null check(subtotal_amount>0),
 discount_amount integer not null, final_amount integer not null check(final_amount=0),
 guest_count integer not null, guest_capacity integer not null, has_form boolean not null,
 terms_version text, accepted_at timestamptz,
 created_at timestamptz not null default now(), completed_at timestamptz not null default now(),
 check(discount_amount=subtotal_amount and discount_amount=round(subtotal_amount*discount_value/100)::integer),
 check(guest_count between 1 and 100000 and guest_capacity=greatest(40,guest_count))
);
alter table public.free_publication_transactions enable row level security;
revoke all on public.free_publication_transactions from public,anon,authenticated;
grant select on public.free_publication_transactions to authenticated,service_role;
create policy "owners read free transactions" on public.free_publication_transactions for select to authenticated
 using(owner_id=(select auth.uid()) or (select private.is_admin()));

alter table public.guest_license_payments add column free_transaction_id uuid references public.free_publication_transactions(id);
alter table public.project_payments add column free_transaction_id uuid references public.free_publication_transactions(id);
alter table public.rsvp_addon_purchases add column free_transaction_id uuid references public.free_publication_transactions(id);
alter table public.promo_code_uses add column free_transaction_id uuid unique references public.free_publication_transactions(id),
 alter column stripe_checkout_session_id drop not null, alter column stripe_payment_intent_id drop not null;
alter table public.guest_license_payments drop constraint guest_license_payments_amount_cents_check,
 add constraint guest_license_payments_amount_cents_check check(amount_cents>=0),
 add constraint guest_free_evidence check((free_transaction_id is null and (amount_cents>0 or status in ('pending','failed','cancelled')))
  or (free_transaction_id is not null and amount_cents=0 and purchase_type='initial_publication' and stripe_checkout_session_id is null and stripe_payment_intent_id is null));
alter table public.project_payments drop constraint project_payments_amount_cents_check,
 add constraint project_payments_amount_cents_check check(amount_cents>0 or (amount_cents=0 and free_transaction_id is not null)),
 add constraint project_free_evidence check(free_transaction_id is null or (amount_cents=0 and stripe_checkout_session_id is null and stripe_payment_intent_id is null));
alter table public.rsvp_addon_purchases drop constraint rsvp_addon_purchases_amount_cents_check,
 add constraint rsvp_addon_purchases_amount_cents_check check(amount_cents>=0),
 add constraint form_free_evidence check(free_transaction_id is null or (amount_cents=0 and stripe_checkout_session_id is null and stripe_payment_intent_id is null));
alter table public.promo_code_uses drop constraint promo_code_uses_final_amount_check,
 add constraint promo_code_uses_final_amount_check check(final_amount>=0),
 add constraint promo_use_provider_check check(
  (free_transaction_id is null and final_amount>0 and stripe_checkout_session_id is not null and stripe_payment_intent_id is not null)
  or (free_transaction_id is not null and final_amount=0 and stripe_checkout_session_id is null and stripe_payment_intent_id is null));

-- Partial discounts can round the form allocation to zero even on a positive order.
-- Only accept that allocation when bound to its independently verified parent order.
create function private.check_zero_form_purchase() returns trigger language plpgsql set search_path='' as $$
begin
 if new.amount_cents=0 and not exists(select 1 from public.project_payments p where p.project_id=new.project_id
  and p.owner_id=new.owner_id and p.includes_rsvp and p.form_amount_cents=0
  and p.stripe_checkout_session_id is not distinct from new.stripe_checkout_session_id
  and p.free_transaction_id is not distinct from new.free_transaction_id) then raise exception 'ZERO_FORM_WITHOUT_ORDER'; end if;
 return new;
end $$;
revoke all on function private.check_zero_form_purchase() from public,anon,authenticated;
create trigger check_zero_form_purchase before insert or update on public.rsvp_addon_purchases
 for each row execute function private.check_zero_form_purchase();
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.finalize_project_payment(uuid,uuid,text,text)'::regprocedure);
 if position('v_rsvp_amount <= 0' in definition)=0 then raise exception 'Unexpected publication finalizer'; end if;
 execute replace(definition,'v_rsvp_amount <= 0','v_rsvp_amount < 0');
end $$;

-- Stripe finalization never authorizes a free order, including forged webhooks.
alter function public.finalize_guest_checkout(uuid,uuid,text,text,integer) rename to finalize_guest_checkout_before_free;
revoke all on function public.finalize_guest_checkout_before_free(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
create function public.finalize_guest_checkout(p_receipt_id uuid,p_owner_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_amount_cents is null or p_amount_cents<=0 or exists(select 1 from public.guest_license_payments where id=p_receipt_id and free_transaction_id is not null)
  then raise exception 'STRIPE_REQUIRES_POSITIVE_ORDER'; end if;
 perform public.finalize_guest_checkout_before_free(p_receipt_id,p_owner_id,p_session_id,p_payment_intent_id,p_amount_cents);
end $$;
revoke all on function public.finalize_guest_checkout(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.finalize_guest_checkout(uuid,uuid,text,text,integer) to service_role;

-- One database transaction: locks, server quote, usage, evidence, rights, snapshot,
-- and the existing recipient-link triggers all commit together or all roll back.
create function public.complete_free_initial_publication(p_project_id uuid,p_owner_id uuid,p_promo_code text,p_previous_session_id text,p_terms text,p_expected_amount integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; r public.guest_license_payments%rowtype;
 evidence public.free_publication_transactions%rowtype; form public.rsvp_addon_purchases%rowtype;
 total integer; transaction_id uuid:=extensions.gen_random_uuid(); code text:=upper(btrim(coalesce(p_promo_code,'')));
begin
 select * into p from public.projects where id=p_project_id and owner_id=p_owner_id for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if p_expected_amount is distinct from 0 or code='' then raise exception 'FREE_QUOTE_REQUIRED'; end if;
 select * into evidence from public.free_publication_transactions where project_id=p.id;
 if found then
  -- Retries return the original receipt. Never reactivate a historical snapshot.
  if evidence.owner_id<>p_owner_id or evidence.promo_code<>code or p.payment_status<>'paid'
   or p.active_version_id is distinct from evidence.publication_version_id then raise exception 'FREE_REPLAY_CONFLICT'; end if;
  return jsonb_build_object('kind','free_publication','completed',true,'transactionId',evidence.id,'projectId',p.id,'publicationVersionId',evidence.publication_version_id);
 end if;
 if p.payment_status in ('paid','refunded') or p.status='published' then raise exception 'PROMO_FIRST_PURCHASE_ONLY'; end if;
 total:=public.recipient_checkout_total(p.id,p_owner_id);
 if p.publication_policy='paid_versions' then
  r:=public.reserve_confirmed_initial_publication(p.id,p_owner_id,total,p_previous_session_id,code,p_terms,0);
 else
  r:=public.reserve_guest_checkout_v2(p.id,p_owner_id,total,p_previous_session_id,code);
 end if;
 if r.amount_cents<>0 or r.promo_code_id is null or r.purchase_type<>'initial_publication' then raise exception 'FREE_QUOTE_REQUIRED'; end if;
 insert into public.free_publication_transactions(id,project_id,owner_id,receipt_id,publication_version_id,promo_code_id,promo_code,
  discount_value,subtotal_amount,discount_amount,final_amount,guest_count,guest_capacity,has_form,terms_version,accepted_at)
 values(transaction_id,p.id,p_owner_id,r.id,r.publication_version_id,r.promo_code_id,r.promo_code,r.discount_value,
  r.subtotal_amount,r.discount_amount,0,r.guest_count,r.guest_capacity,r.has_form,r.publication_terms_version,r.publication_accepted_at);
 insert into public.project_payments(project_id,owner_id,status,amount_cents,currency,includes_rsvp,pricing_version,
  guest_count,guest_capacity,guest_extra_blocks,discount_amount,form_amount_cents,free_transaction_id,paid_at)
 values(p.id,p_owner_id,'paid',0,'eur',r.has_form,r.pricing_version,r.guest_count,r.guest_capacity,null,r.discount_amount,0,transaction_id,now())
 on conflict(project_id) do update set status='paid',amount_cents=0,currency='eur',includes_rsvp=excluded.includes_rsvp,
  pricing_version=excluded.pricing_version,guest_count=excluded.guest_count,guest_capacity=excluded.guest_capacity,guest_extra_blocks=null,
  discount_amount=excluded.discount_amount,form_amount_cents=0,free_transaction_id=transaction_id,
  stripe_checkout_session_id=null,stripe_payment_intent_id=null,paid_at=now()
 where project_payments.status='unpaid';
 if not found then raise exception 'PUBLICATION_ALREADY_SETTLED'; end if;
 if r.has_form then
  select * into form from public.rsvp_addon_purchases where project_id=p.id for update;
  if found and (form.owner_id<>p_owner_id or form.status in ('paid','refunded')) then raise exception 'FORM_ALREADY_SETTLED'; end if;
  insert into public.rsvp_addon_purchases(project_id,owner_id,status,amount_cents,currency,free_transaction_id,paid_at)
  values(p.id,p_owner_id,'paid',0,'eur',transaction_id,now())
  on conflict(project_id) do update set status='paid',amount_cents=0,currency='eur',free_transaction_id=transaction_id,
   stripe_checkout_session_id=null,stripe_payment_intent_id=null,paid_at=now(),updated_at=now();
 end if;
 update public.guest_license_payments set status='paid',free_transaction_id=transaction_id,paid_at=now() where id=r.id;
 insert into public.promo_code_uses(promo_code_id,project_id,user_id,promo_code,discount_value,subtotal_amount,discount_amount,final_amount,free_transaction_id)
 values(r.promo_code_id,p.id,p_owner_id,r.promo_code,r.discount_value,r.subtotal_amount,r.discount_amount,0,transaction_id);
 update public.projects set payment_status='paid',status='published',
  project_data=case when r.has_form then jsonb_set(project_data,'{rsvp,purchased}','true'::jsonb,true) else project_data end,
  public_id=coalesce(public_id,encode(extensions.gen_random_bytes(18),'hex')),published_at=coalesce(published_at,now()) where id=p.id;
 perform private.refresh_guest_capacity(p.id);
 if r.publication_version_id is not null then perform private.activate_publication(p.id,r.publication_version_id); end if;
 return jsonb_build_object('kind','free_publication','completed',true,'transactionId',transaction_id,'projectId',p.id,'publicationVersionId',r.publication_version_id);
end $$;
revoke all on function public.complete_free_initial_publication(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.complete_free_initial_publication(uuid,uuid,text,text,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
