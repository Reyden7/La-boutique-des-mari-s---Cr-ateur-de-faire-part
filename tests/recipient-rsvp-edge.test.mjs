import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let submitted,fail=false;const token='a'.repeat(64),publicId='synthetic-public-event',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_id:owner,name:'Fête test',status:'published',payment_status:'paid',expires_at:null,recipient_links_required:true,project_data:{rsvp:{enabled:true,fields:[{id:'presence',label:'Présence',type:'single_choice',required:true,options:['Présent','Pas présent']},{id:'people',label:'Nombre de personnes',type:'number',required:true},{id:'custom',label:'Question personnelle',type:'long_text',required:false}]}}};
globalThis.__recipientEdgeClient={auth:{admin:{getUserById:async()=>({data:{user:null},error:null})}},from(table){const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:table==='projects'?project:{id:'paid-addon'},error:null})};return chain;},rpc:async(name,args)=>{
 if(name==='get_recipient_invitation')return{data:args.p_token===token?{recipient:{displayName:'Famille Martin',guestCount:4}}:null,error:null};
 if(name==='submit_recipient_rsvp'){submitted=args;return{data:null,error:fail?{message:'RESPONSE_LOCKED'}:null};}throw new Error('Unexpected RPC');
}};
const env={SUPABASE_URL:'https://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock_only'};let handler;
globalThis.Deno={env:{get:key=>env[key]},serve:value=>{handler=value;}};
const hooks=registerHooks({resolve(s,c,next){if(s.startsWith('npm:@supabase/'))return{url:'test:recipient-client',shortCircuit:true};return next(s,c);},load(url,c,next){if(url==='test:recipient-client')return{format:'module',source:'export const createClient = () => globalThis.__recipientEdgeClient;',shortCircuit:true};return next(url,c);}});
await import('../supabase/functions/submit-rsvp/index.ts');
const send=body=>handler(new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId,startedAt:Date.now()-3000,answers:{custom:'Sans gluten'},recipientToken:token,attendance:'confirmed',presentCount:4,...body})}));
test('personal response uses token, not IP/device; standardized fields are server-derived and custom answers retained',async()=>{
 const response=await send({answers:{presence:'Pas présent',people:99999,custom:'Sans gluten'}});assert.equal(response.status,200);assert.equal(submitted.p_token,token);assert.equal(submitted.p_present_count,4);assert.deepEqual({...submitted.p_answers},{Présence:'Présent','Nombre de personnes':4,'Question personnelle':'Sans gluten'});assert.equal(submitted.p_answers_by_id.people,4);assert.equal('p_client_fingerprint' in submitted,false);
});
test('personal RSVP rejects overflow, missing/wrong token, mismatched decline and forged fields',async()=>{
 for(const body of [{presentCount:5},{presentCount:-1},{presentCount:1.5},{attendance:'declined',presentCount:1},{attendance:'confirmed',presentCount:0},{answers:{other:'forged'}},{recipientToken:'b'.repeat(64)},{recipientToken:'not-a-token'},{recipientToken:undefined}])assert.ok((await send(body)).status>=400);
});
test('locked/database failures never report a successful response',async()=>{fail=true;assert.equal((await send({})).status,500);fail=false;});
test.after(()=>{hooks.deregister();delete globalThis.Deno;delete globalThis.__recipientEdgeClient;});
