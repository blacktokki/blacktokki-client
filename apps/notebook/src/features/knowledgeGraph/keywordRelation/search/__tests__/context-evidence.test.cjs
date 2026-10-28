const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const { buildGraphSearchContext } = load('search/context.ts');
const { createEvidenceText, graphEvidenceExcerpt } = load('search/evidence.ts');
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

test('representative subjects prefer intact body evidence over cheaper headings and navigation labels', () => {
  for (const [first, second, portal] of [
    ['Alpha', 'Beta', 'Portal'],
    ['甲', '乙', '入口'],
  ]) {
    const navigation = `${second}\n${portal}`;
    const body = `${second}\n${first} → ${second}: 12 / 24.`;
    const sources = [
      { id: 'first', title: first, text: `${first}: 12 / 24.` },
      {
        id: 'nav',
        title: second,
        text: navigation,
        anchors: [{ name: second, kind: 'heading', start: 0, end: navigation.length }],
        references: [
          {
            name: portal,
            start: second.length + 1,
            end: navigation.length,
            href: 'https://example.invalid/',
          },
        ],
      },
      {
        id: 'body',
        title: second,
        text: body,
        anchors: [{ name: second, kind: 'heading', start: 0, end: body.length }],
        blocks: [
          { start: 0, end: second.length },
          { start: second.length + 1, end: body.length },
        ],
        scopes: [{ start: 0, end: body.length }],
      },
    ];
    for (const shared of [false, true]) {
      const items = [
        { ...node('a', ['first']), name: first },
        { ...node('nav', shared ? ['nav', 'body'] : ['nav']), name: second },
        ...(shared ? [] : [{ ...node('body', ['body']), name: second }]),
        node('neighbor', ['first']),
      ];
      const found = result(items, [edge('near', 'a', 'neighbor', ['first'])], sources, [
        { nodes: ['a', 'neighbor'], edges: ['near'], kind: 'surrounding' },
      ]);
      found.query = `${first} ${second}`;
      found.plan = {
        terms: [first.toLowerCase(), second.toLowerCase()],
        intent: 'connection',
        maxHops: 2,
        targetGroups: [['a'], shared ? ['nav'] : ['nav', 'body']],
      };
      let previous;
      for (const budget of [16000, 32000, 64000]) {
        const context = buildGraphSearchContext(found, budget);
        const entry = context.entries.find(
          (entry) => entry.kind === 'node' && entry.id === (shared ? 'nav' : 'body')
        );
        assert.ok(
          entry?.citationIds.some(
            (id) => context.citations.find((c) => c.id === id).sourceId === 'body'
          )
        );
        assert.ok(context.citations.some((citation) => citation.text.includes('12 / 24')));
        assert.ok(context.entries.some((entry) => entry.kind === 'path'));
        if (previous)
          for (const entry of previous.entries.filter((entry) => entry.kind !== 'node'))
            assert.ok(
              context.entries.some(
                (next) =>
                  next.kind === entry.kind && next.id === entry.id && next.index === entry.index
              )
            );
        previous = context;
        validRanges(context, sources);
      }
    }
  }
});

test('each question subject receives an affordable intact source before peripheral paths, including linked conditions', () => {
  const a = 'Alpha has a separately recorded rule.';
  const rule = 'The original qualification must remain attached.';
  const b = 'Beta is available under the recorded condition.';
  const large = 'Alpha has a long qualification. ' + 'Unabridged context. '.repeat(1500);
  const sources = [
    {
      id: 'a-large',
      title: 'Large',
      text: large,
      blocks: [{ start: 0, end: large.length }],
      scopes: [{ start: 0, end: large.length }],
    },
    {
      id: 'a',
      title: 'First',
      text: a,
      blocks: [{ start: 0, end: a.length }],
      scopes: [{ start: 0, end: a.length }],
      references: [
        {
          start: a.indexOf('rule'),
          end: a.indexOf('rule') + 4,
          href: '?title=Rules',
          name: 'rule',
          internal: true,
          targets: [{ sourceId: 'rule', start: 0, end: rule.length }],
        },
      ],
    },
    { id: 'rule', title: 'Rules', text: rule },
    { id: 'b', title: 'Second', text: b },
    { id: 'side', title: 'Surrounding', text: 'Alpha references Neighbor.' },
  ];
  const items = [
    { ...node('expensive', ['a-large']), name: 'Alpha' },
    { ...node('affordable', ['a']), name: 'Alpha' },
    { ...node('b', ['b']), name: 'Beta' },
    node('Neighbor', []),
  ];
  const found = result(items, [edge('side', 'affordable', 'Neighbor', ['side'])], sources, [
    { nodes: ['affordable', 'Neighbor'], edges: ['side'], kind: 'surrounding' },
  ]);
  found.query = 'Alpha Beta';
  found.plan = {
    terms: ['alpha', 'beta'],
    intent: 'connection',
    maxHops: 2,
    targetIds: ['expensive', 'affordable', 'b'],
    targetGroups: [['expensive', 'affordable'], ['b']],
  };
  let previous = [];
  for (const size of [2000, 4000, 16000, 64000]) {
    const context = buildGraphSearchContext(found, size);
    for (const id of ['affordable', 'b']) {
      const entry = context.entries.find((e) => e.kind === 'node' && e.id === id);
      assert.ok(entry.citationIds.length, id);
    }
    assert.ok(context.citations.some((c) => c.sourceId === 'rule' && c.text === rule));
    const related = context.citations.findIndex((c) => c.sourceId === 'side');
    if (related >= 0) {
      assert.ok(context.citations.findIndex((c) => c.sourceId === 'a') < related);
      assert.ok(context.citations.findIndex((c) => c.sourceId === 'b') < related);
    }
    const keys = new Set(
      context.entries.filter((e) => e.kind !== 'node').map((e) => JSON.stringify(e))
    );
    for (const key of previous) assert.ok(keys.has(key));
    previous = [...keys];
    validRanges(context, sources);
  }
});

test('peripheral explanations wait when the subject evidence cannot fit, and growing budgets keep admitted paths', () => {
  const text =
    'Alpha has a complete qualification. ' +
    'A recorded qualification remains applicable. '.repeat(90);
  const sources = [
    {
      id: 'a',
      title: 'First',
      text,
      blocks: [{ start: 0, end: text.length }],
      scopes: [{ start: 0, end: text.length }],
    },
    { id: 'b', title: 'Second', text: 'Beta has a recorded condition.' },
    { id: 'side', title: 'Side', text: 'Alpha references Neighbor.' },
  ];
  const found = result(
    [node('Alpha', ['a']), node('Beta', ['b']), node('Neighbor', [])],
    [edge('side', 'Alpha', 'Neighbor', ['side'])],
    sources,
    [{ nodes: ['Alpha', 'Neighbor'], edges: ['side'], kind: 'surrounding' }]
  );
  found.query = 'Alpha Beta';
  found.plan = {
    terms: ['alpha', 'beta'],
    intent: 'connection',
    maxHops: 2,
    targetIds: ['Alpha', 'Beta'],
  };
  const small = buildGraphSearchContext(found, 1800);
  assert.equal(small.entries.filter((e) => e.kind === 'path' || e.kind === 'edge').length, 0);
  assert.equal(small.truncated, true);
  const large = buildGraphSearchContext(found, 8000);
  assert.ok(large.entries.some((e) => e.kind === 'path'));
  assert.ok(large.entries.find((e) => e.kind === 'node' && e.id === 'Alpha').citationIds.length);
  validRanges(small, sources);
  validRanges(large, sources);
});

test('normalization offsets retain long unchanged prefixes and suffixes around composed and reordered characters', () => {
  const prefix = 'Unchanged prefix. '.repeat(4000);
  const suffix = ' Unchanged suffix.'.repeat(4000);
  for (const fragment of [
    'e\u0301',
    'x\u0301\u0323',
    'a\u0323\u0301',
    '\u1100\u1161\u11a8',
    '\u0399\u0308\u0301',
    'İ',
  ]) {
    const original = prefix + fragment + suffix;
    const search = createEvidenceText(original);
    const needle = fragment.normalize('NFC').toLowerCase();
    const start = search.text.indexOf(needle, prefix.length);
    const range = search.range(start, start + needle.length);
    assert.equal(original.slice(range.start, range.end), fragment);
    assert.deepEqual(search.range(0, 10), { start: 0, end: 10 });
    const tail = search.range(search.text.length - 10, search.text.length);
    assert.equal(original.slice(tail.start, tail.end), suffix.slice(-10));
  }
});

test('source relationships quote their own occurrence and file hierarchy retains its available evidence', () => {
  const sources = [
    { id: 'one', title: 'First', text: 'Topic occurs in this first note.' },
    { id: 'two', title: 'Second', text: 'An independent occurrence in another note.' },
  ];
  const items = [node('Topic', ['one', 'two']), { ...node('First', ['one']), noteTitle: 'First' }];
  const relationship = {
    ...edge('source', 'Topic', 'First', ['one', 'two']),
    type: 'KEYWORD_SOURCE',
  };
  const context = buildGraphSearchContext(result(items, [relationship], sources), 16000);
  assert.deepEqual(
    new Set(citedBy(context, 'source').map((citation) => citation.sourceId)),
    new Set(['one'])
  );
  const hierarchy = { ...edge('parent', 'First', 'Folder', ['one']), type: 'PART_OF' };
  const parent = { ...node('Folder', []), noteTitle: 'Folder' };
  const nested = buildGraphSearchContext(result([items[1], parent], [hierarchy], sources), 16000);
  assert.deepEqual(
    new Set(citedBy(nested, 'parent').map((citation) => citation.sourceId)),
    new Set(['one'])
  );
  validRanges(context, sources);
  validRanges(nested, sources);
});

test('empty source bodies never create quotation numbers and canonical heading evidence remains usable', () => {
  const heading = 'Subject';
  const text = heading + '\nA nested condition is required.';
  const sources = [
    {
      id: 'empty',
      title: 'Source',
      text: '',
      origin: { sourceId: 'parent', ranges: [{ start: 0, end: heading.length }] },
    },
    {
      id: 'parent',
      title: 'Source',
      text,
      blocks: [
        { start: 0, end: heading.length },
        { start: heading.length + 1, end: text.length },
      ],
      scopes: [{ start: 0, end: text.length }],
    },
  ];
  const relationship = {
    ...edge('membership', 'Subject', 'Container', ['empty']),
    type: 'PART_OF',
  };
  const context = buildGraphSearchContext(
    result([node('Subject', ['empty']), node('Container', ['parent'])], [relationship], sources)
  );
  assert.ok(citedBy(context, 'membership').some((c) => c.text.includes(heading)));
  assert.ok(context.citations.every((c) => c.text.trim().length > 0));
  const empty = buildGraphSearchContext(
    result([node('Empty', ['empty'])], [], [{ id: 'empty', title: 'Source', text: '' }])
  );
  assert.equal(empty.citations.length, 0);
});

test('optional item provenance cannot bypass an oversized linked condition by quoting only its primary passage', () => {
  const text = 'Alpha is available under the linked requirement.';
  const condition = 'An independently linked requirement must remain intact. '.repeat(100);
  const sources = [
    {
      id: 'main',
      title: 'Main',
      text,
      blocks: [{ start: 0, end: text.length }],
      scopes: [{ start: 0, end: text.length }],
      references: [
        {
          start: 0,
          end: text.length,
          name: 'requirement',
          href: '?title=Requirements',
          internal: true,
          targets: [{ sourceId: 'condition', start: 0, end: condition.length }],
        },
      ],
    },
    { id: 'condition', title: 'Requirements', text: condition },
  ];
  const found = {
    ...result([node('Alpha', ['main'])], [], sources),
    query: 'Alpha',
    plan: { terms: ['alpha'], intent: 'related', maxHops: 2 },
  };
  const small = buildGraphSearchContext(found, 1600);
  assert.equal(small.citations.length, 0);
  assert.equal(small.truncated, true);
  const large = buildGraphSearchContext(found, 16000);
  assert.deepEqual(
    new Set(large.citations.map((citation) => citation.sourceId)),
    new Set(['main', 'condition'])
  );
  validRanges(large, sources);
});

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
          .filter((range) => range !== block)
          .map((range) => source.id + '@' + range.start + ':' + range.end),
        ...sources
          .find((other) => other !== source)
          .blocks.map(
            (range) => (source.id === 's' ? 't' : 's') + '@' + range.start + ':' + range.end
          ),
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

test('shared source partitions remove overlapping quotes while relationship claims and their path references stay distinct', () => {
  const first = 'Alpha requires Beta only after approval.';
  const second = 'Beta excludes Gamma under the recorded condition.';
  const text = 'Heading\n' + first + '\n\n' + second;
  const start = text.indexOf(first),
    next = text.indexOf(second);
  const source = {
    id: 's',
    title: 'Conditions',
    text,
    blocks: [
      { start: 0, end: 7 },
      { start, end: start + first.length },
      { start: next, end: text.length },
    ],
    scopes: [
      { start: 0, end: text.length },
      { start: 7, end: text.length },
    ],
  };
  const items = ['Alpha', 'Beta', 'Gamma'].map((id) => node(id));
  const relations = [
    {
      ...edge('requires', 'Alpha', 'Beta'),
      evidence: [{ sourceId: 's', start, end: start + first.length }],
    },
    {
      ...edge('excludes', 'Beta', 'Gamma'),
      evidence: [{ sourceId: 's', start: next, end: text.length }],
    },
  ];
  const found = result(
    items,
    relations,
    [source],
    [{ nodes: ['Alpha', 'Beta', 'Gamma'], edges: ['requires', 'excludes'] }]
  );
  found.plan.terms = ['alpha', 'gamma'];
  for (const budget of [16000, 32000, 64000]) {
    const context = buildGraphSearchContext(found, budget);
    const ordered = [...context.citations].sort((a, b) => a.start - b.start);
    for (let index = 1; index < ordered.length; index++)
      assert.ok(ordered[index - 1].end <= ordered[index].start);
    for (const [id, claim] of [
      ['requires', first],
      ['excludes', second],
    ])
      assert.ok(citedBy(context, id)[0].text.includes(claim));
    const path = context.entries.find((entry) => entry.kind === 'path');
    for (const id of relations.map((edge) => edge.id))
      for (const citation of citedBy(context, id))
        assert.ok(path.citationIds.includes(citation.id));
    assert.equal(
      (context.text.match(/^### \d+\. /gm) || []).length,
      1,
      'one source heading serves all numbered source parts'
    );
    validRanges(context, [source]);
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

test('default retrieval has no fixed seed cap and explicit caller limits still report exclusions', async () => {
  const sources = [{ id: 's', title: 'Note', text: 'UniqueNeedle appears here.' }];
  const items = Array.from({ length: 13 }, (_, index) => node('Item' + index));
  const disconnected = await createGraphSearchIndex(snapshot(items, [], sources));
  const seeded = await searchKnowledgeGraph(disconnected, 'UniqueNeedle');
  assert.equal(seeded.nodes.length, 13);
  assert.equal(seeded.limited, false);
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
