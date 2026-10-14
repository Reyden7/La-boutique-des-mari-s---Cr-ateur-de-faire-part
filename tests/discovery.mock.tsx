import { create } from 'zustand';
import type { ReactNode } from 'react';
import { createBlankProject } from '../src/templates/templates';
import { normalizeProject } from '../src/utils/storage';
const account={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'discovery@local.invalid',is_anonymous:false,user_metadata:{} as Record<string,unknown>};
const state=create<{user:typeof account|null}>(()=>({user:null}));
export const confirmQaEmail=()=>state.setState({user:account});
export const signInQaEmptyAccount=()=>state.setState({user:{...account,id:'edededed-eded-4ded-8ded-edededededed',user_metadata:{}}});
export const signOutQaAccount=()=>state.setState({user:null});
export const AuthProvider=({children}:{children:ReactNode})=>children;
export const useAuth=()=>({user:state(s=>s.user),loading:false,recoveryReady:false,configured:true,isAdmin:false,
  signUp:async()=>({confirmationRequired:true}),signIn:async()=>confirmQaEmail(),signOut:async()=>state.setState({user:null}),requestPasswordReset:async()=>{},resetPassword:async()=>{}});
export const requireSupabaseSession=async()=>{const user=state.getState().user;if(!user)throw new Error('QA: no session');return user;};
export const isSupabaseConfigured=true;
export const incomingPasswordRecovery=false;
export const passwordRecoveryState={getSnapshot:()=>false,subscribe:()=>()=>{},clear:()=>{},hasSession:()=>false};
const draft=normalizeProject(createBlankProject())!;
draft.introductionMode='none';draft.opening.type='none';
const now=new Date().toISOString();
const tables:Record<string,any[]>={projects:[],assets:[],global_assets:[],preview_video_cleanup:[],templates:[
  {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Jardin découverte',slug:'jardin',description:'Modèle publié de test',category:'Romantique',tags:[],template_data:draft,is_published:true,is_featured:false,sort_order:0,version:1,created_at:now,updated_at:now},
  {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Modèle privé interdit',slug:'private',template_data:draft,is_published:false},
]};
export const qaCounts={projectWrites:0,uploads:0,checkout:0};
export const supabase:any={auth:{updateUser:async({data}:{data:Record<string,unknown>})=>{const user=await requireSupabaseSession();const updated={...user,user_metadata:{...user.user_metadata,...data}};state.setState({user:updated});return{data:{user:updated},error:null};}},from(table:string){let action='select',changes:any={},filters:[string,any][]=[];
  const result=()=>{
    if(table==='projects'&&!state.getState().user)return{data:[],error:new Error('QA denies anonymous projects')};
    const matched=(tables[table]??[]).filter(row=>(table!=='projects'||row.owner_id===state.getState().user?.id)&&filters.every(([k,v])=>(row[k]??null)===v));
    if(action==='insert'){if(table==='projects')qaCounts.projectWrites++;const row={id:changes.id??crypto.randomUUID(),...changes};tables[table].push(row);return{data:[row],error:null};}
    if(action==='update'){if(table==='projects')qaCounts.projectWrites++;matched.forEach(row=>Object.assign(row,changes));}
    return{data:matched,error:null};
  };
  const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q;},order:()=>q,limit:()=>q,
    insert:(v:any)=>{action='insert';changes=v;return q;},update:(v:any)=>{action='update';changes=v;return q;},
    single:async()=>{const r=result();return{data:r.data[0],error:r.error};},maybeSingle:async()=>{const r=result();return{data:r.data[0]??null,error:r.error};},returns:async()=>result(),then:(a:any,b:any)=>Promise.resolve(result()).then(a,b)};return q;
},storage:{from:()=>({upload:async()=>{qaCounts.uploads++;return{error:null};},getPublicUrl:(path:string)=>({data:{publicUrl:'https://qa.invalid/'+path}}),remove:async()=>({error:null})})},functions:{invoke:async()=>{qaCounts.checkout++;throw new Error('No real Stripe in QA');}}};
