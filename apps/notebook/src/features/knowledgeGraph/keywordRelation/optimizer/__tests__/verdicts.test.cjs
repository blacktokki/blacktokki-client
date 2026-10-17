const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { moduleLoader } = require('../run-corpus.cjs');
const load = moduleLoader();
const root = path.join(__dirname, '..');
const semantic = load(path.join(root, 'semantic.ts'));
const evaluation = load(path.join(root, 'verdict-evaluation.ts'));
const validation = load(path.join(root, 'validation.ts'));
const syntax = load(path.join(root, 'syntax.ts'));
const labels = semantic.NLI_LABELS;
const scoreKeys = { supported: 'entailment', neutral: 'neutral', contradicted: 'contradiction' };
const scores = (label, confidence = 0.9) =>
  Object.fromEntries(
    labels.map((name) => [scoreKeys[name], name === label ? confidence : (1 - confidence) / 2])
  );
const row = (id, label, predicted = label, confidence = 0.9, extra = {}) => ({
  id,
  family: id,
  split: 'calibration',
  kind: 'natural',
  premise: 'Source ' + id,
  hypothesis: 'Claim ' + id,
  expectedLabel: label,
  sourceClarity: 'clear',
  validation: { scores: scores(predicted, confidence) },
  ...extra,
});

test('every NLI label must win, including calibrated thresholds below one half', () => {
  assert.equal(
    validation.relationScoreVerdict({ entailment: 0.1, neutral: 0.5, contradiction: 0.4 }, 0.35),
    'neutral'
  );
  assert.equal(
    validation.relationScoreVerdict({ entailment: 0.1, neutral: 0.4, contradiction: 0.5 }, 0.35),
    'contradicted'
  );
  assert.equal(
    validation.relationScoreVerdict({ entailment: 0.45, neutral: 0.45, contradiction: 0.1 }, 0.4),
    'uncertain'
  );
});

test('missing, invalid and low-confidence scores have different reasons and never mutate probabilities', () => {
  assert.equal(semantic.decideNli(undefined, 0.8).reason, 'missing-scores');
  assert.equal(
    semantic.decideNli({ entailment: 0.9, neutral: 0.9, contradiction: 0.1 }, 0.8).reason,
    'invalid-scores'
  );
  const raw = scores('neutral', 0.7),
    copy = structuredClone(raw);
  assert.equal(semantic.decideNli(raw, 0.8).reason, 'low-score');
  assert.equal(semantic.decideNli(raw, 0.5, { minMargin: 0.6 }).reason, 'low-margin');
  assert.deepEqual(raw, copy);
  for (const policy of [{ temperature: 0 }, { minMargin: -1 }, { thresholds: { uncertain: 0.8 } }])
    assert.throws(() => semantic.decideNli(raw, 0.8, policy));
});

test('temperature preserves the winning class while per-class thresholds control abstention', () => {
  const raw = scores('contradicted', 0.7);
  assert.equal(
    semantic.decideNli(raw, 0.8, { thresholds: { contradicted: 0.65 } }).verdict,
    'contradicted'
  );
  const softened = semantic.decideNli(raw, 0.8, { temperature: 2 });
  assert.equal(softened.label, 'contradicted');
  assert.ok(softened.scores.contradiction < raw.contradiction);
  assert.equal(softened.verdict, 'uncertain');
});

test('ranking uses calibrated support when present and keeps the original model probabilities', () => {
  const value = {
    evidence: 'Record Alpha; Value: Beta',
    hypothesis: 'Alpha has value Beta.',
    scores: scores('supported', 0.95),
    basis: 'source',
    decisionPolicy: { temperature: 2 },
  };
  value.verdict = validation.optimizedValidationVerdict(value, 0.7);
  const rank = validation.independentSupportRank([value]);
  assert.equal(rank.supportCount, 1);
  assert.ok(rank.meanSupport < value.scores.entailment);
  assert.equal(rank.meanSupport, value.semantic.scores.entailment);
  assert.equal(value.scores.entailment, 0.95);
});

test('a relation hold cannot rewrite the independently recorded semantic judgment', () => {
  const value = {
    scores: scores('supported'),
    claim: { status: 'unresolved', reason: 'syntax-unavailable' },
  };
  assert.equal(validation.optimizedValidationVerdict(value), 'uncertain');
  assert.equal(value.semantic.verdict, 'supported');
  assert.equal(value.decisionReason, 'syntax-unavailable');
  value.control = { hypothesis: 'An alternative' };
  assert.equal(validation.needsControlValidation(value, 0.8), false);
});

test('neutral alternatives pass specificity; a configured control gap can hold an unsafe acceptance', () => {
  const value = {
    scores: scores('supported', 0.95),
    control: { scores: scores('neutral') },
    controlMatch: { status: 'observed-role' },
    decisionPolicy: { controlMargin: 0.95 },
  };
  assert.equal(validation.optimizedValidationVerdict(value), 'uncertain');
  assert.equal(value.decisionReason, 'calibrated-control-gap');
  value.decisionPolicy.controlMargin = 0;
  value.control.scores = scores('neutral');
  assert.equal(validation.optimizedValidationVerdict(value), 'supported');
});

const observation = (source, target, role = '任意役割') => ({
  noteTitle: source,
  section: 'Section',
  source,
  target,
  sourceType: null,
  targetType: null,
  origin: 'table',
  template: `Vorgang: {{E1}}; ${role}: {{E2}}`,
  evidence: `Vorgang: ${source}; ${role}: ${target}`,
  direction: 'column-order',
});
const fixture = (observations) => ({
  candidates: observations.map((o) => ({
    observations: [o],
    validations: [
      {
        evidence: o.evidence,
        hypothesis: o.evidence,
        scores: scores('supported'),
        verdict: 'unverified',
      },
    ],
  })),
});

test('role controls use the actual schema even across groups and do not fall back to unrelated inventory', () => {
  const first = observation('Arbitrary task', '@Zeta');
  const same = observation('Other task', '@Omega');
  const other = observation('Foreign task', '@Lambda', 'Unrelated role');
  const result = fixture([first, same, other]);
  validation.prepareResultValidations(result, validation.relationPolicy());
  const values = result.candidates.map((c) => c.validations[0]);
  assert.equal(
    values[0].control.hypothesis,
    same.template.replace('{{E1}}', first.source).replace('{{E2}}', same.target)
  );
  assert.equal(values[0].controlMatch.source.noteTitle, same.noteTitle);
  assert.equal(values[2].control, undefined);
  assert.equal(validation.optimizedValidationVerdict(values[2]), 'uncertain');
  assert.equal(values[2].decisionReason, 'unreviewed-table-roles');
});

test('locally generated schema hypotheses cannot claim a different note as their held-out source', () => {
  syntax.configureRelationOptimization({ stage: 3 });
  try {
    const current = {
      ...observation('Document A', '@Zeta'),
      origin: 'field',
      evidence: 'Document A\nPropriété: @Zeta',
    };
    const donor = {
      ...current,
      noteTitle: 'Document B',
      source: 'Document B',
      target: '@Omega',
      evidence: 'Document B\nPropriété: @Omega',
    };
    const result = validation.prepareRelationValidation(current, '{{E1}} {{E2}}', donor, [], () =>
      assert.fail('schema is used')
    );
    assert.equal(result.hypothesisSource.noteTitle, current.noteTitle);
    assert.equal(result.heldOut, false);
  } finally {
    syntax.configureRelationOptimization({ stage: 0 });
  }
});

test('gold three-class confusion includes abstention; failures and non-assertions never become neutral', () => {
  const rows = [
    row('s', 'supported'),
    row('n', 'neutral', 'contradicted'),
    row('c', 'contradicted', 'contradicted', 0.6),
    row('error', 'neutral', 'neutral', 0.9, { validation: { skipReason: 'model-error' } }),
    row('pending', null, 'supported', 0.9, { sourceClarity: 'non-assertion' }),
  ];
  const report = evaluation.evaluateVerdicts(rows).populations.natural.all;
  assert.equal(report.reviewed, 4);
  assert.equal(report.scored, 3);
  assert.equal(report.unverified, 1);
  assert.equal(report.modelErrors, 1);
  assert.equal(report.confusion.neutral.contradicted, 1);
  assert.equal(report.confusion.contradicted.uncertain, 1);
  assert.equal(report.byLabel.contradicted.recall.value, 0);
  assert.equal(report.coverage, 2 / 3);
  assert.equal(report.decisionError.value, 0.5);
});

test('natural and contrast accuracy remain separate, and unreviewed scores have no accuracy', () => {
  const rows = [
    row('natural', 'supported'),
    row('contrast', 'neutral', 'supported', 0.9, { kind: 'contrast' }),
    row('unknown', null),
  ];
  const report = evaluation.evaluateVerdicts(rows);
  assert.equal(report.populations.natural.all.decisionError.value, 0);
  assert.equal(report.populations.contrast.all.decisionError.value, 1);
  assert.equal(
    evaluation.evaluateVerdicts([row('none', null)]).populations.natural.all.decisionError.value,
    null
  );
});

test('copied inputs get one vote; conflicting labels, disagreements and split leakage are rejected', () => {
  const first = row('a', 'supported');
  assert.equal(evaluation.evaluateVerdicts([first, { ...first, id: 'copy' }]).inputs, 1);
  assert.throws(
    () => evaluation.evaluateVerdicts([first, { ...first, id: 'copy', expectedLabel: 'neutral' }]),
    /Conflicting/
  );
  assert.throws(
    () => evaluation.evaluateVerdicts([{ ...first, secondExpectedLabel: 'neutral' }]),
    /disagreement/
  );
  assert.throws(
    () =>
      evaluation.evaluateVerdicts([
        first,
        { ...row('b', 'neutral'), family: first.family, split: 'holdout' },
      ]),
    /family/
  );
  assert.throws(
    () =>
      evaluation.evaluateVerdicts([
        first,
        { ...row('b', 'neutral'), premise: first.premise, split: 'holdout' },
      ]),
    /family/
  );
  assert.throws(
    () => evaluation.evaluateVerdicts([{ ...first, expectedLabel: 'uncertain' }]),
    /gold label/
  );
  assert.throws(
    () => evaluation.evaluateVerdicts([{ ...first, sourceClarity: 'non-assertion' }]),
    /non-assertion/
  );
});

const requirements = {
  targetPrecision: { supported: 0.2, neutral: 0.2, contradicted: 0.2 },
  minCoverage: 0.75,
  minPerClass: 1,
};
test('class-specific calibration uses no holdout labels and cannot succeed by abstaining on most inputs', () => {
  const rows = [
    row('s', 'supported', 'supported', 0.7),
    row('n', 'neutral', 'neutral', 0.8),
    row('c', 'contradicted'),
  ];
  const first = evaluation.calibrateVerdicts(rows, requirements);
  assert.deepEqual(first.nli.thresholds, { supported: 0.7, neutral: 0.8, contradicted: 0.9 });
  const holdout = row('holdout', 'supported', 'neutral', 0.99, { split: 'holdout' });
  assert.deepEqual(evaluation.calibrateVerdicts([...rows, holdout], requirements), first);
  assert.deepEqual(
    evaluation.calibrateVerdicts(
      [...rows, { ...holdout, expectedLabel: 'contradicted' }],
      requirements
    ),
    first
  );
  assert.equal(evaluation.calibrateVerdicts(rows.slice(0, 2), requirements), null);
  assert.equal(evaluation.calibrateVerdicts(rows, { ...requirements, minPerClass: 100 }), null);
});

test('fixed-coverage evaluation keeps confidence ties together and reports a statistical interval', () => {
  const rows = [
    row('a', 'supported'),
    row('b', 'neutral', 'supported'),
    row('c', 'contradicted', 'contradicted', 0.8),
  ];
  const tied = evaluation.riskAtCoverage(rows, 0.5);
  assert.equal(tied.decided, 0);
  assert.equal(tied.error.value, null);
  const all = evaluation.riskAtCoverage(rows, 1);
  assert.equal(all.error.value, 1 / 3);
  assert.equal(all.error.interval95.length, 2);
  assert.ok(all.error.interval95[0] < all.error.value);
});

test('a count-derived coverage cannot lose a decision through floating point floor rounding', () => {
  const rows = Array.from({ length: 84 }, (_, i) =>
    row(String(i), 'supported', 'supported', 0.99 - i / 1000)
  );
  assert.equal(evaluation.riskAtCoverage(rows, 51 / 84).decided, 51);
});

test('a changed diagnostic hypothesis cannot silently inherit scores for the old text', () => {
  const value = row('a', 'supported');
  value.validation.hypothesis = 'A different model input';
  assert.throws(() => evaluation.evaluateVerdicts([value]), /stale scores/);
});

test('comparison reports inadequate per-class evidence instead of passing an unmeasured target', () => {
  const rows = labels.map((label) => row(label, label, label, 0.9, { split: 'holdout' }));
  const targets = {
    minPrecision: { supported: 0.95, neutral: 0.9, contradicted: 0.9 },
    errorReduction: 0.3,
    wrongSupportReduction: 0.5,
    confusionReduction: 0.3,
    supportedRetention: 0.9,
    maxClearAbstention: 0.25,
    minPerClass: 100,
  };
  const report = evaluation.compareVerdictPolicies(rows, {}, {}, 1, targets);
  assert.equal(report.status, 'insufficient-data');
  assert.equal(report.checks.supported, null);
  assert.equal(report.supportedRetention.value, 1);
});

test('per-class semantic policies reuse cached raw scores and run only calibrated role controls', async () => {
  const modules = moduleLoader({
    '@blacktokki/editor': { toMarkdown: (text) => text },
    '@react-native-async-storage/async-storage': {},
  });
  const discovery = modules(path.join(root, '../relationDiscovery.ts'));
  const original = discovery.discoverInductiveRelations;
  discovery.discoverInductiveRelations = async (...args) => {
    const result = await original(...args);
    for (const candidate of result.candidates)
      candidate.validations.forEach((value, index) => {
        const o = candidate.observations[index];
        value.hypothesis = `${o.target} is used by ${o.source}.`;
        value.basis = 'source';
        value.verification = { kind: 'semantic' };
      });
    return result;
  };
  const run = modules(path.join(root, 'analysis.ts')).runInductiveRelationAnalysis;
  const notes = [1, 2, 3].map((i) => ({
    title: 'Dictionary ' + i,
    description: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name) => '## ' + name).join('\n'),
  }));
  notes.push(
    { title: 'A', description: 'Alpha uses Beta.' },
    { title: 'B', description: 'Gamma uses Delta.' }
  );
  const cache = new Map();
  const store = {
    load: async (_scope, _version, ids) =>
      new Map(ids.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)])),
    save: async (_scope, _version, values) => values.forEach(([id, value]) => cache.set(id, value)),
    prune: async () => {},
  };
  const options = {
    scope: 'class-policy',
    store,
    maxRetries: 0,
    inputBudget: async () => ({ tokens: 5, limit: 10 }),
  };
  const first = await run(notes, {
    ...options,
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async () => scores('supported', 0.75),
    }),
  });
  assert.equal(first.validationProgress.completed, 2);
  assert.ok(first.candidates.every((c) => c.validations.every((v) => v.verdict === 'uncertain')));
  let checks = 0;
  const policy = { nli: { thresholds: { supported: 0.7 }, controlMargin: 0.1 } };
  const second = await run(notes, {
    ...options,
    policy,
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async () => {
        checks++;
        return scores('neutral');
      },
    }),
  });
  assert.equal(checks, 2);
  assert.ok(
    second.candidates.every((c) =>
      c.validations.every(
        (v) => v.verdict === 'supported' && v.controlMatch.status === 'observed-role'
      )
    )
  );
  const third = await run(notes, {
    ...options,
    policy,
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: () => assert.fail('all scores should be reused'),
    }),
  });
  assert.equal(third.nliStats.validationChecks, 0);
});
