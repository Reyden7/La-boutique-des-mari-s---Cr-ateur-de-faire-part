import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
let user=null, recovery=false, rows=new Map(), calls=[], failUpload=false, failSave=false;
globalThis.discoveryCloud={
  requireSupabaseSession:async()=>{if(!user||user.is_anonymous)throw new Error('Auth required');return user;},
  passwordRecoveryState:{getSnapshot:()=>recovery},
  isSupabaseConfigured:true,
  supabase:{from(table){let edit=null,action='read',id=null;
    const result=()=>{
      if(table==='assets')return {data:{id:'remote-asset-'+calls.length},error:null};
      if(action!=='read'){
        calls.push({action,table,edit:structuredClone(edit)});
        assert.ok(!JSON.stringify(edit).includes('blob:'));
        assert.ok(!JSON.stringify(edit).includes('discovery-asset:'));
        if(failSave)return {data:null,error:new Error('Save offline')};
        if(action==='insert'&&rows.has(edit.id))return {data:null,error:{code:'23505'}};
        if(action==='insert')rows.set(edit.id,{...edit,public_id:null,published_at:null,expires_at:null});
        if(action==='update')Object.assign(rows.get(id),edit);
      }
      return {data:structuredClone(rows.get(id??edit?.id)??null),error:null};
    };
    const q={select:()=>q,eq:(k,v)=>{if(k==='id')id=v;return q;},insert:v=>{edit=v;action='insert';return q;},update:v=>{edit=v;action='update';return q;},single:async()=>result(),maybeSingle:async()=>result(),then:(a,b)=>Promise.resolve(result()).then(a,b)};return q;
  },storage:{from(bucket){assert.equal(bucket,'wedding-assets');return{
    upload:async(path,file)=>{calls.push({action:'upload',path,file});return{error:failUpload?new Error('Upload offline'):null};},
    getPublicUrl:path=>({data:{publicUrl:'https://files.local/'+path}}),remove:async()=>({error:null}),
  };}},functions:{invoke:()=>{throw new Error('No guest Stripe');}}},
};
registerHooks({resolve(s,c,next){
  if(s.endsWith('/lib/supabase'))return{url:'discovery:cloud',shortCircuit:true};
  if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return next(s+'.ts',c);
  return next(s,c);
},load(url,c,next){if(url==='discovery:cloud')return{format:'module',shortCircuit:true,source:'export const {supabase,requireSupabaseSession,isSupabaseConfigured,passwordRecoveryState}=globalThis.discoveryCloud;'};return next(url,c);}});
const runtime=await import('../src/features/discovery/discoverySession.ts');
const {persistGuestDraftAfterAuth}=await import('../src/features/discovery/persistGuestDraft.ts');
const {uploadProjectAsset,deleteProjectAssetIfUnused}=await import('../src/services/assetRepository.ts');
const {saveRemoteProject}=await import('../src/services/projectRepository.ts');
const {useEditorStore}=await import('../src/stores/editorStore.ts');
const {normalizeProject,upsertProject,saveProjects,syncProject}=await import('../src/utils/storage.ts');
const {createBlankProject}=await import('../src/templates/templates.ts');
const {resolvePreviewVideoUrl}=await import('../src/services/previewVideoRepository.ts');
const {instantiateProjectFromTemplate}=await import('../src/utils/templateSnapshot.ts');
globalThis.localStorage={getItem:()=>{throw new Error('Guest must not read storage');},setItem:()=>{throw new Error('Guest must not write storage');}};
function reset(){runtime.discardDiscoverySession();user=null;recovery=false;rows=new Map();calls=[];failUpload=failSave=false;const draft=normalizeProject(createBlankProject());delete draft.ownerId;runtime.beginDiscoverySession(draft.id);useEditorStore.getState().setProject(draft);return useEditorStore.getState().project;}
test('guest text edits, undo, save and checkout never persist or call Stripe',async()=>{
  reset();const s=useEditorStore.getState();s.renameProject('Brouillon privé');s.undo();s.redo();
  const draft=useEditorStore.getState().project;
  upsertProject(draft);s.save();assert.equal(runtime.useDiscoverySession.getState().prompt,'account');
  assert.equal(useEditorStore.getState().saveStatus,'idle');
  await s.checkoutAndPublish(40);assert.equal(runtime.useDiscoverySession.getState().prompt,'publish');
  await assert.rejects(syncProject(draft),/compte/);await assert.rejects(saveRemoteProject(draft),/découverte/);
  assert.throws(()=>saveProjects([draft]),/mémoire/);assert.equal(calls.length,0);
});
test('guest imports of image, music, font and opening files are memory-only and reusable for Undo',async()=>{
  const draft=reset();
  for(const [kind,file,options] of [['image',new File(['png'],'base.png',{type:'image/png'}),{folder:'envelope/bases'}],['audio',new File(['audio'],'music.mp3',{type:'audio/mpeg'})],['font',new File([new Uint8Array([0,1,0,0])],'font.ttf',{type:'font/ttf'})]]){
    const asset=await uploadProjectAsset(draft,file,kind,options);assert.match(asset.url,/^blob:/);assert.ok(runtime.isTemporaryAsset(asset.id));
    assert.equal(await deleteProjectAssetIfUnused(draft,asset.id,asset.url),true);
  }
  assert.equal(runtime.temporaryDiscoveryAssets().length,3);assert.equal(calls.length,0);
  runtime.discardDiscoverySession();assert.equal(runtime.temporaryDiscoveryAssets().length,0);assert.equal(runtime.useDiscoverySession.getState().draftId,null);
});
test('conversion requires a real non-recovery session; confirmation alone cannot save',async()=>{
  const draft=reset();await assert.rejects(persistGuestDraftAfterAuth(draft,'owner'),/Auth required/);
  user={id:'owner',is_anonymous:true};await assert.rejects(persistGuestDraftAfterAuth(draft,'owner'),/Auth required/);
  user={id:'owner'};recovery=true;await assert.rejects(persistGuestDraftAfterAuth(draft,'owner'),/normalement/);
  assert.equal(calls.length,0);
});
test('conversion transfers files and all current content, strips paid rights, and deduplicates double clicks',async()=>{
  const draft=reset();draft.name='Notre essai';draft.status='published';draft.paymentStatus='paid';draft.publicId='forged';draft.purchasedGuestCapacity=100;draft.publicationLicenseId='paid';draft.rsvp.purchased=true;
  const image=await uploadProjectAsset(draft,new File(['png'],'photo.png',{type:'image/png'}),'image');
  draft.pages[0].background={type:'image',color:'#fff',imageUrl:image.url};
  user={id:'owner'};
  const a=persistGuestDraftAfterAuth(draft,'owner'),b=persistGuestDraftAfterAuth(draft,'owner');assert.equal(a,b);
  const {project}=await a;assert.notEqual(project.id,draft.id);assert.equal(project.ownerId,'owner');assert.equal(project.name,'Notre essai');
  assert.equal(project.status,'draft');assert.equal(project.paymentStatus,'unpaid');assert.equal(project.publicId,undefined);assert.equal(project.purchasedGuestCapacity,undefined);assert.equal(project.rsvp.purchased,false);
  assert.match(project.pages[0].background.imageUrl,/https:\/\/files.local\/owner\//);
  assert.equal(calls.filter(c=>c.action==='insert'&&c.table==='projects').length,1);assert.equal(calls.filter(c=>c.action==='upload').length,1);
});
test('failed upload/save keeps File and draft; retry uses same new ID and never repeats successful transfers',async()=>{
  const draft=reset(),asset=await uploadProjectAsset(draft,new File(['png'],'flap.png',{type:'image/png'}),'image',{folder:'doors/right'});
  draft.pages[0].background.imageUrl=asset.url;user={id:'owner'};failUpload=true;
  await assert.rejects(persistGuestDraftAfterAuth(draft,'owner'),/Upload offline/);const id=[...rows.keys()][0];
  assert.equal(runtime.temporaryDiscoveryAssets().length,1);assert.equal(useEditorStore.getState().project,draft);
  failUpload=false;const result=await persistGuestDraftAfterAuth(draft,'owner');assert.equal(result.project.id,id);assert.equal(rows.size,1);
  const count=calls.filter(c=>c.action==='upload').length;
  failSave=true;await assert.rejects(persistGuestDraftAfterAuth(draft,'owner'),/Save offline/);
  failSave=false;await persistGuestDraftAfterAuth(draft,'owner');assert.equal(calls.filter(c=>c.action==='upload').length,count);
});
test('new project creation never updates a conflicting existing ID',async()=>{
  reset();user={id:'owner'};const existing={...createBlankProject(),ownerId:'owner'};rows.set(existing.id,{id:existing.id,name:'Do not overwrite'});
  await assert.rejects(saveRemoteProject(existing,{createOnly:true}),/existe déjà/);assert.equal(rows.get(existing.id).name,'Do not overwrite');
});
test('Undo after conversion retains the new owner/ID and permanent assets without losing device/selection',()=>{
  const draft=reset();useEditorStore.getState().renameProject('Dernière version');useEditorStore.getState().setPreviewDevice('desktop');
  const saved={...useEditorStore.getState().project,id:'new-project',ownerId:'owner'};
  const before=useEditorStore.getState();
  useEditorStore.setState({project:saved,past:runtime.convertDiscoveryHistory(before.past,new Map(),saved)});
  runtime.discardDiscoverySession();useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().project.id,'new-project');assert.equal(useEditorStore.getState().project.ownerId,'owner');assert.equal(useEditorStore.getState().project.name,draft.name);
  assert.equal(useEditorStore.getState().previewDevice,'desktop');
  assert.equal(runtime.hasTemporaryReferences({text:'Mention du protocole blob: dans un texte normal'}),false);
});
test('published template snapshots instantiate locally without paid rights or a remote RPC',()=>{
  reset();const source=normalizeProject(createBlankProject());source.paymentStatus='paid';source.status='published';source.publicId='private';source.rsvp.purchased=true;
  const draft=instantiateProjectFromTemplate({name:'Modèle public',templateData:source},'');assert.equal(draft.paymentStatus,'unpaid');assert.equal(draft.status,'draft');assert.equal(draft.rsvp.purchased,false);assert.equal(draft.publicId,undefined);assert.equal(calls.length,0);
});
test('anonymous video signing is limited to template paths; backend published-template RLS decides visibility',async()=>{
  reset();await assert.rejects(resolvePreviewVideoUrl('projects/owner/private/video.webm'),/Auth required/);
  globalThis.discoveryCloud.supabase.storage={from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://video.local/signed'},error:null})})};
  assert.equal(await resolvePreviewVideoUrl('templates/published/video.webm'),'https://video.local/signed');
});
test('public discovery route does not expose private editors; warning is once and navigation is blocked',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),app=read('src/App.tsx'),editor=read('src/pages/EditorPage.tsx');
  assert.match(app,/path: "\/", element: <HomePage/);assert.match(app,/path: "\/studio\/discovery", element: <EditorPage discovery/);assert.match(app,/path: "\/studio\/:projectId", element: protectedPage/);
  assert.match(editor,/useBlocker/);assert.match(editor,/event.returnValue = ""/);assert.match(editor,/if \(!project \|\| isDiscoveryProject\(project\)\) return/);
  const runtimeSource=read('src/features/discovery/discoverySession.ts');assert.ok(!/localStorage|sessionStorage|indexedDB|persist\(/.test(runtimeSource));
  assert.match(read('src/features/discovery/DiscoveryDialogs.tsx'),/warningShown && !prompt && !error/);
  assert.match(read('src/components/toolbar/TopToolbar.tsx'),/Mode découverte — Non sauvegardé/);
});
