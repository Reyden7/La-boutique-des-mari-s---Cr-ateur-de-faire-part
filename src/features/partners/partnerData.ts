export interface Partner {id:string;name:string;contact_name:string|null;professional_email:string|null;is_active:boolean;created_at:string}
export interface PartnerCommission {
 id:string;receipt_id:string;partner_id:string;partner_name:string;promo_code:string;sale_at:string;
 gross_cents:number;discount_cents:number;tax_cents:number|null;base_cents:number|null;commission_rate:number;
 original_commission_cents:number|null;commission_cents:number;refunded_cents:number;
 status:'pending'|'payable'|'paid'|'canceled';settled_cents:number;settled_at:string|null;settlement_id:string|null;
}
export interface PartnerSettlement {id:string;partner_id:string;amount_cents:number;paid_on:string;reference:string|null;administrator_id:string;created_at:string}
export interface CommissionAdjustment {id:string;commission_id:string;stripe_event_id:string;refunded_cents:number;previous_commission_cents:number;new_commission_cents:number;delta_cents:number;requires_regularization:boolean;created_at:string}
export const commissionStatus={pending:'En attente',payable:'À régler',paid:'Réglée',canceled:'Annulée'};
export const validCommissionRate=(value:number)=>Number.isFinite(value)&&value>=0&&value<=100&&Math.abs(value*100-Math.round(value*100))<1e-8;
export const regularizationDue=(c:PartnerCommission)=>Math.max(0,c.settled_cents-c.commission_cents);
export function filterCommissions(rows:PartnerCommission[],partnerId:string,from:string,to:string){
 return rows.filter(c=>(!partnerId||c.partner_id===partnerId)&&(!from||c.sale_at.slice(0,10)>=from)&&(!to||c.sale_at.slice(0,10)<=to));
}
export function summarizeCommissions(rows:PartnerCommission[]){
 const groups=new Map<string,{partnerId:string;partner:string;code:string;sales:number;revenue:number;payable:number;paid:number;regularization:number}>();
 for(const c of rows){const key=JSON.stringify([c.partner_id,c.promo_code]);const g=groups.get(key)??{partnerId:c.partner_id,partner:c.partner_name,code:c.promo_code,sales:0,revenue:0,payable:0,paid:0,regularization:0};
  g.sales++;g.revenue+=c.gross_cents-c.refunded_cents;g.payable+=c.status==='payable'?c.commission_cents:0;g.paid+=c.settled_cents;g.regularization+=regularizationDue(c);groups.set(key,g);
 }return [...groups.values()];
}
const csvCell=(value:unknown)=>{let s=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function partnerCommissionsCsv(rows:PartnerCommission[]){
 const amount=(n:number|null)=>n===null?'':(n/100).toFixed(2).replace('.',',');
 return '\uFEFF'+[['Partenaire','Code promo','Référence vente','Date','Montant vente initial EUR','Remboursement EUR','Montant encaissé net EUR','Base HT initiale EUR','Réduction EUR','Taux commission %','Commission EUR','Statut','Date règlement','Montant réglé EUR','Régularisation EUR'],
  ...rows.map(c=>[c.partner_name,c.promo_code,c.receipt_id,c.sale_at,amount(c.gross_cents),amount(c.refunded_cents),amount(c.gross_cents-c.refunded_cents),amount(c.base_cents),amount(c.discount_cents),c.commission_rate,amount(c.commission_cents),commissionStatus[c.status],c.settled_at,amount(c.settled_cents),amount(regularizationDue(c))])]
  .map(row=>row.map(csvCell).join(';')).join('\r\n');
}
