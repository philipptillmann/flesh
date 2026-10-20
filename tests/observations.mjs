import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeJournal, observationFeed} from '../public/observations.js';

test('legacy collections and unknown fields survive normalization without mutation',()=>{
 const legacy={version:1,conditions:[{id:'topic',name:'Bestandsthema'}],pain:[{id:'p',conditionId:'topic',date:'2026-01-02',level:4}],cycles:[{id:'c',date:'2026-01-01',flow:'Mittel',symptoms:[],level:0}],meds:[],intakes:[],extension:{kept:true}};
 const before=structuredClone(legacy);
 const normalized=normalizeJournal(legacy);
 assert.deepEqual(legacy,before);
 assert.deepEqual(normalized.observations,[]);
 assert.deepEqual(normalized.pain,legacy.pain);
 assert.deepEqual(normalized.cycles,legacy.cycles);
 assert.deepEqual(normalized.extension,legacy.extension);
 const feed=observationFeed(normalized);
 assert.equal(feed.length,2);
 assert.equal(feed[0].title,'Bestandsthema');
 assert.equal(feed[1].label,'Menstruation');
});
test('general observations and legacy pain/cycles share a sorted filterable feed',()=>{
 const journal=normalizeJournal({conditions:[],pain:[{id:'same',date:'2026-01-01',level:0}],cycles:[{id:'same',date:'2026-01-03',flow:'Keine',symptoms:[],level:0}],observations:[{id:'same',title:'Erholsamer Schlaf',date:'2026-01-02',tone:'Positiv',value:'8',unit:'Stunden'}]});
 const feed=observationFeed(journal);
 assert.deepEqual(feed.map(item=>item.collection),['cycles','observations','pain']);
 assert.equal(observationFeed(journal,'general')[0].title,'Erholsamer Schlaf');
 assert.ok(observationFeed(journal,'general')[0].details.includes('8 Stunden'));
 assert.equal(observationFeed(journal,'pain')[0].details[0],'Stärke 0/10');
 assert.equal(observationFeed(journal,'cycle').length,1);
 assert.equal(journal.observations[0].collection,undefined);
});
