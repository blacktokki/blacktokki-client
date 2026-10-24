const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const { buildGraphSearchContext } = load('search/context.ts');
const { createGraphSearchIndex, searchKnowledgeGraph } = load('search/engine.ts', {
  './snapshot': { yieldGraphSearch: async () => {} },
  '../keyword/keywordUtils': {
    ...require('../../__tests__/loadTs.cjs')('keyword/keywordUtils.ts'),
    checkRelationCancelled: () => {},
  },
});
const node = (id, sourceIds = ['s']) => ({
  id,
  name: id,
  kind: 'note',
  typeLabel: 'Note',
  noteTitle: 'Note',
  body: '',
  sourceIds,
});
const edge = (id, source, target, sourceIds = ['s']) => ({
  id,
  source,
  target,
  type: 'REFERENCES',
  label: id,
  directed: true,
  sourceIds,
});
const snapshot = (nodes, edges, sources) => ({
  version: 1,
  scope: 'evidence-review',
  revision: 'evidence-review',
  coverage: { keywords: true, templates: true },
  nodes,
  edges,
  sources,
});
const result = (nodes, edges, sources, paths = []) => ({
  ...snapshot(nodes, edges, sources),
  nodes: nodes.map((node) => ({ node, score: 50 })),
  edges: edges.map((edge) => ({ edge, score: 40 })),
  paths,
  query: 'Topic',
  plan: { terms: [], intent: 'connection', maxHops: 2 },
  limited: false,
});
const citedBy = (context, id) => {
  const entry = context.entries.find((entry) => entry.kind === 'edge' && entry.id === id);
  assert.ok(entry);
  return entry.citationIds.map((id) => context.citations.find((citation) => citation.id === id));
};
const validRanges = (context, sources) => {
  assert.ok(context.text.length <= context.usage.limit);
  assert.equal(context.usage.characters, context.text.length);
  for (const citation of context.citations) {
    const original = sources.find((source) => source.id === citation.sourceId).text;
    assert.equal(citation.text, original.slice(citation.start, citation.end));
    assert.ok(citation.text.length <= context.usage.limit);
  }
};

test('shared evidence scopes preserve traversal order through cyclic and multi-block references', () => {
  const { createEvidenceContext } = load('search/evidence.ts');
  const sources = ['s', 't'].map((id) => {
    let text = '';
    const blocks = Array.from({ length: 4 }, (_, index) => {
      const start = text.length;
      text += id + ' block ' + index + '\n';
      return { start, end: text.length };
    });
    return { id, title: id, text, blocks, scopes: [{ start: 0, end: text.length }] };
  });
  sources[0].references = [
    {
      ...sources[0].blocks[1],
      href: 'target',
      name: 'target',
      internal: true,
      targets: [{ sourceId: 't', ...sources[1].blocks[1] }],
    },
  ];
  sources[1].references = [
    {
      ...sources[1].blocks[0],
      href: 'return',
      name: 'return',
      internal: true,
      targets: [{ sourceId: 's', start: 0, end: sources[0].blocks[2].end }],
    },
  ];
  const resolve = createEvidenceContext(new Map(sources.map((source) => [source.id, source])));
  for (const source of sources) {
    for (const block of source.blocks) {
      const id = source.id + '@' + block.start + ':' + block.end;
      const primary = {
        ...source,
        ...block,
        sourceId: source.id,
        id,
        text: source.text.slice(block.start, block.end),
      };
      const found = resolve(primary);
      const expected = [
        ...source.blocks
          .filter((range) => range.start !== block.start)
          .map((range) => source.id + '@' + range.start + ':' + range.end),
        ...(source.id === 's'
          ? ['t@10:20', 't@0:10', 't@20:30', 't@30:40']
          : ['s@0:30', 's@30:40']),
      ];
      assert.deepEqual(
        found.context.map((citation) => citation.id),
        expected
      );
      assert.equal(found.unresolved, false);
      for (const citation of found.context) {
        const original = sources.find((item) => item.id === citation.sourceId);
        assert.equal(citation.text, original.text.slice(citation.start, citation.end));
      }
    }
  }
});

test('a query hit in the third source is quoted before irrelevant earlier sources at every context size', async () => {
  const sources = [
    { id: 's1', title: 'Earlier note', text: 'Ordinary background.' },
    { id: 's2', title: 'Another note', text: 'Other background.' },
    { id: 's3', title: 'Approval', text: 'AcknowledgementKey: geometry is approved by Alice.' },
  ];
  const item = {
    ...node(
      'Geometry',
      sources.map((source) => source.id)
    ),
    kind: 'keyword',
  };
  const found = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot([item], [], sources)),
    'AcknowledgementKey'
  );
  assert.equal(found.nodes.length, 1);
  for (const size of [800, 16000, 32000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(found, size);
    assert.equal(context.citations[0].sourceId, 's3');
    assert.ok(context.citations[0].text.includes('AcknowledgementKey'));
    validRanges(context, sources);
  }
});

test('relationship support outranks query-only text and a bare list of endpoint names', () => {
  const sources = [
    { id: 'query', title: 'Query', text: 'Geometry background.' },
    { id: 'names', title: 'Names', text: 'Alpha Beta are listed as examples.' },
    { id: 'proof', title: 'Proof', text: 'Alpha uses Beta for geometry.' },
  ];
  const relationship = edge(
    'uses',
    'Alpha',
    'Beta',
    sources.map((source) => source.id)
  );
  const found = result(
    [node('Alpha', ['query']), node('Beta', ['query'])],
    [relationship],
    sources,
    [{ nodes: ['Alpha', 'Beta'], edges: ['uses'] }]
  );
  found.plan.terms = ['geometry'];
  const context = buildGraphSearchContext(found);
  const entry = context.entries.find((entry) => entry.kind === 'edge');
  assert.equal(
    context.citations.find((citation) => citation.id === entry.citationIds[0]).sourceId,
    'proof'
  );
  validRanges(context, sources);
});

test('different predicates between the same endpoints quote their own late claims instead of an early name list', () => {
  const reference = 'Alpha references the geometry configuration maintained by Beta.';
  const support = 'Alpha supports the reporting service maintained by Beta.';
  const text =
    'Alpha Beta are listed as examples. ' +
    'Unrelated background. '.repeat(80) +
    '\n\n' +
    reference +
    '\n\n' +
    ' Other background. '.repeat(80) +
    '\n\n' +
    support;
  const sources = [{ id: 's', title: 'Long note', text }];
  const found = result(
    [node('Alpha'), node('Beta')],
    [edge('references', 'Alpha', 'Beta'), edge('supports', 'Alpha', 'Beta')],
    sources
  );
  found.plan.terms = ['alpha', 'beta'];
  for (const budget of [1800, 4000, 16000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    for (const [id, claim] of [
      ['references', reference],
      ['supports', support],
    ]) {
      const included = context.entries.some((entry) => entry.kind === 'edge' && entry.id === id);
      if (budget >= 16000) assert.ok(included);
      if (included)
        assert.ok(citedBy(context, id).some((citation) => citation.text.includes(claim)));
    }
    if (budget >= 16000)
      assert.notEqual(citedBy(context, 'references')[0].id, citedBy(context, 'supports')[0].id);
    validRanges(context, sources);
  }
});

test('related item counts describe visible items and standalone relationships after path deduplication', () => {
  const sources = [{ id: 's', title: 'Note', text: 'Shared record.' }];
  const items = ['Alpha', 'Beta', 'Gamma'].map((id) => node(id));
  const found = result(
    items,
    [
      edge('uses', 'Alpha', 'Beta'),
      edge('supports', 'Beta', 'Gamma'),
      edge('reviews', 'Alpha', 'Gamma'),
    ],
    sources,
    [{ nodes: ['Alpha', 'Beta', 'Gamma'], edges: ['uses', 'supports'] }]
  );
  const context = buildGraphSearchContext(found);
  assert.match(context.text, /^## Related items \(4\)$/m);
  assert.match(context.text, /^## Traversal paths \(1\)$/m);
  const itemOnly = buildGraphSearchContext(result([items[0]], [], sources));
  assert.match(itemOnly.text, /^## Related items \(1\)$/m);
});

test('fully retrieved matches do not report a seed limit when matching node and relationship rows overlap', async () => {
  const items = Array.from({ length: 9 }, (_, index) => node('Item' + index));
  const relations = items.slice(1).map((item, index) => edge('e' + index, items[0].id, item.id));
  const sources = [{ id: 's', title: 'Note', text: 'UniqueNeedle appears here.' }];
  const index = await createGraphSearchIndex(snapshot(items, relations, sources));
  for (const maxSeeds of [1, 12]) {
    const found = await searchKnowledgeGraph(index, 'UniqueNeedle', { maxHops: 1, maxSeeds });
    assert.equal(found.nodes.length, 9);
    assert.equal(found.edges.length, 8);
    assert.equal(found.limited, false);
    assert.match(found.context.text, /Search limits reached: None/);
  }
});

test('reaching an exact node or relationship capacity is not a limit unless something is excluded', async () => {
  const sources = [{ id: 's', title: 'Note', text: 'Record.' }];
  const index = await createGraphSearchIndex(
    snapshot([node('Alpha'), node('Beta')], [edge('uses', 'Alpha', 'Beta')], sources)
  );
  const found = await searchKnowledgeGraph(index, 'Alpha', {
    maxNodes: 2,
    maxEdges: 1,
    maxHops: 1,
  });
  assert.equal(found.nodes.length, 2);
  assert.equal(found.edges.length, 1);
  assert.equal(found.limited, false);
});

test('actual seed, item and relationship exclusions still report their retrieval limits', async () => {
  const sources = [{ id: 's', title: 'Note', text: 'UniqueNeedle appears here.' }];
  const items = Array.from({ length: 13 }, (_, index) => node('Item' + index));
  const disconnected = await createGraphSearchIndex(snapshot(items, [], sources));
  const seeded = await searchKnowledgeGraph(disconnected, 'UniqueNeedle');
  assert.equal(seeded.nodes.length, 12);
  assert.equal(seeded.limited, true);
  const connected = await createGraphSearchIndex(
    snapshot(
      items,
      items.slice(1).map((item, index) => edge('e' + index, items[0].id, item.id)),
      sources
    )
  );
  for (const options of [{ maxNodes: 2 }, { maxEdges: 1 }]) {
    const found = await searchKnowledgeGraph(connected, 'UniqueNeedle', options);
    assert.equal(found.limited, true);
    assert.match(found.context.text, /Search limits reached: Present/);
  }
});

const { createEvidenceText, graphEvidenceExcerpt } = load('search/evidence.ts');

test('a joint endpoint statement is retained even when centering on either name would lose the other', () => {
  const claim = 'Alpha references ' + 'configuration '.repeat(32) + 'Beta.';
  const text = 'Background. '.repeat(80) + '\n\n' + claim + '\n\n' + ' Background. '.repeat(80);
  const range = graphEvidenceExcerpt(text, createEvidenceText(text), 600, {
    terms: ['alpha', 'beta'],
    pair: ['alpha', 'beta'],
    relation: 'references',
  });
  assert.equal(text.slice(range.start, range.end), claim);
  const sources = [{ id: 's', title: 'Long relation', text }];
  const found = result(
    [node('Alpha'), node('Beta')],
    [edge('references', 'Alpha', 'Beta')],
    sources
  );
  found.query = 'Alpha Beta';
  found.plan.terms = ['alpha', 'beta'];
  for (const budget of [4000, 16000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    assert.ok(citedBy(context, 'references').some((citation) => citation.text === claim));
    validRanges(context, sources);
  }
});

test('recorded evidence preserves a late rejection and conditions as a whole or omits the relationship', () => {
  const text =
    'Alpha uses Beta for ' +
    'automatic configuration reconciliation and geometry validation, '.repeat(20) +
    'This entire statement is a rejected proposal and is not approved unless Alice signs.';
  const sources = [{ id: 's', title: 'Proposal', text }];
  const relation = {
    ...edge('uses', 'Alpha', 'Beta'),
    type: 'KEYWORD_RELATION',
    evidence: [{ sourceId: 's', start: 0, end: text.length }],
  };
  const found = result([node('Alpha'), node('Beta')], [relation], sources, [
    { nodes: ['Alpha', 'Beta'], edges: ['uses'] },
  ]);
  for (const budget of [800, 1800, 4000, 16000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    const included = context.entries.some((entry) => entry.kind === 'edge');
    if (budget >= 4000) assert.ok(included);
    if (included) assert.equal(citedBy(context, 'uses')[0].text, text);
    else {
      assert.ok(context.entries.every((entry) => entry.kind !== 'path'));
      assert.doesNotMatch(context.text, /— uses/);
      assert.equal(context.truncated, true);
    }
    validRanges(context, sources);
  }
});

test('unrecorded relationship quotations retain the paragraph and adjacent qualifications without word rules', () => {
  const claim =
    'Only if Alice approves, Alpha uses ' +
    'validated configuration, '.repeat(40) +
    'Beta, unless the geometry is cancelled. This proposal is not approved.';
  const text = 'Background. '.repeat(80) + claim + ' Other background.';
  const sources = [{ id: 's', title: 'Conditional proposal', text }];
  const found = result([node('Alpha'), node('Beta')], [edge('uses', 'Alpha', 'Beta')], sources);
  const context = buildGraphSearchContext(found, 16000);
  assert.ok(citedBy(context, 'uses').some((citation) => citation.text.includes(claim)));
  validRanges(context, sources);
});

test('connection questions separate surrounding routes and state when no target-to-target path was found in range', async () => {
  const sources = [
    { id: 's', title: 'Note', text: 'Alpha and Gamma are listed here. Alpha references Helper.' },
  ];
  const data = snapshot(
    ['Alpha', 'Gamma', 'Helper'].map((id) => node(id)),
    [edge('references', 'Alpha', 'Helper')],
    sources
  );
  const found = await searchKnowledgeGraph(
    await createGraphSearchIndex(data),
    'Alpha Gamma connection'
  );
  assert.equal(found.plan.intent, 'connection');
  assert.deepEqual(new Set(found.plan.targetIds), new Set(['Alpha', 'Gamma']));
  assert.ok(found.paths.length);
  assert.ok(found.paths.every((path) => path.kind === 'surrounding'));
  assert.match(found.context.text, /^## Traversal paths \(0\/1\)$/m);
  assert.doesNotMatch(found.context.text, /^> No path found[^\n]* \(\d/m);
  assert.match(
    found.context.text,
    /> No path found within the selected search range[^\n]*\n\n- .*Alpha.*\(Note\)\n  - .*Gamma.*\(Note\)/
  );
  assert.match(found.context.text, /^## Nearby paths \(1\)$/m);
  assert.equal(found.limited, false);
  validRanges(found.context, sources);
});

test('target-to-target paths retain their direction and citations while surrounding paths have a separate heading', async () => {
  const sources = [
    {
      id: 's',
      title: 'Note',
      text: 'Alpha references Helper. Gamma supports Helper. Helper uses Detail.',
    },
  ];
  const data = snapshot(
    ['Alpha', 'Gamma', 'Helper', 'Detail'].map((id) => node(id)),
    [
      edge('references', 'Alpha', 'Helper'),
      edge('supports', 'Gamma', 'Helper'),
      edge('uses', 'Helper', 'Detail'),
    ],
    sources
  );
  const found = await searchKnowledgeGraph(
    await createGraphSearchIndex(data),
    'Alpha Gamma connection'
  );
  assert.ok(found.paths.some((path) => path.kind === 'connection'));
  const section = (heading) =>
    found.context.text.split('## ' + heading)[1]?.split('\n## ')[0] || '';
  const main = section('Traversal paths');
  assert.match(main, /references \[\d+\]\([^)]*\)[^\n]*\n    - ← supports \[\d+\]\([^)]*\)/);
  assert.doesNotMatch(main, /Detail/);
  assert.match(section('Nearby paths'), /Detail/);
  assert.doesNotMatch(
    found.context.text,
    /No path found|Path omitted due to context size|Query item connections/
  );
  const { toToken } = load(
    require
      .resolve('@blacktokki/editor/package.json')
      .replace(/package\.json$/, 'src/lib/markdown.ts')
  );
  const ko = require('../../../../../lang/ko.json');
  for (const translate of [(value) => value, (value) => ko[value] || value]) {
    const context = buildGraphSearchContext(found, 16000, translate);
    const tokens = toToken(context.text);
    for (const heading of ['Traversal paths', 'Related items', 'Nearby paths']) {
      const index = tokens.findIndex(
        (token, index) =>
          token.type === 'heading_open' &&
          token.tag === 'h2' &&
          tokens[index + 1].content.replace(/ \(\d+\)$/, '') === translate(heading)
      );
      assert.ok(index >= 0, heading);
      assert.equal(tokens[index + 3].type, 'blockquote_open', heading);
      const description = tokens[index + 5].content;
      assert.ok(description.trim());
      if (translate(heading) !== heading) assert.match(description, /[가-힣]/u);
    }
    for (const budget of [400, 1600, 16000])
      validRanges(buildGraphSearchContext(found, budget, translate), sources);
  }
  for (const entry of found.context.entries.filter((entry) => entry.kind === 'path')) {
    for (const id of found.paths[entry.index].edges) {
      assert.ok(
        citedBy(found.context, id).every((citation) => entry.citationIds.includes(citation.id))
      );
    }
  }
  validRanges(found.context, sources);
});

test('traversal and nearby paths distinguish identical names by type, retaining both routes and link destinations', () => {
  const items = [
    { ...node('root'), name: 'Start', typeLabel: '노트' },
    { ...node('note'), name: 'Same', typeLabel: '노트' },
    { ...node('keyword'), name: 'Same', kind: 'keyword', typeLabel: '키워드 [분류]' },
    {
      ...node('docs'),
      name: 'Docs',
      kind: 'externalLink',
      typeLabel: '외부 링크',
      url: 'https://example.com/docs',
    },
  ];
  const relations = [
    { ...edge('to-note', 'root', 'note'), label: 'uses' },
    { ...edge('to-keyword', 'root', 'keyword'), label: 'uses' },
    { ...edge('note-docs', 'note', 'docs'), label: 'opens' },
    { ...edge('keyword-docs', 'keyword', 'docs'), label: 'opens' },
  ];
  const sources = [{ id: 's', title: 'Note', text: 'Start uses Same. Same opens Docs.' }];
  const found = result(items, relations, sources, [
    { nodes: ['root', 'note'], edges: ['to-note'], kind: 'connection' },
    { nodes: ['root', 'keyword'], edges: ['to-keyword'], kind: 'connection' },
    { nodes: ['root', 'note', 'docs'], edges: ['to-note', 'note-docs'], kind: 'surrounding' },
    {
      nodes: ['root', 'keyword', 'docs'],
      edges: ['to-keyword', 'keyword-docs'],
      kind: 'surrounding',
    },
  ]);
  const context = buildGraphSearchContext(found);
  for (const heading of ['Traversal paths', 'Nearby paths']) {
    const section = context.text.split(`## ${heading} (2)`)[1]?.split('\n## ')[0];
    assert.ok(section, heading);
    const lines = section.split('\n').filter((line) => line.startsWith('- '));
    assert.equal(lines.length, 1);
    assert.ok(lines.every((line) => line.startsWith('- **Start** (노트)')));
    assert.ok(section.includes('**Same** (노트)'));
    assert.ok(section.includes('**Same** (키워드 \\[분류\\])'));
    if (heading === 'Nearby paths') {
      const children = section.split('\n').filter((line) => line.startsWith('    - '));
      assert.equal(children.length, 2);
      assert.ok(
        children.every((line) => line.includes('[**Docs**](https://example.com/docs) (외부 링크)'))
      );
    }
  }
  assert.equal(context.truncated, false);
  validRanges(context, sources);
});

test('path trees merge common prefixes and parallel relations while preserving distinct routes and citations', () => {
  const items = ['A', 'B', 'C', 'D', 'X'].map((id) => node(id));
  const relations = [
    { ...edge('uses', 'A', 'B', ['uses']), associationScore: 0.75 },
    edge('owns', 'B', 'A', ['owns']),
    { ...edge('peer', 'A', 'B', ['peer']), directed: false },
    edge('includes', 'B', 'D', ['includes']),
    edge('opens', 'A', 'C', ['opens']),
    edge('links', 'C', 'D', ['links']),
    edge('connects', 'X', 'B', ['connects']),
  ];
  const sources = [
    { id: 's', title: 'Items', text: 'A, B, C, D and X.' },
    ...relations.map((edge) => ({
      id: edge.id,
      title: edge.id,
      text: `${edge.source} ${edge.label} ${edge.target}.`,
    })),
  ];
  const paths = [
    { nodes: ['A', 'B'], edges: ['uses'] },
    { nodes: ['A', 'B', 'D'], edges: ['uses', 'includes'] },
    { nodes: ['A', 'B', 'D'], edges: ['owns', 'includes'] },
    { nodes: ['A', 'B'], edges: ['peer'] },
    { nodes: ['A', 'C', 'D'], edges: ['opens', 'links'] },
    { nodes: ['X', 'B', 'D'], edges: ['connects', 'includes'] },
  ];
  const { toToken } = load(
    require
      .resolve('@blacktokki/editor/package.json')
      .replace(/package\.json$/, 'src/lib/markdown.ts')
  );
  for (const [kind, heading] of [
    ['connection', 'Traversal paths'],
    ['surrounding', 'Nearby paths'],
  ]) {
    const found = result(
      items,
      relations,
      sources,
      paths.map((path) => ({ ...path, kind }))
    );
    const context = buildGraphSearchContext(found);
    const section = context.text.split(`## ${heading} (6)`)[1]?.split('\n## ')[0];
    assert.ok(section, heading);
    assert.equal(context.entries.filter((entry) => entry.kind === 'path').length, 6);
    assert.equal((section.match(/^- /gm) || []).length, 2, 'one root per starting point');
    assert.equal((section.match(/^  - .*\*\*B\*\* \(Note\)$/gm) || []).length, 2);
    assert.equal((section.match(/^    - .*\*\*D\*\* \(Note\)$/gm) || []).length, 3);
    const parallel = section.split('\n').find((line) => line.includes('— uses'));
    assert.ok(parallel);
    assert.match(parallel, /— uses \[\d+\]\([^)]*\) → \(Association score: 0\.75\)/);
    assert.match(parallel, /← owns \[\d+\]\([^)]*\) —/);
    assert.match(parallel, /— peer \[\d+\]\([^)]*\) —/);
    assert.equal((parallel.match(/ · /g) || []).length, 2);
    assert.equal((parallel.match(/\*\*B\*\*/g) || []).length, 1);
    for (const id of ['uses', 'owns', 'peer']) {
      for (const citation of citedBy(context, id)) {
        const number = context.citations.indexOf(citation) + 1;
        assert.ok(parallel.includes(`${id} [${number}](?title=${id})`));
      }
    }
    assert.ok(
      toToken(section).some((token) => token.type === 'bullet_list_open' && token.level >= 4)
    );
    assert.equal(context.truncated, false);
    validRanges(context, sources);
    for (const budget of [800, 1800, 4000, 16000])
      validRanges(buildGraphSearchContext(found, budget), sources);
  }
});

test('every paragraph kind identifies its originating note in traversal and nearby paths', () => {
  const ko = require('../../../../../lang/ko.json');
  for (const kind of ['paragraph', 'connectedParagraph', 'boardParagraph', 'card']) {
    const sources = [
      { id: 'a', title: 'First Note', text: 'Start uses Details. Details connects Details.' },
      { id: 'b', title: 'Second Note', text: 'Start uses Details. Details connects Details.' },
    ];
    const items = [
      node('Start', ['a', 'b']),
      {
        ...node('p1', ['a']),
        name: 'Details',
        kind,
        typeLabel: 'Paragraph',
        noteTitle: 'First Note',
      },
      {
        ...node('p2', ['b']),
        name: 'Details',
        kind,
        typeLabel: 'Paragraph',
        noteTitle: 'Second Note',
      },
    ];
    const relations = [
      edge('uses', 'Start', 'p1', ['a']),
      edge('uses-again', 'Start', 'p2', ['b']),
      edge('connects', 'p1', 'p2', ['a', 'b']),
    ];
    const found = result(items, relations, sources, [
      { nodes: ['Start', 'p1'], edges: ['uses'], kind: 'connection' },
      { nodes: ['Start', 'p2'], edges: ['uses-again'], kind: 'connection' },
      { nodes: ['Start', 'p1', 'p2'], edges: ['uses', 'connects'], kind: 'surrounding' },
    ]);
    for (const translate of [(key) => key, (key) => ko[key] || key]) {
      const context = buildGraphSearchContext(found, 16000, translate);
      for (const heading of ['Traversal paths', 'Nearby paths', 'Related items']) {
        const section = context.text.split('## ' + translate(heading))[1]?.split('\n## ')[0];
        assert.ok(section, kind + ' / ' + heading);
        assert.ok(section.includes('(Paragraph[First Note])'));
        assert.ok(section.includes('(Paragraph[Second Note])'));
      }
      validRanges(context, sources);
    }
  }
});

test('remaining budget includes contradictory evidence from a third source and updates each path relationship reference', () => {
  const sources = [
    { id: 's1', title: 'Earlier', text: 'Alpha uses Beta for geometry.' },
    { id: 's2', title: 'Duplicate', text: 'Alpha uses Beta for geometry.' },
    { id: 's3', title: 'Update', text: 'Alpha no longer uses Beta for geometry.' },
    { id: 's4', title: 'Condition', text: 'Alpha uses Beta only if Alice approves.' },
  ];
  const relation = {
    ...edge(
      'uses',
      'Alpha',
      'Beta',
      sources.map((source) => source.id)
    ),
    evidence: sources.map((source) => ({ sourceId: source.id, start: 0, end: source.text.length })),
  };
  const found = result([node('Alpha', ['s1']), node('Beta', ['s1'])], [relation], sources, [
    { nodes: ['Alpha', 'Beta'], edges: ['uses'] },
  ]);
  const full = buildGraphSearchContext(found, 256000);
  assert.deepEqual(
    new Set(citedBy(full, 'uses').map((citation) => citation.sourceId)),
    new Set(sources.map((source) => source.id))
  );
  assert.equal(full.truncated, false);
  for (const budget of [800, 1000, 16000, 32000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(found, budget);
    const entry = context.entries.find((entry) => entry.kind === 'edge');
    if (!entry) continue;
    if (budget >= 16000)
      assert.ok(citedBy(context, 'uses').some((citation) => citation.sourceId === 's3'));
    const path = context.entries.find((entry) => entry.kind === 'path');
    if (path) {
      assert.deepEqual(path.citationIds, entry.citationIds);
      const line = context.text.split('\n').find((line) => line.includes('— uses'));
      for (const id of entry.citationIds) {
        const label = context.citations.findIndex((citation) => citation.id === id) + 1;
        assert.ok(line.includes('[' + label + ']('));
      }
    }
    validRanges(context, sources);
  }
  // A distinct update fits before the redundant copy when the budget cannot hold every note.
  let partial;
  for (let budget = 650; budget <= full.text.length; budget += 20) {
    const context = buildGraphSearchContext(found, budget);
    if (!context.entries.some((entry) => entry.kind === 'edge')) continue;
    const ids = citedBy(context, 'uses').map((citation) => citation.sourceId);
    if (ids.includes('s3') && !ids.includes('s2')) {
      partial = context;
      break;
    }
  }
  assert.ok(partial);
});

test('additional recorded ranges in one source retain opposite evidence instead of choosing only one range', () => {
  const yes = 'Alpha uses Beta.';
  const no = 'Alpha does not use Beta unless Alice approves.';
  const text = yes + '\n' + no;
  const sources = [{ id: 's', title: 'Versions', text }];
  const relation = {
    ...edge('uses', 'Alpha', 'Beta'),
    evidence: [
      { sourceId: 's', start: 0, end: yes.length },
      { sourceId: 's', start: yes.length + 1, end: text.length },
    ],
  };
  const context = buildGraphSearchContext(
    result([node('Alpha'), node('Beta')], [relation], sources)
  );
  assert.ok(citedBy(context, 'uses').some((citation) => citation.text.includes(yes)));
  assert.ok(citedBy(context, 'uses').some((citation) => citation.text.includes(no)));
  validRanges(context, sources);
});

test('unrecorded opposite statements in one note are both included when there is space', () => {
  const sources = [
    { id: 's', title: 'Versions', text: 'Alpha uses Beta.\nAlpha does not use Beta.' },
  ];
  const context = buildGraphSearchContext(
    result([node('Alpha'), node('Beta')], [edge('uses', 'Alpha', 'Beta')], sources)
  );
  assert.ok(
    citedBy(context, 'uses').some((citation) => citation.text.includes('Alpha uses Beta.'))
  );
  assert.ok(
    citedBy(context, 'uses').some((citation) => citation.text.includes('Alpha does not use Beta.'))
  );
  validRanges(context, sources);
});

test('fold expansion and canonical composition preserve raw quotation ranges and original spelling', () => {
  for (const [prefix, claim, pair] of [
    ['İ'.repeat(700), 'Alpha uses Beta.', ['Alpha', 'Beta']],
    ['İ. '.repeat(700), 'Alpha uses Beta.', ['Alpha', 'Beta']],
    ['İ 한글 e\u0301. '.repeat(100), '가 uses Cafe\u0301.', ['가', 'Café']],
    ['😀İ e\u0301. '.repeat(100), 'Alpha uses Beta.', ['Alpha', 'Beta']],
  ]) {
    const text = prefix + claim + ' tail'.repeat(400);
    const sources = [{ id: 's', title: 'Multilingual', text }];
    const found = result(
      pair.map((id) => node(id)),
      [edge('uses', ...pair)],
      sources
    );
    found.plan.terms = pair.map((value) => value.toLowerCase());
    const context = buildGraphSearchContext(found, 16000);
    assert.ok(citedBy(context, 'uses').some((citation) => citation.text.includes(claim)));
    validRanges(context, sources);
    const search = createEvidenceText(text);
    for (const term of pair) {
      const position = search.text.indexOf(term.normalize('NFC').toLowerCase());
      const range = search.range(position, position + term.normalize('NFC').toLowerCase().length);
      assert.equal(
        text.slice(range.start, range.end).normalize('NFC').toLowerCase(),
        term.normalize('NFC').toLowerCase()
      );
    }
  }
});

test('multilingual attribute excerpts and highlights use original coordinates after case expansion', () => {
  const value = 'İ'.repeat(700) + ' AcknowledgementKey 승인' + ' tail'.repeat(400);
  const item = { ...node('Item'), body: JSON.stringify({ Description: value }) };
  const sources = [{ id: 's', title: 'Note', text: value }];
  const found = result([item], [], sources);
  found.plan.terms = ['acknowledgementkey'];
  const context = buildGraphSearchContext(found);
  assert.match(context.text.split('## Source quotations')[0], /\*\*`AcknowledgementKey`\*\*/);
  assert.ok(context.citations.some((citation) => citation.text.includes('AcknowledgementKey')));
  validRanges(context, sources);
});

test('raw multilingual offsets remain valid in runtimes without Intl.Segmenter', () => {
  const segmenter = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    const text = 'İ'.repeat(700) + ' 가나 uses Cafe\u0301.';
    const search = createEvidenceText(text);
    for (const term of ['가', '나', 'Café']) {
      const normalized = term.normalize('NFC').toLowerCase();
      const position = search.text.indexOf(normalized);
      const range = search.range(position, position + normalized.length);
      assert.equal(text.slice(range.start, range.end).normalize('NFC').toLowerCase(), normalized);
    }
  } finally {
    Intl.Segmenter = segmenter;
  }
});
