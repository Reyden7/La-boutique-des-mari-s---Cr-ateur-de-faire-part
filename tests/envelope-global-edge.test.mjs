import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { inspectEnvelopeUpload } from "../supabase/functions/_shared/envelopeFormats.ts";

const bytes = readFileSync(new URL('../public/assets/openings/envelope/cachet1.png',import.meta.url));
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let user, usage, uploadError, insertError, removeError, finishError, copyError;
const calls=[];
function reset() { user={id:'owner',app_metadata:{role:'admin'}}; usage={projects:0,templates:0}; uploadError=insertError=removeError=finishError=copyError=null; calls.length=0; }
reset();
globalThis.__envelopeEdgeClient={
  auth:{getUser:async()=>({data:{user},error:null})},
  rpc:async(name,args)=>{ calls.push({op:'rpc',name,args}); return {data:name==='envelope_asset_usage'?usage:name==='reserve_envelope_asset_deletion'?{...usage,blocked:usage.projects+usage.templates>0,storagePath:'envelope/seals/unused.png'}:true,error:name==='finish_envelope_asset_deletion'?finishError:null}; },
  from:(table)=>{ let mutation; const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:null,error:null}),insert:(data)=>{mutation=data; calls.push({op:'insert',table,data}); return query;},single:async()=>table==='assets'?{data:{id:'source',owner_id:'owner',kind:'image',storage_path:'owner/project/envelope/seals/custom.png',mime_type:'image/png',size_bytes:bytes.length},error:null}:{data:{id,...mutation},error:insertError}};return query;},
  storage:{from:(bucket)=>({
    upload:async(path,file,options)=>{calls.push({op:'upload',bucket,path,options,bytes:new Uint8Array(await file.arrayBuffer())});return {error:uploadError};},
    copy:async(path,destination,options)=>{calls.push({op:'copy',bucket,path,destination,options});return {error:copyError};},
    download:async(path)=>{calls.push({op:'download',bucket,path});return {data:new Blob([bytes],{type:'image/png'}),error:null};},
    remove:async(paths)=>{calls.push({op:'remove',bucket,paths});return {error:removeError};},
    getPublicUrl:(path)=>({data:{publicUrl:`https://example.invalid/storage/v1/object/public/${bucket}/${path}`}}),
  })},
};
let handler;
globalThis.Deno={env:{get:(key)=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service'})[key]},serve:(callback)=>{handler=callback;}};
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('npm:@supabase/supabase-js@'))return{url:'envelope-edge:client',shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url==='envelope-edge:client')return{format:'module',source:'export const createClient=()=>globalThis.__envelopeEdgeClient;',shortCircuit:true};return next(url,context);}});
await import('../supabase/functions/publish-global-asset/index.ts');
const json=(body)=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)});
function upload(type='envelope_seal',file=new File([bytes],'Seal.PNG',{type:'image/png'}),name='Or alliances') {const form=new FormData();form.set('type',type);form.set('name',name);form.set('file',file);return new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:form});}

test('all three direct uploads go straight to global-assets, keep original bytes/alpha, trusted dimensions and MIME',async()=>{
  for (const [type,folder] of [['envelope_base','bases'],['envelope_flap','flaps'],['envelope_seal','seals']]) {
    reset();const response=await handler(upload(type));assert.equal(response.status,200);const {asset}=await response.json();
    assert.equal(asset.type,type);assert.equal(asset.is_published,true);assert.equal(asset.source_asset_id,null);
    assert.equal(asset.metadata.width,1254);assert.equal(asset.metadata.height,1254);assert.equal(asset.metadata.mimeType,'image/png');
    assert.equal(calls[0].op,'upload');assert.equal(calls[0].bucket,'global-assets');assert.match(calls[0].path,new RegExp(`^envelope/${folder}/.+-asset\\.png$`));
    assert.deepEqual(Buffer.from(calls[0].bytes),bytes);assert.equal(calls[0].options.upsert,false);assert.equal(calls[0].options.contentType,'image/png');
    assert.ok(!calls.some(call=>call.bucket==='wedding-assets'));assert.equal(asset.thumbnail_url,asset.url);
  }
});
test('WebP header variants get correct dimensions; wrong signature, extension, MIME and size are rejected',async()=>{
  for (const kind of ['VP8X','VP8 ','VP8L']) {
    const webp=Buffer.alloc(40);webp.write('RIFF',0);webp.writeUInt32LE(32,4);webp.write('WEBP',8);webp.write(kind,12);
    if(kind==='VP8X'){webp.writeUIntLE(199,24,3);webp.writeUIntLE(299,27,3);}
    else if(kind==='VP8 '){webp.set([0x9d,1,0x2a],23);webp.writeUInt16LE(200,26);webp.writeUInt16LE(300,28);}
    else {webp[20]=0x2f;webp.writeUInt32LE(199|(299<<14),21);}
    assert.deepEqual(await inspectEnvelopeUpload(new File([webp],'a.webp',{type:'image/webp'})),{width:200,height:300,mimeType:'image/webp',extension:'webp'});
  }
  for(const file of [new File([bytes],'a.jpg',{type:'image/jpeg'}),new File([bytes],'a.png',{type:'image/webp'}),new File(['fake'],'a.png',{type:'image/png'}),new File([new Uint8Array(5*1024*1024+1)],'a.png',{type:'image/png'})]) {
    reset();assert.equal((await handler(upload('envelope_base',file))).status,400);assert.equal(calls.length,0);
  }
});
test('all actions require authenticated nonanonymous app_metadata admin, not user_metadata',async()=>{
  for(const candidate of [null,{id:'owner',app_metadata:{},user_metadata:{role:'admin'}},{id:'owner',is_anonymous:true,app_metadata:{role:'admin'}}]) {
    for(const request of [()=>upload(),()=>json({action:'usage',assetId:id}),()=>json({action:'delete',assetId:id,confirmed:true})]) {
      reset();user=candidate;assert.equal((await handler(request())).status,candidate && !candidate.is_anonymous?403:401);assert.equal(calls.length,0);
    }
  }
});
test('project custom PNG publication validates actual bytes then copies into envelope folder',async()=>{
  reset();const response=await handler(json({type:'envelope_seal',sourceAssetId:'source',name:'Personnalisé'}));assert.equal(response.status,200);
  assert.equal(calls[0].op,'download');assert.equal(calls[1].op,'copy');assert.equal(calls[1].options.destinationBucket,'global-assets');
  assert.match((await response.json()).asset.url,/global-assets\/envelope\/seals\/.+-asset\.png$/);
});
test('failed upload/insert cleans only new object and never publishes',async()=>{
  for(const step of ['upload','insert']){reset();if(step==='upload')uploadError=new Error('expected upload failure');else insertError=new Error('expected insert failure');assert.equal((await handler(upload())).status,500);assert.equal(calls.at(-1).op,'remove');assert.equal(calls.at(-1).bucket,'global-assets');if(step==='upload')assert.ok(!calls.some(call=>call.op==='insert'));}
});
test('delete confirmation and authoritative second reference audit prevent removal of used assets',async()=>{
  reset();assert.equal((await handler(json({action:'delete',assetId:id}))).status,400);assert.ok(!calls.some(call=>call.op==='remove'));
  reset();usage={projects:4,templates:2};const response=await handler(json({action:'delete',assetId:id,confirmed:true}));assert.equal(response.status,409);assert.match((await response.json()).error,/4 projet.*2 template/);assert.ok(!calls.some(call=>call.op==='remove'));
});
test('safe deletion reserves, removes through Storage API, then finalizes DB only on success',async()=>{
  reset();assert.equal((await handler(json({action:'delete',assetId:id,confirmed:true}))).status,200);
  assert.deepEqual(calls.map(call=>call.name??call.op),['envelope_asset_usage','reserve_envelope_asset_deletion','remove','finish_envelope_asset_deletion']);
  assert.deepEqual(calls[2].paths,['envelope/seals/unused.png']);assert.equal(calls[2].bucket,'global-assets');
  reset();removeError=new Error('expected remove failure');assert.equal((await handler(json({action:'delete',assetId:id,confirmed:true}))).status,500);assert.ok(!calls.some(call=>call.name==='finish_envelope_asset_deletion'));assert.ok(!calls.some(call=>call.op==='insert'));
  reset();finishError=new Error('expected DB failure');const response=await handler(json({action:'delete',assetId:id,confirmed:true}));assert.equal(response.status,500);assert.match((await response.json()).error,/finalisation DB/);
});
