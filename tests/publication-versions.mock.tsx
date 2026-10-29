import type {WeddingProject} from '../src/types/editor';
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'qa@local.invalid',is_anonymous:false,user_metadata:{}};
export const useAuth=()=>({user,loading:false,recoveryReady:false,isAdmin:false,configured:true});
export const requireSupabaseSession=async()=>user;
export const isSupabaseConfigured=true;
let row:any=null, snapshot:any=null, guests=48;
export function setPublicationFixture(project:WeddingProject){row={id:project.id,owner_id:project.ownerId,name:project.name,project_data:structuredClone(project),created_at:project.createdAt,updated_at:project.updatedAt,status:project.status,payment_status:project.paymentStatus,public_id:project.publicId??null,publication_policy:project.publicationPolicy,active_version_id:project.activeVersionId??null,active_version_number:project.activeVersionNumber??0,has_version_draft:project.hasVersionDraft??false,purchased_guest_capacity:project.purchasedGuestCapacity??null};snapshot=structuredClone(project);guests=48;}
export const supabase:any={
 from(table:string){let patch:any=null;const filters:[string,unknown][]=[];
  const result=()=>{if(table==='projects'&&row&&patch)Object.assign(row,patch);const rows=table==='projects'?[row]:table==='project_publication_versions'&&row?.active_version_id?[{id:row.active_version_id,project_id:row.id,status:'published',name:snapshot.name,version_number:1,published_at:new Date().toISOString(),snapshot}]:[];return{data:rows.filter(v=>v&&filters.every(([k,x])=>v[k]===x)),error:null};};
  const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},order:()=>q,update:(p:any)=>{patch=p;return q;},maybeSingle:async()=>{const r=result();return{data:r.data[0]??null,error:null};},single:async()=>{const r=result();return{data:r.data[0],error:null};},returns:async()=>result(),then:(a:any,b:any)=>Promise.resolve(result()).then(a,b)};return q;
 },
 rpc:async(name:string,args:any)=>{
  if(name==='read_invitation_recipients')return{data:{revision:1,recipients:[{id:'synthetic-household',display_name:'Famille de test',guest_count:guests,is_active:true}]},error:null};
  if(name==='begin_publication_revision'){row.has_version_draft=true;row.project_data=structuredClone(snapshot);return{data:null,error:null};}
  return{data:null,error:new Error('Unexpected isolated QA request')};
 },
 functions:{invoke:async()=>{throw new Error('QA isolée : aucun paiement ni appel Stripe autorisé.');}},
};
