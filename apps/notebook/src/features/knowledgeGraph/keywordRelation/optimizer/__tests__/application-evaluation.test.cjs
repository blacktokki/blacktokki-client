const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const { runApplicationEvaluation } = require('../application-evaluation.cjs');
const { moduleLoader } = require('../run-corpus.cjs');

test('application evaluation keeps the real application verdict and never invokes the alternate runner', async () => {
  const sources = moduleLoader({ '@react-native-async-storage/async-storage': {} });
  const modelCalls = [];
  const options = {
    scope: 'test:application-evaluation',
    store: { load: async () => new Map(), save: async () => {}, prune: async () => {} },
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async (premise, hypothesis) => {
        modelCalls.push([premise, hypothesis]);
        return { entailment: 0.01, neutral: 0.98, contradiction: 0.01 };
      },
    }),
    maxRetries: 0,
  };
  const notes = [1, 2, 3].map((i) => ({
    title: 'Dictionary ' + i,
    description: '## Alpha\n\n## Beta',
  }));
  notes.push({ title: 'Alpha', description: 'Owner role: Beta' });
  const entrypoint = path.resolve(__dirname, '../../relationAnalysis.ts');
  const engine = sources(entrypoint);
  const direct = await engine.runInductiveRelationAnalysis(notes, options);
  engine.clearRelationAnalysisMemory(options.scope);
  const load = (file) => {
    assert.notEqual(path.resolve(file), path.resolve(__dirname, '../analysis.ts'));
    return sources(file);
  };
  load.sources = sources.sources;
  const capture = await runApplicationEvaluation(notes, options, load);
  assert.equal(capture.manifest.runner, 'application');
  assert.equal(capture.manifest.entrypoint, entrypoint);
  assert.equal(capture.manifest.observations, 1);
  assert.equal(capture.manifest.finalized, true);
  assert.deepEqual(
    capture.result.candidates.map((candidate) => candidate.validations),
    direct.candidates.map((candidate) => candidate.validations)
  );
  assert.strictEqual(
    capture.predictions[0].validation,
    capture.result.candidates[0].validations[0]
  );
  assert.equal(capture.predictions[0].validation.verdict, 'supported');
  assert.equal(capture.predictions[0].validation.scores.neutral, 0.98);
  assert.equal(capture.predictions[0].validation.verification.kind, 'record-membership');
  assert.ok(modelCalls.length > 0);
});

test('an application inference failure remains an unverified result with its original error', async () => {
  const load = moduleLoader({ '@react-native-async-storage/async-storage': {} });
  const notes = [1, 2, 3].map((i) => ({
    title: 'Dictionary ' + i,
    description: '## Alpha\n\n## Beta',
  }));
  notes.push({ title: 'Work', description: 'Alpha visits Beta.' });
  const capture = await runApplicationEvaluation(
    notes,
    {
      scope: 'test:application-inference-error',
      runtimeFactory: () => ({
        embed: async () => [],
        entailment: async () => {
          throw new Error('Synthetic inference failure');
        },
      }),
      maxRetries: 0,
    },
    load
  );
  assert.equal(capture.predictions.length, 1);
  assert.equal(capture.predictions[0].validation.verdict, 'unverified');
  assert.equal(capture.predictions[0].validation.error, 'Synthetic inference failure');
  assert.equal(capture.manifest.validationProgress.failed, 1);
  assert.equal(capture.manifest.finalized, false);
});

test('completed validation does not conceal an incomplete application discovery', async () => {
  const load = moduleLoader({ '@react-native-async-storage/async-storage': {} });
  const notes = [1, 2, 3].map((i) => ({
    title: 'Dictionary ' + i,
    description: '## Alpha\n\n## Beta',
  }));
  notes.push({ title: 'Alpha', description: 'Role: Beta' });
  const capture = await runApplicationEvaluation(
    notes,
    {
      scope: 'test:application-discovery-error',
      runtimeFactory: () => ({
        embed: async () => {
          throw new Error('Synthetic embedding failure');
        },
        entailment: async () => ({ entailment: 0.01, neutral: 0.98, contradiction: 0.01 }),
      }),
      maxRetries: 0,
    },
    load
  );
  assert.equal(capture.manifest.validationProgress.status, 'completed');
  assert.equal(capture.manifest.validationProgress.failed, 0);
  assert.equal(capture.manifest.discoveryIncomplete, true);
  assert.equal(capture.manifest.finalized, false);
});

test('the actual application applies an in-memory fitted role policy to its final table decisions', async () => {
  const load = moduleLoader({ '@react-native-async-storage/async-storage': {} });
  const editor = load(
    path.join(
      path.dirname(require.resolve('@blacktokki/editor/package.json')),
      'src/lib/markdown.ts'
    )
  );
  const notes = [
    ...[1, 2, 3].map((i) => ({
      title: 'Dictionary ' + i,
      description: '## Record0000\n\n## Beta',
    })),
    { title: 'Work', description: '| Event | Steward |\n| --- | --- |\n| Record0000 | @Beta |' },
  ].map((note) => ({ ...note, description: editor.renderer(note.description) }));
  const options = {
    scope: 'test:application-reviewed-policy',
    maxRetries: 0,
    policy: { maxMergeNliChecks: 0 },
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async () => ({ entailment: 0.01, neutral: 0.98, contradiction: 0.01 }),
    }),
  };
  const before = await runApplicationEvaluation(notes, options, load);
  const query = before.predictions.find((r) => r.observation.origin === 'table');
  assert.ok(query);
  assert.equal(query.validation.verdict, 'uncertain');
  assert.equal(query.validation.eligibility.reason, 'unreviewed-table-roles');
  const reviews = Array.from({ length: 160 }, (_, i) => {
    const observation = structuredClone(query.observation);
    observation.evidence = observation.evidence.replace('0000', String(i).padStart(4, '0'));
    if (i >= 80) {
      observation.schema.structure.sourcePosition += 2;
      observation.evidence += '!';
    }
    return {
      id: String(i),
      family: 'Family ' + i,
      split: 'calibration',
      reviewer: 'assistant',
      observation,
      judgment: i < 80 ? 'valid' : 'parse-error',
    };
  });
  const roleEvidence = load(path.resolve(__dirname, '../role-evidence.ts')).calibrateRoleEvidence(
    reviews,
    { minFamilies: 20, minPrecision: 0.8, minValidRetention: 0.9 }
  );
  assert.equal(roleEvidence.summary.status, 'calibrated');
  const nli = { thresholds: { neutral: 0.99 } };
  const after = await runApplicationEvaluation(
    notes,
    { ...options, policy: { ...options.policy, roleEvidence, nli } },
    load
  );
  const actual = after.predictions.find((r) => r.observation.origin === 'table').validation;
  assert.equal(actual.verdict, 'supported');
  assert.equal(actual.eligibility.reason, 'reviewed-role-evidence');
  assert.deepEqual(actual.decisionPolicy, nli);
  assert.equal(actual.verification.kind, 'record-membership');
  assert.equal(actual.scores.neutral, 0.98, 'Raw model scores remain available and unchanged.');
});
