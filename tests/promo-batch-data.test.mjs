import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeBatchPrefix,batchCodesCsv} from '../src/features/partners/promoBatchData.ts';
test('batch prefixes normalize accents, spaces, ligatures and ASCII characters consistently',()=>{
 for(const [value,expected] of [['Vos Précieux Moments','VOSPRECIEUXMOMENTS'],['Cœur & Æther 42','COEURAETHER42'],[' Éléonore-2a ','ELEONORE2A'],['!!!','']])assert.equal(normalizeBatchPrefix(value),expected);
});
test('batch CSV contains only saved codes for its partner, department and actual shared parameters',()=>{
 const batch={batchId:'batch',partnerId:'partner',partnerName:'=FORMULE("test")',codes:[{code:'WP2A01',partner_id:'partner',batch_id:'batch',department:'2A',discount_value:100,partner_commission_rate:15,max_uses:1,is_active:true}]};
 const csv=batchCodesCsv(batch);assert.ok(csv.startsWith('\uFEFF'));assert.equal(csv.split('\r\n').length,2);for(const v of ['"2A"','"WP2A01"','"100,00"','"15,00"','"1"','"Actif"'])assert.ok(csv.includes(v));assert.ok(csv.includes('"\'=FORMULE(""test"")"'));
 assert.throws(()=>batchCodesCsv({...batch,codes:[{...batch.codes[0],partner_id:'another'}]}),/autre partenaire/);
 assert.throws(()=>batchCodesCsv({...batch,codes:[{...batch.codes[0],batch_id:'another'}]}),/autre partenaire/);
});
