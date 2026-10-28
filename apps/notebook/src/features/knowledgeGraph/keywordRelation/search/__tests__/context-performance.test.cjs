const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const {
  buildGraphSearchContext,
  createContextLineMeasure,
  renderContextPaths,
  graphSourceMetadataIdentity,
} = load('search/context.ts', {}, [
  'createContextLineMeasure',
  'renderContextPaths',
  'graphSourceMetadataIdentity',
]);
const { createEvidenceText } = load('search/evidence.ts');

test('immutable prepared search records validate by identity while score changes still invalidate cached context', () => {
  let reads = 0;
  const sourceIds = ['s'];
  const item = {
    id: 'a',
    name: 'Alpha',
    kind: 'note',
    typeLabel: 'Note',
    body: '',
    get sourceIds() {
      reads++;
      return sourceIds;
    },
  };
  const source = { id: 's', title: 'Record', text: 'Alpha retains the original condition.' };
  graphSourceMetadataIdentity(item, true);
  graphSourceMetadataIdentity(source, true);
  const found = {
    scope: 'prepared-records',
    revision: 'same',
    query: 'Alpha',
    plan: { terms: ['alpha'], intent: 'related', maxHops: 1 },
    nodes: [{ node: item, score: 100 }],
    edges: [],
    paths: [],
    sources: [source],
    limited: false,
  };
  const first = buildGraphSearchContext(found, 16000);
  const initial = reads;
  assert.strictEqual(buildGraphSearchContext(found, 16000), first);
  assert.equal(reads, initial, 'cached validation does not traverse prepared provenance arrays');
  found.nodes[0].score = 80;
  assert.notStrictEqual(buildGraphSearchContext(found, 16000), first);
  assert.equal(Object.isFrozen(sourceIds), true);
});

test('prepared table coordinates are reused without walking cells on repeated context requests', () => {
  let reads = 0;
  const row = {
    cells: [
      { start: 0, end: 5, header: true },
      { start: 5, end: 9, header: true },
    ],
  };
  const rows = [row];
  const table = {
    start: 0,
    end: 9,
    get rows() {
      reads++;
      return rows;
    },
  };
  const source = {
    id: 'table',
    title: 'Table',
    text: 'AlphaBeta',
    blocks: [{ start: 0, end: 9 }],
    tables: [table],
  };
  const found = {
    scope: 'table-cache',
    revision: 'same',
    query: 'Alpha',
    plan: { terms: ['alpha'], intent: 'related', maxHops: 1 },
    nodes: [
      {
        node: {
          id: 'alpha',
          name: 'Alpha',
          kind: 'note',
          typeLabel: 'Note',
          body: '',
          noteTitle: 'Table',
          sourceIds: ['table'],
        },
        score: 100,
      },
    ],
    edges: [],
    paths: [],
    limited: false,
    sources: [source],
  };
  graphSourceMetadataIdentity(source.tables, true);
  const first = buildGraphSearchContext(found, 16000);
  assert.match(first.text, /\|.*Alpha.*\|.*Beta.*\|/);
  const initial = reads;
  assert.ok(initial > 0);
  assert.strictEqual(buildGraphSearchContext(found, 16000), first);
  assert.equal(reads, initial);
  assert.equal(Object.isFrozen(source.tables), true);
  assert.equal(Object.isFrozen(row.cells), true);
  source.tables = [{ start: 0, end: 9, rows: [{ cells: [{ start: 0, end: 9, header: true }] }] }];
  const changed = buildGraphSearchContext(found, 16000);
  assert.notStrictEqual(changed, first);
  assert.notEqual(changed.text, first.text);
});

test('context validation avoids copying unused metadata strings and still detects nested edits', () => {
  const marker = 'unused-source-reference-' + 'x'.repeat(100000);
  const found = {
    scope: 'metadata-cost',
    revision: 'same',
    query: 'Topic',
    plan: { terms: ['topic'], intent: 'related', maxHops: 1 },
    nodes: [
      {
        node: {
          id: 'topic',
          name: 'Topic',
          kind: 'note',
          typeLabel: 'Note',
          body: '',
          sourceIds: ['used'],
        },
        score: 100,
      },
    ],
    edges: [],
    paths: [],
    limited: false,
    sources: [
      { id: 'used', title: 'Used', text: 'Topic has a recorded source.' },
      {
        id: 'unused',
        title: 'Unused',
        text: '',
        references: [
          {
            start: 0,
            end: 0,
            href: marker,
            name: 'Other',
            targets: [{ sourceId: 'used', start: 0, end: 1 }],
          },
        ],
      },
    ],
  };
  const stringify = JSON.stringify;
  let metadataCopies = 0;
  JSON.stringify = (...args) => {
    const value = stringify(...args);
    if (typeof value === 'string' && value.includes(marker)) metadataCopies++;
    return value;
  };
  try {
    const first = buildGraphSearchContext(found, 3000);
    assert.strictEqual(buildGraphSearchContext(found, 3000), first);
    buildGraphSearchContext(found, 6000);
    found.sources[1].references[0].targets[0].end = 2;
    const changed = buildGraphSearchContext(found, 3000);
    assert.notStrictEqual(changed, first);
    assert.equal(changed.text, first.text);
    assert.equal(metadataCopies, 0);
  } finally {
    JSON.stringify = stringify;
  }
});

test('oversized evidence bundles are rejected before formatting and remain available at a larger size', () => {
  const text =
    'Alpha uses Beta.' + ' '.repeat(4000) + 'A complete qualification remains mandatory.';
  const found = {
    scope: 'quotation-cost',
    revision: 'same',
    query: 'Alpha Beta',
    plan: { terms: ['alpha', 'beta'], intent: 'connection', maxHops: 1, targetIds: ['a', 'b'] },
    nodes: ['a', 'b'].map((id, index) => ({
      node: {
        id,
        name: index ? 'Beta' : 'Alpha',
        kind: 'note',
        typeLabel: 'Note',
        body: '',
        sourceIds: [],
      },
      score: 100,
    })),
    edges: [
      {
        edge: {
          id: 'ab',
          source: 'a',
          target: 'b',
          label: 'uses',
          type: 'REFERENCES',
          directed: true,
          sourceIds: ['s'],
        },
        score: 80,
      },
    ],
    paths: [{ nodes: ['a', 'b'], edges: ['ab'] }],
    sources: [
      {
        id: 's',
        title: 'Source',
        text,
        blocks: [{ start: 0, end: text.length }],
        scopes: [{ start: 0, end: text.length }],
      },
    ],
    limited: false,
  };
  const split = String.prototype.split;
  let formatted = 0;
  String.prototype.split = function (...args) {
    if (String(this) === text) formatted++;
    return split.apply(this, args);
  };
  try {
    const small = buildGraphSearchContext(found, 1200);
    assert.equal(formatted, 0);
    assert.ok(!small.entries.some((entry) => entry.kind === 'edge'));
    const large = buildGraphSearchContext(found, 16000);
    assert.ok(formatted > 0);
    assert.ok(large.entries.some((entry) => entry.kind === 'edge' && entry.id === 'ab'));
    assert.ok(large.citations.some((citation) => citation.text === text));
  } finally {
    String.prototype.split = split;
  }
});

test('formatting of standalone items is bounded by the available budget while duplicate entries survive', () => {
  let reads = 0;
  const items = Array.from({ length: 600 }, (_, index) => ({
    id: 'n' + index,
    get name() {
      reads++;
      return ('Item ' + index).padEnd(200, 'x');
    },
    kind: 'note',
    typeLabel: 'Note',
    body: '',
    sourceIds: [],
  }));
  const found = {
    scope: 'item-cost',
    revision: 'v',
    query: 'Topic',
    plan: { terms: [], intent: 'related', maxHops: 1 },
    nodes: items.map((node) => ({ node, score: 100 })),
    edges: [],
    paths: [],
    sources: [],
    limited: false,
  };
  const context = buildGraphSearchContext(found, 1000);
  const visible = context.entries.filter((entry) => entry.kind === 'node').length;
  assert.ok(
    reads <= 2 * items.length + 2 * visible,
    'unaffordable items do not require another name-formatting pass'
  );
  const duplicate = {
    ...found,
    nodes: [
      ...items.slice(0, 10).map((node, index) => ({
        node: { ...node, id: 'copy' + index, name: 'Shared'.repeat(100) },
        score: 100,
      })),
      { node: { ...items[0], id: 'too-large', name: 'Other'.repeat(300) }, score: 100 },
    ],
  };
  const repeated = buildGraphSearchContext(duplicate, 1000);
  assert.equal(repeated.entries.filter((entry) => entry.kind === 'node').length, 10);
});

test('remaining output space rejects optional source formatting before preparing an unaffordable quotation', () => {
  const first = 'First condition remains mandatory. ' + 'x'.repeat(1750);
  const second = 'Second condition remains mandatory. ' + 'y'.repeat(1750);
  const text = first + '\n\n' + second;
  const source = {
    id: 's',
    title: 'Additional record',
    text,
    blocks: [
      { start: 0, end: first.length },
      { start: first.length + 2, end: text.length },
    ],
    scopes: [{ start: 0, end: text.length }],
  };
  const found = {
    scope: 'remaining-budget',
    revision: 'same',
    query: 'Alpha',
    plan: { terms: ['alpha'], intent: 'related', maxHops: 1 },
    nodes: [
      {
        node: {
          id: 'a',
          name: 'Alpha',
          kind: 'note',
          typeLabel: 'Note',
          body: JSON.stringify({ Detail: 'z'.repeat(14000) }),
          sourceIds: [],
        },
        score: 100,
      },
      {
        node: {
          id: 'b',
          name: 'Beta',
          kind: 'note',
          typeLabel: 'Note',
          body: '',
          sourceIds: ['s'],
        },
        score: 10,
      },
    ],
    edges: [],
    paths: [],
    sources: [source],
    limited: false,
  };
  const split = String.prototype.split;
  let formatted = 0;
  String.prototype.split = function (...args) {
    if (String(this) === first || String(this) === second) formatted++;
    return split.apply(this, args);
  };
  try {
    const small = buildGraphSearchContext(found, 16000);
    assert.equal(formatted, 0);
    assert.ok(small.text.includes('z'.repeat(1000)));
    const large = buildGraphSearchContext(found, 32000);
    assert.ok(formatted > 0);
    assert.ok(large.citations.some((c) => c.text === first));
    assert.ok(large.citations.some((c) => c.text === second));
  } finally {
    String.prototype.split = split;
  }
});

test('optional provenance is deferred before scanning a source when even its reference cannot fit', () => {
  let examined = 0;
  const evidence = load('search/evidence.ts');
  const { buildGraphSearchContext } = load('search/context.ts', {
    './evidence': {
      ...evidence,
      graphEvidenceExcerpts: (...args) => {
        examined++;
        return evidence.graphEvidenceExcerpts(...args);
      },
    },
  });
  const found = {
    scope: 'reference-cost',
    revision: 'v',
    query: 'Subject',
    plan: { terms: ['subject'], intent: 'related', maxHops: 1 },
    nodes: [
      {
        node: {
          id: 'subject',
          name: 'Subject',
          kind: 'note',
          typeLabel: 'Note',
          noteTitle: 'Source',
          body: '',
          sourceIds: ['s'],
        },
        score: 100,
      },
    ],
    edges: [],
    paths: [],
    sources: [
      {
        id: 's',
        title: 'Long source title '.repeat(200),
        text: 'Subject and its full source context. '.repeat(10000),
      },
    ],
    limited: false,
  };
  const context = buildGraphSearchContext(found, 1000);
  assert.equal(examined, 0);
  assert.equal(context.citations.length, 0);
  assert.equal(context.truncated, true);
  assert.ok(context.text.includes('Subject'));
});

test('a 256k context with many evidence alternatives retains paths and exact quotes within five seconds', (t) => {
  const points = Array.from({ length: 63 }, (_, index) => index);
  const sources = points.flatMap((index) =>
    Array.from({ length: 12 }, (_, variant) => ({
      id: `s${index}:${variant}`,
      title: `Source ${index} Variant ${variant} ` + 'part '.repeat(70),
      text: `Origin connects Point ${index}. Variant ${variant}. ` + 'Detail '.repeat(80),
    }))
  );
  const sourceIds = (index) =>
    sources.filter((source) => source.id.startsWith(`s${index}:`)).map((source) => source.id);
  const nodes = ['Origin', ...points.map((index) => 'Point ' + index)].map((name, index) => ({
    node: {
      id: 'n' + index,
      name,
      kind: 'keyword',
      typeLabel: 'Keyword',
      sourceIds: index ? sourceIds(index - 1) : [],
      body: JSON.stringify({ measures: [index, index + 1] }),
    },
    score: 90,
  }));
  const edges = points.map((index) => ({
    edge: {
      id: 'e' + index,
      source: 'n0',
      target: 'n' + (index + 1),
      label: 'connects',
      type: 'REFERENCES',
      directed: true,
      sourceIds: sourceIds(index),
    },
    score: 80,
  }));
  const found = {
    scope: 'synthetic-256k',
    revision: 'synthetic-256k',
    query: 'Origin',
    plan: { terms: ['origin'], intent: 'related', maxHops: 2 },
    nodes,
    edges,
    paths: edges.map(({ edge }) => ({ nodes: [edge.source, edge.target], edges: [edge.id] })),
    sources,
    limited: false,
  };
  const started = performance.now();
  const context = buildGraphSearchContext(found, 256000);
  const elapsed = performance.now() - started;
  assert.ok(context.usage.characters <= 256000);
  assert.equal(context.usage.characters, context.text.length);
  assert.equal(context.entries.filter((entry) => entry.kind === 'path').length, edges.length);
  assert.ok(context.truncated, 'the fixture must exercise rejected optional evidence');
  for (const citation of context.citations) {
    const source = sources.find((source) => source.id === citation.sourceId);
    assert.equal(citation.text, source.text.slice(citation.start, citation.end));
  }
  t.diagnostic(`256k synthetic context: ${Math.round(elapsed)} ms`);
  assert.ok(elapsed < 5000, `256k evidence selection exceeded five seconds: ${elapsed} ms`);
});

test('context sizes share source preparation and repeated sizes reuse completed Markdown with input and translation invalidation', () => {
  const evidence = load('search/evidence.ts');
  let excerpts = 0;
  const sourcePreparations = new Set();
  const originalText = 'Alpha uses Beta under the original condition.';
  const { buildGraphSearchContext } = load('search/context.ts', {
    './evidence': {
      ...evidence,
      graphEvidenceExcerpts: (...args) => {
        excerpts++;
        if (args[0] === originalText) sourcePreparations.add(args[1]);
        return evidence.graphEvidenceExcerpts(...args);
      },
    },
  });
  const result = {
    scope: 'resize',
    revision: 'resize',
    query: 'Alpha',
    plan: { terms: ['alpha'], intent: 'related', maxHops: 2 },
    nodes: ['Alpha', 'Beta'].map((id) => ({
      node: {
        id,
        name: id,
        kind: 'note',
        typeLabel: 'Note',
        noteTitle: 'Note',
        body: '',
        sourceIds: ['s'],
      },
      score: 50,
    })),
    edges: [
      {
        edge: {
          id: 'uses',
          source: 'Alpha',
          target: 'Beta',
          label: 'uses',
          type: 'REFERENCES',
          directed: true,
          sourceIds: ['s'],
        },
        score: 40,
      },
    ],
    paths: [{ nodes: ['Alpha', 'Beta'], edges: ['uses'] }],
    sources: [{ id: 's', title: 'Note', text: originalText }],
    limited: false,
  };
  let label = 'Related items';
  const translate = (key) => (key === 'Related items' ? label : key);
  const first = buildGraphSearchContext(result, 16000, translate);
  const prepared = excerpts;
  assert.ok(prepared > 0);
  const larger = buildGraphSearchContext(result, 32000, translate);
  assert.equal(excerpts, prepared, 'a new size reuses source ranges and evidence rankings');
  assert.strictEqual(buildGraphSearchContext(result, 16000, translate), first);
  assert.strictEqual(buildGraphSearchContext(result, 32000, translate), larger);
  assert.equal(excerpts, prepared, 'completed sizes do no evidence work');
  const acrossRanges = {
    ...result,
    nodes: [...result.nodes],
    plan: { ...result.plan, maxHops: 3 },
  };
  buildGraphSearchContext(acrossRanges, 16000, translate);
  buildGraphSearchContext(
    {
      ...acrossRanges,
      query: 'Beta',
      nodes: [...result.nodes],
      plan: { ...acrossRanges.plan, terms: ['beta'] },
    },
    16000,
    translate
  );
  assert.equal(
    sourcePreparations.size,
    1,
    'queries and ranges reuse the prepared index source text'
  );
  result.sources[0].text = 'Alpha uses Beta under a changed condition.';
  const changed = buildGraphSearchContext(result, 16000, translate);
  assert.notStrictEqual(changed, first);
  assert.ok(changed.citations.some((citation) => citation.text.includes('changed condition')));
  assert.ok(changed.citations.every((citation) => !citation.text.includes('original condition')));
  result.nodes[0].node.body = JSON.stringify({ count: 3 });
  assert.match(buildGraphSearchContext(result, 16000, translate).text, /count.*3/);
  result.nodes[0].node.name = 'Updated item';
  assert.match(buildGraphSearchContext(result, 16000, translate).text, /Updated item/);
  label = 'Localized heading';
  assert.match(buildGraphSearchContext(result, 16000, translate).text, /## Localized heading/);
});

test('asynchronous repacking yields during work, cancels obsolete sizes and resumes with the same complete context', async () => {
  const utilities = load('keyword/keywordUtils.ts');
  const controller = new AbortController();
  let yields = 0;
  const context = load('search/context.ts', {
    '../keyword/keywordUtils': {
      ...utilities,
      yieldRelationWork: async (signal) => {
        yields++;
        if (yields === 4) controller.abort();
        await utilities.yieldRelationWork(signal);
      },
    },
  });
  const nodes = Array.from({ length: 80 }, (_, index) => ({
    id: 'n' + index,
    name: index ? 'Item ' + index : 'Topic',
    kind: 'note',
    typeLabel: 'Note',
    noteTitle: 'Note',
    body: '',
    sourceIds: ['s' + index],
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: 'e' + index,
    source: 'n0',
    target: node.id,
    label: 'uses',
    type: 'REFERENCES',
    directed: true,
    sourceIds: ['s' + (index + 1)],
  }));
  const result = {
    scope: 'cooperative',
    revision: 'cooperative',
    query: 'Topic',
    plan: { terms: ['topic'], intent: 'related', maxHops: 2 },
    nodes: nodes.map((node) => ({ node, score: 50 })),
    edges: edges.map((edge) => ({ edge, score: 40 })),
    paths: edges.map((edge) => ({ nodes: [edge.source, edge.target], edges: [edge.id] })),
    sources: nodes.map((_, index) => ({
      id: 's' + index,
      title: 'Note ' + index,
      text: 'Topic uses Item ' + index + '. ' + 'Preserve the full source conditions. '.repeat(20),
    })),
    limited: false,
  };
  await assert.rejects(
    context.buildGraphSearchContextAsync(result, 32000, undefined, controller.signal),
    { name: 'AbortError' }
  );
  assert.equal(
    yields,
    4,
    'cancellation is observed after work has yielded, not only before starting'
  );
  const resumed = await context.buildGraphSearchContextAsync(result, 32000);
  const fresh = buildGraphSearchContext(JSON.parse(JSON.stringify(result)), 32000);
  assert.deepEqual(resumed, fresh);
  assert.strictEqual(await context.buildGraphSearchContextAsync(result, 32000), resumed);
});

test('long multilingual sources retain exact quotation offsets without quadratic grapheme traversal', (t) => {
  const original = 'Original background. '.repeat(12000) + '가 Cafe\u0301 İ 👩‍💻. Alpha uses Beta.';
  const started = performance.now();
  const search = createEvidenceText(original);
  const elapsed = performance.now() - started;
  assert.equal(search.text, original.normalize('NFC').toLowerCase());
  for (const term of ['Original', '가', 'Café', 'İ', '👩‍💻', 'Alpha uses Beta.']) {
    const normalized = term.normalize('NFC').toLowerCase();
    const start = search.text.indexOf(normalized);
    assert.ok(start >= 0);
    const range = search.range(start, start + normalized.length);
    assert.equal(original.slice(range.start, range.end).normalize('NFC').toLowerCase(), normalized);
  }
  t.diagnostic(`${original.length} source characters: ${Math.round(elapsed)} ms`);
  assert.ok(elapsed < 2000, `long-source quotation indexing took ${Math.round(elapsed)} ms`);
});

test('path measurements reuse immutable structural pieces across publications without serializing long reference URLs again', () => {
  let reads = 0;
  const lines = Array.from({ length: 64 }, (_, index) => {
    const href = 'https://example.test/' + 'reference/'.repeat(400) + index;
    const path = [
      { key: 'root', text: 'Root (Note)' },
      {
        key: 'item' + index,
        text: 'Item ' + index + ' (Note)',
        relation: {
          get key() {
            reads++;
            return 'relation' + index + href;
          },
          text: '— uses [1](' + href + ') →',
        },
      },
    ];
    return { key: 'path:' + index, text: JSON.stringify(path), kind: 'path', path };
  });
  const sizes = lines.map((_, index) => renderContextPaths(lines.slice(0, index + 1)).length);
  reads = 0;
  const owner = {};
  for (const [index, size] of sizes.entries()) {
    const measure = createContextLineMeasure(lines.slice(0, index + 1), owner);
    assert.equal(measure([], new Set()).characters, size);
  }
  assert.ok(reads <= lines.length * 2, `repeated path piece processing: ${reads} reads`);
});

test('incremental measurements preserve duplicate lines and path precedence after additions and removals', () => {
  const kinds = ['node', 'edge', 'path', 'nearby'];
  const line = (index, offset = 0) => ({
    key: String(index + offset),
    text: 'Line ' + ((index * 7 + offset) % 17) + '\n\n',
    kind: kinds[(index + offset) % kinds.length],
  });
  const baseline = Array.from({ length: 64 }, (_, index) => line(index));
  const measure = createContextLineMeasure(baseline);
  for (let round = 0; round < 40; round++) {
    const removed = new Set(
      baseline.filter((_, index) => (index + round) % 3 === 0).map(({ key }) => key)
    );
    const added = Array.from({ length: round % 11 }, (_, index) => line(index, 100 + round));
    const visible = new Map();
    for (const item of [...baseline.filter(({ key }) => !removed.has(key)), ...added])
      if (!visible.has(item.text) || item.kind === 'path' || item.kind === 'nearby')
        visible.set(item.text, item.kind);
    const expected = { related: 0, path: 0, nearby: 0, characters: 0 };
    for (const [text, kind] of visible) {
      expected.characters += text.length;
      expected[kind === 'path' || kind === 'nearby' ? kind : 'related']++;
    }
    assert.deepEqual(measure(added, removed), expected);
    const extended = measure.extend(added, removed);
    assert.deepEqual(extended([], new Set()), expected);
    const nextRemoved = new Set([added[0]?.key, ...removed].filter(Boolean));
    const nextAdded = [line(600 + round)];
    const finalLines = [...baseline.filter(({ key }) => !removed.has(key)), ...added];
    assert.deepEqual(
      extended(nextAdded, nextRemoved),
      createContextLineMeasure(finalLines)(nextAdded, nextRemoved)
    );
    assert.deepEqual(extended([], new Set()), expected, 'trials leave the overlay intact');
  }
  assert.deepEqual(measure([], new Set()), measure([], new Set()), 'trials leave the base intact');
});

test('incremental path measurements match shared tree rows, parallel relations and separate path sections', () => {
  const line = (key, ids, relation, kind = 'path') => ({
    key,
    kind,
    text: JSON.stringify([ids, relation, kind]),
    path: ids.map((id, index) => ({
      key: id,
      text: '**' + id + '** (Note)',
      ...(index
        ? {
            relation: {
              key: index === 1 ? relation : 'next',
              text: index === 1 ? relation : '→ next [2]',
            },
          }
        : {}),
    })),
  });
  const baseline = [
    line('first', ['A', 'B'], '→ uses [1]'),
    line('deep', ['A', 'B', 'D'], '→ uses [1]'),
    line('parallel', ['A', 'B', 'D'], '← owns [3]'),
    line('branch', ['A', 'C', 'D'], '→ opens [4]'),
    line('root', ['X', 'B', 'D'], '→ connects [5]'),
    line('nearby', ['A', 'B', 'D'], '→ uses [1]', 'nearby'),
  ];
  const measure = createContextLineMeasure(baseline);
  for (let mask = 0; mask < 64; mask++) {
    const removed = new Set(
      baseline.filter((_, index) => mask & (1 << index)).map(({ key }) => key)
    );
    const added = [line('new', ['A', 'B', 'E'], '— peer [6]')];
    const visible = [...baseline.filter(({ key }) => !removed.has(key)), ...added];
    const paths = visible.filter(({ kind }) => kind === 'path');
    const nearby = visible.filter(({ kind }) => kind === 'nearby');
    const expected = {
      related: 0,
      path: paths.length,
      nearby: nearby.length,
      characters: renderContextPaths(paths).length + renderContextPaths(nearby).length,
    };
    assert.deepEqual(measure(added, removed), expected);
    assert.deepEqual(measure.extend(added, removed)([], new Set()), expected);
    assert.deepEqual(measure.extend(added, removed)([], new Set(['new'])), {
      ...expected,
      path: expected.path - 1,
      characters:
        renderContextPaths(paths.filter(({ key }) => key !== 'new')).length +
        renderContextPaths(nearby).length,
    });
  }
});

test('accepted line publications match fresh measurements after shared paths and duplicates change', () => {
  const measure = createContextLineMeasure([]);
  let published = [];
  const kinds = ['node', 'edge', 'path', 'nearby'];
  for (let round = 0; round < 80; round++) {
    const removed = new Set(
      published.filter((_, index) => (round + index) % 5 === 0).map((line) => line.key)
    );
    const added = Array.from({ length: 3 }, (_, index) => {
      const kind = kinds[(round + index) % kinds.length];
      const path = ['Root', 'Branch ' + (round % 7), 'Leaf ' + index].map((key, depth) => ({
        key,
        text: key + ' (Note)',
        ...(depth ? { relation: { key: 'r' + depth, text: '— connects →' } } : {}),
      }));
      return {
        key: round + ':' + index,
        text:
          kind === 'path' || kind === 'nearby' ? JSON.stringify(path) : 'Duplicate ' + (round % 3),
        kind,
        ...((kind === 'path' || kind === 'nearby') && { path }),
      };
    });
    const expected = measure(added, removed);
    measure.accept(added, removed);
    published = [...published.filter((line) => !removed.has(line.key)), ...added];
    assert.deepEqual(measure([], new Set()), expected);
    assert.deepEqual(measure([], new Set()), createContextLineMeasure(published)([], new Set()));
  }
});

test('dense partial-budget searches retain complete trees without scanning all published paths for each trial', (t) => {
  const count = 120;
  const nodes = Array.from({ length: count + 1 }, (_, index) => ({
    id: 'n' + index,
    name: index ? 'Item ' + index : 'Topic',
    kind: 'note',
    typeLabel: 'Note',
    noteTitle: 'Note',
    body: '',
    sourceIds: ['s' + index],
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: 'e' + index,
    source: 'n0',
    target: node.id,
    type: 'REFERENCES',
    label: 'uses',
    directed: true,
    sourceIds: ['s' + (index + 1)],
  }));
  let pathReads = 0;
  let edgeReads = 0;
  const paths = edges
    .flatMap((edge, index) => [
      { nodes: [edge.source, edge.target], edges: [edge.id] },
      ...edges.slice(index + 1, index + 5).map((peer) => ({
        nodes: [edge.target, edge.source, peer.target],
        edges: [edge.id, peer.id],
      })),
    ])
    .map((path) => ({
      get nodes() {
        pathReads++;
        return path.nodes;
      },
      get edges() {
        edgeReads++;
        return path.edges;
      },
    }));
  const sources = nodes.map((_, index) => ({
    id: 's' + index,
    title: 'Note ' + index,
    text:
      'Topic uses Item ' +
      index +
      '. ' +
      'The original context contains all relevant conditions. '.repeat(12),
  }));
  const result = {
    scope: 'p',
    revision: 'p',
    query: 'Topic',
    plan: { terms: ['topic'], intent: 'related', maxHops: 2 },
    nodes: nodes.map((node, index) => ({ node, score: 100 - index / 100 })),
    edges: edges.map((edge, index) => ({ edge, score: 90 - index / 100 })),
    paths,
    sources,
    limited: false,
  };
  const started = performance.now();
  const context = buildGraphSearchContext(result, 16000);
  t.diagnostic(`${paths.length} candidate paths: ${Math.round(performance.now() - started)} ms`);
  assert.ok(context.entries.some((entry) => entry.kind === 'path'));
  for (const entry of context.entries.filter((entry) => entry.kind === 'path'))
    for (const id of paths[entry.index].edges)
      assert.ok(
        context.entries.some(
          (entry) => entry.kind === 'edge' && entry.id === id && entry.citationIds.length
        )
      );
  for (const citation of context.citations) {
    const source = sources.find((source) => source.id === citation.sourceId);
    assert.equal(citation.text, source.text.slice(citation.start, citation.end));
  }
  assert.ok(pathReads < 60000, `published paths were repeatedly scanned (${pathReads} reads)`);
  assert.ok(
    edgeReads < 60000,
    `candidate relationships were repeatedly scanned (${edgeReads} reads)`
  );
  assert.equal(context.usage.characters, context.text.length);
  assert.ok(context.text.length <= context.usage.limit);
});

test('shared multi-paragraph evidence is evaluated as one bundle instead of all primary/context permutations', (t) => {
  const names = ['Root', 'Alpha', 'Beta', 'Final'];
  const nodes = names.map((id) => ({
    id,
    name: id,
    kind: 'keyword',
    noteTitle: 'Note',
    body: '',
    sourceIds: ['s'],
  }));
  const edges = names.slice(1).map((target, index) => ({
    id: 'e' + index,
    source: names[index],
    target,
    type: 'KEYWORD_RELATION',
    label: 'uses',
    directed: true,
    sourceIds: ['s'],
  }));
  const source = {
    id: 's',
    title: 'Note',
    text: Array.from(
      { length: 48 },
      (_, index) =>
        'Root uses Alpha, Alpha uses Beta, and Beta uses Final under condition ' + index + '.'
    ).join('\n\n'),
  };
  const result = {
    scope: 'shared-evidence',
    revision: 'shared-evidence',
    query: 'Root Final',
    plan: {
      terms: ['root', 'final'],
      intent: 'connection',
      maxHops: 3,
      targetIds: ['Root', 'Final'],
    },
    nodes: nodes.map((node) => ({ node, score: 100 })),
    edges: edges.map((edge) => ({ edge, score: 80 })),
    sources: [source],
    paths: [{ nodes: names, edges: edges.map((edge) => edge.id) }],
    limited: false,
  };
  const started = performance.now();
  const context = buildGraphSearchContext(result, 16000);
  t.diagnostic(`48 shared paragraphs: ${Math.round(performance.now() - started)} ms`);
  assert.ok(performance.now() - started < 5000, 'shared evidence must finish within five seconds');
  assert.ok(
    (context.text.match(/^### \d+\. /gm) || []).length === 1,
    'adjacent source parts share one source heading while retaining their numbered ranges'
  );
  assert.equal(context.entries.filter((entry) => entry.kind === 'edge').length, 3);
  assert.equal(context.entries.filter((entry) => entry.kind === 'path').length, 1);
  for (const citation of context.citations)
    assert.equal(citation.text, source.text.slice(citation.start, citation.end));
  for (const entry of context.entries.filter((entry) => entry.kind === 'edge')) {
    const quoted = entry.citationIds.map((id) => context.citations.find((c) => c.id === id).text);
    for (let index = 0; index < 48; index++)
      assert.ok(
        quoted.some((text) => text.includes('condition ' + index + '.')),
        'each relationship retains every original condition'
      );
  }
  assert.equal(context.usage.characters, context.text.length);
  assert.ok(context.text.length <= 16000);
});

test('scope indexing preserves overlapping, nested and duplicate ranges without scanning the inventory per lookup', () => {
  const { createScopeIndex } = load('search/retrieval.ts');
  let seed = 17;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const scopes = Array.from({ length: 180 }, () => {
    const start = random() % 500;
    return { start, end: start + (random() % 200) };
  });
  scopes.push({ ...scopes[0] }, { start: 0, end: 800 });
  const index = createScopeIndex(scopes);
  for (let i = 0; i < 300; i++) {
    const start = random() % 800,
      range = { start, end: start + (random() % 40) };
    const expected = scopes
      .map((scope, id) => ({ ...scope, id }))
      .filter((s) => s.start <= range.start && s.end >= range.end)
      .sort((a, b) => a.end - a.start - (b.end - b.start) || a.id - b.id)
      .map((s) => s.id);
    assert.deepEqual(index.parents(range), expected);
  }
  for (const [id, parent] of scopes.entries()) {
    const children = scopes.filter(
      (child) =>
        child.start >= parent.start &&
        child.end <= parent.end &&
        (child.start !== parent.start || child.end !== parent.end)
    );
    assert.deepEqual(index.introduction(id), {
      start: parent.start,
      end: Math.min(parent.end, ...children.map((c) => c.start)),
    });
  }
  let reads = 0;
  const inventory = Array.from({ length: 6000 }, (_, i) => ({
    get start() {
      reads++;
      return i * 10;
    },
    get end() {
      reads++;
      return i * 10 + 9;
    },
  }));
  const indexed = createScopeIndex(inventory);
  reads = 0;
  for (let i = 0; i < 100; i++)
    assert.deepEqual(indexed.parents({ start: i * 10 + 2, end: i * 10 + 5 }), [i]);
  assert.ok(reads < inventory.length);
});

test('query and predicate scoring skips blocks excluded by intact party evidence without losing alternatives', () => {
  const { graphEvidenceExcerpts } = load('search/evidence.ts');
  const lines = [
    'Alpha uses Beta for Topic.',
    'Alpha excludes Beta for Topic.',
    ...Array.from({ length: 1200 }, (_, i) => 'Other record ' + i + '.'),
  ];
  const text = lines.join('\n');
  let cursor = 0;
  const blocks = lines.map((line) => {
    const range = { start: cursor, end: cursor + line.length };
    cursor = range.end + 1;
    return range;
  });
  const original = createEvidenceText(text);
  let scored = 0;
  const search = {
    ...original,
    coverage: (range, terms) => {
      if (terms.includes('topic')) scored++;
      return original.coverage(range, terms);
    },
  };
  const excerpts = graphEvidenceExcerpts(text, search, 16000, {
    terms: ['topic'],
    pair: ['alpha', 'beta'],
    relation: 'uses',
    blocks,
  });
  assert.equal(excerpts.length, 2);
  assert.equal(scored, excerpts.length);
  assert.deepEqual(
    excerpts.map((e) => text.slice(e.start, e.end)),
    lines.slice(0, 2)
  );
  assert.deepEqual(
    excerpts.map((e) => e.relevance),
    [325, 320]
  );
});
