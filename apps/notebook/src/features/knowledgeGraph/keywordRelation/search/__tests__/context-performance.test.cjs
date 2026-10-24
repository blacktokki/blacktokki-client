const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const { buildGraphSearchContext, createContextLineMeasure, renderContextPaths } = load(
  'search/context.ts',
  {},
  ['createContextLineMeasure', 'renderContextPaths']
);
const { createEvidenceText } = load('search/evidence.ts');

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
  const { buildGraphSearchContext } = load('search/context.ts', {
    './evidence': {
      ...evidence,
      graphEvidenceExcerpts: (...args) => {
        excerpts++;
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
    sources: [{ id: 's', title: 'Note', text: 'Alpha uses Beta under the original condition.' }],
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
      edges: path.edges,
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
  // Includes nested typed paths, entries, citations and omissions within the Markdown budget.
  assert.equal(
    createHash('sha256').update(JSON.stringify(context)).digest('hex'),
    '581ec56b88fe31e144bee981e06e21f8793fd4bab7a340c880fc7469e2d6c02f'
  );
  assert.ok(pathReads < 60000, `published paths were repeatedly scanned (${pathReads} reads)`);
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
  assert.equal(context.citations.length, 48);
  assert.equal(context.entries.filter((entry) => entry.kind === 'edge').length, 3);
  assert.equal(context.entries.filter((entry) => entry.kind === 'path').length, 1);
  for (const citation of context.citations)
    assert.equal(citation.text, source.text.slice(citation.start, citation.end));
  for (const entry of context.entries.filter((entry) => entry.kind === 'edge'))
    assert.equal(entry.citationIds.length, 48);
  assert.equal(context.usage.characters, context.text.length);
  assert.ok(context.text.length <= 16000);
});
