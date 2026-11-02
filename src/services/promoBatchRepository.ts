import {supabase,requireSupabaseSession} from '../lib/supabase';
import type {PromoBatchInput,PromoBatchPreview,PromoBatchResult} from '../features/partners/promoBatchData';
function parameters(input:PromoBatchInput){return {p_partner_id:input.partnerId,p_prefix:input.prefix,p_department:input.department,p_quantity:input.quantity,p_discount:input.discountValue,p_commission:input.commissionRate,p_max_uses:input.maxUses,p_active:input.isActive};}
const messages:Record<string,string>={ADMIN_REQUIRED:'Cette opération est réservée aux administrateurs.',BATCH_PARTNER_INACTIVE:'Sélectionnez un partenaire actif.',BATCH_PREFIX_INVALID:'Le préfixe est vide ou trop long pour ce département.',BATCH_DEPARTMENT_INVALID:'Le département doit contenir 2 ou 3 lettres ou chiffres.',BATCH_QUANTITY_INVALID:'Le nombre de codes doit être un entier de 1 à 100.',BATCH_RATE_INVALID:'Vérifiez les pourcentages et leurs deux décimales maximum.',BATCH_USAGE_INVALID:'La limite doit être un entier entre 1 et 1 000 000.',BATCH_SEQUENCE_EXHAUSTED:'La numérotation ne tient plus dans ce préfixe. Choisissez un préfixe plus court.',BATCH_REPLAY_MISMATCH:'Cette requête a déjà servi à un autre lot. Recommencez l’aperçu.'};
async function request<T>(name:string,input:PromoBatchInput,requestId?:string):Promise<T>{
 if(!supabase)throw new Error('Supabase n’est pas configuré.');await requireSupabaseSession();
 const {data,error}=await supabase.rpc(name,{...parameters(input),...(requestId?{p_request_id:requestId}:{})});
 if(error){const reason=Object.keys(messages).find(key=>error.message?.includes(key));throw new Error(reason?messages[reason]:'Le lot n’a pas pu être confirmé. Réessayez avec le même aperçu ; aucun nouveau lot ne sera créé en double.');}
 if(!data||!Array.isArray(data.codes)||data.codes.length!==input.quantity||data.partnerId!==input.partnerId)throw new Error('Réponse du serveur incohérente. Actualisez l’historique avant de recommencer.');
 return data as T;
}
export const previewPromoBatch=(input:PromoBatchInput)=>request<PromoBatchPreview>('admin_preview_promo_batch',input);
export const generatePromoBatch=(input:PromoBatchInput,requestId:string)=>request<PromoBatchResult>('admin_generate_promo_batch',input,requestId);
