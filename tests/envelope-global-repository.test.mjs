import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { globalEnvelopeChoices, resolveEnvelopeAsset } from '../src/features/openings/envelopeAssets.ts';
let rows=[],pending=[],invocations=[];
const deferred=()=>{let resolve;const promise=new Promise((r)=>{resolve=r;});return{promise,resolve};};
globalThis.__globalRepoClient={from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,returns:()=>{const item=deferred();pending.push(item);return item.promise;}};return query;},functions:{invoke:async(name,{body})=>{invocations.push({name,body});return{data:{asset:rows[0]},error:null};}}};
registerHooks({resolve(specifier,context,next){if(specifier==='../lib/supabase')return{url:'global-repo:client',shortCircuit:true};if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);return next(specifier,context);},load(url,context,next){if(url==='global-repo:client')return{format:'module',source:'export const isSupabaseConfigured=true;export const supabase=globalThis.__globalRepoClient;export const requireSupabaseSession=async()=>({id:"admin"});',shortCircuit:true};return next(url,context);}});
const repo=await import('../src/services/globalAssetRepository.ts');
const row=(id,type='envelope_base')=>({id,type,name:id,slug:id,url:`https://example.invalid/storage/v1/object/public/global-assets/envelope/bases/${id}.png`,storage_path:`envelope/bases/${id}.png`,thumbnail_url:null,metadata:{},sort_order:0,is_published:true,is_featured:false,created_at:'2026-10-07',updated_at:'2026-10-07',created_by:'admin',source_asset_id:null});
test('publication invalidation cannot be overwritten by an old cached request',async()=>{
  repo.clearGlobalAssetCache();pending=[];
  const old=repo.listPublishedGlobalAssets();assert.equal(pending.length,1);
  repo.clearGlobalAssetCache();const fresh=repo.listPublishedGlobalAssets();assert.equal(pending.length,2);
  pending[1].resolve({data:[row('new')],error:null});assert.equal((await fresh)[0].id,'new');
  pending[0].resolve({data:[row('stale')],error:null});assert.equal((await old)[0].id,'new');
  assert.equal((await repo.listPublishedGlobalAssets('envelope_base'))[0].id,'new');
});
test('multipart repository upload uses existing function, exact file and envelope type; no wedding-assets staging',async()=>{
  rows=[row('global')];invocations=[];const file=new File([readFileSync(new URL('../public/assets/openings/envelope/cachet1.png',import.meta.url))],'cachet.png',{type:'image/png'});
  const asset=await repo.publishGlobalEnvelopeAsset(file,'envelope_seal',' Cachet or ');
  assert.equal(asset.id,'global');assert.equal(invocations[0].name,'publish-global-asset');assert.ok(invocations[0].body instanceof FormData);
  assert.equal(invocations[0].body.get('type'),'envelope_seal');assert.equal(invocations[0].body.get('name'),'Cachet or');assert.equal(invocations[0].body.get('file').size,file.size);
});
test('selector filters type/publication, removes duplicates, honors order and retains snapshot after depublication',()=>{
  const assets=[{id:'b',type:'envelope_base',isPublished:true,sortOrder:2,createdAt:'2026',name:'B',url:row('b').url},{id:'a',type:'envelope_base',isPublished:true,sortOrder:1,createdAt:'2026',name:'A',url:row('a').url},{id:'hidden',type:'envelope_base',isPublished:false,sortOrder:0,createdAt:'2026'},{id:'seal',type:'envelope_seal',isPublished:true,sortOrder:0,createdAt:'2026'}];
  const refs=globalEnvelopeChoices([...assets,assets[0]],'base');assert.deepEqual(refs.map(item=>item.id),['a','b']);
  assert.deepEqual(Object.keys(refs[0]).sort(),['id','name','type','url']);
  const selected=refs[0];assets[1].isPublished=false;
  assert.deepEqual(globalEnvelopeChoices(assets,'base').map(item=>item.id),['b']);
  assert.deepEqual(resolveEnvelopeAsset({baseAsset:selected},'base'),selected);
  assert.deepEqual(resolveEnvelopeAsset(JSON.parse(JSON.stringify({baseAsset:selected})),'base'),selected);
});
