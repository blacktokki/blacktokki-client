const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { compare, reviewIndex } = require('../compare-corpus.cjs');
const load = require('../../__tests__/loadTs.cjs');
const corpus = load('optimizer/corpus.ts');

test('candidate export and assistant review run without any model or network access', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-assistant-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const notebook = path.join(root, 'notebook');
  const output = path.join(root, 'candidates');
  const attempted = path.join(root, 'model-attempts.txt');
  const guard = path.join(root, 'deny-models.cjs');
  fs.mkdirSync(notebook);
  for (let i = 1; i <= 3; i++)
    fs.writeFileSync(path.join(notebook, `Dictionary ${i}.md`), '## Alpha\n\n## Beta');
  fs.writeFileSync(path.join(notebook, 'Work.md'), 'Alpha uses Beta.');
  fs.writeFileSync(
    guard,
    `const fs = require('node:fs');
const Module = require('node:module');
const original = Module._load;
const deny = (name) => {
  fs.appendFileSync(${JSON.stringify(attempted)}, name + '\\n');
  throw new Error('Evaluation must not load models or use the network: ' + name);
};
Module._load = function (name, ...args) {
  if (/huggingface|onnxruntime|relationModels|syntax-runtime|^(node:)?(https?|net|tls)$/.test(name)) deny(name);
  return original.call(this, name, ...args);
};
globalThis.fetch = () => deny('fetch');
`
  );
  const run = (script, args) => {
    const result = spawnSync(
      process.execPath,
      ['--require', guard, path.resolve(__dirname, '..', script), ...args],
      { encoding: 'utf8', timeout: 15000 }
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.equal(fs.existsSync(attempted), false, 'The tool attempted model or network access.');
    return JSON.parse(result.stdout);
  };
  const manifest = run('run-corpus.cjs', [notebook, output]);
  assert.equal(manifest.mode, 'extract');
  assert.equal(manifest.stage, 0);
  assert.equal(manifest.modelsExecuted, false);
  assert.equal(manifest.syntaxParser, 'unavailable');
  const predictions = JSON.parse(fs.readFileSync(path.join(output, 'predictions.json'), 'utf8'));
  assert.ok(predictions.length > 0);
  assert.equal(manifest.observations, predictions.length);
  assert.ok(predictions.every(({ validation }) => validation.verdict === 'unverified'));
  assert.ok(predictions.every(({ validation }) => !validation.scores));
  assert.equal(fs.existsSync(path.join(output, 'final-score-cache.json')), false);

  const config = path.join(root, 'review-config.json');
  fs.writeFileSync(
    config,
    JSON.stringify({
      notebookRoot: notebook,
      output: path.join(root, 'review'),
      datasets: [{ name: 'extracted', directory: output }],
    })
  );
  assert.equal(run('census.cjs', ['prepare', config]).judge, 'assistant');
  const report = run('census.cjs', ['report', config]);
  assert.equal(report.status, 'pending-review');
  assert.equal(report.reviewedCases, 0);
  assert.ok(report.pendingCases > 0);
  assert.equal(report.evaluationModelCalls, 0);
  assert.equal(report.downloadedJudgeModels, 0);

  const extractionConfig = path.join(root, 'extract-config.json');
  fs.writeFileSync(extractionConfig, JSON.stringify({ stage: 4 }));
  const higherStage = run('run-corpus.cjs', [
    notebook,
    path.join(root, 'stage-4'),
    path.resolve(__dirname, '../..'),
    'extract',
    extractionConfig,
  ]);
  assert.equal(higherStage.stage, 4);
  assert.equal(higherStage.modelsExecuted, false);
  assert.equal(higherStage.syntaxParser, 'unavailable');
});

test('removed model modes fail before reading the notebook or creating output', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-removed-modes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'output');
  for (const mode of ['infer', 'restore', 'incremental']) {
    const result = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '../run-corpus.cjs'), '/missing-notebook', output, '.', mode],
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Only candidate extraction is supported/);
    assert.equal(fs.existsSync(output), false);
  }
});

test('the configured merge budget reaches the production runner without limiting final validation', async () => {
  const { moduleLoader } = require('../run-corpus.cjs');
  const modules = moduleLoader({
    '@blacktokki/editor': { toMarkdown: (value) => value },
    '@react-native-async-storage/async-storage': {},
  });
  const analysis = modules(path.resolve(__dirname, '../../relationAnalysis.ts'));
  const notes = [1, 2, 3].map((i) => ({
    title: 'Dictionary ' + i,
    description: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name) => '## ' + name).join('\n'),
  }));
  notes.push({
    title: 'Work',
    description: 'Alpha uses Beta.\n\nGamma avoids Delta.\n\nAlpha consults Gamma.',
  });
  const result = await analysis.runInductiveRelationAnalysis(notes, {
    scope: 'arbitrary-budget-test',
    store: { load: async () => new Map(), save: async () => {}, prune: async () => {} },
    runtimeFactory: () => ({
      embed: async () => [1, 0],
      entailment: async () => ({ entailment: 0.05, neutral: 0.9, contradiction: 0.05 }),
    }),
    policy: { maxMergeNliChecks: 0 },
  });
  assert.equal(result.nliStats.mergeChecks, 0);
  assert.equal(result.validationProgress.completed, 3);
  assert.throws(
    () =>
      modules(path.resolve(__dirname, '../validation.ts')).relationPolicy({
        maxMergeNliChecks: -1,
      }),
    /budget/
  );
});

test('ordinal header recognition works with arbitrary languages and sparse column indices', async () => {
  for (const prefix of ['Feld ', '列', '필드 ']) {
    const content = await corpus.prepareRelationCorpus(
      [
        {
          title: 'Example',
          description: `| ${prefix}1 | ${prefix}2 | ${prefix}3 |\n|---|---|---|\n| Task role | | Person role |\n| Alpha job | | @Beta |`,
        },
      ],
      (x) => x
    );
    const blocks = content.get('Example').blocks;
    assert.deepEqual(
      blocks.map((x) => x.column),
      ['Task role', 'Person role']
    );
  }
});

test('long field labels and values do not depend on an undocumented character ceiling', async () => {
  const label = 'Arbitrary property '.repeat(8).trim();
  const content = await corpus.prepareRelationCorpus(
    [{ title: 'Example', description: label + ': Value' }],
    (x) => x
  );
  assert.equal(content.get('Example').blocks[0].field, label);
});

test('sparse captions may precede a schema; repeated schema rows remain headers', async () => {
  const headers = ['Column name', 'Entry key', 'Assigned person'];
  const schema = '| ' + headers.join(' | ') + ' |';
  const content = await corpus.prepareRelationCorpus(
    [
      {
        title: 'Generated table',
        description: [
          '| Feld 1 | Feld 2 | Feld 3 |',
          '|---|---|---|',
          '| Group caption | | |',
          schema,
          '| First task | REF-1 | @First |',
          schema,
          '| Second task | REF-2 | @Second |',
        ].join('\n'),
      },
      {
        title: 'Explicit schema',
        description: schema + '\n|---|---|---|\n| Other | REF-3 | @Other |',
      },
    ],
    (x) => x
  );
  const blocks = content.get('Generated table').blocks;
  assert.ok(blocks.some((b) => b.text === 'Group caption'));
  assert.ok(!blocks.some((b) => headers.includes(b.text)));
  assert.deepEqual(
    blocks.filter((b) => b.text.includes('task')).map((b) => b.column),
    [headers[0], headers[0]]
  );
});

test('a later full label-like record cannot replace the first complete data record', async () => {
  const content = await corpus.prepareRelationCorpus(
    [
      {
        title: 'Ordinary data',
        description: [
          '| Feld 1 | Feld 2 |',
          '|---|---|',
          '| REF-1 | @First |',
          '| Label one | Label two |',
        ].join('\n'),
      },
    ],
    (x) => x
  );
  const blocks = content.get('Ordinary data').blocks;
  assert.equal(blocks.length, 4);
  assert.ok(blocks.every((b) => b.unresolvedColumns));
});

test('sparse captions need independent header corroboration and cached documents can lose it', async () => {
  const note = {
    title: 'Sparse data',
    description:
      '| Feld 1 | Feld 2 |\n|---|---|\n| Group | |\n| First | Second |\n| REF-1 | @Other |',
  };
  const reference = {
    title: 'Header source',
    description: '| First | Second |\n|---|---|\n| REF-2 | @Another |',
  };
  const documents = new Map();
  const first = await corpus.prepareRelationCorpus([note, reference], (x) => x, documents);
  assert.ok(!first.get(note.title).blocks.some((b) => b.text === 'First'));
  const second = await corpus.prepareRelationCorpus([note], (x) => x, documents);
  assert.ok(second.get(note.title).blocks.some((b) => b.text === 'First'));
  assert.ok(second.get(note.title).blocks.every((b) => b.unresolvedColumns));
});

function fixture(root, name, observations) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  const validation = {
    basis: 'source',
    verdict: 'supported',
    scores: { entailment: 0.95, neutral: 0.03, contradiction: 0.02 },
  };
  const values = observations.map((observation) => ({
    observation,
    validation: { ...validation, evidence: observation.evidence, hypothesis: observation.evidence },
  }));
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  write('manifest.json', {
    notes: 7,
    notebookDigest: 'same',
    observations: values.length,
    elapsedSeconds: 1,
    nliStats: { validationChecks: values.length, mergeChecks: 0 },
  });
  write('predictions.json', values);
  write('result.json', {
    candidates: values.map((row, i) => ({
      id: String(i),
      template: row.observation.template,
      observations: [row.observation],
      validations: [row.validation],
    })),
  });
  return dir;
}
const observation = (i) => ({
  noteTitle: 'Arbitrary note ' + i,
  section: '',
  origin: 'sentence',
  source: 'Alpha ' + i,
  target: 'Beta',
  evidence: 'Alpha ' + i + ' uses Beta.',
  template: '{{E1}} uses {{E2}}.',
});

test('full comparison accepts changing corpus sizes and refuses missing or conflicting source judgments', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-compare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = fixture(root, 'before', [observation(1)]),
    second = fixture(root, 'after', [observation(1), observation(2), observation(3)]),
    review = path.join(root, 'review.json');
  fs.writeFileSync(
    review,
    JSON.stringify([
      { observation: observation(1), judgment: 'valid', reason: 'Explicit role in source.' },
    ])
  );
  assert.throws(() => compare(first, second, [review], path.join(root, 'out')), /Missing explicit/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'out/unreviewed.json'), 'utf8')).length,
    2
  );
  fs.writeFileSync(
    review,
    JSON.stringify(
      [1, 2, 3].map((i) => ({
        observation: observation(i),
        judgment: i === 3 ? 'cooccurrence' : 'valid',
      }))
    )
  );
  const summary = compare(first, second, [review], path.join(root, 'out'));
  assert.equal(summary.before.total, 1);
  assert.equal(summary.after.total, 3);
  assert.equal(summary.notes, 7);
  assert.equal(summary.after.supportedConfirmedValidity, 2 / 3);
  assert.equal(summary.sourceCoverage.missing, 0);
  const html = fs.readFileSync(path.join(root, 'out/comparison.html'), 'utf8');
  assert.equal((html.match(/class="case"/g) || []).length, 4);
  fs.writeFileSync(
    review,
    JSON.stringify([
      { observation: observation(1), judgment: 'valid' },
      { observation: observation(1), judgment: 'parse-error' },
    ])
  );
  assert.throws(() => reviewIndex([review]), /Conflicting/);
});

test('full comparison rejects changed source corpora before reporting quality', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-digest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = fixture(root, 'before', []),
    second = fixture(root, 'after', []);
  const manifest = JSON.parse(fs.readFileSync(path.join(second, 'manifest.json'), 'utf8'));
  manifest.notebookDigest = 'different';
  fs.writeFileSync(path.join(second, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => compare(first, second, [], path.join(root, 'out')), /inputs differ/);
});
