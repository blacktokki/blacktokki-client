const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const editor = load(
  require
    .resolve('@blacktokki/editor/package.json')
    .replace(/package\.json$/, 'src/lib/markdown.ts')
);
const dependencies = {
  '@blacktokki/editor': { toRaw: editor.toRaw },
  '../../../../components/HeaderSelectBar': {
    parseHtmlToParagraphs: () => [],
    base64Decode: (value) => Buffer.from(value, 'base64').toString(),
  },
  '../keywordRelationCache': {
    relationCacheHash: async (text) => createHash('sha256').update(text).digest('hex'),
  },
  '../types': { GRAPH_SEARCH_EMBEDDING_CHARS: 384 },
  '../keyword/keywordUtils': {
    ...require('../../__tests__/loadTs.cjs')('keyword/keywordUtils.ts'),
    checkRelationCancelled: (signal) => {
      if (signal?.aborted) throw new Error('cancelled');
    },
  },
};
const { createGraphSearchSnapshot } = load('search/snapshot.ts', dependencies);
const { createGraphSearchIndex, searchKnowledgeGraph, buildGraphSearchContext } = load(
  'search/engine.ts',
  dependencies
);
const { graphTextBlocks, graphSourceStructure } = load('search/evidence.ts', dependencies);
const node = (id, sourceIds = []) => ({
  id,
  name: id,
  kind: 'keyword',
  typeLabel: 'Keyword',
  noteTitle: '',
  body: '',
  sourceIds,
});
const edge = (id, source, target, sourceIds = ['s']) => ({
  id,
  source,
  target,
  type: 'KEYWORD_RELATION',
  label: 'uses',
  directed: true,
  sourceIds,
});
const result = (nodes, edges, sources, paths = []) => ({
  scope: 'context-budget-review',
  revision: 'review',
  query: 'Alpha Beta',
  plan: {
    terms: ['alpha', 'beta'],
    intent: 'connection',
    maxHops: 3,
    targetIds: ['Alpha', 'Beta'],
  },
  nodes: nodes.map((node) => ({ node, score: 90 })),
  edges: edges.map((edge) => ({ edge, score: 80 })),
  sources,
  paths,
  limited: false,
});
const quotes = (context, id) => {
  const entry = context.entries.find((entry) => entry.kind === 'edge' && entry.id === id);
  assert.ok(entry, 'relationship must be included');
  return entry.citationIds.map((id) => context.citations.find((citation) => citation.id === id));
};
const valid = (context, sources) => {
  assert.equal(context.usage.characters, context.text.length);
  assert.ok(context.text.length <= context.usage.limit);
  for (const citation of context.citations) {
    const original = sources.find((source) => source.id === citation.sourceId);
    assert.ok(original);
    assert.equal(citation.text, original.text.slice(citation.start, citation.end));
  }
  for (const entry of context.entries)
    for (const id of entry.citationIds)
      assert.ok(context.citations.some((citation) => citation.id === id));
};
const graphNode = (id) => ({
  id,
  name: id,
  role: 'INSTANCE',
  instanceKind: 'KEYWORD',
  noteTitle: 'Note',
  properties: {},
  keyword: { key: id, type: null, sources: [{ noteTitle: 'Note', section: '', sectionPath: [] }] },
});
async function observedSnapshot(
  description,
  claim,
  { sectionPath = [], snapshot = createGraphSearchSnapshot, extraNotes = [] } = {}
) {
  const observation = {
    source: 'Alpha',
    target: 'Beta',
    noteTitle: 'Note',
    section: sectionPath.join(' / '),
    sectionPath,
    evidence: claim,
    origin: 'sentence',
  };
  return snapshot({
    graph: {
      nodes: ['Alpha', 'Beta'].map(graphNode),
      edges: [
        {
          id: 'ab',
          source: 'Alpha',
          target: 'Beta',
          type: 'KEYWORD_RELATION',
          directed: false,
          label: 'Associated in the same sentence',
          keywordRelation: {
            candidateId: 'c',
            associationContext: 'sentence',
            score: 0.8,
            observations: 1,
          },
        },
      ],
    },
    candidates: [
      {
        id: 'c',
        observations: [observation],
        measurements: [{ association: { context: 'sentence' } }],
      },
    ],
    scope: 'origin-review',
    coverage: { keywords: true, templates: false },
    notes: [{ title: 'Note', description }, ...extraNotes],
    translate: (key) => key,
  });
}

test('source blocks retain entire paragraphs, nested lists and table structure without linguistic word rules', () => {
  for (const html of [
    '<p>Alpha uses Beta. This is an unapproved proposal.</p><p>Other material.</p>',
    '<ul><li>Alpha uses Beta.<ul><li>Owner approval is required.</li></ul></li></ul><p>Other material.</p>',
    '<table><thead><tr><th>Party</th><th>Condition</th></tr></thead><tbody><tr><td>Alpha uses Beta</td><td>Owner approval is required</td></tr></tbody></table><p>Other material.</p>',
  ]) {
    const text = editor.toRaw(html);
    const ranges = graphSourceStructure(html, text).blocks;
    const proof = ranges.find((range) => text.slice(range.start, range.end).includes('Alpha'));
    assert.ok(proof);
    const quote = text.slice(proof.start, proof.end);
    assert.ok(/unapproved proposal|Owner approval/.test(quote));
    assert.equal(quote.includes('Other material'), false);
  }
  const markdown =
    'Alpha uses Beta. Later qualification.\n\n- Parent\n  - Condition\n\n| Party | Condition |\n| --- | --- |\n| Alpha | Beta |';
  const passages = graphTextBlocks(markdown).map((range) => markdown.slice(range.start, range.end));
  assert.equal(passages.length, 3);
  assert.ok(passages[0].includes('Later qualification'));
  assert.ok(passages[1].includes('Parent') && passages[1].includes('Condition'));
  assert.ok(passages[2].includes('| --- |'));
});

test('unrecorded evidence keeps every sentence in its paragraph, including an unfamiliar qualification', () => {
  for (const qualification of [
    'This is an unapproved proposal.',
    '운영자의 승인이 있어야 적용된다.',
    '承認後に限り適用する。',
    'Unbekannte Einschränkung: Freigabe erforderlich.',
  ]) {
    const text = 'Alpha uses Beta. ' + qualification;
    const sources = [{ id: 's', title: 'Policy', text }];
    const found = result([node('Alpha'), node('Beta')], [edge('ab', 'Alpha', 'Beta')], sources, [
      { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
    ]);
    const context = buildGraphSearchContext(found, 16000);
    assert.ok(quotes(context, 'ab').some((citation) => citation.text === text));
    valid(context, sources);
  }
});

test('recorded observations retain an accessible canonical origin, context and differently worded contrary evidence', async () => {
  const claim = 'Alpha uses Beta for geometry.';
  const qualification = 'This is an unapproved proposal until the owner accepts it.';
  const opposite = 'Alpha is independent of Beta and requires no Beta installation.';
  const html =
    '<p>İ e\u0301 Background.</p><p>' +
    claim +
    ' ' +
    qualification +
    '</p><p>' +
    'Unrelated background. '.repeat(300) +
    '</p><p>' +
    opposite +
    '</p>';
  const data = await observedSnapshot(html, claim);
  const observation = data.sources.find((source) => source.text === claim);
  assert.ok(observation.origin);
  const canonical = data.sources.find((source) => source.id === observation.origin.sourceId);
  assert.equal(canonical.text, editor.toRaw(html));
  assert.ok(
    observation.origin.ranges.every(
      (range) => canonical.text.slice(range.start, range.end) === claim
    )
  );
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta', {
    contextChars: 256000,
  });
  const supporting = quotes(found.context, 'ab');
  assert.ok(
    supporting.some(
      (citation) => citation.text.includes(claim) && citation.text.includes(qualification)
    )
  );
  assert.ok(supporting.some((citation) => citation.text.includes(opposite)));
  assert.ok(supporting.every((citation) => citation.sourceId === canonical.id));
  assert.ok(found.context.usage.characters < 16000);
  const path = found.context.entries.find((entry) => entry.kind === 'path');
  assert.ok(path && supporting.every((citation) => path.citationIds.includes(citation.id)));
  valid(found.context, data.sources);
});

test('opposing evidence in another block is retained even when it shares no predicate wording', () => {
  const sources = [
    {
      id: 's',
      title: 'Versions',
      text: 'Alpha는 Beta를 사용한다.\n\nAlpha는 더 이상 Beta를 이용하지 않는다.',
    },
  ];
  const relation = { ...edge('ab', 'Alpha', 'Beta'), label: '사용한다' };
  const context = buildGraphSearchContext(
    result([node('Alpha'), node('Beta')], [relation], sources),
    16000
  );
  assert.ok(quotes(context, 'ab').some((citation) => citation.text.includes('이용하지 않는다')));
  valid(context, sources);
});

test('larger budgets never lose a relationship because a long primary quotation blocks a fitting alternative', () => {
  const sources = [
    { id: 'large', title: 'Long evidence', text: 'Alpha uses Beta. ' + 'x'.repeat(15553) },
    { id: 'small', title: 'Short evidence', text: 'Alpha uses Beta for geometry.' },
  ];
  const relation = {
    ...edge(
      'ab',
      'Alpha',
      'Beta',
      sources.map((source) => source.id)
    ),
    evidence: sources.map((source) => ({ sourceId: source.id, start: 0, end: source.text.length })),
  };
  const found = result([node('Alpha'), node('Beta')], [relation], sources, [
    { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
  ]);
  for (const budget of [800, 4000, 16000, 32000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    assert.ok(quotes(context, 'ab').length);
    assert.ok(context.entries.some((entry) => entry.kind === 'path'));
    valid(context, sources);
  }
});

test('an explanation retries earlier evidence choices when its later relationship would otherwise not fit', () => {
  const sources = [
    { id: 'long', title: 'Long', text: 'Alpha uses Helper. ' + 'x'.repeat(1700) },
    { id: 'short', title: 'Short', text: 'Alpha uses Helper.' },
    { id: 'end', title: 'End', text: 'Helper uses Beta. ' + 'y'.repeat(1500) },
  ];
  const relations = [
    edge('ah', 'Alpha', 'Helper', ['long', 'short']),
    edge('hb', 'Helper', 'Beta', ['end']),
  ];
  for (const relation of relations)
    relation.evidence = relation.sourceIds.map((id) => ({
      sourceId: id,
      start: 0,
      end: sources.find((source) => source.id === id).text.length,
    }));
  const context = buildGraphSearchContext(
    result(
      ['Alpha', 'Helper', 'Beta'].map((id) => node(id)),
      relations,
      sources,
      [{ nodes: ['Alpha', 'Helper', 'Beta'], edges: ['ah', 'hb'] }]
    ),
    3200
  );
  assert.ok(context.entries.some((entry) => entry.kind === 'path'));
  assert.ok(quotes(context, 'ah').some((citation) => citation.sourceId === 'short'));
  assert.ok(quotes(context, 'hb').some((citation) => citation.sourceId === 'end'));
  valid(context, sources);
});

test('cost includes escaped Markdown, citation links, headings and highlighting', () => {
  const sources = [
    {
      id: 'expanded',
      title: 'Long title '.repeat(100),
      text: 'Alpha uses Beta. ' + '*[]'.repeat(800),
    },
    { id: 'small', title: 'Short', text: 'Alpha uses Beta.' },
  ];
  const relation = {
    ...edge('ab', 'Alpha', 'Beta', ['expanded', 'small']),
    evidence: sources.map((source) => ({ sourceId: source.id, start: 0, end: source.text.length })),
  };
  const context = buildGraphSearchContext(
    result([node('Alpha'), node('Beta')], [relation], sources, [
      { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
    ]),
    4000
  );
  assert.ok(quotes(context, 'ab').some((citation) => citation.sourceId === 'small'));
  valid(context, sources);
});

test('alternative paths through different intermediates survive node revisits and use the actual output budget', async () => {
  const nodes = ['Alpha', 'X', 'Y', 'Gamma'].map((id) => node(id, ['s']));
  const edges = [
    edge('ax', 'Alpha', 'X'),
    edge('ay', 'Alpha', 'Y'),
    edge('xg', 'X', 'Gamma'),
    edge('yg', 'Y', 'Gamma'),
  ];
  const data = {
    version: 1,
    scope: 'routes',
    revision: 'routes',
    coverage: { keywords: true, templates: true },
    nodes,
    edges,
    sources: [
      {
        id: 's',
        title: 'Note',
        text: 'Alpha uses X. X uses Gamma.\n\nAlpha uses Y. Y uses Gamma.',
      },
    ],
  };
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Gamma', {
    maxHops: 2,
    contextChars: 256000,
  });
  const mains = found.paths.filter((path) => path.kind === 'connection');
  for (const via of ['X', 'Y']) assert.ok(mains.some((path) => path.nodes.includes(via)));
  assert.ok(found.paths.every((path) => new Set(path.nodes).size === path.nodes.length));
  assert.match(found.context.text, /^## Traversal paths \(2\)$/m);
  assert.equal(found.limited, false);
  for (const budget of [256, 800, 4000, 16000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    for (const entry of context.entries.filter((entry) => entry.kind === 'path')) {
      const path = found.paths[entry.index];
      for (const edgeId of path.edges)
        assert.ok(context.entries.some((entry) => entry.kind === 'edge' && entry.id === edgeId));
    }
    valid(context, data.sources);
  }
});

test('complete attributes exceed the former per-value and per-item caps when the actual budget permits', () => {
  const policy =
    'Alpha uses Beta for geometry, ' +
    'configuration review, '.repeat(60) +
    'only if the owner approves; otherwise geometry is forbidden.';
  const properties = {
    Policy: policy,
    Number: 3,
    Active: false,
    Empty: null,
    Details: { flags: ['x', 'y'], allowed: false },
  };
  const item = { ...node('Geometry'), body: JSON.stringify(properties) };
  const found = result([item], [], []);
  found.plan.intent = 'related';
  found.plan.terms = ['policy'];
  const large = buildGraphSearchContext(found, 256000);
  assert.ok(large.text.includes('only if the owner approves'));
  assert.ok(large.text.includes('otherwise geometry is forbidden'));
  assert.match(large.text, /Number: 3/);
  assert.match(large.text, /Active: false/);
  assert.match(large.text, /Empty: null/);
  assert.equal(large.truncated, false);
  const small = buildGraphSearchContext(found, 800);
  assert.equal(
    small.text.includes('configuration review'),
    false,
    'an attribute is included whole or omitted'
  );
  assert.equal(small.truncated, true);
  valid(large, []);
  valid(small, []);
});

test('optional item quotations cannot displace relationships or paths as the context budget grows', async () => {
  const sources = [
    { id: 'large', title: 'Alpha', text: 'Alpha details. ' + 'x'.repeat(30000) },
    { id: 'short', title: 'Reference', text: 'Alpha uses Beta. ' + 'b'.repeat(2000) },
  ];
  const data = {
    version: 1,
    scope: 'monotone-context',
    revision: 'review',
    coverage: { keywords: true, templates: true },
    nodes: [node('Alpha', ['large', 'short']), node('Beta', ['short'])],
    edges: [edge('ab', 'Alpha', 'Beta', ['short'])],
    sources,
  };
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha');
  let previous = new Set();
  for (const budget of [16000, 32000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    const current = new Set(
      context.entries
        .filter((entry) => entry.kind !== 'node')
        .map((entry) =>
          JSON.stringify(entry.kind === 'path' ? [entry.kind, entry.index] : [entry.kind, entry.id])
        )
    );
    for (const key of previous) assert.ok(current.has(key), 'a larger budget must retain ' + key);
    assert.ok(quotes(context, 'ab').length);
    assert.ok(context.entries.some((entry) => entry.kind === 'path'));
    previous = current;
    valid(context, sources);
  }
});

test('core admission retains earlier relationships when a larger budget admits expensive higher-priority evidence', () => {
  const sources = [
    { id: 'long', title: 'Long', text: 'Alpha uses Beta. ' + 'x'.repeat(17000) },
    { id: 'short', title: 'Short', text: 'Gamma uses Delta. ' + 'y'.repeat(14500) },
  ];
  const found = result(
    ['Alpha', 'Beta', 'Gamma', 'Delta'].map((id) => node(id)),
    [edge('ab', 'Alpha', 'Beta', ['long']), edge('gd', 'Gamma', 'Delta', ['short'])],
    sources,
    [
      { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
      { nodes: ['Gamma', 'Delta'], edges: ['gd'] },
    ]
  );
  found.edges[0].score = 100;
  let previous = new Set();
  for (const budget of [16000, 32000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    const current = new Set(
      context.entries
        .filter((entry) => entry.kind !== 'node')
        .map((entry) => JSON.stringify([entry.kind, entry.id ?? entry.index]))
    );
    for (const key of previous) assert.ok(current.has(key), 'core coverage cannot shrink');
    previous = current;
    valid(context, sources);
  }
});

test('recorded claims retain qualifications in separate paragraphs using their enclosing source scope', async () => {
  for (const qualification of [
    'This statement is an unapproved proposal and requires owner approval.',
    '이 설명은 제안이며 승인 이후에만 적용된다.',
    '承認後に限り適用する。',
    'Freigabe erforderlich; bis dahin gilt die vorherige Regel.',
  ]) {
    const claim = 'Alpha uses Beta.';
    const data = await observedSnapshot('<p>' + claim + '</p><p>' + qualification + '</p>', claim);
    const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta', {
      contextChars: 256000,
    });
    assert.ok(
      quotes(found.context, 'ab').some((citation) => citation.text.includes(qualification))
    );
    valid(found.context, data.sources);
  }
});

test('a qualification scope is atomic and heading boundaries prevent unrelated sections from becoming mandatory', async () => {
  const claim = 'Alpha uses Beta.';
  const qualification = 'Owner approval is required. ' + 'q'.repeat(17000);
  const data = await observedSnapshot(
    '<h2>Decision</h2><p>' +
      claim +
      '</p><p>' +
      qualification +
      '</p>' +
      '<h2>Archive</h2><p>' +
      'unrelated '.repeat(20000) +
      '</p>',
    claim
  );
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta', {
    contextChars: 256000,
  });
  const small = buildGraphSearchContext(found, 16000);
  assert.ok(small.entries.every((entry) => entry.kind !== 'edge' && entry.kind !== 'path'));
  const large = buildGraphSearchContext(found, 32000);
  assert.ok(quotes(large, 'ab').some((citation) => citation.text.includes(qualification)));
  assert.ok(quotes(large, 'ab').every((citation) => !citation.text.includes('unrelated')));
  valid(small, data.sources);
  valid(large, data.sources);
});

test('ancestor section introductions remain dependencies of a relationship in a nested subsection', async () => {
  const claim = 'Alpha uses Beta.';
  const qualification = 'Approval is required for all decisions in this section.';
  const data = await observedSnapshot(
    '<h1>Policy</h1><p>' +
      qualification +
      '</p><h2>Geometry</h2><p>' +
      claim +
      '</p>' +
      '<h2>Other topic</h2><p>' +
      'unrelated '.repeat(10000) +
      '</p>',
    claim
  );
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
  assert.ok(quotes(found.context, 'ab').some((citation) => citation.text.includes(qualification)));
  assert.ok(quotes(found.context, 'ab').every((citation) => !citation.text.includes('unrelated')));
  valid(found.context, data.sources);
});

test('paragraph extraction follows its original note so ancestor qualifications survive canonical source resolution', async () => {
  const claim = 'Alpha uses Beta.';
  const qualification = 'Approval governs the decisions below.';
  const sectionPath = ['Policy', 'Geometry'];
  const snapshot = load('search/snapshot.ts', {
    ...dependencies,
    '../../../../components/HeaderSelectBar': {
      base64Decode: (value) => Buffer.from(value, 'base64').toString(),
      parseHtmlToParagraphs: () => [
        {
          title: 'Geometry',
          path: sectionPath.map((value) => Buffer.from(value).toString('base64')).join(','),
          description: '<p>' + claim + '</p>',
          level: 2,
        },
      ],
    },
  }).createGraphSearchSnapshot;
  const data = await observedSnapshot(
    '<h1>Policy</h1><p>' + qualification + '</p><h2>Geometry</h2><p>' + claim + '</p>',
    claim,
    { sectionPath, snapshot }
  );
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
  assert.ok(quotes(found.context, 'ab').some((citation) => citation.text.includes(qualification)));
  valid(found.context, data.sources);
});

test('multiline and nested attributes retain whitespace, literal fences and structure in rendered Markdown', () => {
  const properties = {
    Policy: 'if owner_approved:\n\tdeploy()\nelse:\n    abort()\n```literal```',
    Spacing: '  A    B  ',
    Details: { enabled: false, lines: ['one', 'two'], count: 3 },
  };
  const found = result([{ ...node('Geometry'), body: JSON.stringify(properties) }], [], []);
  found.plan.intent = 'related';
  found.plan.terms = ['policy'];
  const context = buildGraphSearchContext(found, 256000);
  const tokens = editor.toToken(context.text);
  const literals = tokens.filter((token) => token.type === 'fence').map((token) => token.content);
  assert.ok(literals.includes(properties.Policy + '\n'));
  assert.ok(literals.includes(properties.Spacing + '\n'));
  assert.ok(
    literals.some((literal) => {
      try {
        return JSON.stringify(JSON.parse(literal)) === JSON.stringify(properties.Details);
      } catch {
        return false;
      }
    })
  );
  assert.equal(context.truncated, false);
  const small = buildGraphSearchContext(found, 400);
  valid(small, []);
  assert.equal(small.truncated, true);
});

test('traversal sections remain visible when complete related items fit and when no intact path fits', () => {
  const items = ['Alpha', 'Beta'].map((id) => ({ ...node(id), name: id + 'x'.repeat(240) }));
  const plain = {
    ...result(items, [], []),
    query: 'Topic',
    plan: { terms: [], intent: 'related', maxHops: 2 },
  };
  const missing = {
    ...plain,
    plan: { ...plain.plan, intent: 'connection', targetIds: ['Alpha', 'Beta'] },
  };
  const ko = require('../../../../../lang/ko.json');
  for (const translate of [(key) => key, (key) => ko[key] || key]) {
    const baseline = buildGraphSearchContext(plain, 16000, translate);
    assert.ok(!baseline.text.includes('## ' + translate('Traversal paths')));
    for (const budget of [
      baseline.text.length - 10,
      baseline.text.length,
      baseline.text.length + 10,
      baseline.text.length + 400,
    ]) {
      const context = buildGraphSearchContext(missing, budget, translate);
      assert.ok(context.text.includes('## ' + translate('Traversal paths') + ' (0/'));
      assert.ok(
        context.text.includes(
          translate('No path found within the selected search range.').replace('.', '\\.')
        )
      );
      valid(context, []);
      const fresh = buildGraphSearchContext(JSON.parse(JSON.stringify(missing)), budget, translate);
      assert.deepEqual(context, fresh);
    }
    const expanded = buildGraphSearchContext(missing, 16000, translate);
    assert.ok(expanded.text.includes('## ' + translate('Traversal paths') + ' (0/1)'));
    assert.equal(expanded.truncated, false);
    valid(expanded, []);
  }

  const relation = edge('ab', 'Alpha', 'Beta');
  const sources = [
    { id: 's', title: 'Note', text: 'Alpha uses Beta. ' + 'Full condition. '.repeat(2000) },
  ];
  const largeEvidence = {
    ...plain,
    edges: [{ edge: relation, score: 40 }],
    paths: [{ nodes: ['Alpha', 'Beta'], edges: ['ab'] }],
    sources,
  };
  const small = buildGraphSearchContext(largeEvidence, 2000);
  assert.match(small.text, /^## Traversal paths \(0\)$/m);
  assert.match(small.text, /^> Paths between query items/m);
  assert.ok(small.entries.every((entry) => entry.kind !== 'path'));
  assert.equal(small.truncated, true);
  valid(small, sources);
  const expanded = buildGraphSearchContext(largeEvidence, 64000);
  assert.match(expanded.text, /^## Traversal paths \(1\)$/m);
  assert.ok(expanded.entries.some((entry) => entry.kind === 'path'));
  valid(expanded, sources);
  for (const budget of [0, 1, 64]) valid(buildGraphSearchContext(largeEvidence, budget), sources);
});

test('traversal paths show only typed exceptions for missing or size-omitted target pairs', async () => {
  const sources = [{ id: 's', title: 'Note', text: 'Alpha uses Beta.' }];
  const data = {
    version: 1,
    scope: 'target-coverage',
    revision: 'review',
    coverage: { keywords: true, templates: true },
    nodes: ['Alpha', 'Beta', 'Gamma'].map((id) => node(id, ['s'])),
    edges: [edge('ab', 'Alpha', 'Beta')],
    sources,
  };
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta Gamma');
  const full = buildGraphSearchContext(found, 16000);
  const traversal = (context) =>
    context.text.split('## Traversal paths')[1]?.split('\n## ')[0] || '';
  const missingPairs = (context) => {
    let start = '';
    return (traversal(context).split('> No path found within the selected search range')[1] || '')
      .split('\n\n> ')[0]
      .split('\n')
      .flatMap((line) => {
        if (line.startsWith('- ')) start = line.slice(2);
        return line.startsWith('  - ') ? [start + ' — ' + line.slice(4)] : [];
      });
  };
  assert.doesNotMatch(full.text, /Query item connections|Paths shown/);
  assert.match(full.text, /^## Traversal paths \(1\/3\)$/m);
  assert.doesNotMatch(traversal(full), /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
  assert.equal(missingPairs(full).length, 2, 'each missing pair is mentioned once');
  assert.match(
    traversal(full),
    /> No path found[^\n]*\n\n- .*Alpha.*\(Keyword\)\n  - .*Gamma.*\(Keyword\)/
  );
  const betaGamma = missingPairs(full).find(
    (line) => line.includes('Beta') && line.includes('Gamma')
  );
  assert.ok(betaGamma);
  assert.equal(betaGamma.match(/\(Keyword\)/g).length, 2);
  assert.ok(
    !missingPairs(full).some((line) => /Alpha.*Beta/.test(line)),
    'shown pairs need no notice'
  );
  const tokens = editor.toToken(traversal(full));
  const quotations = tokens.flatMap((token, index) =>
    token.type === 'blockquote_open' ? [index] : []
  );
  assert.equal(quotations.length, 2, 'the missing-path notice is the second quotation');
  assert.match(
    tokens[quotations[1] + 2].content,
    /^No path found within the selected search range/
  );
  const endQuote = tokens.findIndex(
    (token, index) => index > quotations[1] && token.type === 'blockquote_close'
  );
  assert.equal(
    tokens[endQuote + 1].type,
    'bullet_list_open',
    'affected pairs follow outside the quotation'
  );
  const withheld = {
    ...found,
    sources: [{ ...sources[0], text: sources[0].text + 'x'.repeat(30000) }],
  };
  const partial = buildGraphSearchContext(withheld, 16000);
  assert.match(
    traversal(partial),
    /> Path omitted due to context size[^\n]*\n\n- .*Alpha.*\(Keyword\)\n  - .*Beta.*\(Keyword\)/
  );
  assert.equal((traversal(partial).match(/^> Path omitted due to context size/gm) || []).length, 1);
  assert.doesNotMatch(traversal(partial), /^- .*Path omitted due to context size/m);
  const partialTokens = editor.toToken(traversal(partial));
  const partialQuotations = partialTokens.flatMap((token, index) =>
    token.type === 'blockquote_open' ? [index] : []
  );
  assert.equal(partialQuotations.length, 3);
  assert.match(partialTokens[partialQuotations[1] + 2].content, /^No path found/);
  assert.match(
    partialTokens[partialQuotations[2] + 2].content,
    /^Path omitted due to context size/
  );
  const omittedQuoteEnd = partialTokens.findIndex(
    (token, index) => index > partialQuotations[2] && token.type === 'blockquote_close'
  );
  assert.equal(partialTokens[omittedQuoteEnd + 1].type, 'bullet_list_open');
  assert.equal(missingPairs(partial).length, 2);
  assert.match(partial.text, /^## Traversal paths \(0\/3\)$/m);
  assert.doesNotMatch(traversal(partial), /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
  assert.equal(partial.truncated, true);
  assert.equal(full.truncated, false);
  valid(full, sources);
  valid(partial, withheld.sources);
  const branched = buildGraphSearchContext(
    {
      ...withheld,
      edges: [...withheld.edges, { edge: edge('ac', 'Alpha', 'Gamma'), score: 40 }],
      paths: [...withheld.paths, { nodes: ['Alpha', 'Gamma'], edges: ['ac'] }],
    },
    16000
  );
  const omitted = traversal(branched).split('> Path omitted due to context size')[1];
  assert.ok(omitted);
  assert.match(branched.text, /^## Traversal paths \(0\/3\)$/m);
  assert.equal((omitted.match(/^- /gm) || []).length, 1, 'omitted pairs share their start');
  assert.equal((omitted.match(/^  - /gm) || []).length, 2);
  assert.match(omitted, /^- .*Alpha.*\(Keyword\)$/m);
  assert.match(omitted, /^  - .*Beta.*\(Keyword\)$/m);
  assert.match(omitted, /^  - .*Gamma.*\(Keyword\)$/m);
  assert.equal(missingPairs(branched).length, 1);
  assert.doesNotMatch(traversal(branched), /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
  valid(branched, withheld.sources);
  const larger = buildGraphSearchContext(withheld, 64000);
  assert.ok(larger.entries.some((entry) => entry.kind === 'path'));
  assert.doesNotMatch(larger.text, /Path omitted due to context size/);
  valid(larger, withheld.sources);
  const ko = require('../../../../../lang/ko.json');
  const localized = buildGraphSearchContext(withheld, 16000, (key) => ko[key] || key);
  assert.match(localized.text, /^## 검색 경로 \(0\/3\)$/m);
  assert.doesNotMatch(localized.text, /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
  assert.equal(
    (localized.text.match(/^> 선택한 탐색 범위에서 경로를 찾지 못했습니다/gm) || []).length,
    1
  );
  assert.doesNotMatch(localized.text, /질문 대상별 연결/);
  const noExclusions = buildGraphSearchContext(
    {
      ...found,
      plan: { ...found.plan, targetIds: ['Alpha', 'Beta'] },
    },
    16000
  );
  assert.match(noExclusions.text, /^## Traversal paths \(1\)$/m);
  assert.match(traversal(noExclusions), /^> Paths between query items[^\n]*connections\\\.$/m);
  assert.doesNotMatch(noExclusions.text, /No path found|Path omitted/);

  const extraIds = Array.from({ length: 10 }, (_, index) => 'extra-' + index);
  const crowdedResult = {
    ...found,
    plan: {
      ...found.plan,
      targetIds: [...found.plan.targetIds, ...extraIds],
      targetNames: {
        ...found.plan.targetNames,
        ...Object.fromEntries(extraIds.map((id) => [id, id + 'x'.repeat(600)])),
      },
    },
  };
  const crowded = buildGraphSearchContext(crowdedResult, 1800);
  const displayed = missingPairs(crowded).length;
  assert.match(
    crowded.text,
    new RegExp('^## Traversal paths \\(1/' + (1 + displayed) + '\\)$', 'm')
  );
  assert.ok(
    displayed > 0 && displayed < 77,
    'the header total counts only the notice pairs that fit'
  );
  assert.equal(crowded.truncated, true);
  valid(crowded, sources);
  const expanded = buildGraphSearchContext(crowdedResult, 256000);
  assert.equal(missingPairs(expanded).length, 77);
  assert.match(expanded.text, /^## Traversal paths \(1\/78\)$/m);
  assert.doesNotMatch(traversal(expanded), /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
  valid(expanded, sources);
  assert.strictEqual(buildGraphSearchContext(crowdedResult, 1800), crowded);
  const crowdedKo = buildGraphSearchContext(crowdedResult, 1800, (key) => ko[key] || key);
  const koreanNotice = crowdedKo.text
    .split('> 선택한 탐색 범위에서 경로를 찾지 못했습니다')[1]
    .split('\n## ')[0];
  const koreanDisplayed = (koreanNotice.match(/^  - /gm) || []).length;
  assert.ok(koreanDisplayed > 0 && koreanDisplayed < 77);
  assert.match(
    crowdedKo.text,
    new RegExp('^## 검색 경로 \\(1/' + (1 + koreanDisplayed) + '\\)$', 'm')
  );
  assert.doesNotMatch(koreanNotice, /\(\d+(?:\/\d+)?\)/);
  valid(crowdedKo, sources);

  const unlisted = buildGraphSearchContext(
    {
      ...crowdedResult,
      nodes: [],
      edges: [],
      paths: [],
      sources: [],
      plan: {
        ...crowdedResult.plan,
        targetIds: extraIds.slice(0, 3),
        targetNames: Object.fromEntries(extraIds.map((id) => [id, id + 'x'.repeat(4000)])),
      },
    },
    800
  );
  assert.match(unlisted.text, /^## Traversal paths \(0\/0\)$/m);
  assert.equal(missingPairs(unlisted).length, 0);
  valid(unlisted, []);
  const onlyNormal = buildGraphSearchContext(
    {
      ...crowdedResult,
      plan: {
        ...crowdedResult.plan,
        targetIds: ['Alpha', 'Beta', ...extraIds.slice(0, 2)],
        targetNames: Object.fromEntries(extraIds.map((id) => [id, id + 'x'.repeat(4000)])),
      },
    },
    1600
  );
  assert.match(onlyNormal.text, /^## Traversal paths \(1\/1\)$/m);
  assert.equal(missingPairs(onlyNormal).length, 0);
  valid(onlyNormal, sources);

  const omittedIds = Array.from({ length: 5 }, (_, index) => 'O' + index);
  const omittedEdges = omittedIds.flatMap((id, index) =>
    omittedIds.slice(index + 1).map((peer) => edge(id + peer, id, peer))
  );
  const omittedSources = [{ ...sources[0], text: 'Intact condition. '.repeat(4000) }];
  const omittedResult = {
    ...result(
      omittedIds.map((id) => ({ ...node(id), name: id + 'x'.repeat(160) })),
      omittedEdges,
      omittedSources,
      omittedEdges.map((edge) => ({ nodes: [edge.source, edge.target], edges: [edge.id] }))
    ),
    plan: { ...found.plan, targetIds: omittedIds, terms: [] },
  };
  const clippedOmissions = buildGraphSearchContext(omittedResult, 1800);
  const omittedList = traversal(clippedOmissions).split('> Path omitted due to context size')[1];
  assert.ok(omittedList);
  const omittedDisplayed = (omittedList.match(/^  - /gm) || []).length;
  assert.ok(omittedDisplayed > 0 && omittedDisplayed < 10);
  assert.match(
    clippedOmissions.text,
    new RegExp('^## Traversal paths \\(0/' + omittedDisplayed + '\\)$', 'm')
  );
  assert.doesNotMatch(traversal(clippedOmissions), /^>[^\n]* \(\d+(?:\/\d+)?\)$/m);
  assert.doesNotMatch(traversal(clippedOmissions), /No path found/);
  assert.equal(clippedOmissions.truncated, true);
  valid(clippedOmissions, omittedSources);
  for (const budget of [400, 1600, 16000])
    valid(buildGraphSearchContext(withheld, budget), withheld.sources);
});

test('exception notices retain classifications of targets excluded from retrieval', async () => {
  const data = {
    version: 1,
    scope: 'excluded-targets',
    revision: 'review',
    coverage: { keywords: true, templates: true },
    nodes: [
      node('Alpha'),
      {
        ...node('Beta'),
        kind: 'paragraph',
        typeLabel: 'Paragraph',
        noteTitle: 'Origin Note',
      },
      node('Gamma'),
    ],
    edges: [],
    sources: [],
  };
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta Gamma', {
    maxNodes: 1,
  });
  assert.ok(!found.nodes.some(({ node }) => node.id === 'Beta'));
  assert.equal(found.plan.targetTypes.Beta, 'Paragraph');
  assert.deepEqual(found.plan.targetNotes.Beta, ['Origin Note']);
  assert.match(
    found.context.text,
    /> Path search was not completed[^\n]*\n\n[\s\S]*Beta.*\(Paragraph\[Origin Note\]\)/
  );
  assert.doesNotMatch(found.context.text, /Query item connections|Unclassified/);
  const missing = found.context.text.split('> Path search was not completed')[1].split('\n## ')[0];
  assert.match(found.context.text, /^## Traversal paths \(0\/3\)$/m);
  assert.doesNotMatch(missing, /^\\\. \(\d/);
  assert.equal((missing.match(/^- /gm) || []).length, 2, 'missing pairs share their start');
  assert.equal((missing.match(/^  - /gm) || []).length, 3);
  assert.match(missing, /- .*Alpha.*\(Keyword\)\n(?:  - [^\n]*\n){2}/);
  assert.match(missing, /^  - .*Beta.*\(Paragraph\[Origin Note\]\)$/m);
  assert.match(missing, /^  - .*Gamma.*\(Keyword\)$/m);
  valid(found.context, []);
});

test('unavailable evidence is not described as a context size omission', () => {
  const sources = [
    {
      id: 's',
      title: 'Note',
      text: 'Alpha uses Beta under Linked Policy.',
      references: [
        {
          href: '?title=Missing',
          name: 'Linked Policy',
          start: 22,
          end: 35,
          internal: true,
          unresolved: true,
          targets: [],
        },
      ],
    },
  ];
  const found = result([node('Alpha'), node('Beta')], [edge('ab', 'Alpha', 'Beta')], sources, [
    { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
  ]);
  const context = buildGraphSearchContext(found, 16000);
  assert.ok(!context.entries.some((entry) => entry.kind === 'path'));
  assert.doesNotMatch(context.text, /Path omitted due to context size|No path found/);
  valid(context, sources);
});

test('omission state uses the union of selected source ranges and ignores only separator whitespace', () => {
  const text = 'Alpha uses Beta.\n\nAlpha no longer uses Beta.';
  const blocks = graphTextBlocks(text);
  const source = { id: 's', title: 'Note', text, blocks, scopes: blocks };
  const found = result([node('Alpha'), node('Beta')], [edge('ab', 'Alpha', 'Beta')], [source]);
  const context = buildGraphSearchContext(found, 256000);
  assert.equal(context.citations.length, 2);
  assert.equal(context.truncated, false);
  assert.match(context.text, /Content omissions: None/);
  valid(context, [source]);
  const partial = {
    ...found,
    sources: [
      { ...source, text: text + '\n\nUnquoted content.', blocks: undefined, scopes: undefined },
    ],
  };
  const bounded = buildGraphSearchContext(partial, context.text.length + 16);
  assert.equal(bounded.truncated, true);
  valid(bounded, partial.sources);
});

test('linked conditions in another section remain mandatory without testing their vocabulary', async () => {
  for (const heading of ['Conditions', '승인 규칙', '承認条件', 'Freigabe']) {
    const condition = 'Owner approval is required: ' + heading;
    const claim = 'Alpha uses Beta under Linked Policy.';
    const data = await observedSnapshot(
      '<h2>' +
        heading +
        '</h2><p>' +
        condition +
        '</p><h2>Geometry</h2>' +
        '<p>Alpha uses Beta under <a href="?title=Note&amp;paragraph=' +
        encodeURIComponent(heading) +
        '">Linked Policy</a>.</p>',
      claim
    );
    const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
    assert.ok(quotes(found.context, 'ab').some((citation) => citation.text.includes(condition)));
    assert.ok(found.context.text.includes('Reference: [Linked Policy]('));
    assert.equal(found.context.truncated, false);
    valid(found.context, data.sources);
  }
});

test('explicit anchors and relative note links resolve transitive conditions and terminate cycles', async () => {
  const claim = 'Alpha uses Beta under Linked Policy.';
  const data = await observedSnapshot(
    '<p>Alpha uses Beta under <a href="./Policy.md#approval-key">Linked Policy</a>.</p>',
    claim,
    {
      extraNotes: [
        {
          title: 'Policy',
          description:
            '<h2 id="approval-key">Decision</h2><p>Approval required. <a href="./Limits.md">Limits</a></p>',
        },
        {
          title: 'Limits',
          description:
            '<p>Geometry is suspended during maintenance. <a href="./Policy.md#approval-key">Policy</a></p>',
        },
      ],
    }
  );
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
  const quoted = quotes(found.context, 'ab');
  assert.ok(
    quoted.some(
      (citation) => citation.title === 'Policy' && citation.text.includes('Approval required')
    )
  );
  assert.ok(
    quoted.some(
      (citation) => citation.title === 'Limits' && citation.text.includes('Geometry is suspended')
    )
  );
  assert.equal(
    new Set(found.context.citations.map((citation) => citation.id)).size,
    found.context.citations.length
  );
  assert.equal(found.context.truncated, false);
  valid(found.context, data.sources);
});

test('a relationship cannot fit by dropping a linked condition, and unavailable internal sources report omission', async () => {
  for (const extraNotes of [
    [],
    [{ title: 'Policy', description: '<p>Approval is required. ' + 'q'.repeat(20000) + '</p>' }],
  ]) {
    const data = await observedSnapshot(
      '<p>Alpha uses Beta under <a href="?title=Policy">Linked Policy</a>.</p>',
      'Alpha uses Beta under Linked Policy.',
      { extraNotes }
    );
    const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
    const small = buildGraphSearchContext(found, 16000);
    assert.ok(small.entries.every((entry) => entry.kind !== 'edge' && entry.kind !== 'path'));
    assert.equal(small.truncated, true);
    if (extraNotes.length) {
      const large = buildGraphSearchContext(found, 64000);
      assert.ok(quotes(large, 'ab').some((citation) => citation.title === 'Policy'));
      valid(large, data.sources);
    }
    valid(small, data.sources);
  }
});

test('external reference URLs remain explicit without fetching or inventing their contents', async () => {
  const data = await observedSnapshot(
    '<p>Alpha uses Beta under <a href="https://example.com/policy?version=3&amp;scope=all">Linked Policy</a>.</p>',
    'Alpha uses Beta under Linked Policy.'
  );
  const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
  assert.ok(quotes(found.context, 'ab').length);
  assert.ok(
    found.context.text.includes(
      '[Linked Policy](https://example.com/policy?version=3&amp;scope=all)'
    )
  );
  valid(found.context, data.sources);
});

test('JSON scalar types and literal string blocks remain distinguishable without value-specific rules', () => {
  const properties = {
    StringFlag: 'false',
    BooleanFlag: false,
    StringNumber: '3',
    NumberValue: 3,
    StringNull: 'null',
    NullValue: null,
    Empty: '',
    Multiline: '  first\n\tsecond',
    Nested: { value: 'false', number: 3 },
  };
  const found = result([{ ...node('Values'), body: JSON.stringify(properties) }], [], []);
  found.plan.intent = 'related';
  found.plan.terms = [];
  const context = buildGraphSearchContext(found, 16000);
  for (const [key, value] of Object.entries(properties).filter(
    ([key]) => !['Multiline', 'Nested'].includes(key)
  ))
    assert.ok(context.text.includes(key + ': ' + JSON.stringify(value)));
  const fences = editor.toToken(context.text).filter((token) => token.type === 'fence');
  assert.ok(
    fences.some((token) => token.info === 'string' && token.content === properties.Multiline + '\n')
  );
  assert.ok(
    fences.some(
      (token) =>
        token.info === 'json' &&
        JSON.stringify(JSON.parse(token.content)) === JSON.stringify(properties.Nested)
    )
  );
  assert.equal(context.truncated, false);
  valid(context, []);
});

test('a large early explanation cannot block a cheaper route, and increasing budgets retain admitted cores', () => {
  const sources = [
    { id: 'long', title: 'Long', text: 'Alpha uses Beta. ' + 'x'.repeat(50000) },
    { id: 'short', title: 'Short', text: 'Gamma uses Delta.' },
  ];
  const found = result(
    ['Alpha', 'Beta', 'Gamma', 'Delta'].map((id) => node(id)),
    [edge('ab', 'Alpha', 'Beta', ['long']), edge('gd', 'Gamma', 'Delta', ['short'])],
    sources,
    [
      { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
      { nodes: ['Gamma', 'Delta'], edges: ['gd'] },
    ]
  );
  found.edges[0].score = 100;
  let previous = new Set();
  for (const budget of [1024, 16000, 32000, 48000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    const current = new Set(
      context.entries
        .filter((entry) => entry.kind !== 'node')
        .map((entry) => JSON.stringify([entry.kind, entry.id ?? entry.index]))
    );
    assert.ok(context.entries.some((entry) => entry.kind === 'path' && entry.index === 1));
    for (const key of previous) assert.ok(current.has(key), 'a larger budget lost ' + key);
    if (budget >= 64000)
      assert.ok(context.entries.some((entry) => entry.kind === 'path' && entry.index === 0));
    previous = current;
    valid(context, sources);
  }
});

test('section-qualified references retain ancestor identities and exact fragments win over folded aliases', async () => {
  for (const [href, description, expected, excluded] of [
    [
      '?title=Policy&paragraph=Decision&section=ProductA',
      '<h1>ProductA</h1><h2>Shared</h2><h3>Decision</h3><p>Approval A is required.</p>' +
        '<h1>ProductB</h1><h2>Shared</h2><h3>Decision</h3><p>Approval B is required.</p>',
      'Approval A',
      'Approval B',
    ],
    [
      './Policy.md#Policy',
      '<h2 id="Policy">Active</h2><p>Approval A is required.</p>' +
        '<h2 id="policy">Archived</h2><p>Approval B is required.</p>',
      'Approval A',
      'Approval B',
    ],
  ]) {
    const data = await observedSnapshot(
      '<p>Alpha uses Beta under <a href="' +
        href.replace(/&/g, '&amp;') +
        '">Linked Policy</a>.</p>',
      'Alpha uses Beta under Linked Policy.',
      { extraNotes: [{ title: 'Policy', description }] }
    );
    const found = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha Beta');
    const cited = quotes(found.context, 'ab')
      .map((citation) => citation.text)
      .join('\n');
    assert.ok(cited.includes(expected));
    assert.equal(cited.includes(excluded), false);
    valid(found.context, data.sources);
  }
});

test('source changes invalidate the admission trace and cold and repacked selection preserve the same core coverage', () => {
  const found = result(
    ['Alpha', 'Beta', 'Gamma', 'Delta'].map((id) => node(id)),
    [edge('ab', 'Alpha', 'Beta', ['s1']), edge('gd', 'Gamma', 'Delta', ['s2'])],
    [
      { id: 's1', title: 'Long', text: 'Alpha uses Beta. ' + 'x'.repeat(20000) },
      { id: 's2', title: 'Short', text: 'Gamma uses Delta.' },
    ],
    [
      { nodes: ['Alpha', 'Beta'], edges: ['ab'] },
      { nodes: ['Gamma', 'Delta'], edges: ['gd'] },
    ]
  );
  const cores = (context) =>
    context.entries
      .filter((entry) => entry.kind !== 'node')
      .map((entry) => JSON.stringify([entry.kind, entry.id ?? entry.index]))
      .sort();
  for (const size of [16000, 32000, 16000, 64000, 1024, 256000]) {
    const warm = buildGraphSearchContext(found, size);
    const cold = buildGraphSearchContext(JSON.parse(JSON.stringify(found)), size);
    assert.deepEqual(cores(warm), cores(cold));
    valid(warm, found.sources);
  }
  found.sources[0].text = 'Alpha uses Beta. ' + 'q'.repeat(300);
  const updated = buildGraphSearchContext(found, 16000);
  assert.ok(quotes(updated, 'ab').some((citation) => citation.text.includes('q'.repeat(300))));
  assert.equal(
    updated.citations.some((citation) => citation.text.includes('x'.repeat(100))),
    false
  );
  valid(updated, found.sources);
});
