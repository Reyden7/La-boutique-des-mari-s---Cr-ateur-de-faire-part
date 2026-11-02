import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let calls=[],fail=false;
const rows=Array.from({length:501},(_,i)=>({id:'row-'+i,partner_id:'partner',name:'Partenaire '+i}));
globalThis.__partnerRepo={requireSupabaseSession:async()=>({id:'admin'}),supabase:{
 from:table=>{const chain={select:()=>chain,order:()=>chain,range:async(start,end)=>{calls.push({table,start,end});return {data:rows.slice(start,end+1),error:fail?new Error('fixture failure'):null};}};return chain;},
 rpc:async(name,params)=>{calls.push({name,params});return {data:{id:'synthetic'},error:null};}
}};
const hooks=registerHooks({resolve(specifier,context,next){if(specifier.endsWith('/lib/supabase'))return {url:'partner-repo:client',shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url==='partner-repo:client')return {format:'module',source:'export const {requireSupabaseSession,supabase}=globalThis.__partnerRepo;',shortCircuit:true};return next(url,context);}});
const repo=await import('../src/services/partnerRepository.ts');
test('partner history and CSV source are not silently truncated at the Supabase row limit',async()=>{
 calls=[];const ledger=await repo.loadPartnerLedger();assert.equal(ledger.commissions.length,501);assert.equal(ledger.settlements.length,501);assert.equal(ledger.adjustments.length,501);assert.equal(calls.filter(c=>c.start===500).length,3);
 assert.equal((await repo.listPartners()).length,501);fail=true;await assert.rejects(()=>repo.loadPartnerLedger(),/fixture failure/);fail=false;
});
test('manual settlement posts only a guarded RPC with identity-bound selection and expected total; no direct ledger write',async()=>{
 calls=[];await repo.settlePartnerCommissions('idempotency','partner',['c1'],'2026-11-02','FACT-1',445);
 assert.deepEqual(calls,[{name:'admin_settle_partner_commissions',params:{p_request_id:'idempotency',p_partner_id:'partner',p_commission_ids:['c1'],p_paid_on:'2026-11-02',p_reference:'FACT-1',p_expected_total:445}}]);
});
test.after(()=>{hooks.deregister();delete globalThis.__partnerRepo;});
