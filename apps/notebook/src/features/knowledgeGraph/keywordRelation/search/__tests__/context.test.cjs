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
const node = (id, body = '') => ({
  id,
  name: id,
  kind: 'note',
  typeLabel: 'Note',
  noteTitle: 'Note',
  body,
  sourceIds: ['s'],
});
const edge = (id, source, target) => ({
  id,
  source,
  target,
  type: 'REFERENCES',
  label: 'uses',
  directed: true,
  sourceIds: ['s'],
});
const snapshot = (nodes, edges, text = 'Shared record.') => ({
  version: 1,
  scope: 'review',
  revision: 'review',
  nodes,
  edges,
  sources: [{ id: 's', title: 'Note', text }],
  coverage: { keywords: true, templates: true },
});
const included = (context, kind, id) =>
  context.entries.some((entry) => entry.kind === kind && entry.id === id);

const searchResult = (nodes, edges, paths = []) => ({
  ...snapshot(
    nodes.map(({ node }) => node),
    edges.map(({ edge }) => edge)
  ),
  nodes,
  edges,
  paths,
  query: 'Topic',
  plan: { terms: ['topic'], intent: 'related', maxHops: 2 },
  limited: false,
});

test('the character budget can include more than 24 items, 40 relationships and 12 paths without fixed count caps', () => {
  const root = node('Root');
  const leaves = Array.from({ length: 65 }, (_, index) => node('Item' + index));
  const edges = leaves.map((item, index) => edge('e' + index, root.id, item.id));
  const result = searchResult(
    [root, ...leaves].map((node, index) => ({ node, score: 100 - index / 100 })),
    edges.map((edge, index) => ({ edge, score: 90 - index / 100 })),
    edges.map((edge) => ({ nodes: [edge.source, edge.target], edges: [edge.id] }))
  );
  const large = buildGraphSearchContext(result, 256000);
  assert.equal(large.entries.filter((entry) => entry.kind === 'node').length, 66);
  assert.equal(large.entries.filter((entry) => entry.kind === 'edge').length, 65);
  assert.equal(large.entries.filter((entry) => entry.kind === 'path').length, 65);
  assert.equal(large.truncated, false);
  assert.match(large.text, /Content omissions: None/);
  let previous = 0;
  for (const budget of [4000, 16000, 32000, 64000, 128000, 256000]) {
    const context = buildGraphSearchContext(result, budget);
    assert.ok(context.text.length <= budget);
    assert.deepEqual(context.usage, { characters: context.text.length, limit: budget });
    for (const heading of ['Related items', 'Traversal paths']) {
      const section = context.text.split(`## ${heading} (`)[1].split('\n## ')[0];
      const count =
        heading === 'Related items'
          ? (section.match(/^- /gm) || []).length
          : context.entries.filter((entry) => entry.kind === 'path').length;
      assert.equal(Number(section.match(/^\d+/)[0]), count);
      if (heading === 'Traversal paths') assert.equal((section.match(/^- /gm) || []).length, 1);
    }
    assert.ok(context.text.includes(`## Source quotations (${context.citations.length})`));
    assert.match(context.text, /^# Search Results: Topic\n/);
    assert.doesNotMatch(context.text, /^Item:|^Related items:|^Traversal paths:/m);
    assert.ok(context.entries.length >= previous);
    previous = context.entries.length;
    for (const entry of context.entries.filter((entry) => entry.kind === 'path')) {
      assert.ok(result.paths[entry.index].nodes.every((id) => included(context, 'node', id)));
      assert.ok(result.paths[entry.index].edges.every((id) => included(context, 'edge', id)));
    }
  }
  const small = buildGraphSearchContext(result, 4000);
  assert.ok(small.entries.length < large.entries.length);
  assert.equal(small.truncated, true);
  assert.match(small.text, /Content omissions: Present/);
});

test('items and relationships share retrieval relevance ordering even when the input arrays are unsorted', () => {
  const nodes = [
    node('Low'),
    node('Left'),
    node('Right'),
    node('Middle'),
    node('Best', '{"Num":3}'),
  ];
  const result = searchResult(
    nodes.map((node, index) => ({ node, score: [1, 10, 10, 80, 99][index] })),
    [{ edge: edge('important', 'Left', 'Right'), score: 95 }],
    [{ nodes: ['Left', 'Right'], edges: ['important'] }]
  );
  const context = buildGraphSearchContext(result, 16000);
  assert.equal(context.entries[0].kind, 'node');
  assert.equal(context.entries[0].id, 'Best');
  const position = (kind, id) =>
    context.entries.findIndex((entry) => entry.kind === kind && entry.id === id);
  assert.ok(position('edge', 'important') < position('node', 'Middle'));
  assert.ok(position('node', 'Middle') < position('node', 'Low'));
  assert.match(context.text, /Num: 3/);
  const bestOnly = searchResult([result.nodes.at(-1)], []);
  const smallBudget = buildGraphSearchContext(bestOnly).text.length + 16;
  const small = buildGraphSearchContext(result, smallBudget);
  assert.ok(included(small, 'node', 'Best'));
  assert.equal(included(small, 'node', 'Low'), false);
  assert.ok(small.text.length <= smallBudget);
});

test('connection relevance uses the retrieval scores of its endpoints and relationships', () => {
  const nodes = ['WeakA', 'WeakB', 'StrongA', 'StrongB'].map((id) => node(id));
  const edges = [edge('weak', 'WeakA', 'WeakB'), edge('strong', 'StrongA', 'StrongB')];
  const result = searchResult(
    nodes.map((node, index) => ({ node, score: index < 2 ? 1 : 70 })),
    edges.map((edge, index) => ({ edge, score: index === 0 ? 1 : 70 })),
    edges.map((edge) => ({ nodes: [edge.source, edge.target], edges: [edge.id] }))
  );
  const context = buildGraphSearchContext(result, 16000);
  assert.deepEqual(
    context.entries.filter((entry) => entry.kind === 'path').map((entry) => entry.index),
    [1, 0]
  );
  assert.equal(context.entries[0].id, 'strong');
});

test('retrieval exposes paths beyond the former discovery-order cap for relevance-based context selection', async () => {
  const root = node('Anchor');
  const leaves = Array.from({ length: 45 }, (_, index) => node('Leaf' + index));
  const result = await searchKnowledgeGraph(
    await createGraphSearchIndex(
      snapshot(
        [root, ...leaves],
        leaves.map((item, index) => edge('e' + index, root.id, item.id))
      )
    ),
    'Anchor'
  );
  assert.ok(result.paths.length > 40);
  assert.ok(result.context.entries.filter((entry) => entry.kind === 'path').length > 12);
  assert.ok(result.context.text.length <= 16000);
});

test('a connecting path and its attributes survive forty higher-ranked surrounding relationships', async () => {
  const nodes = [
    node('Alpha'),
    ...Array.from({ length: 40 }, (_, i) => node('Item' + i)),
    node('Beta', '{"Num":3}'),
    node('Gamma'),
  ];
  const edges = nodes
    .slice(1, 41)
    .map((n, i) => edge('a' + String(i).padStart(2, '0'), 'Alpha', n.id));
  edges.push(edge('z-bridge1', 'Alpha', 'Beta'), edge('z-bridge2', 'Beta', 'Gamma'));
  const result = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot(nodes, edges)),
    'Alpha Gamma connection',
    { maxHops: 2 }
  );
  assert.equal(result.plan.intent, 'connection');
  assert.ok(result.context.entries.some((entry) => entry.kind === 'path'));
  for (const id of ['z-bridge1', 'z-bridge2']) assert.ok(included(result.context, 'edge', id));
  for (const id of ['Alpha', 'Beta', 'Gamma']) assert.ok(included(result.context, 'node', id));
  assert.match(result.context.text, /Num: 3/);
  assert.ok(
    result.context.text.indexOf('## Traversal paths') < result.context.text.indexOf('Item0')
  );
  assert.equal(result.context.truncated, false);
  assert.match(result.context.text, /Content omissions: None/);
  for (const budget of [256, 1000, 1800, 4000]) {
    const context = buildGraphSearchContext(result, budget);
    for (const entry of context.entries.filter((entry) => entry.kind === 'path')) {
      const path = result.paths[entry.index];
      assert.ok(path.edges.every((id) => included(context, 'edge', id)));
      assert.ok(path.nodes.every((id) => included(context, 'node', id)));
    }
    for (const entry of context.entries)
      assert.ok(
        entry.citationIds.every((id) => context.citations.some((source) => source.id === id))
      );
    assert.ok(context.text.length <= budget);
  }
});

test('metadata-only matches retain values, prioritize matching attributes and preserve false, null and nested values', async () => {
  const metadata = {
    Overview: 'irrelevant '.repeat(1000),
    Num: 3,
    Active: false,
    Empty: null,
    Details: { Num: 3 },
  };
  const data = snapshot([node('Sample 3', JSON.stringify(metadata))], [], 'Sample planning notes.');
  const result = await searchKnowledgeGraph(
    await createGraphSearchIndex(data),
    'Num Active Empty Details'
  );
  assert.equal(result.nodes[0].node.name, 'Sample 3');
  assert.match(result.context.text, /\*\*`Num`\*\*: 3/);
  assert.match(result.context.text, /\*\*`Active`\*\*: false/);
  assert.match(result.context.text, /\*\*`Empty`\*\*: null/);
  assert.match(result.context.text, /\*\*`Details`\*\*:[\s\S]*"Num": 3/);
  assert.ok(result.context.text.indexOf('**`Num`**: 3') < result.context.text.indexOf('Overview:'));
  assert.equal(result.context.truncated, false);
  assert.ok(result.context.text.includes(metadata.Overview.trim()));
});

test('different relationships quote different passages from the same source, including relations after an early name mention', async () => {
  const text =
    'Alpha is mentioned here. ' +
    'Unrelated introduction. '.repeat(45) +
    '\n\n' +
    'Alpha uses Beta for geometry.\n\n' +
    'Other background information. '.repeat(45) +
    '\n\n' +
    'Beta uses Gamma for reporting.';
  const data = snapshot(
    [node('Alpha'), node('Beta'), node('Gamma')],
    [edge('ab', 'Alpha', 'Beta'), edge('bc', 'Beta', 'Gamma')],
    text
  );
  const result = await searchKnowledgeGraph(await createGraphSearchIndex(data), 'Alpha', {
    maxHops: 2,
  });
  const quoteFor = (id) => {
    const entry = result.context.entries.find((entry) => entry.kind === 'edge' && entry.id === id);
    assert.ok(entry);
    return entry.citationIds.map((id) =>
      result.context.citations.find((source) => source.id === id)
    );
  };
  assert.ok(quoteFor('ab').some((source) => source.text.includes('Alpha uses Beta for geometry.')));
  assert.ok(
    quoteFor('bc').some((source) => source.text.includes('Beta uses Gamma for reporting.'))
  );
  assert.notEqual(quoteFor('ab')[0].id, quoteFor('bc')[0].id);
  assert.equal(
    new Set(result.context.citations.map((source) => source.id)).size,
    result.context.citations.length
  );
  for (const source of result.context.citations) {
    assert.equal(source.sourceId, 's');
    assert.equal(source.text, text.slice(source.start, source.end));
    assert.ok(source.text.length <= result.context.usage.limit);
  }
  assert.match(result.context.text, /> …/);
});

test('readable sections collect evidence at the end and show an identical connection only once', () => {
  const first = node('Sample 3', '{"Num":3}');
  const second = node('Geometry plan');
  const relation = edge('uses-plan', first.id, second.id);
  const result = searchResult(
    [
      { node: first, score: 90 },
      { node: second, score: 90 },
    ],
    [{ edge: relation, score: 45 }],
    [
      { nodes: [first.id, second.id], edges: [relation.id] },
      { nodes: [second.id, first.id], edges: [relation.id] },
    ]
  );
  result.query = 'Sample 3 Geometry plan connection';
  result.plan.intent = 'connection';
  result.sources[0].text = 'Sample 3 uses the Geometry plan.';
  const context = buildGraphSearchContext(result);
  assert.equal(context.entries.filter((entry) => entry.kind === 'path').length, 1);
  assert.ok(included(context, 'edge', relation.id));
  assert.ok(included(context, 'node', first.id));
  assert.ok(included(context, 'node', second.id));
  assert.equal(context.truncated, false, 'removing a reverse duplicate does not omit information');
  assert.match(context.text, /^# Search Results:/);
  assert.match(context.text, /^## Source quotations \(1\)$/m);
  assert.ok(context.text.indexOf('## Traversal paths') < context.text.indexOf('## Related items'));
  const evidenceStart = context.text.indexOf('## Source quotations');
  assert.ok(evidenceStart > context.text.indexOf('Num: 3'));
  assert.ok(context.text.indexOf('Sample 3 uses the Geometry plan\\.') > evidenceStart);
  assert.match(context.text, /^- \*\*Sample 3\*\* \(Note\)\n  - — uses /m);
  assert.equal((context.text.match(/^  - — uses /gm) || []).length, 1);
  assert.match(context.text, /uses \[1\]\([^\n]+?\) → \*\*Geometry plan\*\*/);
  assert.equal(
    context.text.split('Sample 3 uses the Geometry plan.').length - 1,
    0,
    'source punctuation stays escaped'
  );
  assert.equal(context.text.split('Sample 3 uses the Geometry plan\\.').length - 1, 1);
  assert.equal((context.text.match(/^### /gm) || []).length, context.citations.length);
  assert.doesNotMatch(
    context.text,
    /### (Item|Related items|Traversal paths) \d|\*\*Sources\*\*|\[S\d+\]/
  );
  assert.deepEqual(context.usage, { characters: context.text.length, limit: 16000 });
  const { renderer } = load(
    require
      .resolve('@blacktokki/editor/package.json')
      .replace(/package\.json$/, 'src/lib/markdown.ts')
  );
  const html = renderer(context.text.slice(evidenceStart));
  assert.equal((html.match(/<blockquote>/g) || []).length, 1);
  assert.match(html, /<\/blockquote>\s*<p><em>Retrieved excerpts/);
});

for (const relationshipScore of [1, 1000]) {
  test(`multi-step explanations own their relationships whether selected before or after them (score ${relationshipScore})`, () => {
    const items = [node('Alpha', '{"Num":3}'), node('Beta'), node('Gamma')];
    const relations = [
      { ...edge('ab', 'Alpha', 'Beta'), associationScore: 0.75, sourceIds: ['ab-source'] },
      {
        ...edge('cb', 'Gamma', 'Beta'),
        label: 'supports',
        sourceIds: ['cb-source'],
      },
      { ...edge('parallel', 'Alpha', 'Beta'), label: 'reviews' },
    ];
    const result = searchResult(
      items.map((node) => ({ node, score: 20 })),
      relations.map((edge, index) => ({ edge, score: index < 2 ? relationshipScore : 1 })),
      [{ nodes: ['Alpha', 'Beta', 'Gamma'], edges: ['ab', 'cb'] }]
    );
    result.plan.intent = 'connection';
    result.sources.push(
      { id: 'ab-source', title: 'Geometry', text: 'Alpha uses Beta for geometry.' },
      { id: 'cb-source', title: 'Reporting', text: 'Gamma supports Beta for reporting.' }
    );
    const context = buildGraphSearchContext(result);
    const section = (heading) => {
      const start = context.text.indexOf(`## ${heading}`);
      return start < 0
        ? ''
        : context.text.slice(start).split('\n\n').slice(1).join('\n\n').split('\n## ')[0];
    };
    const related = section('Related items');
    const explanation = section('Traversal paths');
    assert.doesNotMatch(related, /— uses |supports/);
    assert.match(related, /\*\*Alpha\*\* — reviews → \*\*Beta\*\*/);
    assert.match(related, /Num: 3/);
    assert.match(
      explanation,
      /\*\*Alpha\*\* \(Note\)\n  - — uses \[\d+\]\([^\n]+?\) → \(Association score: 0\.75\) \*\*Beta\*\* \(Note\)/
    );
    assert.match(
      explanation,
      /\*\*Beta\*\*[^\n]*\n    - ← supports \[\d+\]\([^\n]+?\) — \*\*Gamma\*\*/
    );
    const pathEntry = context.entries.find((entry) => entry.kind === 'path');
    for (const id of ['ab', 'cb']) {
      const relationEntry = context.entries.find(
        (entry) => entry.kind === 'edge' && entry.id === id
      );
      assert.ok(relationEntry);
      assert.ok(relationEntry.citationIds.length);
      for (const citationId of relationEntry.citationIds) {
        assert.ok(pathEntry.citationIds.includes(citationId));
        const number = context.citations.findIndex((citation) => citation.id === citationId) + 1;
        assert.ok(number > 0);
        assert.ok(explanation.includes(`${id === 'ab' ? 'uses' : 'supports'} [${number}](`));
      }
    }
    assert.match(section('Source quotations'), /Alpha uses Beta for geometry/);
    assert.match(section('Source quotations'), /Gamma supports Beta for reporting/);
    assert.equal(context.truncated, false);
    const budget = context.text.length + 16;
    const bounded = buildGraphSearchContext(result, budget);
    assert.equal(bounded.entries.length, context.entries.length);
    assert.equal(
      bounded.truncated,
      false,
      'removed relationship lines consume no character budget'
    );
    assert.ok(bounded.text.length <= budget);
    assert.deepEqual(bounded.usage, { characters: bounded.text.length, limit: budget });
  });
}

test('a relationship stays visible when the explanation that uses it does not fit', () => {
  const first = node('Alpha');
  const second = node('Beta');
  const third = node('Gamma'.repeat(100));
  const relation = edge('ab', first.id, second.id);
  const base = searchResult(
    [first, second].map((node) => ({ node, score: 20 })),
    [{ edge: relation, score: 1000 }]
  );
  let budget = buildGraphSearchContext(base).text.length + 16;
  const result = searchResult(
    [...base.nodes, { node: third, score: 1 }],
    [...base.edges, { edge: edge('bc', second.id, third.id), score: 1 }],
    [{ nodes: [first.id, second.id, third.id], edges: ['ab', 'bc'] }]
  );
  const section = buildGraphSearchContext(result, budget).text.match(
    /^## Traversal paths \(0\)\n\n> [^\n]*\n\n/m
  )?.[0];
  assert.ok(section, 'the empty traversal section has its own Markdown cost');
  budget += section.length;
  const context = buildGraphSearchContext(result, budget);
  assert.ok(included(context, 'edge', 'ab'));
  assert.equal(
    context.entries.some((entry) => entry.kind === 'path'),
    false
  );
  assert.match(context.text, /\*\*Alpha\*\* — uses → \*\*Beta\*\*/);
  assert.match(context.text, /^## Traversal paths \(0\)$/m);
  assert.equal(context.truncated, true);
  assert.ok(context.text.length <= budget);
});

test('retrieval limits and content omissions remain visible in Markdown, including small budgets', async () => {
  const result = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot([node('Alpha')], [])),
    'Alpha'
  );
  assert.equal(result.context.truncated, false);
  assert.match(result.context.text, /Content omissions: None/);
  assert.match(result.context.text, /Search limits reached: None/);
  const limited = buildGraphSearchContext({ ...result, limited: true });
  assert.match(limited.text, /Search limits reached: Present/);
  for (const budget of [0, 1, 20, 256, 800, 16000]) {
    const context = buildGraphSearchContext({ ...result, query: 'Alpha '.repeat(500) }, budget);
    assert.equal(context.truncated, true);
    assert.ok(context.text.length <= budget);
    assert.deepEqual(context.usage, { characters: context.text.length, limit: budget });
    if (budget >= 256) assert.match(context.text, /Content omissions: Present/);
  }
});

test('external addresses and matching metadata beyond a long prefix are preserved as literal text', async () => {
  const item = {
    ...node('Resource', 'before '.repeat(300) + 'TailValue'),
    url: 'https://example.com/?x=1&y=2',
  };
  const result = await searchKnowledgeGraph(
    await createGraphSearchIndex(snapshot([item], [])),
    'TailValue'
  );
  assert.match(result.context.text, /TailValue/);
  assert.match(result.context.text, /https:\/\/example\\\.com/);
  assert.match(result.context.text, /&amp;y/);
  assert.match(result.context.text, /Content omissions: None/);
});

test('paragraph descriptions identify every source note, including a paragraph shared by notes', () => {
  const paragraph = {
    ...node('Geometry', '{"Num":3}'),
    kind: 'connectedParagraph',
    typeLabel: '연결된 문단',
    noteTitle: 'Shape collection',
    sourceIds: ['team', 'product'],
  };
  const result = searchResult([{ node: paragraph, score: 90 }], []);
  result.sources = [
    { id: 'team', title: 'Shape collection', paragraph: 'Geometry', text: 'First record.' },
    { id: 'product', title: 'Color collection', paragraph: 'Geometry', text: 'Second record.' },
  ];
  const ko = require('../../../../../lang/ko.json');
  const context = buildGraphSearchContext(result, 16000, (key) => ko[key] || key);
  assert.match(context.text, /\(연결된 문단\[Shape collection, Color collection\]\)/);
  assert.match(context.text, /Num: 3/);
  assert.equal(context.citations.length, 2);
  assert.match(context.text, /^## 인용된 본문 \(2\)$/m);
  assert.equal(context.truncated, false);
});

for (const kind of ['externalLink', 'connectedExternalLink']) {
  test(`${kind} names link to their address without a duplicate URL attribute`, () => {
    const url = 'https://example.com/docs/(v2)?q=a%20b&next=x#details';
    const item = { ...node('Sample 3 [guide]', '{"Num":3}'), kind, url };
    const result = searchResult([{ node: item, score: 90 }], []);
    result.plan.terms = ['sample', '3'];
    const context = buildGraphSearchContext(result);
    const { renderer, toToken } = load(
      require
        .resolve('@blacktokki/editor/package.json')
        .replace(/package\.json$/, 'src/lib/markdown.ts')
    );
    const hrefs = toToken(context.text)
      .flatMap((token) => token.children || [])
      .filter((token) => token.type === 'link_open')
      .map((token) => token.attrGet('href'));
    assert.ok(hrefs.includes(url.replace('(v2)', '%28v2%29')));
    assert.doesNotMatch(context.text, /^\s*- URL:/m);
    assert.match(context.text, /Num: \*\*`3`\*\*/);
    assert.match(
      renderer(context.text),
      /<a href="https:\/\/example.com[^"]+"><strong><code>Sample<\/code> <code>3<\/code> \[guide\]<\/strong><\/a>/
    );
    assert.equal(context.truncated, false);
    const bounded = buildGraphSearchContext(result, context.text.length + 16);
    assert.equal(included(bounded, 'node', item.id), true);
    assert.ok(bounded.text.length <= bounded.usage.limit);
  });
}

test('partial query highlights preserve case, Korean text and literal Markdown characters', () => {
  const value = 'sample SAMPLE 사전도형계획 a+b <script> `tick` [fake](https://example.com)';
  const item = node('preSample3-post', JSON.stringify({ Description: value }));
  const result = searchResult([{ node: item, score: 90 }], []);
  result.plan.terms = ['sample', 'sam', '도형', 'a+b', '<script>', '`tick`'];
  result.sources[0].text = value;
  const context = buildGraphSearchContext(result);
  const { renderer } = load(
    require
      .resolve('@blacktokki/editor/package.json')
      .replace(/package\.json$/, 'src/lib/markdown.ts')
  );
  const html = renderer(context.text);
  assert.match(html, /<strong>pre<code>Sample<\/code>3-post<\/strong>/);
  assert.match(
    html,
    /<strong><code>sample<\/code><\/strong> <strong><code>SAMPLE<\/code><\/strong>/
  );
  assert.match(html, /사전<strong><code>도형<\/code><\/strong>계획/);
  assert.match(html, /<strong><code>a\+b<\/code><\/strong>/);
  assert.match(html, /<strong><code>&lt;script&gt;<\/code><\/strong>/);
  assert.match(html, /<strong><code>`tick`<\/code><\/strong>/);
  assert.doesNotMatch(html, /<script|href="https:\/\/example.com"/);
  assert.equal(context.citations[0].text, value);
  assert.deepEqual(context.usage, { characters: context.text.length, limit: 16000 });
  result.plan.terms = ['', ''];
  assert.doesNotMatch(renderer(buildGraphSearchContext(result).text), /<code>/);
});
