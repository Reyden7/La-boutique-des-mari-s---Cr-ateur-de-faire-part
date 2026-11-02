import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(s,c,next){
 if(s.endsWith('/lib/supabase'))return{url:'category:cloud',shortCircuit:true};
 if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))for(const ext of ['.ts','.tsx'])if(existsSync(new URL(s+ext,c.parentURL)))return next(s+ext,c);
 return next(s,c);
},load(url,c,next){if(url==='category:cloud')return{format:'module',source:'export const supabase=null,isSupabaseConfigured=false;export const requireSupabaseSession=async()=>{throw new Error("No cloud in this test")};',shortCircuit:true};return next(url,c);}});
const {publishedTemplatesForCategory,resolveInvitationCategory}=await import('../src/features/templates/invitationCategory.ts');
const {createBlankProject}=await import('../src/templates/templates.ts');
const {instantiateProjectFromTemplate}=await import('../src/utils/templateSnapshot.ts');
const {normalizeProject,upsertProject,getProject}=await import('../src/utils/storage.ts');

test('gallery uses explicit metadata, defaults historical templates to wedding and hides drafts',()=>{
 const rows=[{id:'legacy',name:'Naissance dans le nom',isPublished:true},{id:'w',invitationCategory:'wedding',isPublished:true},{id:'b',name:'Mariage dans le nom',invitationCategory:'birth',isPublished:true},{id:'private',invitationCategory:'birth',isPublished:false}];
 assert.deepEqual(publishedTemplatesForCategory(rows,'wedding').map(x=>x.id),['legacy','w']);assert.deepEqual(publishedTemplatesForCategory(rows,'birth').map(x=>x.id),['b']);
 assert.equal(resolveInvitationCategory(undefined),'wedding');assert.equal(resolveInvitationCategory('bad'),'wedding');
});
test('blank wedding/birth projects share the editor and preserve category through save/reload without RSVP or paid rights',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 for(const category of ['wedding','birth']) {
  const project=normalizeProject(createBlankProject(category));assert.equal(project.invitationCategory,category);assert.equal(project.rsvp.enabled,false);assert.equal(project.rsvp.purchased,false);assert.equal(project.status,'draft');
  project.ownerId='synthetic-owner';upsertProject(project);assert.equal(getProject(project.id,project.ownerId).invitationCategory,category);
  const copy=instantiateProjectFromTemplate({name:'Modèle',invitationCategory:category,templateData:{...project,paymentStatus:'paid',purchasedGuestCapacity:100,rsvp:{...project.rsvp,purchased:true}}},'other');
  assert.equal(copy.invitationCategory,category);assert.equal(copy.paymentStatus,'unpaid');assert.equal(copy.purchasedGuestCapacity,undefined);assert.equal(copy.rsvp.purchased,false);
 }
});
test('template metadata wins over embedded category; historical projects are read without injecting new published content',()=>{
 const project=createBlankProject('birth');
 assert.equal(instantiateProjectFromTemplate({name:'Legacy',templateData:project},'owner').invitationCategory,'wedding');
 assert.equal(instantiateProjectFromTemplate({name:'Moved',templateData:project,invitationCategory:'wedding'},'owner').invitationCategory,'wedding');
 delete project.invitationCategory;const before=structuredClone(project);const normalized=normalizeProject(project);
 assert.equal('invitationCategory' in normalized,false);assert.deepEqual(project,before);assert.equal(resolveInvitationCategory(normalized.invitationCategory),'wedding');
});
