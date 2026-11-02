import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let calls=[],error=null,response;
globalThis.__batchRepo={requireSupabaseSession:async()=>({id:'admin'}),supabase:{rpc:async(name,params)=>{calls.push({name,params});return {data:response,error};}}};
const hooks=registerHooks({resolve(specifier,context,next){if(specifier.endsWith('/lib/supabase'))return {url:'batch-repo:client',shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url==='batch-repo:client')return {format:'module',source:'export const {requireSupabaseSession,supabase}=globalThis.__batchRepo;',shortCircuit:true};return next(url,context);}});
const repo=await import('../src/services/promoBatchRepository.ts');
const input={partnerId:'partner',prefix:'WP',department:'71',quantity:1,discountValue:100,commissionRate:15,maxUses:1,isActive:true};
test('preview never generates codes and generation sends only parameters plus a stable request ID',async()=>{
 calls=[];response={...input,codes:['WP7101']};await repo.previewPromoBatch(input);assert.equal(calls[0].name,'admin_preview_promo_batch');assert.equal('p_request_id' in calls[0].params,false);
 response={...input,batchId:'request',codes:[{id:'code',code:'WP7101'}]};await repo.generatePromoBatch(input,'request');await repo.generatePromoBatch(input,'request');
 assert.deepEqual(calls[1],calls[2]);assert.equal(calls[1].params.p_request_id,'request');assert.equal('codes' in calls[1].params,false);assert.equal(calls[1].params.p_quantity,1);
});
test('server validation errors remain explicit; uncertain response never reports success',async()=>{
 error={message:'BATCH_PARTNER_INACTIVE'};await assert.rejects(()=>repo.generatePromoBatch(input,'request'),/partenaire actif/);error=null;
 response={...input,codes:[]};await assert.rejects(()=>repo.generatePromoBatch(input,'request'),/incohérente/);
 response={...input,partnerId:'other',codes:['BAD']};await assert.rejects(()=>repo.previewPromoBatch(input),/incohérente/);
});
test.after(()=>{hooks.deregister();delete globalThis.__batchRepo;});
