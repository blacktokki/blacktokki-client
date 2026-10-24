const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../../../__tests__/loadTs.cjs');
const { createGraphSearchIndex, searchKnowledgeGraph } = load('search/engine.ts', {
  './snapshot': { yieldGraphSearch: async () => {} },
});
const node = (id, name = id) => ({
  id,
  name,
  kind: 'keyword',
  typeLabel: 'Keyword',
  noteTitle: 'Source',
  body: '',
  sourceIds: ['s'],
});
const edge = (id, source, target) => ({
  id,
  source,
  target,
  type: 'REFERENCES',
  label: 'references',
  directed: true,
  sourceIds: ['s'],
});
const snapshot = (nodes, edges = []) => ({
  version: 1,
  scope: 'generated',
  revision: 'v',
  nodes,
  edges,
  sources: [{ id: 's', title: 'Source', text: 'Recorded source.' }],
  coverage: { keywords: true, templates: true },
});

test('literal queries keep their names intact across scripts and discover indexed names without suffix rules', async () => {
  for (const name of ['휴가', '사과', '結果', 'résumé', 'Alpha']) {
    const index = await createGraphSearchIndex(snapshot([node(name)]));
    const found = await searchKnowledgeGraph(index, name);
    assert.deepEqual(found.plan.terms, [name.normalize('NFC').toLowerCase()]);
    assert.equal(found.nodes[0].node.id, name);
  }
  const found = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot([node('Alpha'), node('Beta')])),
    'Alpha​Beta'
  );
  assert.deepEqual(found.plan.targetGroups, [['Alpha'], ['Beta']]);
});

test('higher scoring nodes precede lower scoring relationship endpoints in results and context', async () => {
  const items = [node('Relevant'), ...Array.from({ length: 16 }, (_, i) => node('Peer' + i))];
  const relations = Array.from({ length: 8 }, (_, i) =>
    edge('e' + i, 'Peer' + i * 2, 'Peer' + (i * 2 + 1))
  );
  const semanticScores = new Map([['Relevant', 0.99], ...relations.map((e) => [e.id, 0.4])]);
  const result = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot(items, relations)),
    'Unlisted query',
    { semanticScores }
  );
  assert.equal(result.nodes[0].node.id, 'Relevant');
  assert.ok(
    result.context.entries.some((entry) => entry.kind === 'node' && entry.id === 'Relevant')
  );
});

test('homonyms stay separate alternatives while disjoint short and long name mentions remain subjects', async () => {
  const index = await createGraphSearchIndex(
    snapshot([
      node('k', 'Topic'),
      node('p', 'TOPIC'),
      node('short', 'Spring'),
      node('long', 'Spring Boot'),
    ])
  );
  const homonyms = await searchKnowledgeGraph(index, 'Topic');
  assert.equal(homonyms.plan.intent, 'related');
  assert.deepEqual(homonyms.plan.targetGroups, [['k', 'p']]);
  assert.deepEqual(new Set(homonyms.plan.targetIds), new Set(['k', 'p']));
  assert.doesNotMatch(homonyms.context.text, /No path found|Path search was not completed/);
  const distinct = await searchKnowledgeGraph(index, 'Spring Spring Boot');
  assert.equal(distinct.plan.intent, 'connection');
  assert.deepEqual(distinct.plan.targetGroups, [['short'], ['long']]);
  const nested = await searchKnowledgeGraph(index, 'Spring Boot');
  assert.equal(nested.plan.intent, 'related');
  assert.deepEqual(nested.plan.targetGroups, [['long']]);
});

test('actual Markdown budgets select beyond former caps and repack without reranking or revisiting adjacency', async () => {
  const peers = Array.from({ length: 240 }, (_, i) => node('Point ' + i));
  const relations = peers.map((item, i) => edge('e' + i, 'Origin', item.id));
  const index = await createGraphSearchIndex(snapshot([node('Origin'), ...peers], relations));
  let visits = 0;
  let sourceReads = 0;
  const source = index.normalizedSource;
  index.normalizedSource = (id) => {
    sourceReads++;
    return source(id);
  };
  const get = index.adjacent.get.bind(index.adjacent);
  index.adjacent.get = (id) => {
    visits++;
    return get(id);
  };
  const first = await searchKnowledgeGraph(index, 'Origin', { contextChars: 16000 });
  const visited = visits;
  const rankedSourceReads = sourceReads;
  const larger = await searchKnowledgeGraph(index, 'Origin', { contextChars: 256000 });
  assert.equal(visits, visited);
  assert.equal(sourceReads, rankedSourceReads);
  assert.equal(larger.nodes.length, 241);
  assert.equal(larger.edges.length, 240);
  assert.equal(larger.limited, false);
  assert.ok(larger.context.entries.filter((e) => e.kind === 'edge').length > 180);
  const retained = new Set(
    larger.context.entries.map((e) =>
      JSON.stringify(e.kind === 'path' ? [e.kind, e.index] : [e.kind, e.id])
    )
  );
  for (const e of first.context.entries.filter((e) => e.kind !== 'node'))
    assert.ok(retained.has(JSON.stringify(e.kind === 'path' ? [e.kind, e.index] : [e.kind, e.id])));
  assert.ok(larger.context.usage.characters <= 256000);
  const again = await searchKnowledgeGraph(index, 'Origin', { contextChars: 16000 });
  assert.strictEqual(again.context, first.context);
  assert.equal(visits, visited);
});

test('a shared suffix retains alternative complete routes between query subjects', async () => {
  const index = await createGraphSearchIndex(
    snapshot(
      ['Start', 'Upper', 'Lower', 'Merge', 'Goal'].map((id) => node(id)),
      [
        edge('a', 'Start', 'Upper'),
        edge('b', 'Start', 'Lower'),
        edge('c', 'Upper', 'Merge'),
        edge('d', 'Lower', 'Merge'),
        edge('e', 'Merge', 'Goal'),
      ]
    )
  );
  const found = await searchKnowledgeGraph(index, 'Start Goal', { maxHops: 3 });
  const paths = found.paths.filter((path) => path.kind === 'connection');
  assert.ok(paths.some((path) => path.nodes.join(',') === 'Start,Upper,Merge,Goal'));
  assert.ok(paths.some((path) => path.nodes.join(',') === 'Start,Lower,Merge,Goal'));
  assert.equal(found.pathSearchComplete, true);
});

test('explicit subject connections verify category bridges without expanding unrelated siblings for one subject', async () => {
  const group = { ...node('group', 'Group'), kind: 'builtInClass' };
  const index = await createGraphSearchIndex(
    snapshot(
      [node('Alpha'), node('Beta'), node('Unrelated'), group],
      ['Alpha', 'Beta', 'Unrelated'].map((id) => edge(id, id, 'group'))
    )
  );
  const related = await searchKnowledgeGraph(index, 'Alpha', { maxHops: 2 });
  assert.ok(!related.paths.some((path) => path.nodes.includes('Unrelated')));
  const connection = await searchKnowledgeGraph(index, 'Alpha Beta', { maxHops: 2 });
  assert.ok(connection.paths.some((path) => path.nodes.join(',') === 'Alpha,group,Beta'));
  assert.doesNotMatch(connection.context.text, /No path found|Path search was not completed/);
});

test('complete disconnected searches report absence, interrupted searches report unverified typed pairs', async () => {
  const graph = snapshot(
    [node('Alpha'), node('Bridge'), node('Beta')],
    [edge('first', 'Alpha', 'Bridge'), edge('last', 'Bridge', 'Beta')]
  );
  const index = await createGraphSearchIndex(graph);
  const stopped = await searchKnowledgeGraph(index, 'Alpha Beta', { maxEdges: 1, maxHops: 2 });
  assert.equal(stopped.pathSearchComplete, false);
  assert.match(stopped.context.text, /Path search was not completed/);
  assert.match(stopped.context.text, /Alpha.*\(Keyword\)/);
  assert.match(stopped.context.text, /Beta.*\(Keyword\)/);
  assert.doesNotMatch(stopped.context.text, /No path found|Path omitted due to context size/);
  const disconnected = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot([node('Alpha'), node('Beta')])),
    'Alpha Beta'
  );
  assert.equal(disconnected.pathSearchComplete, true);
  assert.match(disconnected.context.text, /No path found/);
  const full = await searchKnowledgeGraph(index, 'Alpha Beta', { maxHops: 2 });
  assert.ok(full.paths.some((path) => path.nodes.join(',') === 'Alpha,Bridge,Beta'));
  assert.doesNotMatch(full.context.text, /No path found|Path search was not completed/);
});
