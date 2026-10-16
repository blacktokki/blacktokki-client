const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const load = require('../../__tests__/loadTs.cjs');
const cancel = (signal) => {
  if (signal?.aborted) throw new Error('cancelled');
};
const dependencies = {
  '@blacktokki/editor': { toRaw: (html) => html.replace(/<[^>]*>/g, '') },
  '../relationDiscovery': { checkRelationCancelled: cancel },
  '../relationCheckpoint': {
    relationCacheHash: async (text) => createHash('sha256').update(text).digest('hex'),
  },
  '../../../../components/HeaderSelectBar': {
    base64Decode: (value) => Buffer.from(value, 'base64').toString(),
    parseHtmlToParagraphs: () => [
      {
        title: 'Details',
        path: Buffer.from('Details').toString('base64'),
        description: '<p>paragraph evidence</p>',
        level: 1,
      },
    ],
  },
};
const { createGraphSearchSnapshot } = load('search/snapshot.ts', dependencies);
const { createGraphSearchIndex, searchKnowledgeGraph, buildGraphSearchContext } = load(
  'search/engine.ts',
  dependencies
);
const node = (id, kind = 'note') => ({
  id,
  name: id,
  kind,
  typeLabel: kind,
  noteTitle: 'Note',
  body: '',
  sourceIds: ['s'],
});
const edge = (id, source, target, type = 'REFERENCES', verdict) => ({
  id,
  source,
  target,
  type,
  label: id,
  sourceIds: ['s'],
  directed: !verdict,
  ...(verdict && { verdict }),
});
const snapshot = (nodes, edges) => ({
  version: 1,
  scope: 'local:1:normal',
  revision: 'rev1',
  nodes,
  edges,
  sources: [{ id: 's', title: 'Note', text: 'original evidence' }],
  coverage: { keywords: true, templates: true },
});

const kinds = [
  'builtInClass',
  'boardClass',
  'note',
  'boardNote',
  'card',
  'paragraph',
  'boardParagraph',
  'connectedParagraph',
  'externalLink',
  'connectedExternalLink',
  'template',
  'templateGroup',
  'keyword',
];
const types = [
  'INSTANCE_OF',
  'SUBCLASS_OF',
  'REPRESENTED_BY_NOTE',
  'REFERENCES',
  'EXTERNAL_REFERENCE',
  'PART_OF',
  'DERIVED_FROM',
  'KEYWORD_SOURCE',
  'KEYWORD_RELATION',
];

test('every node kind and relation type is searchable, independent of canvas filters', async () => {
  const nodes = kinds.map((kind, i) => node(`unique${i}name`, kind));
  const edges = types.map((type, i) => edge(`predicate${i}`, nodes[i].id, nodes[i + 1].id, type));
  const index = await createGraphSearchIndex(snapshot(nodes, edges));
  for (const item of nodes) {
    const result = await searchKnowledgeGraph(index, item.name, { maxHops: 1 });
    assert.equal(result.nodes[0].node.id, item.id);
  }
  for (const item of edges) {
    const result = await searchKnowledgeGraph(index, item.label, { maxHops: 1 });
    assert.ok(
      result.edges.some(({ edge }) => edge.type === item.type),
      item.type
    );
    assert.ok(result.plan.matchedEdgeIds.includes(item.id));
  }
});

test('natural query anchors graph vocabulary; bounded paths preserve direction and contradictions', async () => {
  const index = await createGraphSearchIndex(
    snapshot(
      [node('프로젝트'), node('메일'), node('담당자'), node('별개')],
      [
        edge('owns', '메일', '프로젝트'),
        edge('works', '메일', '담당자', 'KEYWORD_RELATION', 'contradicted'),
      ]
    )
  );
  const result = await searchKnowledgeGraph(index, '프로젝트와 담당자 사이 연결 경로', {
    maxHops: 2,
  });
  assert.equal(result.plan.intent, 'connection');
  assert.ok(
    result.paths.some((path) => path.nodes.join(',') === '프로젝트,메일,담당자' && path.disputed)
  );
  const owns = result.edges.find(({ edge }) => edge.id === 'owns').edge;
  assert.equal(owns.source, '메일');
  assert.equal(owns.target, '프로젝트');
  assert.equal(result.edges.find(({ edge }) => edge.id === 'works').edge.directed, false);
  assert.match(result.context.text, /"verdict":"contradicted"/);
  assert.equal(
    result.nodes.some(({ node }) => node.id === '별개'),
    false
  );
});

test('empty and unrelated queries do not traverse the whole graph', async () => {
  const index = await createGraphSearchIndex(
    snapshot([node('Alpha'), node('Beta')], [edge('uses', 'Alpha', 'Beta')])
  );
  for (const query of ['', '어떠한일치도없는문구']) {
    const result = await searchKnowledgeGraph(index, query);
    assert.equal(result.nodes.length, 0);
    assert.equal(result.edges.length, 0);
  }
});

test('cycles and category hubs stay bounded, abort is honored', async () => {
  const nodes = [
    node('Anchor'),
    node('Hub', 'builtInClass'),
    ...Array.from({ length: 100 }, (_, i) => node(`Item${i}`)),
  ];
  const edges = [
    edge('link', 'Anchor', 'Hub'),
    ...nodes.slice(2).map((n, i) => edge(`e${i}`, 'Hub', n.id)),
    edge('cycle', 'Item0', 'Anchor'),
  ];
  const index = await createGraphSearchIndex(snapshot(nodes, edges));
  const result = await searchKnowledgeGraph(index, 'Anchor', {
    maxHops: 4,
    maxNodes: 8,
    maxEdges: 10,
  });
  assert.ok(result.nodes.length <= 8);
  assert.ok(result.edges.length <= 10);
  assert.ok(result.paths.every((path) => new Set(path.nodes).size === path.nodes.length));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    searchKnowledgeGraph(index, 'Anchor', { signal: controller.signal }),
    /cancelled/
  );
});

test('context commits evidence with claims, preserves structural types, and never exceeds its budget', async () => {
  const data = snapshot(
    [node('Alpha'), node('Beta')],
    [edge('contains', 'Alpha', 'Beta', 'PART_OF')]
  );
  data.sources[0].text = 'evidence '.repeat(10000);
  const result = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha');
  for (const budget of [256, 1500, 16000]) {
    const context = buildGraphSearchContext({ ...result, query: 'x'.repeat(20000) }, budget);
    assert.ok(context.text.length <= budget);
    for (const [, number] of context.text.matchAll(/\[S(\d+)\]/g))
      assert.ok(context.citations[Number(number) - 1]);
    for (const entry of context.entries)
      for (const id of entry.citationIds)
        assert.ok(context.citations.some((source) => source.id === id));
    for (const [kind, marker] of [
      ['edge', '[Edge]'],
      ['node', '[Node]'],
      ['path', '[Path]'],
    ])
      assert.equal(
        context.entries.filter((entry) => entry.kind === kind).length,
        context.text.split(marker).length - 1
      );
  }
  assert.match(result.context.text, /"type":"PART_OF"/);
  assert.match(result.context.text, /\[S1\]/);
  assert.ok(result.context.citations[0].text.length <= 600);
});

const graphNode = (id, more = {}) => ({
  id,
  name: id,
  noteTitle: 'Note',
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  properties: {},
  ...more,
});
const makeSnapshot = (graph, more = {}) =>
  createGraphSearchSnapshot({
    graph,
    scope: 'normal',
    notes: [{ title: 'Note', description: '<h1>Details</h1><p>paragraph evidence</p>' }],
    coverage: { keywords: true, templates: false },
    translate: (s) => s,
    ...more,
  });

test('snapshot removes inaccessible nodes, dangling edges and private-only external links', async () => {
  const graph = {
    nodes: [
      graphNode('Note'),
      graphNode('private', { noteTitle: 'Hidden' }),
      graphNode('url', { instanceKind: 'EXTERNAL_LINK', description: 'https://example.test' }),
      graphNode('public-url', {
        instanceKind: 'EXTERNAL_LINK',
        description: 'https://public.test',
      }),
    ],
    edges: [
      edge('private-link', 'private', 'url', 'EXTERNAL_REFERENCE'),
      edge('public-link', 'Note', 'public-url', 'EXTERNAL_REFERENCE'),
    ],
  };
  const result = await makeSnapshot(graph);
  assert.deepEqual(
    result.nodes.map((n) => n.id),
    ['Note', 'public-url']
  );
  assert.deepEqual(
    result.edges.map((e) => e.id),
    ['public-link']
  );
  assert.deepEqual(result.nodes[1].sourceIds, result.nodes[0].sourceIds);
  assert.doesNotMatch(JSON.stringify(result), /Hidden|example\.test/);
});

test('keyword sources use canonical paragraphs; distinct evidence is not overwritten by whole-note text', async () => {
  const graph = {
    nodes: [
      graphNode('Note'),
      ...['Alpha', 'Beta'].map((name) =>
        graphNode(name, {
          name,
          noteTitle: '',
          instanceKind: 'KEYWORD',
          keyword: {
            key: name,
            sources: [{ noteTitle: 'Note', section: 'Details', sectionPath: ['Details'] }],
          },
        })
      ),
    ],
    edges: [
      {
        ...edge('claim', 'Alpha', 'Beta', 'KEYWORD_RELATION', 'supported'),
        keywordRelation: { candidateId: 'c', verdict: 'supported' },
      },
    ],
  };
  const candidates = [
    {
      id: 'c',
      observations: [
        {
          source: 'Alpha',
          target: 'Beta',
          noteTitle: 'Note',
          section: 'Details',
          sectionPath: ['Details'],
          evidence: 'exact claim',
        },
      ],
      validations: [{ verdict: 'supported' }],
    },
  ];
  const result = await makeSnapshot(graph, { candidates });
  const keyword = result.nodes.find((n) => n.id === 'Alpha');
  const source = result.sources.find((s) => s.id === keyword.sourceIds[0]);
  assert.equal(source.paragraph, 'Details');
  assert.equal(source.path, Buffer.from('Details').toString('base64'));
  assert.equal(source.text, 'paragraph evidence');
  assert.equal(
    result.sources.find((s) => s.id === result.edges[0].sourceIds[0]).text,
    'exact claim'
  );
  assert.equal(result.edges[0].directed, false);
});

test('snapshot revisions remove deleted nodes and change with content or access scope', async () => {
  const graph = { nodes: [graphNode('Note')], edges: [] };
  const first = await makeSnapshot(graph);
  assert.equal(first.revision, (await makeSnapshot(graph)).revision);
  assert.notEqual(first.revision, (await makeSnapshot(graph, { scope: 'private' })).revision);
  assert.notEqual(
    first.revision,
    (await makeSnapshot(graph, { notes: [{ title: 'Note', description: 'edited' }] })).revision
  );
  const deleted = await makeSnapshot(graph, { notes: [] });
  assert.equal(deleted.nodes.length, 0);
  assert.equal(deleted.sources.length, 0);
  assert.notEqual(first.revision, deleted.revision);
});

module.exports = { dependencies, node, edge, snapshot };
