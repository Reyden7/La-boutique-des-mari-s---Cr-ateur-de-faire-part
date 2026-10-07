-- Transactional SQL/RLS audit. No Stripe calls, no Auth writes, no lasting fixtures.
begin isolation level repeatable read;
create temporary table promo_audit_baseline on commit drop as
  select 'projects'::text as source,id,to_jsonb(p) as payload from public.projects p
  union all select 'project_payments',id,to_jsonb(p) from public.project_payments p
  union all select 'guest_license_payments',id,to_jsonb(p) from public.guest_license_payments p
  union all select 'rsvp_addon_purchases',id,to_jsonb(p) from public.rsvp_addon_purchases p
  union all select 'promo_codes',id,to_jsonb(p) from public.promo_codes p
  union all select 'promo_code_uses',id,to_jsonb(p) from public.promo_code_uses p;
create temporary table promo_audit_results(test_name text primary key,passed boolean not null) on commit drop;
create temporary table promo_audit_context(owner_id uuid,other_id uuid,promo_id uuid,code text,project_id uuid) on commit drop;
grant select,insert on promo_audit_results to authenticated,anon;
grant select on promo_audit_context to authenticated,anon;
create function pg_temp.promo_assert(p_name text,p_pass boolean) returns void language plpgsql as $$
begin
  if p_pass is distinct from true then raise exception 'PROMO AUDIT FAILED: %',p_name; end if;
  insert into promo_audit_results values(p_name,true);
end $$;
do $$
declare v_admin uuid; v_other uuid;
begin
  select id into v_admin from auth.users where raw_app_meta_data->>'role'='admin' and not coalesce(is_anonymous,false) limit 1;
  if v_admin is null then raise exception 'Audit requires an existing admin; no Auth user will be created or changed'; end if;
  select id into v_other from auth.users where raw_app_meta_data->>'role' is distinct from 'admin' and not coalesce(is_anonymous,false) limit 1;
  insert into promo_audit_context values(v_admin,coalesce(v_other,extensions.gen_random_uuid()),extensions.gen_random_uuid(),'QA_'||upper(replace(extensions.gen_random_uuid()::text,'-','')),null);
end $$;

-- Admin creation/normalization, duplicates, invalid rates and immutable history ACLs.
select set_config('request.jwt.claim.sub',(select owner_id::text from promo_audit_context),true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
set local role authenticated;
insert into public.promo_codes(id,code,discount_value) select promo_id,'  '||lower(code)||'  ',10 from promo_audit_context;
select pg_temp.promo_assert('admin_create_trim_upper',(select p.code=c.code and p.is_active and p.discount_value=10 from public.promo_codes p join promo_audit_context c on p.id=c.promo_id));
update public.promo_codes set code='EDIT_'||(select code from promo_audit_context),discount_value=15 where id=(select promo_id from promo_audit_context);
select pg_temp.promo_assert('admin_rename_and_rate',(select p.code='EDIT_'||c.code and p.discount_value=15 from public.promo_codes p join promo_audit_context c on p.id=c.promo_id));
update public.promo_codes set code=(select code from promo_audit_context),discount_value=10 where id=(select promo_id from promo_audit_context);
do $$
declare v_rate numeric;
begin
  begin
    insert into public.promo_codes(code,discount_value) select lower(code),10 from promo_audit_context;
    raise exception 'Duplicate accepted';
  exception when unique_violation then perform pg_temp.promo_assert('duplicate_case_insensitive',true); end;
  foreach v_rate in array array[0::numeric,91,-1] loop
    begin
      insert into public.promo_codes(code,discount_value) values('QA_BAD_'||v_rate, v_rate);
      raise exception 'Invalid percentage accepted';
    exception when check_violation then perform pg_temp.promo_assert('invalid_rate_'||v_rate,true); end;
  end loop;
  begin
    delete from public.promo_codes where id=(select promo_id from promo_audit_context);
    raise exception 'Physical delete accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('admin_no_physical_delete',true); end;
end $$;
reset role;

-- Every threshold, with/without form, at 1/10/33.33/90 percent, independently recomputed in SQL.
do $$
declare
  v_owner uuid := (select owner_id from promo_audit_context);
  v_code text := (select code from promo_audit_context);
  v_promo uuid := (select promo_id from promo_audit_context);
  v_case record; v_form boolean; v_rate numeric; v_id uuid; v_receipt public.guest_license_payments;
  v_subtotal integer; v_discount integer; v_key text; v_session text; v_intent text;
begin
  for v_case in select * from (values(1,2450,40),(40,2450,40),(41,2900,47),(47,2900,47),(48,3350,54),(54,3350,54),(55,3800,61),(61,3800,61),(62,4250,68)) q(guests,amount,capacity) loop
    foreach v_form in array array[false,true] loop
      foreach v_rate in array array[1::numeric,10,33.33,90] loop
        update public.promo_codes set discount_value=v_rate where id=v_promo;
        v_id:=extensions.gen_random_uuid(); v_key:=v_case.guests||'_'||v_form||'_'||v_rate;
        v_session:='cs_promo_audit_'||v_id; v_intent:='pi_promo_audit_'||v_id;
        insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Promo audit] tier',jsonb_build_object('rsvp',jsonb_build_object('enabled',v_form),'pages','[]'::jsonb));
        v_receipt:=public.reserve_guest_checkout(v_id,v_owner,v_case.guests,null,' '||lower(v_code)||' ');
        v_subtotal:=v_case.amount+case when v_form then 990 else 0 end;
        v_discount:=round(v_subtotal*v_rate/100)::integer;
        perform pg_temp.promo_assert('quote_'||v_key,v_receipt.amount_cents=v_subtotal-v_discount and v_receipt.discount_amount=v_discount and v_receipt.subtotal_amount=v_subtotal and v_receipt.guest_capacity=v_case.capacity and v_receipt.promo_code=v_code);
        perform pg_temp.promo_assert('no_use_before_payment_'||v_key,not exists(select 1 from public.promo_code_uses where project_id=v_id));
        update public.guest_license_payments set stripe_checkout_session_id=v_session where id=v_receipt.id;
        perform public.finalize_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_receipt.amount_cents);
        perform public.finalize_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_receipt.amount_cents);
        perform pg_temp.promo_assert('paid_replay_'||v_key,(select count(*)=1 from public.promo_code_uses where project_id=v_id));
        perform pg_temp.promo_assert('snapshot_'||v_key,(select promo_code=v_code and discount_value=v_rate and subtotal_amount=v_subtotal and discount_amount=v_discount and final_amount=v_subtotal-v_discount from public.promo_code_uses where project_id=v_id));
        perform pg_temp.promo_assert('rights_'||v_key,(select status='published' and payment_status='paid' and purchased_guest_capacity=v_case.capacity and purchased_extra_blocks=(v_case.capacity-40)/7 and ((project_data#>>'{rsvp,purchased}')='true') is not distinct from v_form from public.projects where id=v_id));
        if v_form then perform pg_temp.promo_assert('form_amount_'||v_key,(select status='paid' and amount_cents=990-round(990*v_rate/100)::integer from public.rsvp_addon_purchases where project_id=v_id)); end if;
        if v_case.guests=40 and not v_form and v_rate=10 then update promo_audit_context set project_id=v_id; end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Upgrade discounted initial sale: full-price extra blocks; no second promo.
do $$
declare
  v_owner uuid:=(select owner_id from promo_audit_context); v_id uuid:=(select project_id from promo_audit_context);
  v_code text:=(select code from promo_audit_context); v_receipt public.guest_license_payments;
begin
  begin
    perform public.reserve_guest_checkout(v_id,v_owner,54,null,v_code);
    raise exception 'Upgrade promo accepted';
  exception when raise_exception then
    if sqlerrm <> 'PROMO_FIRST_PURCHASE_ONLY' then raise; end if;
    perform pg_temp.promo_assert('upgrade_promo_rejected',true);
  end;
  v_receipt:=public.reserve_guest_checkout(v_id,v_owner,54,null,null);
  perform pg_temp.promo_assert('upgrade_40_54_full_price',v_receipt.amount_cents=900 and v_receipt.discount_amount=0 and v_receipt.promo_code_id is null);
  update public.guest_license_payments set stripe_checkout_session_id='cs_promo_upgrade' where id=v_receipt.id;
  perform public.finalize_guest_checkout(v_receipt.id,v_owner,'cs_promo_upgrade','pi_promo_upgrade',900);
  perform pg_temp.promo_assert('upgrade_capacity_54',(select purchased_guest_capacity=54 from public.projects where id=v_id));
  begin
    perform public.reserve_guest_checkout(v_id,v_owner,53,null,null);
    raise exception 'Downgrade charged';
  exception when raise_exception then
    if sqlerrm <> 'CAPACITY_ALREADY_COVERED' then raise; end if;
    perform pg_temp.promo_assert('downgrade_capacity_kept',true);
  end;
  -- Form purchased afterwards is always 990, regardless of initial promo.
  insert into public.rsvp_addon_purchases(project_id,owner_id,status,amount_cents,stripe_checkout_session_id) values(v_id,v_owner,'pending',990,'cs_promo_later_form');
  perform public.finalize_rsvp_addon_payment(v_id,v_owner,'cs_promo_later_form','pi_promo_later_form',990);
  perform pg_temp.promo_assert('later_form_full_price',(select amount_cents=990 and status='paid' from public.rsvp_addon_purchases where project_id=v_id));
end $$;

-- Rename/change/deactivate AFTER checkout: stored quote is authoritative at settlement/refund.
do $$
declare
  v_owner uuid:=(select owner_id from promo_audit_context); v_promo uuid:=(select promo_id from promo_audit_context);
  v_code text:=(select code from promo_audit_context); v_id uuid:=extensions.gen_random_uuid(); v_receipt public.guest_license_payments;
begin
  update public.promo_codes set discount_value=10 where id=v_promo;
  insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Promo audit] snapshot','{"rsvp":{"enabled":true},"pages":[]}');
  v_receipt:=public.reserve_guest_checkout(v_id,v_owner,54,null,v_code);
  update public.guest_license_payments set stripe_checkout_session_id='cs_promo_snapshot' where id=v_receipt.id;
  update public.promo_codes set code='RENAMED_'||v_promo,discount_value=15,is_active=false where id=v_promo;
  perform public.finalize_guest_checkout(v_receipt.id,v_owner,'cs_promo_snapshot','pi_promo_snapshot',3906);
  perform pg_temp.promo_assert('snapshot_survives_admin_edit',(select promo_code=v_code and discount_value=10 and final_amount=3906 from public.promo_code_uses where project_id=v_id));
  perform public.refund_guest_checkout(v_receipt.id,v_owner,'cs_promo_snapshot','pi_promo_snapshot',3906);
  perform public.refund_guest_checkout(v_receipt.id,v_owner,'cs_promo_snapshot','pi_promo_snapshot',3906);
  perform public.finalize_guest_checkout(v_receipt.id,v_owner,'cs_promo_snapshot','pi_promo_snapshot',3906);
  perform pg_temp.promo_assert('refund_replay_no_rights',(select status='draft' and payment_status='refunded' and purchased_guest_capacity is null and project_data#>>'{rsvp,purchased}'='false' from public.projects where id=v_id));
  perform pg_temp.promo_assert('refund_preserves_history',(select count(*)=1 from public.promo_code_uses where project_id=v_id));
  -- Fresh checkout refuses both old name and deactivated new name, leaves no receipt.
  v_id:=extensions.gen_random_uuid();
  insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Promo audit] invalid','{}');
  begin
    perform public.reserve_guest_checkout(v_id,v_owner,40,null,v_code);
    raise exception 'Old name accepted';
  exception when raise_exception then
    if sqlerrm <> 'PROMO_UNAVAILABLE' then raise; end if;
    perform pg_temp.promo_assert('old_name_invalid',true);
  end;
  begin
    perform public.reserve_guest_checkout(v_id,v_owner,40,null,'RENAMED_'||v_promo);
    raise exception 'Inactive code accepted';
  exception when raise_exception then
    if sqlerrm <> 'PROMO_UNAVAILABLE' then raise; end if;
    perform pg_temp.promo_assert('inactive_code_invalid',true);
  end;
  perform pg_temp.promo_assert('invalid_quote_rolled_back',not exists(select 1 from public.guest_license_payments where project_id=v_id));
end $$;

-- Non-admin cannot enumerate/change codes, forge admin claims, write usage or call pricing RPCs.
select set_config('request.jwt.claim.sub',(select other_id::text from promo_audit_context),true);
select set_config('request.jwt.claims','{"app_metadata":{"role":"admin"},"user_metadata":{"role":"admin"},"is_anonymous":false}',true);
set local role authenticated;
select pg_temp.promo_assert('nonadmin_codes_hidden',not exists(select 1 from public.promo_codes));
select pg_temp.promo_assert('nonadmin_history_hidden',not exists(select 1 from public.promo_code_uses));
do $$
begin
  begin
    insert into public.promo_codes(code,discount_value) values('FORGED',10);
    raise exception 'Nonadmin insert accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('nonadmin_insert_denied',true); end;
  update public.promo_codes set discount_value=90;
  perform pg_temp.promo_assert('nonadmin_update_denied',not found);
  begin
    delete from public.promo_codes;
    raise exception 'Nonadmin delete accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('nonadmin_delete_denied',true); end;
  begin
    insert into public.promo_code_uses(promo_code) values('FORGED');
    raise exception 'Fake usage accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('fake_usage_denied',true); end;
  begin
    perform public.reserve_guest_checkout(null,null,40,null,'FORGED');
    raise exception 'Nonadmin pricing RPC accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('pricing_rpc_not_client_callable',true); end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin perform 1 from public.promo_codes; raise exception 'Anon read accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('anon_codes_denied',true); end;
end $$;
reset role;

-- Administrators can read audit snapshots, but cannot alter or erase them.
select set_config('request.jwt.claim.sub',(select owner_id::text from promo_audit_context),true);
set local role authenticated;
select pg_temp.promo_assert('admin_reads_history',(select count(*) >= 72 from public.promo_code_uses));
do $$
begin
  begin update public.promo_code_uses set discount_value=90; raise exception 'History update accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('history_update_denied',true); end;
  begin delete from public.promo_code_uses; raise exception 'History delete accepted';
  exception when insufficient_privilege then perform pg_temp.promo_assert('history_delete_denied',true); end;
end $$;
reset role;

-- Compare only preexisting rows within the stable snapshot.
select pg_temp.promo_assert('preexisting_rows_unchanged',not exists (
  select source,id,payload from promo_audit_baseline except
  (select 'projects',id,to_jsonb(p) from public.projects p
  union all select 'project_payments',id,to_jsonb(p) from public.project_payments p
  union all select 'guest_license_payments',id,to_jsonb(p) from public.guest_license_payments p
  union all select 'rsvp_addon_purchases',id,to_jsonb(p) from public.rsvp_addon_purchases p
  union all select 'promo_codes',id,to_jsonb(p) from public.promo_codes p
  union all select 'promo_code_uses',id,to_jsonb(p) from public.promo_code_uses p)
));
select count(*)::integer as total,count(*) filter(where passed)::integer as passed,'ROLLBACK follows; no Stripe call' as detail from promo_audit_results;
rollback;
