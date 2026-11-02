import {requireSupabaseSession,supabase} from '../lib/supabase';
import type {Partner,PartnerCommission,PartnerSettlement,CommissionAdjustment} from '../features/partners/partnerData';
async function client(){if(!supabase)throw new Error('Supabase n’est pas configuré.');await requireSupabaseSession();return supabase;}
async function allRows(api:Awaited<ReturnType<typeof client>>,table:string,order:string){
 const rows=new Map<string,Record<string,unknown>>();
 for(let start=0;;start+=500){const {data,error}=await api.from(table).select('*').order(order,{ascending:table==='partners'}).order('id').range(start,start+499);if(error)throw error;for(const row of data??[])rows.set(row.id,row);if(!data||data.length<500)break;}
 return [...rows.values()];
}
export async function listPartners():Promise<Partner[]>{return await allRows(await client(),'partners','name') as unknown as Partner[];}
export async function savePartner(id:string|null,name:string,contact:string,email:string,active:boolean):Promise<Partner>{
 const {data,error}=await(await client()).rpc('admin_save_partner',{p_id:id,p_name:name,p_contact_name:contact,p_email:email,p_active:active});
 if(error)throw new Error(error.code==='23505'?'Un partenaire porte déjà ce nom.':'Le partenaire n’a pas pu être enregistré.');return data;
}
export async function loadPartnerLedger(){
 const api=await client();const results=await Promise.all([
  allRows(api,'partner_commissions','sale_at'),allRows(api,'partner_settlements','created_at'),allRows(api,'partner_commission_adjustments','created_at')]);
 return {commissions:results[0] as unknown as PartnerCommission[],settlements:results[1] as unknown as PartnerSettlement[],adjustments:results[2] as unknown as CommissionAdjustment[]};
}
export async function settlePartnerCommissions(requestId:string,partnerId:string,ids:string[],paidOn:string,reference:string,expectedTotal:number):Promise<PartnerSettlement>{
 const {data,error}=await(await client()).rpc('admin_settle_partner_commissions',{p_request_id:requestId,p_partner_id:partnerId,p_commission_ids:ids,p_paid_on:paidOn,p_reference:reference,p_expected_total:expectedTotal});
 if(error)throw new Error('Règlement non enregistré : actualisez les commissions et vérifiez la sélection.');return data;
}
