import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('/lib/supabase'))return {url:'preview:no-cloud',shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes('/src/'))return next(`${specifier}.ts`,context);
  return next(specifier,context);
},load(url,context,next){if(url==='preview:no-cloud')return {format:'module',shortCircuit:true,source:'export const isSupabaseConfigured=true; export const supabase=new Proxy({},{get:(_,key)=>globalThis.videoDb[key]}); export const requireSupabaseSession=async()=>globalThis.videoUser;'};return next(url,context);}});
const {validatePreviewVideo,MAX_PREVIEW_VIDEO_BYTES,createPreviewPlaybackCoordinator}=await import('../src/features/previewVideos/previewVideo.ts');
const {uploadPreviewVideo,removePreviewVideo,resolvePreviewVideoUrl,flushPreviewVideoCleanup}=await import('../src/services/previewVideoRepository.ts');
const {projectFromRow,saveRemoteProject}=await import('../src/services/projectRepository.ts');
const {sanitizeProjectForTemplate,instantiateProjectFromTemplate}=await import('../src/utils/templateSnapshot.ts');
const {normalizeProject,upsertProject,getProject}=await import('../src/utils/storage.ts');
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const mp4=new File([new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0])],'demo.mp4',{type:'video/mp4'});
const webm=new File([new Uint8Array([26,69,223,163,0,0,0,0])],'demo.webm',{type:'video/webm'});
const user={id:'owner'},target={kind:'project',project:{id:'p',ownerId:'owner',name:'QA',createdAt:'2026-10-14',updatedAt:'2026-10-14',pages:[]}};
let events,rows,jobs,objects,failUpload,failAttach,failDelete,lastEdit;
const reset=()=>{
  events=[];jobs=[];objects=new Set(['old']);failUpload=failAttach=failDelete=false;lastEdit=null;
  rows={projects:{id:'p',preview_video_path:'old'},templates:{id:'t',preview_video_path:null}};globalThis.videoUser=user;
  globalThis.videoDb={from(table){let edit=null,action=null,filters=[];
    const result=()=>{
      if(table==='preview_video_cleanup'){
        if(action==='upsert'){jobs.push(edit);return {data:null,error:null};}
        if(action==='delete'){jobs=jobs.filter(row=>!filters.every(([k,v])=>row[k]===v));events.push('ack');return {data:null,error:null};}
        return {data:[...jobs],error:null};
      }
      const row=rows[table],matches=row&&filters.every(([k,v])=>(row[k]??null)===v);
      if(!matches)return {data:null,error:action==='update'?new Error('CAS conflict'):null};
      if(action==='update'){
        events.push('attach');lastEdit=edit;if(failAttach)return {data:null,error:new Error('DB down')};
        if('preview_video_path' in edit&&row.preview_video_path&&row.preview_video_path!==edit.preview_video_path)jobs.push({storage_path:row.preview_video_path,kind:table==='projects'?'project':'template'});
        Object.assign(row,edit);
      }
      return {data:{...row},error:null};
    };
    const q={select:()=>q,order:()=>q,limit:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},is:(key,value)=>{filters.push([key,value]);return q;},update:value=>{edit=value;action='update';return q;},upsert:value=>{edit=value;action='upsert';return q;},delete:()=>{action='delete';return q;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)};return q;
  },storage:{from(bucket){assert.equal(bucket,'card-preview-videos');return {
    upload:async(path,_file,options)=>{events.push('upload');assert.equal(options.upsert,false);if(failUpload)return {error:new Error('Storage down')};objects.add(path);return {error:null};},
    remove:async paths=>{events.push('remove:'+paths[0]);if(failDelete)return {error:new Error('Offline')};paths.forEach(path=>objects.delete(path));return {error:null};},
    createSignedUrl:async(path,ttl)=>{events.push('sign:'+path);assert.equal(ttl,300);return {data:{signedUrl:'https://example.test/signed/'+path},error:null};},
  };}}};
};
test('manual MP4/WebM validation checks container bytes, MIME, extension and 15 MiB ceiling',async()=>{
  assert.equal((await validatePreviewVideo(mp4)).mime,'video/mp4');assert.equal((await validatePreviewVideo(webm)).mime,'video/webm');
  await assert.rejects(validatePreviewVideo(new File(['invalid'],'x.mp4',{type:'video/mp4'})),/contenu/);
  await assert.rejects(validatePreviewVideo(new File([mp4],'x.mov',{type:'video/quicktime'})),/Formats/);
  await assert.rejects(validatePreviewVideo({...mp4,name:'x.mp4',type:'video/mp4',size:MAX_PREVIEW_VIDEO_BYTES+1,slice:()=>mp4}),/15 Mo/);
  await assert.rejects(validatePreviewVideo(new File([],'x.mp4',{type:'video/mp4'})),/1 octet/);
});
test('one playback owner, successive hover/manual claims stop exactly the previous player',()=>{
  const c=createPreviewPlaybackCoordinator(),a=Symbol(),b=Symbol(),stops=[];
  c.claim(a,()=>stops.push('a'));c.claim(a,()=>stops.push('a'));assert.deepEqual(stops,[]);
  c.claim(b,()=>stops.push('b'));assert.deepEqual(stops,['a']);c.release(a);c.claim(a,()=>stops.push('a'));assert.deepEqual(stops,['a','b']);c.release(a);
});
test('replacement uploads fresh UUID first, commits reference, then removes only retired files',async()=>{
  reset();const result=await uploadPreviewVideo(target,mp4,'old');
  assert.match(result.path,/^projects\/owner\/p\/[a-f0-9-]+\.mp4$/);assert.equal(rows.projects.preview_video_path,result.path);
  assert.deepEqual(events,['upload','attach','remove:old','ack']);assert.ok(objects.has(result.path));assert.ok(!objects.has('old'));
});
test('upload, DB or concurrent-change failure leaves the old reference and cleans only the candidate',async()=>{
  reset();failUpload=true;await assert.rejects(uploadPreviewVideo(target,mp4,'old'),/Storage down/);assert.deepEqual(events,['upload']);assert.equal(rows.projects.preview_video_path,'old');
  reset();failAttach=true;await assert.rejects(uploadPreviewVideo(target,webm,'old'),/enregistrée/);assert.equal(rows.projects.preview_video_path,'old');assert.ok(objects.has('old'));assert.equal(objects.size,1);
  reset();rows.projects.preview_video_path='newer';await assert.rejects(uploadPreviewVideo(target,mp4,'old'),/autre modification/);assert.equal(rows.projects.preview_video_path,'newer');assert.ok(objects.has('old'));
});
test('removal commits null first; failed byte deletion is queued and retried without false save failure',async()=>{
  reset();failDelete=true;await removePreviewVideo(target,'old');assert.equal(rows.projects.preview_video_path,null);assert.equal(jobs.length,1);assert.ok(objects.has('old'));
  failDelete=false;await flushPreviewVideoCleanup();assert.equal(jobs.length,0);assert.ok(!objects.has('old'));
});
test('template import uses the same pipeline; owner check blocks wrong private-project uploads',async()=>{
  reset();await uploadPreviewVideo({kind:'template',id:'t'},webm,null);assert.match(rows.templates.preview_video_path,/^templates\/t\//);
  reset();globalThis.videoUser={id:'other'};await assert.rejects(uploadPreviewVideo(target,mp4,'old'),/propriétaire/);assert.equal(events.length,0);
});
test('signed URLs are lazy, short-lived, memory-only and partitioned by signed-in user',async()=>{
  reset();assert.equal(events.length,0);const path='private-'+crypto.randomUUID();await resolvePreviewVideoUrl(path);await resolvePreviewVideoUrl(path);assert.deepEqual(events,['sign:'+path]);
  globalThis.videoUser={id:'other'};await resolvePreviewVideoUrl(path);assert.equal(events.length,2);
});
test('DB mapping and local reload preserve path, content saves strip it, template instantiation does not copy private media',async()=>{
  reset();const project=normalizeProject({...target.project,pages:[{id:'page',name:'Document',elements:[],background:{type:'color',color:'#fff'}}]});
  project.previewVideoPath='old';upsertProject(project);assert.equal(getProject('p','owner').previewVideoPath,'old');
  const row={...rows.projects,owner_id:'owner',name:'QA',project_data:{previewVideoPath:'forged',pages:project.pages},created_at:project.createdAt,updated_at:project.updatedAt,status:'draft',payment_status:'unpaid'};
  assert.equal(projectFromRow(row).previewVideoPath,'old');await saveRemoteProject(project);assert.ok(!('previewVideoPath' in lastEdit.project_data));
  assert.ok(!('previewVideoPath' in sanitizeProjectForTemplate(project)));
  const copy=instantiateProjectFromTemplate({name:'Modèle',templateData:project},'other');assert.equal(copy.previewVideoPath,undefined);
});
test('shared component keeps static content until first video frame; mouse-only autoplay, mobile/reduced-motion button and no eager src',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),component=read('src/features/previewVideos/HoverVideoThumbnail.tsx');
  assert.match(component,/\{source && <video/);assert.match(component,/muted loop playsInline preload="none"/);assert.match(component,/requestVideoFrameCallback/);
  assert.match(component,/pointerType === "mouse" && !manual/);assert.match(component,/prefers-reduced-motion: reduce/);assert.match(component,/event.stopPropagation\(\)/);
  assert.match(component,/currentTime = 0/);assert.match(component,/visibilitychange/);assert.match(component,/IntersectionObserver/);
  for(const path of ['src/pages/HomePage.tsx','src/pages/AdminTemplatesPage.tsx'])assert.match(read(path),/PreviewVideoManager/);
  assert.match(read('src/pages/HomePage.tsx'),/delete copy.previewVideoPath/);
});
