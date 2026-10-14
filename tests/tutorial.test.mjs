import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
let user={id:'owner',is_anonymous:false},recovery=false,updates=[],fail=false;
globalThis.tutorialCloud={isSupabaseConfigured:false,requireSupabaseSession:async()=>{if(!user)throw new Error('No session');return user;},passwordRecoveryState:{getSnapshot:()=>recovery},supabase:{auth:{updateUser:async(payload)=>{updates.push(payload);return fail?{data:{user:null},error:new Error('Offline')}:{data:{user:{...user,user_metadata:{kept:'existing',...payload.data}}},error:null};}}}};
registerHooks({resolve(s,c,next){if(s.endsWith('/lib/supabase'))return{url:'tutorial:cloud',shortCircuit:true};if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return next(s+'.ts',c);return next(s,c);},load(url,c,next){if(url==='tutorial:cloud')return{format:'module',shortCircuit:true,source:'export const {isSupabaseConfigured,requireSupabaseSession,supabase,passwordRecoveryState}=globalThis.tutorialCloud;'};return next(url,c);}});
const p=await import('../src/features/tutorial/tutorialPreferences.ts');
const tour=await import('../src/features/tutorial/tutorialStore.ts');
const cfg=await import('../src/features/tutorial/tutorialConfig.ts');
const {clipTourRect,placeTourCard}=await import('../src/features/tutorial/tutorialLayout.ts');
const {captureTutorialUi,prepareTutorialStep,restoreTutorialUi}=await import('../src/features/tutorial/tutorialContext.ts');
const {saveTutorialPreference}=await import('../src/services/tutorialPreferenceRepository.ts');
const {useEditorStore}=await import('../src/stores/editorStore.ts');
const {usePropertyPanelStore}=await import('../src/stores/propertyPanelStore.ts');
const {createBlankProject}=await import('../src/templates/templates.ts');
const initial=tour.useTutorialStore.getState();
const reset=()=>{memory.clear();updates=[];user={id:'owner',is_anonymous:false};recovery=false;fail=false;tour.useTutorialStore.setState({...initial,preference:{...p.DEFAULT_TUTORIAL_PREFERENCE}});};
test('one optional proposal for eligible guests/new users; existing projects never auto-start',()=>{
 reset();tour.bindTutorialActor('guest');tour.offerTutorial('editor',true);assert.equal(tour.useTutorialStore.getState().invitation,'editor');assert.equal(tour.useTutorialStore.getState().active,null);
 tour.finishTutorial(false);assert.equal(tour.useTutorialStore.getState().preference.status,'skipped');tour.offerTutorial('editor',true);assert.equal(tour.useTutorialStore.getState().invitation,null);
 reset();tour.bindTutorialActor('owner');tour.offerTutorial('home',false);assert.equal(tour.useTutorialStore.getState().invitation,null);
 tour.offerTutorial('home',true);assert.equal(tour.useTutorialStore.getState().invitation,'home');
});
test('guest preference survives reload but contains only three allowed fields, never draft data',()=>{
 reset();p.writeTutorialPreference('guest',{version:1,status:'skipped',offered:true,project:{secret:'must not persist'},files:['bad']});
 assert.deepEqual([...memory.keys()],['lbm-studio-tutorial-v1:guest']);assert.deepEqual(JSON.parse([...memory.values()][0]),{version:1,status:'skipped',offered:true});
 tour.bindTutorialActor('guest');tour.offerTutorial('editor',true);assert.equal(tour.useTutorialStore.getState().invitation,null);
 assert.deepEqual(p.parseTutorialPreference({status:'forged',offered:'true'}),p.DEFAULT_TUTORIAL_PREFERENCE);
});
test('previous/next, skip at every step, manual replay and completion are independent of tool clicks',()=>{
 reset();tour.bindTutorialActor('guest');tour.startTutorial();assert.equal(tour.useTutorialStore.getState().index,0);tour.moveTutorial(1);tour.moveTutorial(-1);assert.equal(tour.useTutorialStore.getState().index,0);
 for(let i=0;i<12;i++)tour.moveTutorial(1);assert.equal(tour.useTutorialStore.getState().active,null);assert.equal(tour.useTutorialStore.getState().preference.status,'completed');
 tour.startTutorial();tour.finishTutorial(false);assert.equal(tour.useTutorialStore.getState().preference.status,'completed');
 for(const index of [0,3,8,11]){reset();tour.bindTutorialActor('guest');tour.startTutorial();for(let i=0;i<index;i++)tour.moveTutorial(1);tour.finishTutorial(false);assert.equal(tour.useTutorialStore.getState().active,null);assert.equal(tour.useTutorialStore.getState().preference.status,'skipped');}
});
test('accepting from home waits for a real user-chosen project and creates no project itself',()=>{
 reset();tour.bindTutorialActor('owner');const project=createBlankProject();useEditorStore.getState().setProject(project);const before=useEditorStore.getState().project;
 tour.startTutorial('main',true);assert.equal(tour.useTutorialStore.getState().pending,true);assert.equal(useEditorStore.getState().project,before);assert.equal(updates.length,0);
});
test('signup preserves guest completion/skip or ongoing progress; account switches reset overlays',()=>{
 for(const status of ['skipped','completed','not_started']){
  reset();tour.bindTutorialActor('guest');tour.useTutorialStore.setState({guestSeen:true,preference:{version:1,status,offered:true}});
  if(status==='not_started'){tour.startTutorial();tour.moveTutorial(1);tour.moveTutorial(1);}
  tour.bindTutorialActor('owner');assert.equal(tour.useTutorialStore.getState().preference.status,status);assert.equal(tour.useTutorialStore.getState().invitation,null);
  if(status==='not_started'){assert.equal(tour.useTutorialStore.getState().active,'main');assert.equal(tour.useTutorialStore.getState().index,2);}
  tour.bindTutorialActor('different');assert.equal(tour.useTutorialStore.getState().active,null);assert.equal(tour.useTutorialStore.getState().index,0);
 }
});
test('12 main steps and mini-guides use real stable targets, no removed opening or configurable delay',()=>{
 assert.equal(cfg.MAIN_TUTORIAL.length,12);assert.equal(new Set(cfg.MAIN_TUTORIAL.map(s=>s.id)).size,12);
 for(const step of cfg.MAIN_TUTORIAL){assert.ok(step.title&&step.description&&step.targets.length);assert.ok(step.targets.every(t=>/^[a-z-]+$/.test(t)));}
 assert.ok(!/rideau|curtain|délai|delay/i.test(JSON.stringify(cfg.MAIN_TUTORIAL)));assert.ok(cfg.getTutorialSteps('curve').length);assert.deepEqual(cfg.getTutorialSteps('absent'),[]);
 assert.equal(cfg.isEditorTutorialRoute('/i/public'),false);assert.equal(cfg.isEditorTutorialRoute('/studio/id/rsvp/responses'),false);assert.equal(cfg.isEditorTutorialRoute('/studio/discovery'),true);
});
test('all context preparation and restoration change UI only, not project data, undo or save state',()=>{
 reset();useEditorStore.getState().setProject(createBlankProject());usePropertyPanelStore.setState({propertySectionOpenState:{animation:false,police:false}});
 const state=useEditorStore.getState(),original=captureTutorialUi(),before=JSON.stringify(state.project),history=state.past,saveStatus=state.saveStatus;
 for(const step of [...cfg.MAIN_TUTORIAL,...cfg.getTutorialSteps('text'),...cfg.getTutorialSteps('curve')])prepareTutorialStep(step);
 assert.equal(JSON.stringify(useEditorStore.getState().project),before);assert.equal(useEditorStore.getState().past,history);assert.equal(useEditorStore.getState().saveStatus,saveStatus);
 assert.equal(usePropertyPanelStore.getState().propertySectionOpenState.animation,true);
 restoreTutorialUi(original);assert.deepEqual(captureTutorialUi(),original);assert.equal(JSON.stringify(useEditorStore.getState().project),before);assert.equal(updates.length,0);
});
test('empty document, hidden element, stale selection and closed panels have safe non-destructive fallbacks',()=>{
 reset();const project=createBlankProject();project.pages[0].elements=[];useEditorStore.getState().setProject(project);const before=JSON.stringify(useEditorStore.getState().project);
 prepareTutorialStep(cfg.MAIN_TUTORIAL[8]);assert.equal(useEditorStore.getState().selectedElementId,null);assert.equal(usePropertyPanelStore.getState().propertySectionOpenState.animation,true);assert.equal(JSON.stringify(useEditorStore.getState().project),before);
});
test('tooltip and spotlight remain inside viewport at corners, after scrolling, and on small screens',()=>{
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:900}])for(const [left,top] of [[0,0],[viewport.width-20,0],[0,viewport.height-20],[viewport.width-20,viewport.height-20],[40,-100]]){
  const rect=clipTourRect({left,top,width:200,height:80},viewport);if(rect){assert.ok(rect.left>=0&&rect.top>=0&&rect.left+rect.width<=viewport.width&&rect.top+rect.height<=viewport.height);}
  const card=placeTourCard(rect,viewport,{width:365,height:280});assert.ok(card.left>=12&&card.top>=12&&card.left+card.width<=viewport.width-12);assert.ok(card.top+280<=viewport.height-12);
 }
 assert.equal(clipTourRect({left:0,top:900,width:80,height:40},{width:390,height:844}),null);
});
test('profile update is authenticated, whitelisted, scoped to current account and never grants permissions',async()=>{
 reset();const pref={version:1,status:'completed',offered:true};assert.deepEqual(await saveTutorialPreference('owner',{...pref,role:'admin',project:{bad:true}}),pref);
 assert.deepEqual(updates,[{data:{studio_tutorial:pref}}]);
 await assert.rejects(saveTutorialPreference('other',pref),/session/);assert.equal(updates.length,1);
 recovery=true;await assert.rejects(saveTutorialPreference('owner',pref),/session/);recovery=false;user.is_anonymous=true;await assert.rejects(saveTutorialPreference('owner',pref),/session/);
 user=null;await assert.rejects(saveTutorialPreference('owner',pref),/No session/);assert.equal(updates.length,1);
});
test('offline profile save reports an error, without losing the local preference or project',async()=>{
 reset();const pref={version:1,status:'skipped',offered:true};p.writeTutorialPreference('owner',pref);fail=true;
 await assert.rejects(saveTutorialPreference('owner',pref),/Offline/);assert.deepEqual(p.readTutorialPreference('owner'),pref);
});
test('cached account preference is scheduled for profile retry on a later sign-in, never for guest Auth',()=>{
 reset();p.writeTutorialPreference('owner',{version:1,status:'completed',offered:true});tour.bindTutorialActor('owner');assert.equal(tour.useTutorialStore.getState().revision,1);
 tour.bindTutorialActor('guest');assert.equal(tour.useTutorialStore.getState().revision,0);tour.bindTutorialActor('owner',{version:1,status:'completed',offered:true});assert.equal(tour.useTutorialStore.getState().revision,0);assert.equal(updates.length,0);
});
test('Help is editor-only, Escape/skip always available, and motion/overlay precedence are explicit',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
 assert.match(read('src/components/toolbar/TopToolbar.tsx'),/<TutorialHelpButton/);assert.ok(!read('src/pages/PublicInvitePage.tsx').includes('Tutorial'));
 const layer=read('src/features/tutorial/TutorialLayer.tsx');assert.match(layer,/Passer le tutoriel/);assert.match(layer,/MutationObserver/);assert.match(layer,/ResizeObserver/);assert.match(layer,/if \(!step \|\| blocked \|\| geometry.paused\) return null/);
 assert.match(read('src/styles.css'),/prefers-reduced-motion: reduce/);assert.match(read('src/features/tutorial/TutorialProvider.tsx'),/Serialize writes/);
});
