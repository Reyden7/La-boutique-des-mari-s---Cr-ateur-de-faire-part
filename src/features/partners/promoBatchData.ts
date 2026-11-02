import type {PromoCodeRecord} from '../../services/promoCodeRepository';
export interface PromoBatchInput {partnerId:string;prefix:string;department:string;quantity:number;discountValue:number;commissionRate:number;maxUses:number|null;isActive:boolean}
export interface PromoBatchPreview extends PromoBatchInput {partnerName:string;codes:string[]}
export interface PromoBatchResult extends PromoBatchInput {batchId:string;partnerName:string;codes:PromoCodeRecord[]}
export const normalizeBatchPrefix=(value:string)=>value.replace(/[œŒ]/g,'OE').replace(/[æÆ]/g,'AE').replace(/ß/g,'SS').normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function batchCodesCsv(batch:PromoBatchResult){
 if(batch.codes.some(c=>c.partner_id!==batch.partnerId||c.batch_id!==batch.batchId))throw new Error('Le lot contient des codes d’un autre partenaire. Export refusé.');
 const cell=(v:unknown)=>{let text=String(v??'');if(/^\s*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const rate=(n:number)=>Number(n).toFixed(2).replace('.',',');
 return '\uFEFF'+[['Partenaire','Département','Code','Réduction client (%)','Commission partenaire (%)','Limite d’utilisation','Statut'],
  ...batch.codes.map(c=>[batch.partnerName,c.department,c.code,rate(c.discount_value),rate(c.partner_commission_rate??0),c.max_uses??'Illimitée',c.is_active?'Actif':'Désactivé'])]
  .map(row=>row.map(cell).join(';')).join('\r\n');
}
