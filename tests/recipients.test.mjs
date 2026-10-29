import test from 'node:test';import assert from 'node:assert/strict';
import {parseRecipientCsv,validateRecipientRows,recipientTotals,csvCell,recipientUrl} from '../src/features/recipients/recipientData.ts';
import {readSheet} from 'read-excel-file/node';
import {fileURLToPath} from 'node:url';
test('CSV quotes, CRLF, accents, semicolons, multiline and empty rows',()=>{
 const data=parseRecipientCsv('\uFEFFDestinataire;Nombre d’invités\r\n"Famille Évrard; amis";4\r\n"Thomas\nJulie";2\r\n;\r\n');
 const result=validateRecipientRows(data);assert.equal(result.errors.length,0);assert.equal(result.recipients[0].display_name,'Famille Évrard; amis');assert.deepEqual(recipientTotals(result.recipients),{households:2,guests:6});
 assert.throws(()=>parseRecipientCsv('Nom;Invités\n"incomplet;3'),/guillemets/);
});
test('imports reject missing names, invalid numbers/columns/oversized totals, surface duplicates',()=>{
 const result=validateRecipientRows([['Destinataire',"Nombre d’invités"],['Dupont',4],['dupont',2],['',3],['A',1.5],['B',-1],['C','']]);assert.equal(result.recipients.length,2);assert.equal(result.duplicates.length,1);assert.equal(result.errors.length,4);
 assert.equal(validateRecipientRows([['bad','columns']]).errors.length,1);
 assert.equal(validateRecipientRows([['Nom','Personnes'],['A',100000],['B',1]]).errors.length,1);
});
test('totals count people, ignore inactive households; CSV export prevents formulas; URLs encode',()=>{
 assert.deepEqual(recipientTotals([{id:'a',display_name:'A',guest_count:48,is_active:true},{id:'b',display_name:'B',guest_count:100,is_active:false}]),{households:1,guests:48});
 assert.equal(csvCell('=WEBSERVICE("bad")'),'"\'=WEBSERVICE(""bad"")"');assert.equal(recipientUrl('https://example.test','event','abc'),'https://example.test/i/event/abc');
});
test('downloadable XLSX model is readable and matches import headers/example types',async()=>{
 const rows=await readSheet(fileURLToPath(new URL('../public/models/liste-invites.xlsx',import.meta.url)));
 const result=validateRecipientRows(rows);assert.deepEqual(result.errors,[]);assert.equal(result.recipients.length,3);assert.equal(recipientTotals(result.recipients).guests,8);
});
