import {setupPublicationVersionsDb} from './publication-versions-db.fixture.mjs';
export const partnerMigration='20261102102520_partner_commissions.sql';
export async function partnerFixture(t,apply=true){
 const f=await setupPublicationVersionsDb(t);
 for(const name of ['20261029145330_promo_full_discount_free_publication.sql','20261102075451_rsvp_included_pricing_v3.sql','20261102100112_promo_usage_limits_reservations.sql'])await f.db.exec(await f.file(name));
 if(apply)await f.db.exec(await f.file(partnerMigration));
 f.today=(await f.db.query('select current_date::text d')).rows[0].d;
 f.partner=async(name='Vos Précieux Moments')=>{await f.asOwner();const p=await f.call('admin_save_partner',[null,name,'Contact synthétique','contact@example.invalid',true]);await f.root();return p;};
 f.project=async()=>{
  const id=crypto.randomUUID(),recipient=crypto.randomUUID();await f.asOwner();
  await f.db.query("insert into public.projects(id,owner_id,name,project_data) values($1,$2,'Synthetic partner',$3)",[id,f.owner,JSON.stringify({pages:[],rsvp:{enabled:true,fields:[{id:'food',label:'Repas',type:'short_text'}]}})]);
  await f.call('save_invitation_recipients',[id,0,JSON.stringify([{id:recipient,display_name:'Famille synthétique',guest_count:40,is_active:true}])]);await f.root();return {id,recipient};
 };
 f.code=async(partner,rate=15,discount=10)=>{
  const code='PARTNER_'+crypto.randomUUID().slice(0,8).toUpperCase();
  await f.db.query('insert into public.promo_codes(code,discount_value,partner_id,partner_commission_rate) values($1,$2,$3,$4)',[code,discount,partner?.id??null,partner?rate:0]);return code;
 };
 f.quote=async(code,amount=2969)=>{
  const p=await f.project();const r=await f.call('reserve_confirmed_initial_publication',[p.id,f.owner,40,null,code,'paid-versions-v1',amount]);
  const session='cs_'+r.id;await f.db.query('update public.guest_license_payments set stripe_checkout_session_id=$2 where id=$1',[r.id,session]);return {...p,receipt:r,session,intent:'pi_'+r.id};
 };
 f.pay=async(sale,tax=0)=>{
  await f.root();const {receipt:r,session,intent}=sale;
  await f.call('finalize_guest_checkout',[r.id,f.owner,session,intent,r.amount_cents]);
  await f.call('confirm_partner_commission',[r.id,session,intent,r.amount_cents,tax]);return f.commission(r.id);
 };
 f.commission=async id=>(await f.db.query('select * from public.partner_commissions where receipt_id=$1',[id])).rows[0];
 f.refund=async(sale,cents,event='evt_'+crypto.randomUUID())=>f.call('refund_partner_commission',[sale.receipt.id,sale.session,sale.intent,sale.receipt.amount_cents,cents,event,(await f.commission(sale.receipt.id))?.tax_cents??0]);
 f.settle=async(partner,ids,key=crypto.randomUUID(),expected)=>{await f.root();const rows=(await f.db.query('select commission_cents,settled_cents,status from public.partner_commissions where id=any($1::uuid[])',['{'+ids.join(',')+'}'])).rows;const total=expected??rows.reduce((n,c)=>n+(c.status==='paid'?c.settled_cents:c.commission_cents),0);await f.asOwner();return f.call('admin_settle_partner_commissions',[key,partner.id,'{'+ids.join(',')+'}',f.today,total,'Virement synthétique']);};
 return f;
}
