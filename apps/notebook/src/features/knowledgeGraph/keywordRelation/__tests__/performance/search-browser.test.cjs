const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { runBrowser, browserPath } = require('./browser.cjs');

if (browserPath && typeof WebSocket === 'undefined') {
  const result = spawnSync(process.execPath, ['--experimental-websocket', __filename], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

test(
  'HTML IDs and dense paragraph sources remain responsive in the real browser',
  { timeout: 60000 },
  async (t) => {
    const result = await runBrowser(
      t,
      [
        'search/snapshot.ts',
        'search/engine.ts',
        '../../../components/HeaderSelectBar.tsx',
        'keywordRelationCache.ts',
        'search/evidence.ts',
        '../../../../../../packages/blacktokki-editor/src/lib/dom.ts',
        '../../../../../../packages/blacktokki-editor/src/lib/markdown.ts',
      ],
      `
    const [{createGraphSearchSnapshot}, {createGraphSearchIndex,searchKnowledgeGraph}, {parseHtmlToParagraphs}, {keywordRelationEntries,graphSearchCache,keywordRelationCacheKey}, {graphSourceStructure}, {toRaw}, {renderer}] = production;
    const notes = Array.from({length:128}, (_,index) => ({
      title:'Synthetic source '+index,
      description:Array.from({length:64}, (_,section) => '<h2 id="anchor-'+section+'">Section '+section+'</h2><p>Condition '+index+':'+section+'. '+'Generated context including multilingual 한글 Ελληνικά é content. '.repeat(4)+'</p>').join(''),
    }));
    const graph = {nodes:[],edges:[]};
    for (const [index,note] of notes.entries()) {
      const root = 'note:'+index;
      graph.nodes.push({id:root,name:note.title,noteTitle:note.title,role:'INSTANCE',instanceKind:'NOTE',properties:{}});
      for (const paragraph of parseHtmlToParagraphs(note.description).slice(1)) {
        const id = root+':'+paragraph.path;
        graph.nodes.push({id,name:paragraph.title,noteTitle:note.title,role:'INSTANCE',instanceKind:'PARAGRAPH',paragraph,properties:{}});
        graph.edges.push({id:'edge:'+id,source:id,target:root,type:'PART_OF',propertyLabel:'paragraphPartOf'});
      }
    }
    const scope = 'browser-independent';
    const oldPattern=keywordRelationCacheKey(scope,'patterns');
    const oldMetadata=keywordRelationCacheKey(scope,'metadata');
    const retainedVector=keywordRelationCacheKey('synthetic-retained','vectors');
    const obsolete='@blacktokki:notebook:keyword_relation:synthetic/patterns/result';
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('@blacktokki:notebook:keyword_relation',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('entries');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result, tx=db.transaction('entries','readwrite'), store=tx.objectStore('entries');
        for(const key of [oldPattern,oldMetadata,obsolete]) store.put('Synthetic confidential source',key);
        store.put('retained numeric vectors',retainedVector);
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>reject(tx.error);
      };
    });
    const retired=await keywordRelationEntries.read([oldPattern,oldMetadata,obsolete,retainedVector]);
    const vector = Array.from({length:384},(_,index)=>Math.sin(index+1)*0.1234567);
    const identities=Array.from({length:32768},(_,index)=>index.toString(16).padStart(64,'0'));
    const serialized=JSON.stringify({model:'synthetic:mean:normalized:search-v1',vectors:identities.map(key=>[key,vector]),graph:{version:1,revision:'a'.repeat(64),inputRevision:'b'.repeat(64),documentCount:graph.nodes.length+graph.edges.length,documents:identities.slice(0,graph.nodes.length+graph.edges.length)}});
    await keywordRelationEntries.write([[keywordRelationCacheKey(scope,'vectors'),serialized]]);
    let maxDelay = 0;
    let previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maxDelay=Math.max(maxDelay,now-previous); previous=now; },10);
    const started = performance.now();
    let cacheTiming;
    const reading = graphSearchCache.read(scope,'vectors',timing=>cacheTiming=timing);
    const model = new Promise(resolve=>setTimeout(resolve,2300));
    const snapshot = await createGraphSearchSnapshot({scope,graph,notes,coverage:{keywords:true,templates:false},translate:key=>key});
    const index = await createGraphSearchIndex(snapshot);
    const [saved] = await Promise.all([reading,model]);
    clearInterval(timer);
    const elapsed = performance.now()-started;
    const source = snapshot.sources.find(source => source.title === notes[0].title && !source.paragraph);
    const fragment='<div class="yaml-frontmatter"><span id="hidden">Hidden</span></div>'+Array.from({length:16},(_,index)=>'<h2 id="ref-'+index+'">标题 한글 é '+index+'</h2><p>Constraint <a href="./Generated.md#rule">조건</a> &amp; context.</p>').join('');
    const text=toRaw(fragment);
    const parse=DOMParser.prototype.parseFromString;
    let parses=0;
    DOMParser.prototype.parseFromString=function(...args){parses++;return parse.apply(this,args);};
    let structure;
    try {structure=graphSourceStructure(fragment,text);} finally {DOMParser.prototype.parseFromString=parse;}
    const ids=structure.anchors.filter(anchor=>anchor.kind==='id');
    const nested={title:'Generated nested source',description:'<h1>Root</h1><h2>Subject</h2><h3>Details</h3><blockquote><p>Subject requires <a href="#policy">the linked decision</a><br>with complete context.</p><ul><li><input type="checkbox">Also check <a href="./Rules.md">Rules</a>.</li></ul></blockquote><h2 id="policy">Decision</h2><p>Approval is mandatory.</p>'};
    const emptyParagraph=parseHtmlToParagraphs(nested.description).find(p=>p.title==='Subject');
    const nestedSnapshot=await createGraphSearchSnapshot({scope:'generated-nested',graph:{nodes:[{id:'subject',name:'Subject',noteTitle:nested.title,role:'INSTANCE',instanceKind:'PARAGRAPH',paragraph:emptyParagraph,properties:{}}],edges:[]},notes:[nested,{title:'Rules',description:'<p>Owner review is mandatory.</p>'}],coverage:{keywords:true,templates:false},translate:key=>key});
    const nestedSource=nestedSnapshot.sources.find(s=>!s.origin&&s.title===nested.title);
    const nestedSearch=await searchKnowledgeGraph(await createGraphSearchIndex(nestedSnapshot),'Subject');
    const nestedChecks={links:nestedSource.references.length,resolved:nestedSource.references.every(r=>r.internal&&!r.unresolved&&r.targets.length&&r.resolvedHref.startsWith('?title=')),validLinkOffsets:nestedSource.references.every(r=>nestedSource.text.slice(r.start,r.end)===r.name),emptyQuotes:nestedSearch.context.citations.filter(c=>!c.text.trim()).length,headingQuoted:nestedSearch.context.citations.some(c=>c.text.includes('Subject')),conditionQuoted:nestedSearch.context.citations.some(c=>c.text.includes('Owner review is mandatory'))};
    const merged='<p>Before.</p><table><thead><tr><th rowspan="2">Subject</th><th colspan="2">Alternatives</th></tr><tr><th>First</th><th>Second</th></tr></thead><tbody><tr><td rowspan="0">Alpha</td><td>7 | &lt;literal&gt;</td><td>24</td></tr><tr><td>Conditional only.</td><td></td></tr></tbody><tbody><tr><td>Beta</td><td>Not yet enabled.</td><td>Never enabled.</td></tr></tbody></table><p>After.</p>';
    const mergedText=toRaw(merged), mergedStructure=graphSourceStructure(merged,mergedText);
    const tableSnapshot={version:1,scope:'generated-table',revision:'same',coverage:{keywords:true,templates:false},sources:[{id:'table',title:'Generated table',text:mergedText,...mergedStructure}],nodes:[{id:'alpha',name:'Alpha',kind:'note',typeLabel:'Note',noteTitle:'Generated table',body:'',sourceIds:['table']}],edges:[]};
    const tableIndex=await createGraphSearchIndex(tableSnapshot);
    const tableSearch=await searchKnowledgeGraph(tableIndex,'Alpha');
    const tableHtml=document.createElement('div');tableHtml.innerHTML=renderer(tableSearch.context.text);
    const tableRows=[...tableHtml.querySelector('blockquote table').rows].map(row=>[...row.cells].map(cell=>cell.textContent));
    const tableChecks={rowSpan:mergedStructure.tables[0].rows[2].cells[0].rowSpan,raw:tableSearch.context.citations.every(c=>c.text===mergedText.slice(c.start,c.end)),withinBudget:tableSearch.context.text.length<=16000,rows:tableRows};
    return {retired,elapsed,maxDelay,bytes:serialized.length,vectors:saved.vectors.length,storage:cacheTiming.steps.map(step=>({name:step.name,ms:step.end-step.start})),nodes:snapshot.nodes.length,documents:index.documents.length,anchors:source.anchors.length,validAnchors:source.anchors.every(anchor => source.text.slice(anchor.start,anchor.end).includes('Section')),parses,idCount:ids.length,referenceCount:structure.references.length,validOffsets:ids.every((anchor,index)=>text.slice(anchor.start,anchor.end).startsWith('标题 한글 é '+index)),hidden:ids.some(anchor=>anchor.name==='hidden'),nestedChecks,tableChecks};
  `
    );
    if (!result) return;
    t.diagnostic(JSON.stringify(result));
    assert.deepEqual(result.retired, [null, null, null, 'retained numeric vectors']);
    assert.equal(result.anchors, 128);
    assert.equal(result.validAnchors, true);
    assert.equal(result.idCount, 16);
    assert.equal(result.referenceCount, 16);
    assert.equal(result.validOffsets, true);
    assert.equal(result.hidden, false);
    assert.deepEqual(result.nestedChecks, {
      links: 2,
      resolved: true,
      validLinkOffsets: true,
      emptyQuotes: 0,
      headingQuoted: true,
      conditionQuoted: true,
    });
    assert.deepEqual(result.tableChecks, {
      rowSpan: 2,
      raw: true,
      withinBudget: true,
      rows: [
        ['Subject', 'Alternatives', 'Alternatives'],
        ['Subject', 'First', 'Second'],
        ['Alpha', '7 | <literal>', '24'],
        ['Alpha', 'Conditional only.', ''],
        ['Beta', 'Not yet enabled.', 'Never enabled.'],
      ],
    });
    assert.ok(result.parses <= 2, 'HTML IDs must not trigger repeated prefix parsing');
    assert.ok(
      result.elapsed < 5000,
      `browser source/index preparation exceeded five seconds: ${result.elapsed}`
    );
  }
);
