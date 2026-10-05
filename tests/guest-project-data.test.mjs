import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const calls=[];
let exists=true;
const row={id:"project",owner_id:"owner",name:"Projet",project_data:{pages:[],rsvp:{purchased:true}},status:"published",payment_status:"paid",public_id:"public",created_at:"date",updated_at:"date",published_at:"date",expires_at:null,purchased_guest_capacity:54,purchased_extra_blocks:2,publication_license_id:"licence"};
globalThis.__guestDataMock={
  isSupabaseConfigured:true,requireSupabaseSession:async()=>({id:"owner"}),
  supabase:{
    from:()=>{
      let operation="read";
      const chain={select:()=>chain,eq:()=>chain,order:()=>chain,
        update:(value)=>{operation="update";calls.push({kind:operation,value});return chain;},
        insert:(value)=>{operation="insert";calls.push({kind:operation,value});return chain;},
        maybeSingle:async()=>({data:exists?{id:"project"}:null,error:null}),
        single:async()=>({data:{...row,status:operation==="insert"?"draft":"published",payment_status:operation==="insert"?"unpaid":"paid"},error:null}),
      };return chain;
    },
    functions:{invoke:async(name,options)=>{calls.push({kind:"checkout",name,...options});return{data:{url:"https://checkout.invalid"},error:null};}},
  },
};
const hooks=registerHooks({
  resolve(specifier,context,nextResolve){
    if(context.parentURL?.endsWith("/src/services/projectRepository.ts") && specifier==="../lib/supabase")return{url:"guest-data:client",shortCircuit:true};
    if(context.parentURL?.endsWith("/src/utils/templateSnapshot.ts") && specifier==="./storage")return{url:"guest-data:normalizer",shortCircuit:true};
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
    if(url==="guest-data:client")return{format:"module",source:"export const {supabase,isSupabaseConfigured,requireSupabaseSession}=globalThis.__guestDataMock;",shortCircuit:true};
    if(url==="guest-data:normalizer")return{format:"module",source:"export const normalizeProject = (project) => project;",shortCircuit:true};
    return nextLoad(url,context);
  },
});
const repository=await import("../src/services/projectRepository.ts");
const {sanitizeProjectForTemplate,instantiateProjectFromTemplate}=await import("../src/utils/templateSnapshot.ts");
test("save writes only editable columns; declaration persists but purchased rights never enter project_data",async()=>{
  for(const existing of [true,false]){
    calls.length=0;exists=existing;
    await repository.saveRemoteProject({...repository.projectFromRow(row),requestedGuestCount:53,purchasedGuestCapacity:999,purchasedExtraBlocks:999,publicationLicenseId:"forged"});
    const write=calls.find((call)=>call.kind===(existing?"update":"insert"));
    assert.equal(write.value.project_data.requestedGuestCount,53);
    for(const key of ["purchasedGuestCapacity","purchasedExtraBlocks","publicationLicenseId","status","paymentStatus","ownerId","publicId"])assert.equal(write.value.project_data[key],undefined);
    if(existing)assert.deepEqual(Object.keys(write.value).sort(),["expires_at","name","project_data","updated_at"]);
    else {assert.equal(write.value.status,"draft");assert.equal(write.value.payment_status,"unpaid");assert.equal(write.value.public_id,null);assert.equal(write.value.owner_id,"owner");}
  }
});
test("loading cannot trust forged rights inside editable JSON; Checkout sends only ID and guest count",async()=>{
  const project=repository.projectFromRow({...row,project_data:{...row.project_data,purchasedGuestCapacity:999}});
  assert.equal(project.purchasedGuestCapacity,54);
  assert.equal(repository.projectFromRow({...row,purchased_guest_capacity:null}).purchasedGuestCapacity,undefined);
  calls.length=0;await repository.startProjectCheckout("project",53);
  assert.deepEqual(calls[0].body,{projectId:"project",guestCount:53});
});
test("remote project_data save and reload retain editor-only names without changing content",async()=>{
  calls.length=0;exists=true;
  const project={...repository.projectFromRow(row),pages:[{id:"page",elements:[{id:"text",type:"text",name:"Emma & Lucas",editorName:"Titre principal",text:"Emma & Lucas"}]}],rsvp:{...row.project_data.rsvp,title:"Confirmez votre présence",editorName:"Réponses invités"},welcomePage:{elements:[{id:"welcome",type:"text",editorName:"Titre accueil",text:"Bienvenue"}]}};
  await repository.saveRemoteProject(project);
  const saved=calls.find(call=>call.kind==="update").value.project_data;
  const loaded=repository.projectFromRow({...row,project_data:JSON.parse(JSON.stringify(saved))});
  assert.equal(loaded.pages[0].elements[0].editorName,"Titre principal");
  assert.equal(loaded.pages[0].elements[0].text,"Emma & Lucas");
  assert.equal(loaded.rsvp.editorName,"Réponses invités");
  assert.equal(loaded.rsvp.title,"Confirmez votre présence");
  assert.equal(loaded.welcomePage.elements[0].editorName,"Titre accueil");
});
test("template snapshots and instantiation never inherit a source licence or purchased capacity",()=>{
  const project={...repository.projectFromRow(row),requestedGuestCount:53};
  const snapshot=sanitizeProjectForTemplate(project);
  assert.equal(snapshot.rsvp.purchased,false);
  for(const key of ["purchasedGuestCapacity","purchasedExtraBlocks","publicationLicenseId","requestedGuestCount","ownerId","publicId","paymentStatus"])assert.equal(snapshot[key],undefined);
  const created=instantiateProjectFromTemplate({name:"Modèle",templateData:project},"another-owner");
  assert.notEqual(created.id,project.id);assert.equal(created.ownerId,"another-owner");
  assert.equal(created.status,"draft");assert.equal(created.paymentStatus,"unpaid");assert.equal(created.rsvp.purchased,false);
  assert.equal(created.purchasedGuestCapacity,undefined);assert.equal(created.publicationLicenseId,undefined);
});
test("template snapshot and instantiation preserve responsive last sections and form heights",()=>{
  const project={...repository.projectFromRow(row),pages:[{id:"page",elements:[{id:"section",type:"section",isLastSection:true,responsive:{tablet:{isLastSection:false},desktop:{isLastSection:true}}}]}],rsvp:{...row.project_data.rsvp,height:900,responsive:{tablet:{height:1200},desktop:{height:1800}}}};
  const snapshot=sanitizeProjectForTemplate(project);
  const created=instantiateProjectFromTemplate({name:"Modèle",templateData:snapshot},"another-owner");
  for(const target of [snapshot,created]) {
    assert.equal(target.pages[0].elements[0].isLastSection,true);
    assert.equal(target.pages[0].elements[0].responsive.tablet.isLastSection,false);
    assert.equal(target.pages[0].elements[0].responsive.desktop.isLastSection,true);
    assert.equal(target.rsvp.height,900);
    assert.equal(target.rsvp.responsive.tablet.height,1200);
    assert.equal(target.rsvp.responsive.desktop.height,1800);
    assert.equal(target.rsvp.purchased,false);
  }
});
test.after(()=>{hooks.deregister();delete globalThis.__guestDataMock;});
