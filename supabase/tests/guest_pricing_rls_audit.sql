-- Production-safe audit: existing Auth user is read, never changed or created.
-- All project/payment fixtures and temporary helpers are rolled back.
-- This tests SQL/RLS, not a real Stripe payment or signed webhook delivery.
begin isolation level repeatable read;

-- Compare existing rows inside one stable snapshot, even while users autosave.
create temporary table guest_audit_baseline on commit drop as
  select 'projects'::text as source, id, to_jsonb(p) as payload from public.projects p
  union all select 'project_payments', id, to_jsonb(p) from public.project_payments p
  union all select 'guest_license_payments', id, to_jsonb(p) from public.guest_license_payments p
  union all select 'rsvp_addon_purchases', id, to_jsonb(p) from public.rsvp_addon_purchases p;

create temporary table guest_audit_results (
  test_name text primary key, passed boolean not null, detail text not null
) on commit drop;
create temporary table guest_audit_context (
  owner_id uuid, other_id uuid, project_id uuid, receipt_id uuid
) on commit drop;
grant select, insert on guest_audit_results to authenticated, anon;
grant select on guest_audit_context to authenticated, anon;

create function pg_temp.guest_assert(p_name text, p_passed boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_passed is distinct from true then raise exception 'AUDIT FAILED: % (%)', p_name, p_detail; end if;
  insert into guest_audit_results values (p_name, true, p_detail);
end $$;

do $$
declare v_owner uuid;
begin
  select id into v_owner from auth.users where coalesce(is_anonymous,false)=false order by created_at limit 1;
  if v_owner is null then raise exception 'Audit requires an existing authenticated user'; end if;
  insert into guest_audit_context(owner_id,other_id) values (v_owner,extensions.gen_random_uuid());
end $$;

-- Historical publication, replay, independently purchased form, and refund.
do $$
declare
  v_owner uuid := (select owner_id from guest_audit_context);
  v_id uuid; v_combined boolean; v_session text; v_intent text; v_public text; v_data jsonb;
begin
  foreach v_combined in array array[false,true] loop
    v_id := extensions.gen_random_uuid(); v_session := 'cs_audit_legacy_'||v_id; v_intent := 'pi_audit_legacy_'||v_id;
    insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Audit guest pricing] legacy',jsonb_build_object('id',v_id,'pages','[]'::jsonb,'rsvp',jsonb_build_object('enabled',v_combined)));
    insert into public.project_payments(project_id,owner_id,amount_cents,status,includes_rsvp,stripe_checkout_session_id)
      values(v_id,v_owner,2490+case when v_combined then 990 else 0 end,'pending',v_combined,v_session);
    perform public.finalize_project_payment(v_id,v_owner,v_session,v_intent);
    select public_id into v_public from public.projects where id=v_id;
    perform public.finalize_project_payment(v_id,v_owner,v_session,v_intent);
    perform pg_temp.guest_assert('legacy_publication_replay_'||v_combined,
      (select status='published' and payment_status='paid' and public_id=v_public and purchased_guest_capacity is null and purchased_extra_blocks is null from public.projects where id=v_id),'legacy amount and unlimited capacity preserved');
    perform pg_temp.guest_assert('legacy_public_link_'||v_combined, public.get_public_project(v_public) is not null);
    if not v_combined then
      insert into public.rsvp_addon_purchases(project_id,owner_id,status,amount_cents,stripe_checkout_session_id) values(v_id,v_owner,'pending',990,'cs_audit_addon_'||v_id);
      perform public.finalize_rsvp_addon_payment(v_id,v_owner,'cs_audit_addon_'||v_id,'pi_audit_addon_'||v_id,990);
      perform public.finalize_rsvp_addon_payment(v_id,v_owner,'cs_audit_addon_'||v_id,'pi_audit_addon_'||v_id,990);
    end if;
    perform pg_temp.guest_assert('legacy_form_paid_'||v_combined,(select project_data #>> '{rsvp,purchased}'='true' from public.projects where id=v_id));
    perform public.refund_project_payment(v_id,v_owner,v_session,v_intent);
    perform public.refund_project_payment(v_id,v_owner,v_session,v_intent);
    perform pg_temp.guest_assert('legacy_refund_replay_'||v_combined,
      (select status='draft' and payment_status='refunded' and (project_data #>> '{rsvp,purchased}' = case when v_combined then 'false' else 'true' end) from public.projects where id=v_id));
    perform pg_temp.guest_assert('legacy_refunded_not_public_'||v_combined, public.get_public_project(v_public) is null);
    if not v_combined then
      perform public.refund_rsvp_addon_payment(v_id,v_owner,'cs_audit_addon_'||v_id,'pi_audit_addon_'||v_id);
      perform pg_temp.guest_assert('separate_form_refund',(select project_data #>> '{rsvp,purchased}'='false' from public.projects where id=v_id));
    end if;
  end loop;
end $$;

-- All declared pricing tiers independently calculated in PostgreSQL, with/without form.
do $$
declare
  v_owner uuid := (select owner_id from guest_audit_context);
  v_case record; v_form boolean; v_id uuid; v_receipt public.guest_license_payments;
  v_session text; v_intent text; v_public text; v_expected integer;
begin
  for v_case in select * from (values(1,2450,40),(40,2450,40),(41,2900,47),(47,2900,47),(48,3350,54),(54,3350,54),(55,3800,61),(61,3800,61),(62,4250,68)) q(guests,amount,capacity) loop
    foreach v_form in array array[false,true] loop
      v_id := extensions.gen_random_uuid(); v_session := 'cs_audit_tier_'||v_id; v_intent := 'pi_audit_tier_'||v_id;
      insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Audit guest pricing] tier',jsonb_build_object('id',v_id,'pages','[]'::jsonb,'rsvp',jsonb_build_object('enabled',v_form)));
      select * into v_receipt from public.reserve_guest_checkout(v_id,v_owner,v_case.guests,null);
      v_expected := v_case.amount + case when v_form then 990 else 0 end;
      perform pg_temp.guest_assert('tier_'||v_case.guests||'_form_'||v_form,v_receipt.amount_cents=v_expected and v_receipt.guest_capacity=v_case.capacity and v_receipt.has_form=v_form,format('amount=%s capacity=%s',v_receipt.amount_cents,v_receipt.guest_capacity));
      update public.guest_license_payments set stripe_checkout_session_id=v_session where id=v_receipt.id;
      perform public.finalize_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_expected);
      select public_id into v_public from public.projects where id=v_id;
      perform public.finalize_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_expected);
      perform pg_temp.guest_assert('settlement_'||v_case.guests||'_form_'||v_form,
        (select status='published' and payment_status='paid' and purchased_guest_capacity=v_case.capacity and purchased_extra_blocks=v_receipt.extra_blocks and publication_license_id is not null and public_id=v_public and coalesce(project_data #>> '{rsvp,purchased}','false')=v_form::text from public.projects where id=v_id));
      if v_form then
        perform pg_temp.guest_assert('form_amount_'||v_case.guests,(select amount_cents=990 and status='paid' from public.rsvp_addon_purchases where project_id=v_id));
      end if;
      perform pg_temp.guest_assert('ledger_paid_'||v_case.guests||'_form_'||v_form,
        (select count(*)=1 from public.guest_license_payments where project_id=v_id and id=v_receipt.id
          and status='paid' and guest_count=v_case.guests and guest_capacity=v_case.capacity
          and extra_blocks=v_receipt.extra_blocks and amount_cents=v_expected and has_form=v_form
          and stripe_checkout_session_id=v_session and stripe_payment_intent_id=v_intent),
        'single paid receipt; original quote and Stripe identifiers preserved after replay');
      perform public.refund_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_expected);
      perform public.refund_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_expected);
      perform public.finalize_guest_checkout(v_receipt.id,v_owner,v_session,v_intent,v_expected);
      perform pg_temp.guest_assert('refund_'||v_case.guests||'_form_'||v_form,
        (select status='draft' and payment_status='refunded' and purchased_guest_capacity is null and purchased_extra_blocks is null and coalesce(project_data #>> '{rsvp,purchased}','false')='false' from public.projects where id=v_id));
      perform pg_temp.guest_assert('ledger_refunded_'||v_case.guests||'_form_'||v_form,
        (select count(*)=1 from public.guest_license_payments where project_id=v_id and id=v_receipt.id
          and status='refunded' and amount_cents=v_expected and guest_count=v_case.guests),
        'refund and late payment replay do not duplicate or reactivate the receipt');
    end loop;
  end loop;
end $$;

-- Exact upgrade examples and capacity retention after a declaration decreases.
do $$
declare
  v_owner uuid := (select owner_id from guest_audit_context);
  v_case record; v_id uuid; v_initial public.guest_license_payments; v_upgrade public.guest_license_payments;
  v_session text; v_rejected boolean;
begin
  for v_case in select * from (values(40,47,450,47),(40,54,900,54),(47,54,450,54),(54,53,0,54)) q(old_capacity,new_count,amount,capacity) loop
    v_id := extensions.gen_random_uuid(); v_session := 'cs_audit_upgrade_base_'||v_id;
    insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Audit guest pricing] upgrade','{"rsvp":{"enabled":false}}');
    select * into v_initial from public.reserve_guest_checkout(v_id,v_owner,v_case.old_capacity,null);
    update public.guest_license_payments set stripe_checkout_session_id=v_session where id=v_initial.id;
    perform public.finalize_guest_checkout(v_initial.id,v_owner,v_session,'pi_audit_upgrade_base_'||v_id,v_initial.amount_cents);
    if v_case.amount=0 then
      v_rejected := false;
      begin
        perform public.reserve_guest_checkout(v_id,v_owner,v_case.new_count,null);
      exception when raise_exception then
        if sqlerrm <> 'CAPACITY_ALREADY_COVERED' then raise; end if;
        v_rejected := true;
      end;
      update public.projects set project_data=project_data||jsonb_build_object('requestedGuestCount',v_case.new_count) where id=v_id;
      perform pg_temp.guest_assert('upgrade_54_to_53_free',v_rejected and (select purchased_guest_capacity=54 from public.projects where id=v_id),'no Checkout; capacity retained');
    else
      select * into v_upgrade from public.reserve_guest_checkout(v_id,v_owner,v_case.new_count,null);
      perform pg_temp.guest_assert('upgrade_quote_'||v_case.old_capacity||'_to_'||v_case.new_count,v_upgrade.amount_cents=v_case.amount and not v_upgrade.has_form,format('amount=%s',v_upgrade.amount_cents));
      v_session := 'cs_audit_upgrade_'||v_id;
      update public.guest_license_payments set stripe_checkout_session_id=v_session where id=v_upgrade.id;
      perform public.finalize_guest_checkout(v_upgrade.id,v_owner,v_session,'pi_audit_upgrade_'||v_id,v_case.amount);
      perform public.finalize_guest_checkout(v_upgrade.id,v_owner,v_session,'pi_audit_upgrade_'||v_id,v_case.amount);
      perform pg_temp.guest_assert('upgrade_capacity_'||v_case.old_capacity||'_to_'||v_case.new_count,(select status='published' and payment_status='paid' and purchased_guest_capacity=v_case.capacity from public.projects where id=v_id));
      perform pg_temp.guest_assert('upgrade_ledger_'||v_case.old_capacity||'_to_'||v_case.new_count,
        (select count(*)=2 from public.guest_license_payments where project_id=v_id and status='paid')
        and (select purchase_type='guest_capacity_upgrade' and amount_cents=v_case.amount
          and additional_blocks=v_case.amount/450 and not has_form from public.guest_license_payments where id=v_upgrade.id));
      perform public.refund_guest_checkout(v_upgrade.id,v_owner,v_session,'pi_audit_upgrade_'||v_id,v_case.amount);
      perform pg_temp.guest_assert('upgrade_refund_'||v_case.old_capacity||'_to_'||v_case.new_count,(select status='published' and payment_status='paid' and purchased_guest_capacity=v_case.old_capacity from public.projects where id=v_id));
      perform pg_temp.guest_assert('upgrade_refund_ledger_'||v_case.old_capacity||'_to_'||v_case.new_count,
        (select status='refunded' from public.guest_license_payments where id=v_upgrade.id)
        and (select status='paid' from public.guest_license_payments where id=v_initial.id));
    end if;
  end loop;
end $$;

-- Paid fixture for client permission tests. No modification of an actual user's project.
-- New guest-v1 publication followed by the existing separate form purchase.
do $$
declare
  v_owner uuid := (select owner_id from guest_audit_context);
  v_id uuid := extensions.gen_random_uuid(); v_receipt public.guest_license_payments; v_public text;
begin
  insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Audit guest pricing] separate form','{"rsvp":{"enabled":false}}');
  select * into v_receipt from public.reserve_guest_checkout(v_id,v_owner,40,null);
  update public.guest_license_payments set stripe_checkout_session_id='cs_audit_separate_'||v_id where id=v_receipt.id;
  perform public.finalize_guest_checkout(v_receipt.id,v_owner,'cs_audit_separate_'||v_id,'pi_audit_separate_'||v_id,2450);
  select public_id into v_public from public.projects where id=v_id;
  insert into public.rsvp_addon_purchases(project_id,owner_id,status,amount_cents,stripe_checkout_session_id)
    values(v_id,v_owner,'pending',990,'cs_audit_separate_form_'||v_id);
  perform public.finalize_rsvp_addon_payment(v_id,v_owner,'cs_audit_separate_form_'||v_id,'pi_audit_separate_form_'||v_id,990);
  perform public.finalize_rsvp_addon_payment(v_id,v_owner,'cs_audit_separate_form_'||v_id,'pi_audit_separate_form_'||v_id,990);
  perform pg_temp.guest_assert('guest_v1_separate_form_paid',
    (select status='published' and payment_status='paid' and public_id=v_public and purchased_guest_capacity=40
      and purchased_extra_blocks=0 and project_data #>> '{rsvp,purchased}'='true' from public.projects where id=v_id)
    and (select amount_cents=2450 from public.project_payments where project_id=v_id)
    and (select amount_cents=990 and status='paid' from public.rsvp_addon_purchases where project_id=v_id));
  perform public.refund_guest_checkout(v_receipt.id,v_owner,'cs_audit_separate_'||v_id,'pi_audit_separate_'||v_id,2450);
  perform pg_temp.guest_assert('guest_v1_refund_preserves_separate_form',
    (select status='draft' and payment_status='refunded' and project_data #>> '{rsvp,purchased}'='true' from public.projects where id=v_id));
  perform public.refund_rsvp_addon_payment(v_id,v_owner,'cs_audit_separate_form_'||v_id,'pi_audit_separate_form_'||v_id);
  perform pg_temp.guest_assert('guest_v1_separate_form_own_refund',
    (select project_data #>> '{rsvp,purchased}'='false' from public.projects where id=v_id));
end $$;

do $$
declare
  v_owner uuid := (select owner_id from guest_audit_context);
  v_id uuid := extensions.gen_random_uuid(); v_receipt public.guest_license_payments; v_denied boolean;
begin
  insert into public.projects(id,owner_id,name,project_data) values(v_id,v_owner,'[Audit guest pricing] RLS','{"rsvp":{"enabled":true}}');
  select * into v_receipt from public.reserve_guest_checkout(v_id,v_owner,54,null);
  update public.guest_license_payments set stripe_checkout_session_id='cs_audit_rls_'||v_id where id=v_receipt.id;
  v_denied := false;
  begin
    perform public.finalize_guest_checkout(v_receipt.id,v_owner,'cs_audit_rls_'||v_id,'pi_audit_rls_'||v_id,1);
  exception when raise_exception then
    if sqlerrm <> 'GUEST_PAYMENT_MISMATCH' then raise; end if;
    v_denied := true;
  end;
  perform pg_temp.guest_assert('falsified_amount_denied',v_denied);
  v_denied := false;
  begin
    update public.guest_license_payments set amount_cents=1 where id=v_receipt.id;
  exception when check_violation then v_denied := true;
  end;
  perform pg_temp.guest_assert('quote_constraint_denies_fake_amount',v_denied);
  perform public.finalize_guest_checkout(v_receipt.id,v_owner,'cs_audit_rls_'||v_id,'pi_audit_rls_'||v_id,v_receipt.amount_cents);
  update guest_audit_context set project_id=v_id,receipt_id=v_receipt.id;
  perform pg_temp.guest_assert('template_scrubs_guest_rights',not (private.sanitize_template_data('{"pages":[],"requestedGuestCount":54,"purchasedGuestCapacity":54,"purchasedExtraBlocks":2,"publicationLicenseId":"source","ownerId":"source","publicId":"source"}'::jsonb) ?| array['requestedGuestCount','purchasedGuestCapacity','purchasedExtraBlocks','publicationLicenseId','ownerId','publicId']));
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from guest_audit_context),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;

select pg_temp.guest_assert('owner_reads_receipt',(select count(*)=1 from public.guest_license_payments where id=(select receipt_id from guest_audit_context)));

do $$
declare v_query text; v_case record; v_denied boolean;
begin
  for v_case in select * from (values
    ('client_capacity_update','update public.projects set purchased_guest_capacity=999 where id=(select project_id from guest_audit_context)'),
    ('client_blocks_update','update public.projects set purchased_extra_blocks=999 where id=(select project_id from guest_audit_context)'),
    ('client_license_update','update public.projects set publication_license_id=null where id=(select project_id from guest_audit_context)'),
    ('client_receipt_insert','insert into public.guest_license_payments(project_id,owner_id,purchase_type,guest_count,guest_capacity,extra_blocks,previous_extra_blocks,additional_blocks,amount_cents) select project_id,owner_id,''guest_capacity_upgrade'',61,61,3,2,1,450 from guest_audit_context'),
    ('client_receipt_update','update public.guest_license_payments set status=''paid'' where id=(select receipt_id from guest_audit_context)'),
    ('client_receipt_delete','delete from public.guest_license_payments where id=(select receipt_id from guest_audit_context)'),
    ('client_reserve_rpc','select public.reserve_guest_checkout(project_id,owner_id,61,null) from guest_audit_context'),
    ('client_finalize_rpc','select public.finalize_guest_checkout(receipt_id,owner_id,''fake'',''fake'',1) from guest_audit_context'),
    ('client_refund_rpc','select public.refund_guest_checkout(receipt_id,owner_id,''fake'',''fake'',1) from guest_audit_context'),
    ('client_fail_rpc','select public.fail_guest_checkout(receipt_id,''fake'') from guest_audit_context')
  ) q(name,statement) loop
    v_denied := false;
    begin execute v_case.statement; exception when insufficient_privilege then v_denied := true; end;
    perform pg_temp.guest_assert(v_case.name,v_denied,'SQLSTATE 42501');
  end loop;
end $$;

update public.projects set project_data=project_data||'{"purchasedGuestCapacity":999,"purchasedExtraBlocks":999,"publicationLicenseId":"forged","purchased_guest_capacity":999,"purchased_extra_blocks":999,"publication_license_id":"forged","rsvp":{"enabled":true,"purchased":false}}'::jsonb where id=(select project_id from guest_audit_context);
select pg_temp.guest_assert('client_json_rights_scrubbed',not (project_data ?| array['purchasedGuestCapacity','purchasedExtraBlocks','publicationLicenseId','purchased_guest_capacity','purchased_extra_blocks','publication_license_id']) and project_data #>> '{rsvp,purchased}'='true' and purchased_guest_capacity=54) from public.projects where id=(select project_id from guest_audit_context);

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select other_id from guest_audit_context),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select pg_temp.guest_assert('other_owner_reads_no_receipt',(select count(*)=0 from public.guest_license_payments where id=(select receipt_id from guest_audit_context)));
select pg_temp.guest_assert('other_owner_reads_no_project',(select count(*)=0 from public.projects where id=(select project_id from guest_audit_context)));

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from guest_audit_context),'role','authenticated','is_anonymous',true)::text,true);
set local role authenticated;
select pg_temp.guest_assert('anonymous_auth_user_reads_no_receipt',(select count(*)=0 from public.guest_license_payments where id=(select receipt_id from guest_audit_context)));

reset role;
set local role anon;
do $$ declare v_denied boolean := false; begin
  begin perform 1 from public.guest_license_payments; exception when insufficient_privilege then v_denied := true; end;
  perform pg_temp.guest_assert('anon_receipt_read_denied',v_denied,'SQLSTATE 42501');
end $$;
reset role;

do $$
declare v_table text; v_unchanged boolean;
begin
  foreach v_table in array array['projects','project_payments','guest_license_payments','rsvp_addon_purchases'] loop
    execute format('select not exists (select 1 from guest_audit_baseline b left join public.%I p on p.id=b.id where b.source=$1 and (p.id is null or to_jsonb(p) is distinct from b.payload))',v_table)
      into v_unchanged using v_table;
    perform pg_temp.guest_assert('existing_rows_unchanged_'||v_table,v_unchanged,'all pre-existing rows unchanged in the transaction snapshot');
  end loop;
end $$;

select * from guest_audit_results order by test_name;
rollback;
