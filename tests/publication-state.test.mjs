import test from 'node:test';import assert from 'node:assert/strict';
import {isPublishedDesignLocked,applyPublicationAuthority,applySavedPublicationAuthority,publicationVersionLabel} from '../src/features/publication/publicationState.ts';
test('only strict published designs are locked; legacy clients and new drafts remain editable',()=>{
 assert.equal(isPublishedDesignLocked({publicationPolicy:'paid_versions',activeVersionId:'v1',hasVersionDraft:false}),true);
 for(const p of [{publicationPolicy:'legacy',activeVersionId:'v1'},{publicationPolicy:'paid_versions'},{publicationPolicy:'paid_versions',activeVersionId:'v1',hasVersionDraft:true}])assert.equal(isPublishedDesignLocked(p),false);
 assert.match(publicationVersionLabel({activeVersionId:'v1',activeVersionNumber:2,hasVersionDraft:true}),/Version 2 en ligne.*Non publiée/);
});
test('server publication authority overrides cached rights without erasing a concurrent draft or creating a save loop',()=>{
 const local={id:'p',name:'Unsent draft',publicationPolicy:'paid_versions',hasVersionDraft:true,rsvp:{title:'New title',purchased:false}},remote={...local,name:'Saved title',activeVersionId:'v2',activeVersionNumber:2,hasVersionDraft:false,rsvp:{title:'Original',purchased:true}};
 const merged=applyPublicationAuthority(local,remote);assert.equal(merged.name,'Unsent draft');assert.equal(merged.rsvp.title,'New title');assert.equal(merged.rsvp.purchased,true);assert.equal(merged.activeVersionId,'v2');assert.equal(merged.hasVersionDraft,false);assert.equal(applyPublicationAuthority(merged,remote),merged);
 assert.equal(applySavedPublicationAuthority(merged,local,local),merged);
 assert.equal(applySavedPublicationAuthority(local,remote,local).activeVersionId,'v2');
});
