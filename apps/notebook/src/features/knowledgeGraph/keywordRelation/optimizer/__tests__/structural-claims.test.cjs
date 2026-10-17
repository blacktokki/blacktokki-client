const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');
const { moduleLoader } = require('../run-corpus.cjs');
const editor = { toMarkdown: (value) => value };
const discovery = load('relationDiscovery.ts', { '@blacktokki/editor': editor });
const validation = load('optimizer/validation.ts');
const note = (title, description) => ({ title, description });
const dictionary = (names) =>
  [1, 2, 3].map((n) => note('Dictionary ' + n, names.map((name) => '## ' + name).join('\n\n')));
const extract = (notes, names, memory) =>
  discovery.discoverInductiveRelations([...notes, ...dictionary(names)], {
    memory,
    runtime: { embed: async () => [], entailment: async () => assert.fail('no inference') },
    maxMergeNliChecks: 0,
  });
const observations = (result) => result.candidates.flatMap((candidate) => candidate.observations);

test('body examples and mixed roles cannot replace an entire field value with one noun', async () => {
  const result = await extract(
    [
      note(
        'Alpha',
        'LLM: Beta 기반 · 참조: Gamma 제품 페이지\n\n설명: Beta로 여러 Gamma를 처리\n\n보안 조건(예: Gamma 외부 유출 금지)'
      ),
    ],
    ['Alpha', 'Beta', 'Gamma']
  );
  assert.equal(observations(result).filter((item) => item.origin === 'field').length, 0);
  assert.ok(
    result.entityExtraction.details.beta.sources.length > 0,
    'keyword provenance survives deferral'
  );
});

test('whole document-reference lists preserve qualified names and reject partial names', async () => {
  const result = await extract(
    [note('Alpha', '관련 문서: Beta, Nonqualified title, Gamma')],
    ['Alpha', 'Beta', 'Gamma']
  );
  assert.deepEqual(
    observations(result)
      .map((item) => item.target)
      .sort(),
    ['Beta', 'Gamma']
  );
});

test('a rare current document owns single linked values in any observed role', async () => {
  const result = await extract(
    [
      note(
        'Folder/Single occurrence',
        'Arbitrary role: [Alpha](./alpha.md)\n\n별도 역할: [Beta](./beta.md) [Gamma](./gamma.md)'
      ),
      note('Other/Qualified', 'Arbitrary role: [Alpha](./alpha.md) after review'),
      note('Other/Unmarked', 'Arbitrary role: Alpha'),
    ],
    ['Alpha', 'Beta', 'Gamma']
  );
  const fields = observations(result).filter((item) => item.origin === 'field');
  assert.equal(fields.length, 3);
  assert.ok(fields.every((item) => item.source === 'Single occurrence'));
  assert.deepEqual(fields.map((item) => item.target).sort(), ['Alpha', 'Beta', 'Gamma']);
  const owner = result.entityExtraction.entities.find((item) => item.text === 'Single occurrence');
  assert.equal(owner.noteCount, 1);
  for (const value of result.candidates.flatMap((candidate) => candidate.validations)) {
    assert.equal(value.verification.kind, 'record-membership');
    assert.equal(validation.optimizedValidationVerdict(value), 'supported');
  }
});

test('an unknown explicit link cannot hide complete known values in a field list', async () => {
  const result = await extract(
    [
      note(
        'Alpha',
        'Witnesses: [Beta](./beta.md) [Unknown Name](./unknown.md) [Gamma](./gamma.md)'
      ),
    ],
    ['Alpha', 'Beta', 'Gamma']
  );
  const rows = observations(result).filter((item) => item.origin === 'field');
  assert.deepEqual(rows.map((item) => item.target).sort(), ['Beta', 'Gamma']);
  for (const candidate of result.candidates)
    for (const value of candidate.validations) {
      assert.equal(value.verification.kind, 'record-membership');
      assert.equal(validation.optimizedValidationVerdict(value), 'supported');
      assert.equal(value.scores, undefined);
    }
});

test('link boundaries cannot discard qualifiers, prose or a different plain occurrence', async () => {
  const result = await extract(
    [
      note('Alpha', 'Role: Beta [Beta](./beta.md) [Gamma](./gamma.md)'),
      note('Omega', 'Role: [Beta](./beta.md) after review [Gamma](./gamma.md)'),
      note('Delta', 'Role: [Beta](./beta.md) [Gamma](./gamma.md) pending approval'),
    ],
    ['Alpha', 'Omega', 'Delta', 'Beta', 'Gamma']
  );
  assert.equal(observations(result).filter((item) => item.origin === 'field').length, 0);
});

test('link lists preserve escaped names, Unicode and independent fields in a single line', async () => {
  const result = await extract(
    [
      note(
        'Alpha',
        '역할: [B\\[eta\\]](./b.md) [Gamma](./g.md); 별도: [Delta](./d.md) [Other](./o.md)'
      ),
    ],
    ['Alpha', 'B[eta]', 'Gamma', 'Delta']
  );
  const rows = observations(result).filter((item) => item.origin === 'field');
  assert.deepEqual(rows.map((item) => [item.target, item.evidence.split('\n')[1]]).sort(), [
    ['B[eta]', '역할: B[eta]'],
    ['Delta', '별도: Delta'],
    ['Gamma', '역할: Gamma'],
  ]);
});

test('a rare document owns explicit linked field entries without turning unlinked body text into links', async () => {
  const result = await extract(
    [
      note(
        'Unique record',
        'Witnesses: [Beta](./b.md) [Unknown Name](./unknown.md) [Gamma](./g.md)\n\nUnique record met Beta.'
      ),
    ],
    ['Beta', 'Gamma']
  );
  const rows = observations(result).filter((item) => item.origin === 'field');
  assert.deepEqual(rows.map((item) => [item.source, item.target]).sort(), [
    ['Unique record', 'Beta'],
    ['Unique record', 'Gamma'],
  ]);
  const owner = result.entityExtraction.entities.find((item) => item.text === 'Unique record');
  assert.ok(owner);
  assert.ok(
    result.entityExtraction.details[owner.key].sources.every((item) => item.kind === 'title')
  );
  assert.equal(observations(result).filter((item) => item.origin === 'sentence').length, 0);
});

test('field hypotheses retain the recorded role without the legacy 가다 suffix', () => {
  const observation = {
    noteTitle: '문서',
    section: '',
    source: '문서',
    target: '서버',
    sourceType: null,
    targetType: null,
    evidence: '문서\n대상: 서버',
    origin: 'field',
  };
  const result = validation.prepareRelationValidation(
    observation,
    '{{E1}}의 대상은 {{E2}}이다.',
    observation,
    [{ text: '노트', type: null }],
    (template, value) =>
      template.replace('{{E1}}', value.source).replace('{{E2}}이', value.target + '가')
  );
  validation.prepareResultValidations(
    { candidates: [{ observations: [observation], validations: [result] }] },
    validation.relationPolicy()
  );
  assert.equal(result.hypothesis, '문서\n대상: 서버.');
  assert.equal(result.control, undefined);
  assert.equal(result.verification.membership, true);
});

test('an identical quotation cannot become a final neutral or contradiction without relation evidence', () => {
  const observation = {
    noteTitle: 'Source',
    section: '',
    source: 'Alpha',
    target: 'Beta',
    sourceType: null,
    targetType: null,
    origin: 'sentence',
    evidence: 'Alpha sends requests to Beta.',
    template: '{{E1}} sends requests to {{E2}}.',
  };
  for (const scores of [
    { entailment: 0.01, neutral: 0.98, contradiction: 0.01 },
    { entailment: 0.01, neutral: 0.01, contradiction: 0.98 },
  ]) {
    const value = validation.prepareRelationValidation(
      observation,
      observation.template,
      observation,
      [],
      (template, item) => template.replace('{{E1}}', item.source).replace('{{E2}}', item.target)
    );
    value.scores = scores;
    assert.equal(value.verification.kind, 'source-reconstruction');
    assert.equal(validation.optimizedValidationVerdict(value), 'uncertain');
    assert.equal(value.decisionReason, 'reconstruction-only');
    assert.strictEqual(value.scores, scores);
  }
});

test('a corroborated ordinal schema row restores real roles; ambiguous ordinals stay contextual', async () => {
  const result = await extract(
    [
      note(
        'Work',
        '| 열 1 | 열 2 |\n| --- | --- |\n| Task role | Person role |\n| Alpha work | @Beta |'
      ),
      note('Unknown', '| 열 1 | 열 2 |\n| --- | --- |\n| Alpha-123 | Beta |'),
      note('Words only', '| 열 1 | 열 2 |\n| --- | --- |\n| Alpha | Beta |\n| Gamma | Delta |'),
    ],
    ['Alpha', 'Beta', '@Beta']
  );
  const rows = observations(result);
  assert.ok(
    rows.some(
      (row) =>
        row.template === 'Task role: {{E1}}; Person role: {{E2}}' && row.source === 'Alpha work'
    )
  );
  assert.ok(rows.some((row) => row.schema.structure.unresolvedHeaders));
  assert.ok(result.contextualEvidence.some((row) => row.noteTitle === 'Unknown'));
});

test('compound cell values are held intact, while explicit person lists and checklist roles survive', async () => {
  const result = await extract(
    [
      note(
        'Work',
        '| Task | People |\n| --- | --- |\n| Alpha task | (Beta Gamma) |\n| Other Alpha task | @Alice / @Bob |\n| Another Alpha task | - [x] @Alice |'
      ),
    ],
    ['Alpha', 'Beta', 'Gamma', '@Alice', '@Bob']
  );
  const rows = observations(result);
  assert.equal(rows.length, 3);
  assert.ok(!rows.some((row) => ['Beta', 'Gamma'].includes(row.target)));
  assert.ok(result.contextualEvidence.some((row) => row.evidence.includes('(Beta Gamma)')));
});

test('self-file macro links are excluded without an exporter keyword or field-name list', async () => {
  const result = await extract(
    [note('Alpha', '[Anything: Beta](Alpha.md)'), note('Other', '[Different: Gamma](Other.md)')],
    ['Alpha', 'Beta', 'Gamma']
  );
  assert.equal(result.observationCount, 0);
});

test('identifier boundaries and questions are structural filters; prose is not a Korean word-list decision', async () => {
  const result = await extract(
    [
      note(
        'Work',
        'task-server는 역할을 전송한다.\n\n메신저_기능.png\n\n도메인은 신규 명령이 필요하고, 계정은 기존 명령을 사용한다.\n\n메신저가 DB에 접근할 수 있는가?\n\n메신저는 DB에 접근할 수 없다.'
      ),
    ],
    ['task', '역할', '메신저', '기능', '도메인', '계정', 'DB']
  );
  const rows = observations(result);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.evidence.includes('접근할 수 없다')));
  assert.ok(rows.some((row) => row.evidence.includes('도메인은 신규')));
  assert.ok(rows.every((row) => !row.evidence.endsWith('?')));
  assert.ok(
    result.candidates.every((candidate) =>
      candidate.validations.every((row) => row.verdict === 'unverified')
    )
  );
});

test('dictionary changes reconsider deferred fields from original blocks', async () => {
  const memory = discovery.createRelationDiscoveryMemory();
  const notes = [note('Alpha', '대상: Beta')];
  const first = await extract(notes, ['Alpha'], memory);
  assert.equal(first.observationCount, 0);
  const second = await extract(notes, ['Alpha', 'Beta'], memory);
  assert.equal(second.observationCount, 1);
  assert.equal(observations(second)[0].target, 'Beta');
});

test('policy revision invalidates restored groups without changing model/input score identity', () => {
  assert.equal(validation.relationPolicy().extractionRevision, 'reviewed-claims-v9');
  assert.equal(
    validation.relationPolicy({ extractionRevision: 'old' }).extractionRevision,
    'reviewed-claims-v9'
  );
});

test('exhaustive review keeps every observation beyond the old 200-case sample', () => {
  const evaluation = load('optimizer/evaluation.ts');
  const result = {
    candidates: [
      {
        observations: Array.from({ length: 257 }, (_, i) => ({
          noteTitle: 'Note ' + i,
          section: '',
          origin: 'sentence',
          template: '{{E1}} uses {{E2}}.',
          source: 'Alpha ' + i,
          target: 'Beta',
          evidence: 'Alpha ' + i + ' uses Beta.',
        })),
        validations: Array(257).fill(undefined),
      },
    ],
  };
  const rows = evaluation.createRelationReviewSet(result, {
    table: Infinity,
    sentence: Infinity,
    field: Infinity,
  });
  assert.equal(rows.length, 257);
  assert.equal(new Set(rows.map((row) => row.id)).size, 257);
  assert.ok(rows.every((row) => row.judgment === null));
});

test('the production runner persists completed batches, resumes, and reuses all unchanged final inputs', async () => {
  const path = require('node:path');
  const modules = moduleLoader({
    '@blacktokki/editor': editor,
    '@react-native-async-storage/async-storage': {},
  });
  const feature = path.resolve(__dirname, '../..');
  const checkpoint = modules(path.join(feature, 'relationCheckpoint.ts'));
  const analysis = modules(path.join(feature, 'relationAnalysis.ts'));
  const records = new Map();
  const entries = {
    read: async (keys) => keys.map((key) => records.get(key) || null),
    write: async (items) => items.forEach(([key, value]) => records.set(key, value)),
    remove: async (keys) => keys.forEach((key) => records.delete(key)),
    keys: async (prefix) => [...records.keys()].filter((key) => key.startsWith(prefix)),
  };
  const store = checkpoint.createRelationNliCacheStore(entries);
  const notes = [
    ...dictionary(['Alpha', 'Beta', 'Gamma', 'Delta']),
    note('Work', '| Task | Person |\n| --- | --- |\n| Alpha work | Beta |\n| Gamma work | Delta |'),
  ];
  const neutral = { entailment: 0.05, neutral: 0.9, contradiction: 0.05 };
  const controller = new AbortController();
  let calls = 0;
  const options = {
    scope: 'test-local',
    store,
    batchSize: 1,
    maxRetries: 0,
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async () => {
        calls++;
        return neutral;
      },
    }),
  };
  await assert.rejects(
    analysis.runInductiveRelationAnalysis(notes, {
      ...options,
      signal: controller.signal,
      onBatch: () => controller.abort(),
    }),
    { name: 'AbortError' }
  );
  assert.equal(records.size, 1);
  const completedCalls = calls;
  const resumed = await analysis.runInductiveRelationAnalysis(notes, options);
  assert.equal(resumed.validationProgress.completed, 2);
  assert.equal(calls - completedCalls, 1);
  calls = 0;
  const unchanged = await analysis.runInductiveRelationAnalysis(notes, options);
  assert.equal(calls, 0);
  assert.equal(unchanged.patternChanges.added, 0);
  assert.equal(unchanged.patternChanges.removed, 0);
  assert.ok(
    [...records.values()].every((value) => !value.includes('Alpha') && !value.includes('Beta'))
  );
  const edited = notes.map((item) =>
    item.title === 'Work'
      ? { ...item, description: item.description.replace('Alpha work', 'Alpha revised work') }
      : item
  );
  await analysis.runInductiveRelationAnalysis(edited, options);
  assert.equal(calls, 1, 'only the changed evidence/hypothesis needs final NLI');
});
