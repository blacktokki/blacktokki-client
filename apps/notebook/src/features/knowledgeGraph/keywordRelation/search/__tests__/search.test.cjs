const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const cancel = (signal) => {
  if (signal?.aborted) throw new Error('cancelled');
};
const dependencies = {
  '@blacktokki/editor': { toRaw: (html) => html.replace(/<[^>]*>/g, '') },
  '../types': { ...load('types.ts') },
  '../keywordRelationCache': {
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
  '../keyword/keywordUtils': {
    ...require('../../__tests__/loadTs.cjs')('keyword/keywordUtils.ts'),
    checkRelationCancelled: cancel,
  },
};
const { createGraphSearchSnapshot, graphSearchInputRevision } = load(
  'search/snapshot.ts',
  dependencies
);
const {
  graphSearchDocuments,
  createGraphSearchIndex,
  searchKnowledgeGraph,
  buildGraphSearchContext,
} = load('search/engine.ts', dependencies);
const node = (id, kind = 'note') => ({
  id,
  name: id,
  kind,
  typeLabel: kind,
  noteTitle: 'Note',
  body: '',
  sourceIds: ['s'],
});
const edge = (id, source, target, type = 'REFERENCES', associationScore) => ({
  id,
  source,
  target,
  type,
  label: id,
  sourceIds: ['s'],
  directed: associationScore === undefined,
  ...(associationScore !== undefined && { associationScore }),
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

test('changing only the hop range reuses query ranking while changed semantic values rerank', async () => {
  const data = snapshot(
    [node('Anchor'), node('Neighbor'), node('Farther')],
    [edge('first', 'Anchor', 'Neighbor'), edge('second', 'Neighbor', 'Farther')]
  );
  const index = await createGraphSearchIndex(data);
  let examined = 0;
  for (const entry of index.entries) {
    const parts = entry.normalizedParts;
    Object.defineProperty(entry, 'normalizedParts', {
      get: () => {
        examined++;
        return parts;
      },
    });
  }
  const semanticScores = new Map([['Neighbor', 0.5]]);
  const first = await searchKnowledgeGraph(index, 'Anchor', { semanticScores, maxHops: 1 });
  const initial = examined;
  assert.ok(initial > 0);
  const wider = await searchKnowledgeGraph(index, 'Anchor', { semanticScores, maxHops: 3 });
  assert.equal(examined, initial, 'hop changes do not scan and sort the source inventory again');
  assert.equal(first.plan.maxHops, 1);
  assert.equal(wider.plan.maxHops, 3);
  await searchKnowledgeGraph(index, 'Anchor', { semanticScores: new Map(semanticScores) });
  assert.equal(examined, initial, 'equal scores can share rankings across result maps');
  semanticScores.set('Neighbor', 0.8);
  await searchKnowledgeGraph(index, 'Anchor', { semanticScores });
  assert.ok(examined > initial, 'in-place changes to the input scores invalidate ranking');
  const changed = examined;
  await searchKnowledgeGraph(index, 'Neighbor', { semanticScores });
  assert.ok(examined > changed, 'a different query gets its own ranking');
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
  'KEYWORD_GENERAL',
  'KEYWORD_RELATION',
  'KEYWORD_TYPE_RELATION',
];

test('search keeps literal words and detects connections by named items rather than question words', async () => {
  const index = await createGraphSearchIndex(
    snapshot(
      [node('Alpha'), node('Beta'), node('관련'), node('find')],
      [edge('uses', 'Alpha', 'Beta')]
    )
  );
  for (const word of ['관련', 'find']) {
    const found = await searchKnowledgeGraph(index, word);
    assert.deepEqual(found.plan.terms, [word]);
    assert.equal(found.nodes[0].node.name, word);
  }
  const connected = await searchKnowledgeGraph(index, 'Alpha Beta');
  assert.equal(connected.plan.intent, 'connection');
  assert.ok(
    connected.paths.some((path) => path.nodes.includes('Alpha') && path.nodes.includes('Beta'))
  );
  const particles = await searchKnowledgeGraph(index, 'Alpha와 Beta의');
  assert.deepEqual(particles.plan.terms, ['alpha와', 'beta의', 'alpha', 'beta']);
});

test('embedding documents use only the model prefix while lexical search covers metadata and full shared sources', async () => {
  const data = snapshot([node('Alpha'), node('Beta')], [edge('related', 'Alpha', 'Beta')]);
  data.nodes[0].body = 'metadata '.repeat(1000) + 'MetadataTail';
  data.sources[0].text = 'source '.repeat(1000) + 'SourceTail';
  const documents = graphSearchDocuments(data);
  const oldNodePrefix = ['Alpha', 'note', 'Note', data.nodes[0].body, data.sources[0].text]
    .join('\n')
    .slice(0, 384);
  const oldEdgePrefix = ['related', 'REFERENCES', 'Alpha', 'Beta', data.sources[0].text]
    .join('\n')
    .slice(0, 384);
  assert.equal(documents[0].text, oldNodePrefix);
  assert.equal(documents[2].text, oldEdgePrefix);
  assert.ok(documents.every((document) => document.text.length <= 384));
  const index = await createGraphSearchIndex(data);
  for (const query of ['MetadataTail', 'SourceTail']) {
    const result = await searchKnowledgeGraph(index, query, { maxHops: 1 });
    assert.ok(
      result.nodes.some(({ node }) => node.id === 'Alpha'),
      query
    );
  }
  const sourceResult = await searchKnowledgeGraph(index, 'SourceTail');
  assert.ok(sourceResult.edges.some(({ edge }) => edge.id === 'related'));
  assert.ok(sourceResult.context.citations.some((source) => source.text.includes('SourceTail')));
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => graphSearchDocuments(data, controller.signal), /cancelled/);
});

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
    assert.equal(result.edges[0].edge.id, item.id);
  }
});

test('natural query anchors graph vocabulary; bounded paths preserve direction and association scores', async () => {
  const index = await createGraphSearchIndex(
    snapshot(
      [node('프로젝트'), node('메일'), node('담당자'), node('별개')],
      [edge('owns', '메일', '프로젝트'), edge('works', '메일', '담당자', 'KEYWORD_RELATION', 0.12)]
    )
  );
  const result = await searchKnowledgeGraph(index, '프로젝트와 담당자 사이 연결 경로', {
    maxHops: 2,
  });
  assert.equal(result.plan.intent, 'connection');
  assert.ok(result.paths.some((path) => path.nodes.join(',') === '프로젝트,메일,담당자'));
  const owns = result.edges.find(({ edge }) => edge.id === 'owns').edge;
  assert.equal(owns.source, '메일');
  assert.equal(owns.target, '프로젝트');
  assert.equal(result.edges.find(({ edge }) => edge.id === 'works').edge.directed, false);
  assert.doesNotMatch(result.context.text, /"verdict"|"disputed"/);
  assert.match(result.context.text, /Association score: 0\.12/);
  assert.match(result.context.text, /← owns \[\d+\]\([^\n]+?\) —/);
  assert.match(result.context.text, /— works \[\d+\]\([^\n]+?\) —/);
  assert.ok(result.paths.every((path) => !Object.hasOwn(path, 'disputed')));
  assert.equal(
    result.nodes.some(({ node }) => node.id === '별개'),
    false
  );
});

test('homonymous keywords and paragraphs remain alternatives of one query subject', async () => {
  for (const [keyword, paragraph, query] of [
    ['Topic', 'TOPIC', 'Topic incident'],
    ['표본', '표본', '표본 연결'],
    ['Cafe\u0301', 'CAFE\u0301', 'Café incident'],
  ]) {
    const data = snapshot(
      [
        { ...node('keyword', 'keyword'), name: keyword },
        { ...node('paragraph', 'connectedParagraph'), name: paragraph },
        node('Helper'),
      ],
      [edge('first', 'keyword', 'Helper')]
    );
    data.sources[0].text = `${keyword} references Helper. ${paragraph} references Helper.`;
    const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), query, {
      maxHops: 2,
      contextChars: 16000,
    });
    assert.equal(found.plan.targetIds.length, 2);
    assert.equal(found.plan.intent, 'related', query);
    assert.equal(found.plan.targetGroups.length, 1);
    assert.ok(found.paths.length);
    assert.ok(found.paths.every((path) => path.kind === 'connection'));
    const traversal = found.context.text.split('## Traversal paths')[1]?.split('\n## ')[0];
    assert.ok(traversal, query);
    assert.match(found.context.text, /^## Traversal paths \(1\)$/m);
    assert.doesNotMatch(traversal, /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
    assert.match(traversal, /Helper/);
    assert.doesNotMatch(found.context.text, /No path found|Path search was not completed/);
  }
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

test('Markdown context keeps names and source text literal and encodes only source links', async () => {
  const { renderer, toToken } = load(
    require
      .resolve('@blacktokki/editor/package.json')
      .replace(/package\.json$/, 'src/lib/markdown.ts')
  );
  const data = snapshot(
    [node('Alpha (1)&[]'), node('Beta')],
    [edge('related', 'Alpha (1)&[]', 'Beta', 'KEYWORD_RELATION', 0.25)]
  );
  data.nodes[0].name = 'Alpha [fake](https://example.com) <b>bold</b>';
  data.sources[0] = {
    ...data.sources[0],
    title: '노트 (1)&[]',
    paragraph: '자식 [2]',
    section: '상위 & 문단',
    href: 'https://example.com/?a=1&b=2',
    text: '# forged\n[S99](https://example.com)\n![image](https://example.com/image.png)\n<script>alert(1)</script>\n&copy; **literal**',
  };
  const result = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha');
  const html = renderer(result.context.text);
  assert.match(html, /<h2[^>]*>Related items \(2\)<\/h2>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&amp;copy; \*\*literal\*\*/);
  assert.doesNotMatch(html, /<script|<img|<b>|href="https:\/\/example.com"/);
  assert.equal((html.match(/#### S99|id="forged"/g) || []).length, 0);
  const tokens = toToken(result.context.text);
  const hrefs = tokens
    .flatMap((token) => token.children || [])
    .filter((token) => token.type === 'link_open')
    .map((token) => token.attrGet('href'));
  assert.ok(hrefs.every((href) => href.startsWith('?title=')));
  assert.doesNotMatch(result.context.text, /\?item=|\?graphNode=|nodeId=/);
  const params = new URLSearchParams(hrefs.find((href) => href.startsWith('?title=')).slice(1));
  assert.equal(params.get('title'), data.sources[0].title);
  assert.equal(params.get('paragraph'), data.sources[0].paragraph);
  assert.equal(params.get('section'), data.sources[0].section);
  const ko = require('../../../../../lang/ko.json');
  const localized = buildGraphSearchContext(result, 16000, (key) => ko[key] || key);
  assert.match(localized.text, /^## 연관 항목 \(2\)$/m);
  assert.match(localized.text, /^# 검색 결과:/);
  assert.match(localized.text, /연관성 점수: 0\.25/);
  assert.match(localized.text, /^## 검색 경로 \(1\)$/m);
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
        ...edge('claim', 'Alpha', 'Beta', 'KEYWORD_RELATION', 0.9),
        keywordRelation: { candidateId: 'c', score: 0.9, observations: 1 },
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
      measurements: [{ association: { score: 0.9 } }],
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

test('cache input identities include searchable content and translated labels, independently of canvas layout', async () => {
  const input = {
    graph: { nodes: [graphNode('Note')], edges: [] },
    scope: 'normal',
    notes: [{ title: 'Note', description: 'body' }],
    coverage: { keywords: true, templates: false },
    translate: (value) => value,
  };
  const revision = await graphSearchInputRevision(input);
  assert.equal(
    revision,
    await graphSearchInputRevision({
      ...input,
      graph: {
        ...input.graph,
        nodes: [{ ...input.graph.nodes[0], x: 1, color: 'red', radius: 100 }],
      },
    })
  );
  const changes = [
    { scope: 'private' },
    { notes: [{ title: 'Note', description: 'edited' }] },
    { boards: [{ title: 'Board', description: 'new board' }] },
    {
      graph: {
        ...input.graph,
        nodes: [{ ...input.graph.nodes[0], properties: { Related: 'Other' } }],
      },
    },
    { graph: { ...input.graph, nodes: [] } },
    { coverage: { keywords: true, templates: true } },
    { translate: (value) => `translated ${value}` },
    { candidates: [{ id: 'relationship', observations: [{ evidence: 'new evidence' }] }] },
  ];
  for (const change of changes)
    assert.notEqual(revision, await graphSearchInputRevision({ ...input, ...change }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    graphSearchInputRevision({ ...input, signal: controller.signal }),
    /cancelled/
  );
});

module.exports = { dependencies, node, edge, snapshot };

test('keyword types and membership edges remain searchable with canonical source provenance', async () => {
  const { addKeywordRelationGraph } = load('graph.ts', dependencies);
  const { getKnowledgeGraphPalette, getKeywordRelationColors } = load('../utils/palette.ts');
  const graph = addKeywordRelationGraph(
    { nodes: [graphNode('Note')], edges: [] },
    {
      entities: ['Item 1', 'Item 2'].map((text) => ({
        text,
        type: 'Item {{NUM}}',
        noteCount: 3,
        mentionCount: 3,
      })),
      details: Object.fromEntries(
        ['item 1', 'item 2'].map((key) => [
          key,
          { sources: [{ noteTitle: 'Note', section: '' }], sentences: [] },
        ])
      ),
      entityTypes: [
        {
          name: 'Collected items',
          keywordCount: 1,
          items: ['item 1', 'item 2'].map((key) => ({ keywords: [{ key, text: key }] })),
          occurrences: [],
          parentIndices: [],
          childIndices: [],
        },
      ],
    },
    [],
    getKnowledgeGraphPalette(false),
    getKeywordRelationColors(false)
  );
  const result = await createGraphSearchSnapshot({
    graph,
    scope: 'normal',
    notes: [{ title: 'Note', description: 'Item evidence' }],
    coverage: { keywords: true, templates: false },
    translate: (value) => value,
  });
  const types = result.nodes.filter((node) => node.kind === 'keywordType');
  assert.equal(types.length, 2);
  assert.ok(types.every((node) => node.typeLabel === 'Keyword type' && node.sourceIds.length));
  assert.equal(result.edges.filter((edge) => edge.label === 'Keyword type membership').length, 4);
  const index = await createGraphSearchIndex(result);
  const search = await searchKnowledgeGraph(index, 'Collected items', { maxHops: 1 });
  assert.ok(search.nodes.some(({ node }) => node.name === 'Collected items'));
  assert.ok(search.sources.some((source) => source.title === 'Note'));
});

test('type associations cite only their actual keyword evidence and distinct association types keep separate sources', async () => {
  const observations = ['sentence', 'table'].map((origin) => ({
    source: 'Alpha',
    target: 'Beta',
    noteTitle: 'Note',
    section: '',
    sectionPath: [],
    evidence: `Actual ${origin} evidence`,
    origin,
  }));
  const candidate = {
    id: 'contexts',
    observations,
    measurements: [
      { association: { context: 'sentence' } },
      { association: { context: 'table-row' } },
    ],
  };
  const typeNode = (id) =>
    graphNode(id, {
      role: 'CLASS',
      instanceKind: undefined,
      classKind: 'KEYWORD_TYPE',
      noteTitle: '',
    });
  const graph = {
    nodes: [graphNode('Alpha'), graphNode('Beta'), typeNode('Editors'), typeNode('Features')],
    edges: [
      {
        id: 'sentence',
        source: 'Alpha',
        target: 'Beta',
        type: 'KEYWORD_RELATION',
        label: 'Associated in the same sentence',
        keywordRelation: {
          candidateId: 'contexts',
          associationContext: 'sentence',
          score: 0.8,
          observations: 1,
        },
      },
      {
        id: 'table',
        source: 'Alpha',
        target: 'Beta',
        type: 'KEYWORD_RELATION',
        label: 'Associated in the same table row',
        keywordRelation: {
          candidateId: 'contexts',
          associationContext: 'table-row',
          score: 0.8,
          observations: 1,
        },
      },
      {
        id: 'types',
        source: 'Editors',
        target: 'Features',
        type: 'KEYWORD_TYPE_RELATION',
        directed: false,
        label: 'Associated in the same table row',
        keywordTypeRelation: { score: 0.8, evidenceCount: 1, evidence: [observations[1]] },
      },
      {
        id: 'general',
        source: 'Alpha',
        target: 'Beta',
        type: 'KEYWORD_GENERAL',
        propertyLabel: 'Compound / contained keyword relationships',
      },
    ],
  };
  const data = await makeSnapshot(graph, { candidates: [candidate] });
  const input = {
    graph,
    scope: 'normal',
    notes: [{ title: 'Note', description: 'body' }],
    candidates: [candidate],
    translate: (value) => value,
    coverage: { keywords: true, templates: false },
  };
  const revision = await graphSearchInputRevision(input);
  assert.notEqual(
    revision,
    await graphSearchInputRevision({
      ...input,
      graph: {
        ...graph,
        edges: graph.edges.map((edge) =>
          edge.id === 'types'
            ? {
                ...edge,
                keywordTypeRelation: {
                  ...edge.keywordTypeRelation,
                  evidence: [{ ...observations[1], evidence: 'Changed source evidence' }],
                },
              }
            : edge
        ),
      },
    })
  );
  for (const [id, text] of [
    ['sentence', 'Actual sentence evidence'],
    ['table', 'Actual table evidence'],
    ['types', 'Actual table evidence'],
  ]) {
    const relation = data.edges.find((edge) => edge.id === id);
    assert.deepEqual(
      relation.sourceIds.map((id) => data.sources.find((source) => source.id === id).text),
      [text]
    );
    assert.deepEqual(relation.evidence, [
      { sourceId: relation.sourceIds[0], start: 0, end: text.length },
    ]);
  }
  const typed = data.edges.find((edge) => edge.id === 'types');
  assert.equal(typed.associationScore, 0.8);
  assert.equal(typed.directed, false);
  const result = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Editors');
  assert.ok(result.edges.some(({ edge }) => edge.id === 'types'));
  assert.ok(result.context.citations.some((source) => source.text === 'Actual table evidence'));
  assert.equal(
    data.edges.find((edge) => edge.id === 'general').label,
    'Compound / contained keyword relationships'
  );
});

test('a merged pair/context edge retains citations from every contributing pattern', async () => {
  const candidates = ['first', 'second'].map((id) => ({
    id,
    observations: ['sentence', 'table'].map((origin) => ({
      source: id === 'first' ? 'Alpha' : 'Beta',
      target: id === 'first' ? 'Beta' : 'Alpha',
      noteTitle: 'Note',
      section: '',
      sectionPath: [],
      origin,
      evidence: `${id} ${origin} evidence`,
    })),
    measurements: [
      { association: { context: 'sentence' } },
      { association: { context: 'table-row' } },
    ],
  }));
  const graph = {
    nodes: [graphNode('Alpha'), graphNode('Beta')],
    edges: [
      {
        id: 'merged',
        source: 'Alpha',
        target: 'Beta',
        type: 'KEYWORD_RELATION',
        label: 'Associated in the same sentence',
        directed: false,
        keywordRelation: {
          candidateId: 'first',
          candidateIds: ['first', 'second'],
          associationContext: 'sentence',
          score: 0.9,
          observations: 2,
        },
      },
    ],
  };
  const data = await makeSnapshot(graph, { candidates });
  assert.equal(data.edges.length, 1);
  const byId = new Map(data.sources.map((source) => [source.id, source]));
  assert.deepEqual(
    new Set(data.edges[0].sourceIds.map((id) => byId.get(id).text)),
    new Set(['first sentence evidence', 'second sentence evidence'])
  );
  const input = {
    graph,
    candidates,
    scope: 'normal',
    notes: [{ title: 'Note', description: 'body' }],
    translate: (value) => value,
    coverage: { keywords: true, templates: false },
  };
  const original = await graphSearchInputRevision(input);
  graph.edges[0].keywordRelation.candidateIds = ['first'];
  assert.notEqual(await graphSearchInputRevision(input), original);
});

test('a graph sharing a 2 MB note across 1000 memberships indexes and searches within a 128 MB heap', (t) => {
  const script = `
    const assert = require('node:assert/strict');
    const { createHash } = require('node:crypto');
    const load = require(${JSON.stringify(require.resolve('../../__tests__/loadTs.cjs'))});
    const dependencies = {
      '@blacktokki/editor': { toRaw: (text) => text },
      '../../../../components/HeaderSelectBar': { parseHtmlToParagraphs: () => [] },
      '../keywordRelationCache': { relationCacheHash: async (text) => createHash('sha256').update(text).digest('hex') },
      '../keyword/keywordUtils': { ...load('keyword/keywordUtils.ts'), checkRelationCancelled: (signal) => { if (signal?.aborted) throw new Error('cancelled'); } },
    };
    const { createGraphSearchSnapshot } = load('search/snapshot.ts', dependencies);
    const { createGraphSearchIndex, searchKnowledgeGraph } = load('search/engine.ts', dependencies);
    (async () => {
      const text = 'shared source '.repeat(160000) + ' TailOnly';
      const origin = { noteTitle: 'Note', section: '' };
      const nodes = Array.from({ length: 1000 }, (_, i) => ({
        id: 'keyword:' + i, name: 'Keyword ' + i, noteTitle: '', role: 'INSTANCE', instanceKind: 'KEYWORD', properties: {},
        keyword: { key: String(i), type: null, sources: [origin] },
      }));
      nodes.push({ id: 'type', name: 'Shared type', noteTitle: '', role: 'CLASS', classKind: 'KEYWORD_TYPE', properties: {}, keywordType: { kind: 'entity-type', sources: [origin] } });
      const edges = nodes.slice(0, 1000).map((node, i) => ({ id: 'edge:' + i, source: node.id, target: 'type', type: 'INSTANCE_OF', propertyLabel: 'keywordType' }));
      const snapshot = await createGraphSearchSnapshot({ graph: { nodes, edges }, scope: 'memory-test', notes: [{ title: 'Note', description: text }], translate: (key) => key, coverage: { keywords: true, templates: false } });
      assert.equal(snapshot.sources.length, 1);
      assert.ok(snapshot.nodes.every((node) => !node.body));
      assert.ok(snapshot.sources[0].id.length < 32);
      const index = await createGraphSearchIndex(snapshot);
      const documentChars = index.documents.reduce((sum, document) => sum + document.text.length, 0);
      assert.ok(documentChars <= index.documents.length * 384);
      const result = await searchKnowledgeGraph(index, 'TailOnly');
      assert.ok(result.nodes.length);
      assert.ok(result.edges.length);
      assert.ok(result.context.citations.some((source) => source.text.includes('TailOnly')));
      process.stdout.write(JSON.stringify({ sourceChars: text.length, documentChars, heapUsed: process.memoryUsage().heapUsed }));
    })().catch((error) => { process.stderr.write(String(error.stack)); process.exitCode = 1; });
  `;
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', script], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 64 * 1024,
  });
  assert.equal(child.status, 0, child.error?.message || child.stderr);
  const metrics = JSON.parse(child.stdout);
  assert.ok(metrics.documentChars < metrics.sourceChars);
  t.diagnostic(JSON.stringify(metrics));
});
