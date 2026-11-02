import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
let handler,admin=true,calls=[],patch;
const template={id:'synthetic-template',invitation_category:'birth',template_data:{invitationCategory:'wedding',pages:[{text:'Original'}]}};
const client={auth:{getUser:async()=>({data:{user:{id:'synthetic-admin',is_anonymous:false,app_metadata:{role:admin?'admin':'user'}}},error:null})},
 rpc:async(name,args)=>{calls.push({name,args});return {data:template,error:null};},
 from(){const q={update(values){patch=values;return q;},eq:()=>q,select:()=>q,single:async()=>({data:{...template,...patch},error:null})};return q;}};
globalThis.categoryEdgeClient=client;
globalThis.Deno={env:{get:()=> 'mock-only'},serve:fn=>handler=fn};
const hooks=registerHooks({resolve(s,c,next){if(s.startsWith('npm:@supabase/'))return{url:'category-edge:client',shortCircuit:true};return next(s,c);},load(url,c,next){if(url==='category-edge:client')return{format:'module',source:'export const createClient=()=>globalThis.categoryEdgeClient',shortCircuit:true};return next(url,c);}});
await import('../supabase/functions/publish-template/index.ts');
const send=body=>handler(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({projectId:'synthetic-project',name:'Modèle',slug:'modele',category:'Floral',isPublished:true,...body})}));
test('admin publication persists category separately while retaining the original snapshot and publication gate',async()=>{
 for(const invitationCategory of ['wedding','birth']) {
  calls=[];patch=null;assert.equal((await send({invitationCategory})).status,200);
  assert.equal(calls[0].args.p_is_published,false);assert.equal(patch.invitation_category,invitationCategory);assert.equal(patch.is_published,true);assert.deepEqual(patch.template_data,template.template_data);
 }
});
test('invalid category and non-admin requests cannot modify template metadata',async()=>{
 calls=[];patch=null;assert.equal((await send({invitationCategory:'invalid'})).status,400);assert.equal(calls.length,0);assert.equal(patch,null);
 admin=false;assert.equal((await send({invitationCategory:'birth'})).status,403);assert.equal(calls.length,0);admin=true;
});
test('old republish requests preserve existing category instead of resetting a birth template',async()=>{
 assert.equal((await send({templateId:template.id})).status,200);assert.equal(patch.invitation_category,'birth');
});
test.after(()=>{hooks.deregister();delete globalThis.Deno;delete globalThis.categoryEdgeClient;});
