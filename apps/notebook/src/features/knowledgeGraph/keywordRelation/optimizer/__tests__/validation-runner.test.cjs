const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');

const progress = load('relationProgress.ts');
const checkpoint = load('relationCheckpoint.ts', {
  '@react-native-async-storage/async-storage': {},
});
const discovery = load('relationDiscovery.ts', {
  '@blacktokki/editor': { toMarkdown: (text) => text },
});
const metadata = load('relationCacheMetadata.ts', {
  './relationCheckpoint': checkpoint,
  './relationDiscovery': discovery,
});
const supported = { entailment: 0.95, neutral: 0.03, contradiction: 0.02 };
const neutral = { entailment: 0.1, neutral: 0.85, contradiction: 0.05 };
const notes = [{ title: 'One', description: 'Beta works on Alpha. Gamma works on Delta.' }];

function fixture() {
  const observation = {
    noteTitle: 'One',
    section: '',
    source: 'Alpha',
    target: 'Beta',
    sourceType: null,
    targetType: null,
    origin: 'sentence',
    evidence: 'Beta works on Alpha.',
    template: '{{E1}} has person {{E2}}.',
    direction: 'text-order',
  };
  return {
    noteCount: 1,
    entityCount: 2,
    observationCount: 2,
    warnings: [],
    candidates: [
      observation,
      { ...observation, source: 'Delta', target: 'Gamma', evidence: 'Gamma works on Delta.' },
    ].map((o, i) => ({
      id: String(i),
      label: 'Task / Person',
      template: observation.template,
      variants: [],
      noteSupport: 1,
      pairSupport: 1,
      recurring: false,
      observations: [o],
      validations: [
        {
          noteTitle: 'One',
          evidence: o.evidence,
          hypothesis: `${o.source} has person ${o.target}.`,
          heldOut: false,
          basis: 'source',
          verdict: 'unverified',
          skipReason: 'pending',
        },
      ],
    })),
    nliStats: {
      mergeChecks: 0,
      validationChecks: 0,
      successfulChecks: 0,
      modelErrors: 0,
      oversizedInputs: 0,
    },
  };
}
function engine(data) {
  return load('relationAnalysis.ts', {
    './relationDiscovery': {
      ...discovery,
      discoverInductiveRelations: async () => structuredClone(data),
    },
    './relationCheckpoint': checkpoint,
    './relationCacheMetadata': metadata,
    './relationModels': {
      RELATION_MODELS: { nli: 'test' },
      RELATION_MODEL_DTYPES: { nli: 'test' },
    },
    './relationProgress': progress,
  });
}
function store() {
  const data = new Map();
  return {
    data,
    load: async (_scope, _version, ids) =>
      new Map(ids.flatMap((id) => (data.has(id) ? [[id, data.get(id)]] : []))),
    save: async (_scope, _version, values) => {
      for (const [id, scores] of values) data.set(id, scores);
    },
    prune: async () => {},
  };
}
const config = (cache, infer, extra = {}) => ({
  scope: 'local:1:normal',
  store: cache,
  batchSize: 1,
  maxRetries: 0,
  retryDelayMs: 0,
  runtimeFactory: () => ({ embed: async () => [], entailment: infer }),
  ...extra,
});
const calibratedControls = { nli: { controlMargin: 0.01 } };

test('a neutral alternative passes specificity, and both raw scores survive a fresh runner', async () => {
  const cache = store();
  const calls = [];
  const options = config(
    cache,
    async (_premise, hypothesis) => {
      calls.push(hypothesis);
      return hypothesis.includes('Gamma') ? neutral : supported;
    },
    { policy: calibratedControls }
  );
  const first = await engine(fixture()).runInductiveRelationAnalysis(notes, options);
  assert.equal(first.candidates[0].validations[0].verdict, 'supported');
  assert.equal(first.nliStats.validationChecks, 3);
  assert.equal(cache.data.size, 3);
  assert.deepEqual(first.candidates[0].validations[0].control.scores, neutral);
  const restored = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(cache, () => assert.fail('all scores should be reused'), { policy: calibratedControls })
  );
  assert.equal(restored.candidates[0].validations[0].verdict, 'supported');
  assert.equal(restored.nliStats.validationChecks, 0);
  assert.equal(calls.length, 3);
});

test('supporting an absent alternative downgrades the relationship without rewriting raw model scores', async () => {
  const result = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(store(), async () => supported, { policy: calibratedControls })
  );
  const row = result.candidates[0].validations[0];
  assert.equal(row.verdict, 'uncertain');
  assert.deepEqual(row.scores, supported);
  assert.deepEqual(row.control.scores, supported);
});

test('a failed calibrated alternative leaves the main score reusable when control calibration is disabled', async () => {
  const cache = store();
  const first = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(
      cache,
      async (_premise, hypothesis) => {
        if (hypothesis.includes('Gamma')) throw new Error('temporary alternative failure');
        return supported;
      },
      { policy: calibratedControls }
    )
  );
  assert.equal(first.candidates[0].validations[0].verdict, 'unverified');
  assert.equal(first.validationProgress.failed, 2);
  assert.equal(cache.data.size, 1);
  const calls = [];
  const second = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(cache, async (_premise, hypothesis) => {
      calls.push(hypothesis);
      return neutral;
    })
  );
  assert.deepEqual(
    calls,
    ['Delta has person Gamma.'],
    'an optional missing control does not invalidate a reusable main decision'
  );
  assert.equal(second.candidates[0].validations[0].verdict, 'supported');
});

test('a main non-support decision never spends another inference on its alternative', async () => {
  let calls = 0;
  const result = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(store(), async () => {
      calls++;
      return neutral;
    })
  );
  assert.equal(calls, 2);
  assert.equal(result.candidates[0].validations[0].verdict, 'neutral');
  assert.equal(result.candidates[0].validations[0].control.scores, undefined);
});

test('a calibration policy controls the actual runner and ranking respects the resulting decision', async () => {
  const cache = store();
  const result = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(
      cache,
      async (_premise, hypothesis) =>
        hypothesis.includes('Gamma')
          ? neutral
          : { entailment: 0.75, neutral: 0.15, contradiction: 0.1 },
      { policy: { entailmentThreshold: 0.7 } }
    )
  );
  const row = result.candidates[0].validations[0];
  assert.equal(row.verdict, 'supported');
  assert.equal(load('optimizer/validation.ts').independentSupportRank([row]).supportCount, 1);
});

test('cancelled alternative checks preserve the completed main score without exposing partial support', async () => {
  const cache = store();
  const controller = new AbortController();
  await assert.rejects(
    engine(fixture()).runInductiveRelationAnalysis(
      notes,
      config(
        cache,
        async (_premise, hypothesis) => {
          if (hypothesis.includes('Gamma')) {
            controller.abort();
            throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
          }
          return supported;
        },
        { signal: controller.signal, policy: calibratedControls }
      )
    ),
    { name: 'AbortError' }
  );
  assert.equal(cache.data.size, 1);
});

test('changing a decision threshold reuses raw probabilities without requiring an optional control', async () => {
  const cache = store();
  const main = { entailment: 0.75, neutral: 0.15, contradiction: 0.1 };
  const first = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(cache, async () => main)
  );
  assert.equal(first.candidates[0].validations[0].verdict, 'uncertain');
  const calls = [];
  const second = await engine(fixture()).runInductiveRelationAnalysis(
    notes,
    config(
      cache,
      async (_premise, hypothesis) => {
        calls.push(hypothesis);
        return neutral;
      },
      { policy: { entailmentThreshold: 0.7 } }
    )
  );
  assert.deepEqual(
    calls,
    [],
    'an optional missing control does not invalidate a reusable main decision'
  );
  assert.equal(second.candidates[0].validations[0].verdict, 'supported');
});
