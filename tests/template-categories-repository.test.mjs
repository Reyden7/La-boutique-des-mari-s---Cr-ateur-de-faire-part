import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';import {existsSync} from 'node:fs';
let patch=null;
const original={id:'legacy',name:'Nom avec naissance',category:'Floral',template_data:{pages:[{content:'untouched'}]},thumbnail_url:'/keep.png',preview_video_path:'keep.mp4',is_published:true,version:4};
const rows=[{...original},{...original,id:'birth',invitation_category:'birth'},{...original,id:'private',is_published:false}];
globalThis.categoryRepositoryClient={from(){const filters=[];let update=null;const result=()=>{const matched=rows.filter(row=>filters.every(([key,value])=>row[key]===value));if(update)matched.forEach(row=>Object.assign(row,update));return{data:matched,error:null};};const q={select:()=>q,order:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},update:value=>{patch=update=value;return q;},returns:async()=>result(),single:async()=>{const r=result();return{data:r.data[0],error:null};}};return q;}};
registerHooks({resolve(s,c,next){if(s.endsWith('/lib/supabase'))return{url:'category-repository:client',shortCircuit:true};if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))for(const ext of ['.ts','.tsx'])if(existsSync(new URL(s+ext,c.parentURL)))return next(s+ext,c);return next(s,c);},load(url,c,next){if(url==='category-repository:client')return{format:'module',source:'export const supabase=globalThis.categoryRepositoryClient,isSupabaseConfigured=true;export const requireSupabaseSession=async()=>({id:"owner"});',shortCircuit:true};return next(url,c);}});
const {loadPublishedTemplates,updateTemplateMetadata}=await import('../src/services/templateRepository.ts');
test('repository reads persistent category, defaults old rows to wedding and requests published templates only',async()=>{
 const templates=await loadPublishedTemplates();assert.deepEqual(templates.map(t=>[t.id,t.invitationCategory]),[['legacy','wedding'],['birth','birth']]);
 assert.equal(templates[0].thumbnailUrl,original.thumbnail_url);assert.equal(templates[0].previewVideoPath,original.preview_video_path);
});
test('category-only edits preserve content, style, publication status, thumbnail, video and version',async()=>{
 const result=await updateTemplateMetadata('legacy',{invitationCategory:'birth'});assert.equal(result.invitationCategory,'birth');assert.deepEqual(Object.keys(patch).sort(),['invitation_category','updated_at']);
 for(const key of ['template_data','category','is_published','thumbnail_url','preview_video_path','version'])assert.deepEqual(rows[0][key],original[key]);
 patch=null;await assert.rejects(()=>updateTemplateMetadata('legacy',{invitationCategory:'invalid'}),/invalide/);assert.equal(patch,null);
});
