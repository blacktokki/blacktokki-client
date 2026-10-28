const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { describe, test } = require('node:test');

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

test('query changes reuse canonical source context from the prepared index', async () => {
  const text = 'Alpha references Beta under the linked requirement.';
  const condition = 'Independent owner review is mandatory.';
  const data = snapshot([node('Alpha'), node('Beta')], [edge('relationship', 'Alpha', 'Beta')]);
  data.sources = [
    {
      id: 's',
      title: 'Source',
      text,
      blocks: [{ start: 0, end: text.length }],
      scopes: [{ start: 0, end: text.length }],
      references: [
        {
          start: 0,
          end: text.length,
          href: '?title=Policy',
          name: 'requirement',
          internal: true,
          targets: [{ sourceId: 'policy', start: 0, end: condition.length }],
        },
      ],
    },
    { id: 'policy', title: 'Policy', text: condition },
  ];
  const index = await createGraphSearchIndex(data);
  const resolve = index.evidenceContext;
  const remembered = new Map();
  let reused = 0;
  index.evidenceContext = (citation, limit) => {
    const evidence = resolve(citation, limit);
    if (remembered.has(citation.id)) {
      assert.strictEqual(evidence, remembered.get(citation.id));
      reused++;
    } else remembered.set(citation.id, evidence);
    return evidence;
  };
  for (const query of ['Alpha', 'Beta']) {
    const found = await searchKnowledgeGraph(index, query);
    assert.ok(found.context.citations.some((c) => c.text.includes(condition)));
  }
  assert.ok(reused > 0, 'changing the query does not rebuild identical source context bundles');
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

describe('Search retrieval', () => {
  const { createGraphSearchIndex, searchKnowledgeGraph, graphSearchDocuments } = load(
    'search/engine.ts',
    {
      './snapshot': { yieldGraphSearch: async () => {} },
    }
  );
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

  test('identifier fragments retain proportional evidence confidence across scripts and exact searches', async () => {
    for (const [fragment, identifier, query] of [
      ['ti', 'work_notification_channel', 'Signal'],
      ['결', '작업결과목록', '표식'],
      ['é', 'Cafe\u0301Index', 'Indice'],
      ['𐐀', '𐐀𐐁𐐂', 'Marker'],
    ]) {
      const text = `${query} ${identifier}.`;
      const data = snapshot([
        { ...node('fragment', fragment), noteTitle: query },
        { ...node('whole', identifier.normalize('NFC')), noteTitle: query },
      ]);
      data.sources = [{ id: 's', title: query, text }];
      const documents = graphSearchDocuments(data);
      const index = await createGraphSearchIndex(data);
      const found = await searchKnowledgeGraph(index, query);
      const partial = found.nodes.find(({ node }) => node.id === 'fragment');
      const whole = found.nodes.find(({ node }) => node.id === 'whole');
      assert.ok(partial.score > 0 && partial.score < whole.score);
      assert.equal(whole.score, 25);
      assert.equal(data.nodes[0].name, fragment);
      const exact = await searchKnowledgeGraph(index, fragment);
      assert.equal(exact.nodes.find(({ node }) => node.id === 'fragment').score, 100);
      assert.deepEqual(graphSearchDocuments(data), documents);
    }
  });

  test('independent occurrences and verified link identities keep full evidence confidence', async () => {
    const text = 'Signal work_notification.\nSignal ti.\nSignal tiny.';
    const data = snapshot([
      node('fragment', 'ti'),
      { ...node('link', 'tiny'), kind: 'externalLink', url: 'https://example.invalid/item' },
    ]);
    const start = text.indexOf('tiny');
    data.sources = [
      {
        id: 's',
        title: 'Source',
        text,
        references: [{ start, end: start + 4, name: 'tiny', href: 'https://example.invalid/item' }],
      },
    ];
    const index = await createGraphSearchIndex(data);
    const found = await searchKnowledgeGraph(index, 'Signal');
    assert.equal(found.nodes.find(({ node }) => node.id === 'fragment').score, 25);
    assert.equal(found.nodes.find(({ node }) => node.id === 'link').score, 25);
    assert.strictEqual((await searchKnowledgeGraph(index, 'Signal')).context, found.context);
  });

  test('returning to recent words reuses ranking, traversal and context while changed semantic scores invalidate them', async () => {
    const index = await createGraphSearchIndex(snapshot([node('Alpha'), node('Beta')]));
    let scoreReads = 0,
      traversals = 0,
      sourceReads = 0;
    const adjacent = index.adjacent.get.bind(index.adjacent);
    index.adjacent.get = (id) => {
      traversals++;
      return adjacent(id);
    };
    const source = index.normalizedSource;
    index.normalizedSource = (id) => {
      sourceReads++;
      return source(id);
    };
    const semanticScores = new Map([['Beta', 0.4]]);
    const semantic = semanticScores.get.bind(semanticScores);
    semanticScores.get = (id) => {
      scoreReads++;
      return semantic(id);
    };
    const first = await searchKnowledgeGraph(index, 'Alpha', { semanticScores });
    await searchKnowledgeGraph(index, 'Beta');
    const counts = [scoreReads, traversals, sourceReads];
    const again = await searchKnowledgeGraph(index, 'Alpha', { semanticScores });
    assert.strictEqual(again.context, first.context);
    assert.deepEqual([scoreReads, traversals, sourceReads], counts);
    semanticScores.set('Beta', 0.8);
    await searchKnowledgeGraph(index, 'Alpha', { semanticScores });
    assert.equal(scoreReads, counts[0] + 1);
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
    const punctuation = await searchKnowledgeGraph(
      await createGraphSearchIndex(snapshot([node('Alpha')])),
      '()[]{}'
    );
    assert.equal(punctuation.nodes.length, 0);
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

  test('word fragments do not become query subjects or expand the literal query terms', async () => {
    const index = await createGraphSearchIndex(
      snapshot([
        node('fragment-a', 'ot'),
        node('fragment-b', 'fi'),
        node('fragment-c', 'at'),
        node('fragment-d', 'on'),
        node('topic', 'Notification reference'),
      ])
    );
    const found = await searchKnowledgeGraph(index, 'notification');
    assert.deepEqual(found.plan.terms, ['notification']);
    assert.deepEqual(found.plan.targetGroups, [['topic']]);
    assert.equal(found.plan.intent, 'related');
    const literal = await searchKnowledgeGraph(index, 'on');
    assert.deepEqual(literal.plan.targetGroups, [['fragment-d']]);
  });

  test('longer indexed titles represent uncovered query mentions and each subject appears in the context', async () => {
    for (const [first, second] of [
      ['Alpha', 'Beacon'],
      ['표본', '자료'],
      ['Δείγμα', 'Σήμα'],
    ]) {
      const index = await createGraphSearchIndex(
        snapshot([
          node('first', first),
          node('second-a', '[Project] ' + second),
          node('second-b', second + ' specification'),
        ])
      );
      const found = await searchKnowledgeGraph(index, first + ' ' + second, {
        contextChars: 16000,
      });
      assert.deepEqual(found.plan.targetGroups, [['first'], ['second-a', 'second-b']]);
      assert.equal(found.plan.intent, 'connection');
      assert.ok(found.context.entries.some((e) => e.kind === 'node' && e.id === 'first'));
      assert.ok(
        found.context.entries.some(
          (e) => e.kind === 'node' && ['second-a', 'second-b'].includes(e.id)
        )
      );
      assert.match(found.context.text, /No path found/);
      let reads = 0;
      const original = index.names.keys.bind(index.names);
      index.names.keys = () => {
        reads++;
        return original();
      };
      await searchKnowledgeGraph(index, first + ' ' + second, { contextChars: 32000 });
      assert.equal(reads, 0, 'context repacking reuses resolved name groups');
    }
  });

  test('name components that describe an explicit subject stay qualifiers across scripts, while literal names stay subjects', async () => {
    for (const [first, second, qualifier, condition] of [
      ['Origin', 'Beacon', 'mode', 'constraint'],
      ['표본', '자료', '작동', '제한'],
      ['Δείγμα', 'Σήμα', 'χρήση', 'όρος'],
    ]) {
      const items = [
        node('first', first),
        node('second-a', '[Project] ' + second),
        node('second-b', second + ' specification'),
        node('qualifier-a', first + ' ' + qualifier + ' guide'),
        node('qualifier-b', 'Other ' + qualifier + ' guide'),
        node('condition', first + ' ' + condition + ' guide'),
      ];
      const query = [first, second, qualifier, condition].join(' ');
      const found = await searchKnowledgeGraph(
        await createGraphSearchIndex(snapshot(items)),
        query
      );
      assert.deepEqual(found.plan.targetGroups, [['first'], ['second-a', 'second-b']]);
      for (const word of [qualifier, condition])
        assert.ok(found.plan.terms.includes(word.toLowerCase()));
      const literal = await searchKnowledgeGraph(
        await createGraphSearchIndex(snapshot([...items, node('literal', qualifier)])),
        query
      );
      assert.deepEqual(literal.plan.targetGroups, [
        ['first'],
        ['second-a', 'second-b'],
        ['literal'],
      ]);
    }
  });

  test('whole-source matches do not promote unrelated links and item evidence reuses only its matching provenance', async () => {
    const { graphSearchDocuments } = load('search/engine.ts', {
      './snapshot': { yieldGraphSearch: async () => {} },
    });
    for (const query of ['Signal', '標本', 'Δείγμα', 'résumé']) {
      const first = 'Link belongs to different work.';
      const second = query.normalize('NFD') + ' includes Link and Owner.';
      const text = first + '\n' + second;
      const source = {
        id: 's',
        title: 'Recorded work',
        text,
        blocks: [{ start: 0, end: text.length }],
        scopes: [{ start: 0, end: text.length }],
        references: [
          { start: 0, end: 4, name: 'Link', href: 'https://example.invalid/unrelated' },
          {
            start: first.length + 1 + second.indexOf('Link'),
            end: first.length + 1 + second.indexOf('Link') + 4,
            name: 'Link',
            href: 'https://example.invalid/related',
          },
        ],
      };
      const extras = Array.from({ length: 40 }, (_, i) => ({
        id: 'other' + i,
        title: 'Other ' + i,
        text: 'Owner belongs to another recorded context.',
      }));
      const owner = { ...node('owner', 'Owner'), sourceIds: ['s', ...extras.map((s) => s.id)] };
      const data = snapshot([
        node('subject', query),
        { ...node('note', 'Recorded work'), kind: 'note' },
        owner,
        {
          ...node('unrelated', 'Link'),
          kind: 'externalLink',
          url: 'https://example.invalid/unrelated',
        },
        {
          ...node('related', 'Link'),
          kind: 'externalLink',
          url: 'https://example.invalid/related',
        },
      ]);
      data.sources = [source, ...extras];
      const documents = graphSearchDocuments(data);
      const index = await createGraphSearchIndex(data);
      const found = await searchKnowledgeGraph(index, query);
      assert.ok(found.nodes.some(({ node }) => node.id === 'related'));
      assert.ok(!found.nodes.some(({ node }) => node.id === 'unrelated'));
      const selected = found.nodes.find(({ node }) => node.id === 'owner').node;
      assert.deepEqual(selected.matchedSourceIds, ['s']);
      assert.deepEqual(selected.sourceIds, owner.sourceIds);
      const record = found.context.entries.find((e) => e.kind === 'node' && e.id === 'owner');
      assert.ok(record.citationIds.length);
      for (const id of record.citationIds)
        assert.equal(found.context.citations.find((c) => c.id === id).sourceId, 's');
      assert.ok(
        found.nodes.find(({ node }) => node.id === 'note').score <=
          found.nodes.find(({ node }) => node.id === 'related').score
      );
      await searchKnowledgeGraph(index, query, { maxHops: 3, contextChars: 32000 });
      assert.strictEqual((await searchKnowledgeGraph(index, query)).context, found.context);
      assert.deepEqual(graphSearchDocuments(data), documents);
      assert.equal(owner.matchedSourceIds, undefined);
    }
  });

  test('adjacent structural blocks keep independent link contexts even without separator characters', async () => {
    const text = 'LinkSignal Owner';
    const data = snapshot([
      node('subject', 'Signal'),
      { ...node('link', 'Link'), kind: 'externalLink', url: 'https://example.invalid/link' },
      node('owner', 'Owner'),
    ]);
    data.sources = [
      {
        id: 's',
        title: 'Source',
        text,
        blocks: [
          { start: 0, end: 4 },
          { start: 4, end: text.length },
        ],
        references: [{ start: 0, end: 4, name: 'Link', href: 'https://example.invalid/link' }],
      },
    ];
    const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Signal');
    assert.ok(found.nodes.some(({ node }) => node.id === 'owner'));
    assert.ok(!found.nodes.some(({ node }) => node.id === 'link'));
    const separate = snapshot([node('subject', 'Signal'), node('owner', 'Owner')]);
    separate.sources = [
      {
        id: 's',
        title: 'Source',
        text: 'Owner belongs to different work.\nSignal has independent context.',
      },
    ];
    const independent = await searchKnowledgeGraph(
      await createGraphSearchIndex(separate),
      'Signal'
    );
    assert.ok(!independent.nodes.some(({ node }) => node.id === 'owner'));
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
      assert.ok(
        retained.has(JSON.stringify(e.kind === 'path' ? [e.kind, e.index] : [e.kind, e.id]))
      );
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

  test('the first literal search shares normalized evidence, while full phrases still collapse whitespace', async () => {
    const engine = load(
      'search/engine.ts',
      {
        './snapshot': { yieldGraphSearch: async () => {} },
        './context': { buildGraphSearchContextAsync: async (result) => result.context },
      },
      [],
      new Map()
    );
    const text = 'Owner.\nRésumé 가 İ Alpha\t\nBeta.';
    const data = snapshot([
      node('owner', 'Owner'),
      { ...node('note', 'Other'), kind: 'note' },
      { ...node('phrase', 'Alpha Beta'), sourceIds: [] },
    ]);
    data.sources = [
      {
        id: 's',
        title: 'Stored',
        text,
        blocks: [
          { start: 0, end: 6 },
          { start: 7, end: text.length },
        ],
      },
    ];
    const index = await engine.createGraphSearchIndex(data);
    const normalize = String.prototype.normalize;
    let fullSourceNormalizations = 0;
    String.prototype.normalize = function (...args) {
      if (String(this) === text) fullSourceNormalizations++;
      return normalize.apply(this, args);
    };
    try {
      for (const query of ['Résumé', '가', 'İ']) {
        const result = await engine.searchKnowledgeGraph(index, query);
        assert.equal(result.nodes.find(({ node }) => node.id === 'note').score, 25);
      }
      assert.equal(fullSourceNormalizations, 0);
      const phrase = await engine.searchKnowledgeGraph(index, 'Alpha Beta');
      assert.equal(phrase.nodes.find(({ node }) => node.id === 'note').score, 25);
      assert.equal(phrase.nodes.find(({ node }) => node.id === 'phrase').score, 100);
      assert.equal(fullSourceNormalizations, 0);
    } finally {
      String.prototype.normalize = normalize;
    }
  });
});
