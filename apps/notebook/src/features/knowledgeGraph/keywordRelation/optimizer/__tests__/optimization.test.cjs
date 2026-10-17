const MarkdownIt = require('markdown-it');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Turndown = require('turndown');
const { tables } = require('turndown-plugin-gfm');

const load = require('../../__tests__/loadTs.cjs');
const markdown = new MarkdownIt();
const turndown = new Turndown({ headingStyle: 'atx' });
turndown.use(tables);
const editor = { toMarkdown: (html) => turndown.turndown(html) };
const corpus = load('optimizer/corpus.ts');
const validation = load('optimizer/validation.ts');
const evaluation = load('optimizer/evaluation.ts');
const discovery = load('relationDiscovery.ts', { '@blacktokki/editor': editor });
const supported = { entailment: 0.95, neutral: 0.03, contradiction: 0.02 };
const note = (title, description) => ({ title, description });
const dictionary = (names) =>
  ['Dictionary One', 'Dictionary Two', 'Dictionary Three'].map((title) =>
    note(title, names.map((name) => `## ${name}`).join('\n'))
  );
const discover = (notes, names, options = {}) =>
  discovery.discoverInductiveRelations([...notes, ...dictionary(names)], {
    runtime: { embed: async () => [], entailment: async () => assert.fail('no NLI expected') },
    maxMergeNliChecks: 0,
    ...options,
  });

test('navigation learns repeated ancestry roles without a separator vocabulary, including plain captions', async () => {
  const notes = [note('Root', ''), note('Root/Branch', '')];
  for (const [index, separator] of [' > ', ' / ', ' ⇢ ', '\n', ' 🧭 ', ' : ', ' — '].entries())
    notes.push(
      note(
        `Root/Branch/Child ${index}`,
        `[Root](../../Root.md)${separator}[Branch](../Branch.md)\n\nRoot improves Branch.`
      )
    );
  notes.push(note('Root/Branch/Plain One', 'Root ⟿ Branch\n\nRoot improves Branch.'));
  notes.push(note('Root/Branch/Plain Two', 'Root\nBranch\n\nRoot improves Branch.'));
  const prepared = await corpus.prepareRelationCorpus(notes, editor.toMarkdown);
  for (const item of notes.slice(2)) {
    const content = prepared.get(item.title);
    assert.equal(content.excludedRegions.length, 1, item.title);
    assert.deepEqual(
      content.blocks.map((block) => block.text),
      ['Root improves Branch.']
    );
  }
  assert.equal(
    prepared.get('Root/Branch/Plain One').keywordSources.some((source) => source.kind === 'link'),
    false,
    'plain captions never become links'
  );
});

test('repetition alone never removes processes, foreign references, statements or uncorroborated navigation', async () => {
  const sources = [
    note('Root', ''),
    note('Root/Branch', ''),
    note('Foreign', ''),
    note(
      'Root/Branch/One',
      '[Root](../../Root.md) > [Branch](../Branch.md)\n\nRoot → Branch → Finish'
    ),
    note(
      'Elsewhere/Two',
      '[Root](../Root.md) > [Branch](../Root/Branch.md)\n\nRoot → Branch → Finish'
    ),
    note('Root/Branch/Three', '[Root](../../Root.md) improves [Branch](../Branch.md).'),
  ];
  const prepared = await corpus.prepareRelationCorpus(sources, editor.toMarkdown);
  for (const content of prepared.values()) assert.deepEqual(content.excludedRegions, []);
});

test('navigation provenance remains and removing corroborating documents restores the uncertain region', async () => {
  const memory = discovery.createRelationDiscoveryMemory();
  const sources = [
    note('Root', ''),
    note('Root/Branch', ''),
    note('Root/Branch/One', '[Root](../../Root.md) > [Branch](../Branch.md)'),
    note('Root/Branch/Two', '[Root](../../Root.md) / [Branch](../Branch.md)'),
  ];
  const result = await discovery.extractRelationEntities(
    [...sources, ...dictionary(['Root', 'Branch'])],
    undefined,
    undefined,
    memory
  );
  assert.ok(result.details.root.sources.some((source) => source.kind === 'link'));
  assert.equal(memory.notes.get('Root/Branch/One').blocks.length, 0);
  await discovery.extractRelationEntities(
    [...sources.slice(0, -1), ...dictionary(['Root', 'Branch'])],
    undefined,
    undefined,
    memory
  );
  assert.equal(memory.notes.get('Root/Branch/One').blocks.length, 1);
});

test('AST decoding preserves nested escaped link titles and code never becomes a keyword', async () => {
  const result = await discover(
    [note('One', '[\\[업무\\] Alpha](../Alpha%20%28v1%29.md) uses **Beta**.\n\n`**Secret**`')],
    ['[업무] Alpha', 'Beta']
  );
  assert.equal(result.observationCount, 1);
  assert.equal(result.candidates[0].observations[0].source, '[업무] Alpha');
  assert.doesNotMatch(result.candidates[0].template, /%20|\.md|\\\[/);
  assert.ok(!result.entityExtraction.entities.some((entity) => entity.text === 'Secret'));
});

test('metadata-matched repeated self-reference footers are excluded without reserving their link labels', async () => {
  const notes = ['One', 'Two', 'Three'].map((title) =>
    note(
      title,
      `---\norigin: "https://example.test/${title}"\nidentity: "${title}"\n---\n\n# ${title}\n\n[Arbitrary label](https://example.test/${title})`
    )
  );
  const prepared = await corpus.prepareRelationCorpus(notes, editor.toMarkdown);
  for (const content of prepared.values()) {
    assert.equal(content.excludedRegions.length, 1);
    assert.ok(!content.keywordSources.some((source) => source.keyword === 'Arbitrary label'));
  }
});

test('table subjects retain the full task and support several people without Cartesian noun links', async () => {
  const body =
    '| Task role | People role |\n| --- | --- |\n| RabbitMQ cluster recovery | @Alice / @Bob |\n| PostgreSQL data migration | @Alice |';
  const result = await discover([note('Work', body)], ['RabbitMQ', 'PostgreSQL', '@Alice', '@Bob']);
  const rows = result.candidates.flatMap((candidate) => candidate.observations);
  assert.deepEqual(
    rows.map((row) => [row.source, row.target]),
    [
      ['RabbitMQ cluster recovery', '@Alice'],
      ['RabbitMQ cluster recovery', '@Bob'],
      ['PostgreSQL data migration', '@Alice'],
    ]
  );
  const anchor = result.entityExtraction.entities.find(
    (entity) => entity.text === 'RabbitMQ cluster recovery'
  );
  assert.ok(rows.every((row) => row.sourceType === '{{TABLE_RECORD}}'));
  assert.equal(anchor.type, '{{TABLE_RECORD}}');
  assert.equal(anchor.noteCount, 1);
  assert.equal(result.entityExtraction.details[anchor.key].sources[0].kind, 'table-cell');
  assert.equal(anchor.mentionCount, 1, 'multiple assignees do not multiply one task occurrence');
});

test('table record prefixes classify entities and relationship inputs and refresh on cached note removal', async () => {
  const memory = discovery.createRelationDiscoveryMemory();
  const notes = ['개발', '운영', '배포'].map((name) =>
    note(
      `Work ${name}`,
      `| Task role | People role |\n| --- | --- |\n| 업무-${name} 작업 | @Alice |`
    )
  );
  const check = async (sources, expected) => {
    const result = await discover(sources, ['업무', '@Alice'], {
      memory,
      runtime: {
        embed: async () => [1, 0],
        entailment: async () => assert.fail('no NLI expected'),
      },
    });
    const records = result.entityExtraction.entities.filter((entity) =>
      entity.type?.includes('{{TABLE_RECORD}}')
    );
    assert.equal(records.length, sources.length);
    assert.ok(records.every((entity) => entity.type === expected));
    const rows = result.candidates.flatMap((candidate) => candidate.observations);
    assert.equal(rows.length, sources.length);
    assert.ok(rows.every((row) => row.sourceType === expected));
    assert.deepEqual(
      new Set(rows.map((row) => row.source)),
      new Set(records.map((entity) => entity.text))
    );
    assert.ok(result.inputPatterns.every((pattern) => pattern.sourceType === expected));
    return result;
  };
  await check(notes, '업무-{{TABLE_RECORD}}');
  const reduced = await check(notes.slice(0, 2), '{{TABLE_RECORD}}');
  assert.ok(
    reduced.discoveryStats.reusedNotes >= 2,
    'unchanged notes reuse their raw observations'
  );
  await check(notes, '업무-{{TABLE_RECORD}}');
});

test('wide-table candidates retain all potential roles while unrelated prose cells remain contextual evidence', async () => {
  const body =
    '| 任意 A | 任意 B | 任意 C |\n| --- | --- | --- |\n| Alpha task | Alice | Active |\n| Beta task | Alice | Active |\n\n| Left | Right |\n| --- | --- |\n| Issue-101 / Issue-102 | Issue-999 needs reassignment |';
  const result = await discover(
    [note('Work', body)],
    ['Alpha', 'Beta', 'Alice', 'Active', 'Issue-101', 'Issue-102', 'Issue-999']
  );
  const rows = result.candidates.flatMap((candidate) => candidate.observations);
  assert.equal(rows.filter((row) => row.source.endsWith('task')).length, 4);
  assert.ok(rows.some((row) => row.source === 'Alice'));
  assert.ok(result.contextualEvidence.some((row) => row.evidence.includes('Issue-999')));
  assert.ok(!rows.some((row) => row.source === 'Issue-999'));
  assert.ok(rows.every((row) => row.schema.location));
});

test('ambiguous table keys remain candidates without being semantically accepted', async () => {
  const result = await discover(
    [note('Work', '| RoleA | RoleB | RoleC |\n| --- | --- | --- |\n| Alpha | Beta | Gamma |')],
    ['Alpha', 'Beta', 'Gamma']
  );
  assert.equal(result.observationCount, 6);
  assert.equal(result.contextualEvidence.length, 1);
  validation.prepareResultValidations(result, validation.relationPolicy());
  for (const candidate of result.candidates)
    for (const value of candidate.validations) {
      assert.equal(value.eligibility.status, 'unresolved');
      assert.equal(validation.optimizedValidationVerdict(value), 'uncertain');
    }
});

test('document anchoring and repeated-mention admission from excluded step 4 remain unchanged', async () => {
  const result = await discover(
    [note('Unique meeting', '참석자: Alice\n\nAlice uses Beta and Alice repeats Beta.')],
    ['Alice', 'Beta']
  );
  assert.equal(result.observationCount, 0);
  assert.ok(!result.entityExtraction.entities.some((entity) => entity.text === 'Unique meeting'));
});

test('copying a source to another note cannot manufacture held-out validation or independent votes', async () => {
  const result = await discover(
    [note('One', 'Alpha uses Beta.'), note('Two', 'Alpha uses Beta.')],
    ['Alpha', 'Beta', 'Gamma']
  );
  const rows = result.candidates[0].validations;
  assert.ok(rows.every((row) => row.basis === 'reconstruction' && !row.heldOut));
  const rank = validation.independentSupportRank(
    rows.map((row) => ({ ...row, scores: supported, verdict: 'supported' }))
  );
  assert.equal(rank.supportCount, 0);
  assert.equal(rank.confidence, 0);
});

test('duplicate model inputs count once while distinct supported claims increase rank', () => {
  const row = {
    evidence: 'Work: Alpha; Owner: Beta',
    hypothesis: 'Alpha has owner Beta.',
    heldOut: false,
    verdict: 'supported',
    scores: supported,
    basis: 'source',
  };
  const one = validation.independentSupportRank([row]);
  assert.deepEqual(validation.independentSupportRank(Array(100).fill(row)), one);
  const other = {
    ...row,
    evidence: 'Work: Gamma; Owner: Beta',
    hypothesis: 'Gamma has owner Beta.',
  };
  assert.ok(validation.independentSupportRank([row, other]).confidence > one.confidence);
});

test('unrelated inventory no longer creates a counterfactual or proves a copied claim', async () => {
  const result = await discover([note('One', 'Alpha uses Beta.')], ['Alpha', 'Beta', 'Gamma']);
  validation.prepareResultValidations(result, validation.relationPolicy());
  const row = result.candidates[0].validations[0];
  assert.equal(row.control, undefined);
  row.scores = supported;
  assert.equal(validation.optimizedValidationVerdict(row), 'uncertain');
  assert.equal(row.decisionReason, 'reconstruction-only');
});

test('full review export is deterministic and keeps both a note and copied claims in one split', async () => {
  const result = await discover(
    [note('One', 'Alpha uses Beta.'), note('Two', 'Alpha uses Beta.\n\nGamma avoids Delta.')],
    ['Alpha', 'Beta', 'Gamma', 'Delta']
  );
  const rows = evaluation.createRelationReviewSet(result);
  assert.deepEqual(evaluation.createRelationReviewSet(result), rows);
  assert.equal(new Set(rows.map((row) => row.family)).size, 1);
  assert.equal(new Set(rows.map((row) => row.split)).size, 1);
  assert.ok(rows.every((row) => row.judgment === null));
});

test('HTML and Markdown parsing produce equivalent structural observations', async () => {
  const body = '## Work\n\n| Subject | People |\n| --- | --- |\n| Alpha task | Alice |';
  const first = await discover([note('One', body)], ['Alpha', 'Alice']);
  const second = await discover([note('One', markdown.render(body))], ['Alpha', 'Alice']);
  assert.deepEqual(first.candidates, second.candidates);
});

test('counterfactuals prefer another observed value of the same induced role', async () => {
  const result = await discover(
    [note('One', 'Alpha uses Beta.'), note('Two', 'Gamma uses Delta.')],
    ['Alpha', 'Beta', 'Gamma', 'Delta', 'AAA']
  );
  validation.prepareResultValidations(result, validation.relationPolicy());
  const first = result.candidates[0].validations.find((row) => row.noteTitle === 'One');
  assert.equal(first.control.hypothesis, 'Alpha uses Delta.');
});

test('a repeated metadata-related URL without corroborating identity is preserved as provenance', async () => {
  const sources = ['One', 'Two', 'Three'].map((title) =>
    note(
      title,
      `---\nrelated: "https://example.test/${title}"\n---\n\n[Reference label](https://example.test/${title})`
    )
  );
  const prepared = await corpus.prepareRelationCorpus(sources, editor.toMarkdown);
  for (const item of prepared.values()) {
    assert.deepEqual(item.excludedRegions, []);
    assert.ok(item.keywordSources.some((source) => source.keyword === 'Reference label'));
  }
});
