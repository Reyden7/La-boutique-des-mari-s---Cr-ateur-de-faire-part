import test from 'node:test';
import assert from 'node:assert/strict';
import {validCommissionRate,partnerCommissionsCsv,summarizeCommissions,filterCommissions,regularizationDue} from '../src/features/partners/partnerData.ts';
const row={id:'c',receipt_id:'sale',partner_id:'p',partner_name:'Vos Précieux Moments',promo_code:'CODE',sale_at:'2026-11-02T12:00:00Z',gross_cents:2969,discount_cents:330,tax_cents:0,base_cents:2969,commission_rate:15,original_commission_cents:445,commission_cents:445,refunded_cents:0,status:'payable',settled_cents:0,settled_at:null,settlement_id:null};
test('commission percentage accepts 0..100 with two decimals only',()=>{
 for(const n of [0,0.01,15,99.99,100])assert.equal(validCommissionRate(n),true);
 for(const n of [-1,100.01,1.001,NaN,Infinity])assert.equal(validCommissionRate(n),false);
});
test('partner summary uses actual ledger values, net refunds and historical settlements',()=>{
 const paid={...row,id:'paid',commission_cents:295,status:'paid',settled_cents:445,refunded_cents:1000};const free={...row,id:'free',gross_cents:0,commission_cents:0};
 const [g]=summarizeCommissions([row,paid,free]);assert.equal(g.sales,3);assert.equal(g.revenue,4938);assert.equal(g.payable,445);assert.equal(g.paid,445);assert.equal(g.regularization,150);assert.equal(regularizationDue(paid),150);
 assert.deepEqual(filterCommissions([row],'other','',''),[]);assert.deepEqual(filterCommissions([row],'p','2026-11-01','2026-11-02'),[row]);assert.deepEqual(filterCommissions([row],'','2026-11-03',''),[]);
});
test('CSV exports accounting amounts, settlement date and prevents spreadsheet formulas',()=>{
 const csv=partnerCommissionsCsv([{...row,partner_name:'=CMD("test")',promo_code:'CODE;"A"',status:'paid',settled_at:'2026-11-02',settled_cents:445}]);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"29,69"'));assert.ok(csv.includes('"4,45"'));assert.ok(csv.includes('"Réglée"'));assert.ok(csv.includes('"2026-11-02"'));assert.ok(csv.includes('"\'=CMD(""test"")"'));assert.ok(csv.includes('"CODE;""A"""'));
});
