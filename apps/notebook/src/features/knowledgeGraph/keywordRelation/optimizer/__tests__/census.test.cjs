const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  prepareReview,
  checkedJudgments,
  reportReview,
  assessComparison,
} = require('../census.cjs');

const prediction = (index, changes = {}) => ({
  observation: {
    noteTitle: 'note-' + index,
    section: 'section',
    origin: 'field',
    source: 'Alpha',
    target: 'Beta',
    evidence: 'Alpha has Beta.',
    template: '{{E1}} has {{E2}}.',
  },
  validation: {
    evidence: 'Alpha has Beta.',
    hypothesis: 'Alpha has Beta.',
    verdict: 'supported',
    semantic: { verdict: 'supported' },
    scores: { entailment: 0.95, neutral: 0.04, contradiction: 0.01 },
    ...changes,
  },
});
const datasetsOf = (predictions) => [
  { name: 'app', manifest: { observations: predictions.length }, predictions },
];
const judgment = (row, changes = {}) => ({
  id: row.id,
  contentHash: row.contentHash,
  reviewer: 'assistant',
  reviewedAt: '2026-10-16T03:00:00Z',
  expectedLabel: 'supported',
  sourceClarity: 'clear',
  relationJudgment: 'valid',
  reason: 'The source explicitly records this pair.',
  evidenceQuotes: ['Alpha has Beta.'],
  ...changes,
});
const reviewOf = (packet, judgments = packet.cases.map((row) => judgment(row))) => ({
  packetHash: packet.packetHash,
  judgments,
});

test('all 501 observations are exported without predictions or automatic judgments', () => {
  const datasets = datasetsOf(Array.from({ length: 501 }, (_, index) => prediction(index)));
  const packet = prepareReview(datasets);
  assert.equal(packet.cases.length, 501);
  assert.equal(packet.references.length, 501);
  assert.ok(packet.cases.every((row) => !row.expectedLabel && !row.validation && !row.scores));
  assert.ok(!JSON.stringify(packet).includes('entailment'));
  const result = reportReview(datasets, packet, reviewOf(packet, []));
  assert.equal(result.pendingObservations, 501);
  assert.equal(result.reviewedCases, 0);
  assert.equal(result.status, 'pending-review');
  assert.equal(result.datasets[0].semantic.decisionErrorRate, null);
});

test('same text with different endpoint pairs remains a separate source judgment', () => {
  const a = prediction(0),
    b = structuredClone(a);
  b.observation.target = 'Gamma';
  const packet = prepareReview(datasetsOf([a, b]));
  assert.equal(packet.cases.length, 2);
});

test('distinct roles for the same endpoint pair retain separate whole-corpus denominators', () => {
  const a = prediction(0),
    b = structuredClone(a);
  b.observation.template = '{{E1}} reviews {{E2}}.';
  b.validation.hypothesis = 'Alpha reviews Beta.';
  const datasets = datasetsOf([a, b]),
    packet = prepareReview(datasets);
  const result = reportReview(datasets, packet, reviewOf(packet));
  assert.equal(result.observations, 2);
  assert.equal(result.datasets[0].candidatePreservation.knownValidInUnion, 2);
  assert.equal(result.datasets[0].relationship.unionValidRetention, 1);
});

test('removed observations and changed hypotheses are retained in the union', () => {
  const datasets = [
    { name: 'before', predictions: [prediction(0), prediction(1)] },
    { name: 'after', predictions: [prediction(0, { hypothesis: 'Another claim.' })] },
  ];
  const packet = prepareReview(datasets);
  const result = reportReview(datasets, packet, reviewOf(packet, [judgment(packet.cases[0])]));
  assert.equal(result.cases, 3);
  assert.equal(result.observations, 2);
  assert.equal(result.pendingCases, 2);
  assert.equal(result.status, 'pending-review');
});

test('a reviewed valid observation removed by optimization stays in its preservation denominator', () => {
  const datasets = [
    { name: 'before', predictions: [prediction(0), prediction(1)] },
    { name: 'after', predictions: [prediction(0)] },
  ];
  const packet = prepareReview(datasets);
  const removed = packet.cases.find((row) => row.source.noteTitle === 'note-1');
  const result = reportReview(datasets, packet, reviewOf(packet, [judgment(removed)]));
  assert.equal(result.datasets[1].candidatePreservation.knownValidInUnion, 1);
  assert.equal(result.datasets[1].candidatePreservation.missingKnownValid, 1);
  assert.equal(result.datasets[0].relationship.precision, null);
  assert.equal(result.datasets[0].relationship.reviewedPrecision, 1);
});

test('a valid endpoint pair cannot conceal a contradicted or unsupported hypothesis', () => {
  const datasets = datasetsOf([prediction(0)]),
    packet = prepareReview(datasets);
  const result = reportReview(
    datasets,
    packet,
    reviewOf(packet, [
      judgment(packet.cases[0], {
        expectedLabel: 'contradicted',
        relationJudgment: 'valid',
        reason: 'The endpoints are related, but the proposed direction is reversed.',
      }),
    ])
  );
  assert.equal(result.datasets[0].relationship.falseSupport, 1);
  assert.equal(result.datasets[0].relationship.precision, 0);
});

test('structural relationship omissions remain measurable without inventing semantic truth labels', () => {
  const rows = [
    prediction(0, { verification: { kind: 'record-membership', membership: true } }),
    prediction(1, { verdict: 'uncertain', verification: { kind: 'source-reconstruction' } }),
    prediction(2, {
      verdict: 'uncertain',
      verification: { kind: 'record-membership', membership: true },
    }),
  ];
  const datasets = datasetsOf(rows),
    packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((row) =>
      judgment(row, {
        expectedLabel: null,
        sourceClarity: 'not-applicable',
        relationJudgment: row.source.noteTitle === 'note-2' ? 'cooccurrence' : 'valid',
      })
    )
  );
  const result = reportReview(datasets, packet, review).datasets[0];
  assert.equal(result.semantic.notApplicable, 3);
  assert.equal(result.semantic.overallError.cases, 0);
  assert.equal(result.relationship.confirmedAccepted, 1);
  assert.equal(result.relationship.confirmedPrecision, 1);
  assert.equal(result.relationship.validRetention, 0.5);
  assert.equal(result.relationship.decisionAccuracy, 1);
  assert.equal(result.relationship.overallError.missedDecisions, 1);
  assert.equal(result.relationship.byVerdict.uncertain.nonActionable, 1);
  assert.equal(result.relationship.byVerdict.uncertain.unresolved, 0);
  assert.equal(result.relationship.byVerdict.uncertain.missedByExpectedLabel.supported, 1);
  assert.equal(result.relationship.byVerdict.supported.falseNegative, 1);
  assert.equal(result.relationship.byVerdict.supported.falsePositiveRate, 0);
});

test('a semantic validation cannot bypass its meaning judgment with a not-applicable review', () => {
  const semantic = prediction(0),
    structural = prediction(0, { verification: { kind: 'source-reconstruction' } });
  const packet = prepareReview(datasetsOf([semantic, structural]));
  assert.equal(packet.cases.length, 2, 'The same text retains both validation contracts.');
  const source = packet.cases.find((row) => row.semanticApplicable);
  assert.throws(
    () =>
      checkedJudgments(
        packet,
        reviewOf(packet, [
          judgment(source, {
            expectedLabel: null,
            sourceClarity: 'not-applicable',
          }),
        ])
      ),
    /Incomplete assistant judgment/
  );
});

test('missing observations, stale input and model-authored gold are rejected', () => {
  assert.throws(
    () =>
      prepareReview([
        { name: 'partial', predictions: [prediction(0)], manifest: { observations: 10 } },
      ]),
    /every observation/
  );
  const datasets = datasetsOf([prediction(0)]),
    packet = prepareReview(datasets);
  for (const changes of [
    { contentHash: 'old' },
    { expectedLabel: 'uncertain' },
    { reviewer: 'nli-model' },
    { reason: '' },
    { evidenceQuotes: ['Not in the source.'] },
  ])
    assert.throws(() =>
      checkedJudgments(packet, reviewOf(packet, [judgment(packet.cases[0], changes)]))
    );
  const tampered = structuredClone(packet);
  tampered.cases[0].hypothesis = 'Edited after the review.';
  assert.throws(() => checkedJudgments(tampered, reviewOf(packet)), /changed/);
  const changed = datasetsOf([prediction(0, { hypothesis: 'New hypothesis.' })]);
  assert.throws(() => reportReview(changed, packet, reviewOf(packet)), /match/);
});

test('assistant labels measure false support and held valid relations separately', () => {
  const datasets = datasetsOf([
    prediction(0, { verdict: 'uncertain', semantic: { verdict: 'uncertain' } }),
    prediction(1),
  ]);
  const packet = prepareReview(datasets);
  const result = reportReview(
    datasets,
    packet,
    reviewOf(
      packet,
      packet.cases.map((row) =>
        judgment(
          row,
          row.source.noteTitle === 'note-1'
            ? {
                expectedLabel: 'neutral',
                relationJudgment: 'cooccurrence',
                reason: 'The two terms only share the source.',
              }
            : {}
        )
      )
    )
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.evaluationModelCalls, 0);
  assert.equal(result.datasets[0].semantic.incorrect, 1);
  assert.equal(result.datasets[0].semantic.abstained, 1);
  assert.equal(result.datasets[0].relationship.falseSupport, 1);
  assert.equal(result.datasets[0].relationship.heldValid, 1);
  assert.equal(result.datasets[0].relationship.precision, 0);
});

test('non-assertions and uncertain source judgments never become neutral or correct', () => {
  const datasets = datasetsOf([prediction(0)]),
    packet = prepareReview(datasets);
  const review = reviewOf(packet, [
    judgment(packet.cases[0], {
      sourceClarity: 'non-assertion',
      expectedLabel: null,
      relationJudgment: 'insufficient',
      reason: 'A fragment supplies no independently verifiable relationship.',
    }),
  ]);
  const result = reportReview(datasets, packet, review);
  assert.equal(result.datasets[0].semantic.reviewed, 0);
  assert.equal(result.datasets[0].semantic.decisionErrorRate, null);
  assert.equal(result.datasets[0].relationship.falseSupport, 0);
  assert.equal(result.datasets[0].relationship.unresolvedAccepted, 1);
  assert.equal(result.datasets[0].relationship.precision, null);
});

test('the source review tool runs without an inference library', () => {
  const Module = require('node:module'),
    original = Module._load;
  try {
    Module._load = function (request, ...args) {
      if (request.includes('transformers') || request.includes('relationModels'))
        assert.fail('An evaluation model must never load.');
      return original.call(this, request, ...args);
    };
    delete require.cache[require.resolve('../census.cjs')];
    const tool = require('../census.cjs'),
      datasets = datasetsOf([prediction(0)]);
    const packet = tool.prepareReview(datasets);
    assert.equal(tool.reportReview(datasets, packet, reviewOf(packet)).downloadedJudgeModels, 0);
  } finally {
    Module._load = original;
  }
});

test('legacy model-evaluation and sampling commands cannot silently perform a partial review', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  for (const command of ['infer', 'sample', 'calibrate']) {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '../verdict-review.cjs'), command, 'unused-input', 'unused-output'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use census\.cjs prepare\/report\/calibrate/);
    assert.ok(!result.stderr.includes('ENOENT'));
  }
});

test('abstaining on every case cannot pass the error and whole-decision quality targets', () => {
  const datasets = [
    { name: 'before', predictions: [prediction(0), prediction(1)] },
    {
      name: 'after',
      predictions: [0, 1].map((i) =>
        prediction(i, { verdict: 'uncertain', semantic: { verdict: 'uncertain' } })
      ),
    },
  ];
  const packet = prepareReview(datasets);
  const report = reportReview(datasets, packet, reviewOf(packet));
  const result = assessComparison(report, 'before', 'after', {
    minPrecision: 0.95,
    minDecisionAccuracy: 0.95,
    minValidRetention: 0.9,
    minDecisionCoverage: 0.5,
  });
  assert.equal(result.passed, false);
  assert.equal(result.criteria.validRetention, false);
  assert.equal(result.criteria.decisionCoverage, false);
  assert.equal(result.criteria.noSemanticCoverageRegression, false);
  assert.equal(result.errorReductionRate, null);
  assert.equal(result.falseSupportReductionRate, null);
});

test('unresolved accepted results and removed valid pairs remain in the quality denominators', () => {
  const unknown = prediction(2);
  const datasets = [
    { name: 'before', predictions: [prediction(0), prediction(1), unknown] },
    { name: 'after', predictions: [prediction(0), prediction(0), unknown] },
  ];
  const packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((c) =>
      judgment(c, c.source.noteTitle === 'note-2' ? { relationJudgment: 'insufficient' } : {})
    )
  );
  const report = reportReview(datasets, packet, review);
  const after = report.datasets[1].relationship;
  assert.equal(after.confirmedPrecision, 2 / 3);
  assert.equal(after.unionValidRetention, 1 / 2);
  assert.equal(after.decisionCoverage, 1);
  assert.throws(() => assessComparison(report, 'before', 'after', {}), /Explicit/);
});

test('correct support alone cannot hide incorrect neutral or contradiction decisions', () => {
  const datasets = [
    {
      name: 'before',
      predictions: [prediction(0), prediction(1, { verdict: 'uncertain' })],
    },
    {
      name: 'after',
      predictions: [
        prediction(0),
        prediction(1, { verdict: 'neutral', semantic: { verdict: 'neutral' } }),
      ],
    },
  ];
  const packet = prepareReview(datasets);
  const report = reportReview(datasets, packet, reviewOf(packet));
  assert.equal(report.datasets[1].relationship.confirmedPrecision, 1);
  assert.equal(report.datasets[1].relationship.confirmedDecisions, 1);
  assert.equal(report.datasets[1].relationship.decisionAccuracy, 0.5);
  const result = assessComparison(report, 'before', 'after', {
    minPrecision: 0.95,
    minDecisionAccuracy: 0.95,
    minValidRetention: 0.5,
    minDecisionCoverage: 0.5,
  });
  assert.equal(result.criteria.decisionAccuracy, false);
  assert.equal(result.criteria.noDecisionAccuracyRegression, false);
  assert.equal(result.passed, false);
});

const comparisonTargets = {
  minPrecision: 0.95,
  minDecisionAccuracy: 0.95,
  minValidRetention: 0.5,
  minDecisionCoverage: 0.1,
  minErrorReductionRate: 0.3,
};

test('final error reduction includes recovered structural omissions without inventing NLI decisions', () => {
  const make = (index, verdict) =>
    prediction(index, { verdict, verification: { kind: 'source-reconstruction' } });
  const datasets = [
    { name: 'before', predictions: [make(0, 'uncertain'), make(1, 'unverified')] },
    { name: 'after', predictions: [make(1, 'supported'), make(0, 'supported')] },
  ];
  const packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((row) =>
      judgment(row, { expectedLabel: null, sourceClarity: 'not-applicable' })
    )
  );
  const report = reportReview(datasets, packet, review);
  const result = assessComparison(report, 'before', 'after', comparisonTargets);
  assert.equal(result.errorReductionRate, 1);
  assert.deepEqual(result.errorReductionRateBounds, [1, 1]);
  assert.equal(result.semanticErrorReductionRate, null);
  assert.equal(result.finalErrors.comparable, true);
  assert.equal(result.criteria.errorReduction, true);
  assert.equal(result.passed, true);
});

test('unchanged unresolved predictions cancel in a paired comparison instead of manufacturing an improvement', () => {
  const before = [0, 1, 2].map((i) => prediction(i, { verdict: 'uncertain' }));
  const datasets = [
    { name: 'before', predictions: before },
    { name: 'after', predictions: [...before].reverse() },
  ];
  const packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((row) =>
      judgment(
        row,
        row.source.noteTitle === 'note-2'
          ? { relationJudgment: 'insufficient', sourceClarity: 'ambiguous', expectedLabel: null }
          : {}
      )
    )
  );
  const report = reportReview(datasets, packet, review);
  const unchanged = assessComparison(report, 'before', 'after', comparisonTargets);
  assert.equal(unchanged.errorReductionRate, 0);
  assert.deepEqual(unchanged.errorReductionRateBounds, [0, 0]);
  assert.equal(unchanged.criteria.errorReduction, false);

  datasets[1].predictions = [prediction(0), ...before.slice(1)];
  const improved = assessComparison(
    reportReview(datasets, prepareReview(datasets), review),
    'before',
    'after',
    {
      ...comparisonTargets,
      minPrecision: 0.5,
      minDecisionAccuracy: 0.5,
    }
  );
  assert.equal(improved.errorReductionRate, null);
  assert.equal(improved.finalErrors.confirmedErrorReductionRate, 0.5);
  assert.deepEqual(improved.errorReductionRateBounds, [1 / 3, 1 / 2]);
  assert.equal(improved.criteria.errorReduction, true);
  const worsened = assessComparison(
    reportReview(datasets, prepareReview(datasets), review),
    'after',
    'before',
    comparisonTargets
  );
  assert.deepEqual(worsened.errorReductionRateBounds, [-1, -1 / 2]);
  assert.equal(worsened.criteria.errorReduction, false);
});

test('changed unresolved decisions cannot claim the confirmed-error reduction as the actual reduction', () => {
  const datasets = [
    { name: 'before', predictions: [prediction(0, { verdict: 'uncertain' }), prediction(1)] },
    { name: 'after', predictions: [prediction(0), prediction(1, { verdict: 'uncertain' })] },
  ];
  const packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((row) =>
      judgment(
        row,
        row.source.noteTitle === 'note-1'
          ? { relationJudgment: 'insufficient', sourceClarity: 'ambiguous', expectedLabel: null }
          : {}
      )
    )
  );
  const result = assessComparison(
    reportReview(datasets, packet, review),
    'before',
    'after',
    comparisonTargets
  );
  assert.equal(result.finalErrors.confirmedErrorReductionRate, 1);
  assert.equal(result.errorReductionRate, null);
  assert.deepEqual(result.errorReductionRateBounds, [0, 1]);
  assert.equal(result.criteria.errorReduction, false);
});

test('dropping claims or changing hypotheses cannot silently shrink the error-reduction population', () => {
  for (const after of [
    [prediction(0)],
    [prediction(0), prediction(1, { hypothesis: 'Another claim.' })],
  ]) {
    const datasets = [
      {
        name: 'before',
        predictions: [prediction(0), prediction(1, { verdict: 'uncertain' })],
      },
      { name: 'after', predictions: after },
    ];
    const packet = prepareReview(datasets);
    const result = assessComparison(
      reportReview(datasets, packet, reviewOf(packet)),
      'before',
      'after',
      comparisonTargets
    );
    assert.equal(result.finalErrors.status, 'changed-population');
    assert.equal(result.errorReductionRate, null);
    assert.equal(result.criteria.errorReduction, false);
  }
});

test('equal claims from different declared notebook snapshots are not an error-reduction comparison', () => {
  const datasets = ['before', 'after'].map((name) => ({
    name,
    manifest: { observations: 1, portableNotebookDigest: name },
    predictions: [prediction(0, { verdict: 'uncertain' })],
  }));
  const packet = prepareReview(datasets);
  const result = assessComparison(
    reportReview(datasets, packet, reviewOf(packet)),
    'before',
    'after',
    comparisonTargets
  );
  assert.equal(result.finalErrors.comparable, false);
  assert.equal(result.errorReductionRate, null);
  assert.equal(result.criteria.errorReduction, false);
});

test('each verdict reports wrong predictions separately from false positives among other classes', () => {
  const verdicts = [
    'supported',
    'supported',
    'supported',
    'neutral',
    'neutral',
    'contradicted',
    'contradicted',
    'uncertain',
    'unverified',
  ];
  const expected = [
    'supported',
    'neutral',
    'supported',
    'neutral',
    'contradicted',
    'contradicted',
    'neutral',
    'supported',
    'supported',
  ];
  const datasets = datasetsOf(
    verdicts.map((verdict, i) => prediction(i, { verdict, semantic: { verdict } }))
  );
  const packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((row) => {
      const index = Number(row.source.noteTitle.slice('note-'.length));
      return judgment(row, {
        expectedLabel: expected[index],
        relationJudgment: index === 2 ? 'parse-error' : 'valid',
      });
    })
  );
  const result = reportReview(datasets, packet, review).datasets[0];
  const semantic = result.semantic.byVerdict;
  const relationship = result.relationship.byVerdict;
  assert.equal(semantic.supported.predicted, 3);
  assert.equal(semantic.supported.truePositive, 2);
  assert.equal(semantic.supported.falsePositive, 1);
  assert.equal(semantic.supported.falseNegative, 2);
  assert.equal(semantic.supported.trueNegative, 4);
  assert.equal(semantic.supported.falseDiscoveryRate, 1 / 3);
  assert.equal(semantic.supported.falsePositiveRate, 1 / 5);
  assert.equal(relationship.supported.truePositive, 1);
  assert.equal(relationship.supported.falsePositive, 2);
  assert.equal(relationship.supported.falseDiscoveryRate, 2 / 3);
  assert.equal(relationship.supported.falsePositiveRate, 2 / 6);
  for (const group of [semantic, relationship]) {
    assert.equal(group.neutral.falseDiscoveryRate, 1 / 2);
    assert.equal(group.neutral.falsePositiveRate, 1 / 6);
    assert.equal(group.contradicted.falseDiscoveryRate, 1 / 2);
    assert.equal(group.contradicted.falsePositiveRate, 1 / 7);
    for (const status of ['uncertain', 'unverified']) {
      assert.equal(group[status].predicted, 1);
      assert.equal(group[status].kind, 'abstention');
      assert.equal(group[status].falseDiscoveryRate, null);
      assert.equal(group[status].falsePositiveRate, null);
      assert.equal(group[status].heldValid, 1);
      assert.equal(group[status].heldValidRate, 1);
      assert.equal(group[status].missedDecisions, 1);
      assert.equal(group[status].confirmedErrors, 1);
      assert.equal(group[status].errorRate, 1);
    }
  }
  assert.equal(result.semantic.overallError.wrongDecisions, 3);
  assert.equal(result.semantic.overallError.missedDecisions, 2);
  assert.equal(result.semantic.overallError.errorRate, 5 / 9);
  assert.equal(result.relationship.overallError.wrongDecisions, 4);
  assert.equal(result.relationship.overallError.missedDecisions, 2);
  assert.equal(result.relationship.overallError.errorRate, 6 / 9);
});

test('unread and unresolved judgments never produce a complete per-verdict error rate', () => {
  const datasets = datasetsOf([prediction(0), prediction(1), prediction(2)]);
  const packet = prepareReview(datasets);
  const byNote = new Map(packet.cases.map((row) => [row.source.noteTitle, row]));
  const judgments = [
    judgment(byNote.get('note-0')),
    judgment(byNote.get('note-1'), {
      expectedLabel: null,
      sourceClarity: 'ambiguous',
      relationJudgment: 'insufficient',
    }),
  ];
  const partial = reportReview(datasets, packet, reviewOf(packet, judgments)).datasets[0];
  for (const scope of [partial.semantic, partial.relationship]) {
    const support = scope.byVerdict.supported;
    assert.equal(support.predicted, 3);
    assert.equal(support.reviewed, 2);
    assert.equal(support.pending, 1);
    assert.equal(support.evaluated, 1);
    assert.equal(support.unresolved, 1);
    assert.equal(support.falseDiscoveryRate, null);
    assert.equal(support.reviewedFalseDiscoveryRate, 0);
    assert.equal(support.falsePositiveRate, null);
  }
  const complete = reportReview(
    datasets,
    packet,
    reviewOf(packet, [...judgments, judgment(byNote.get('note-2'))])
  );
  assert.equal(complete.status, 'complete');
  for (const scope of [complete.datasets[0].semantic, complete.datasets[0].relationship]) {
    assert.equal(scope.byVerdict.supported.falseDiscoveryRate, null);
    assert.equal(scope.byVerdict.supported.unresolved, 1);
    assert.equal(scope.byVerdict.neutral.falseDiscoveryRate, null);
    assert.equal(scope.byVerdict.neutral.predicted, 0);
    assert.equal(scope.byVerdict.uncertain.heldValidRate, null);
    assert.equal(scope.byVerdict.uncertain.errorRate, null);
  }
});

test('clear abstentions are omission errors while invalid candidates and unknown source truth stay separate', () => {
  const expected = ['supported', 'neutral', 'contradicted', 'supported', null, 'supported', null];
  const datasets = datasetsOf(
    expected.map((_, i) => {
      const verdict = i < 5 ? 'uncertain' : 'unverified';
      return prediction(i, { verdict, semantic: { verdict } });
    })
  );
  const packet = prepareReview(datasets);
  const review = reviewOf(
    packet,
    packet.cases.map((row) => {
      const index = Number(row.source.noteTitle.slice('note-'.length));
      return judgment(row, {
        expectedLabel: expected[index],
        sourceClarity: expected[index] === null ? 'ambiguous' : 'clear',
        relationJudgment:
          expected[index] === null ? 'insufficient' : index === 3 ? 'parse-error' : 'valid',
      });
    })
  );
  const result = reportReview(datasets, packet, review).datasets[0];
  const semantic = result.semantic.byVerdict.uncertain;
  const relationship = result.relationship.byVerdict.uncertain;
  assert.equal(semantic.missedDecisions, 4);
  assert.equal(semantic.nonActionable, 0);
  assert.equal(semantic.unresolved, 1);
  assert.equal(semantic.errorRate, null);
  assert.equal(semantic.confirmedErrorRate, 4 / 5);
  assert.deepEqual(semantic.errorRateBounds, [4 / 5, 1]);
  assert.equal(relationship.missedDecisions, 3);
  assert.deepEqual(relationship.missedByExpectedLabel, {
    supported: 1,
    neutral: 1,
    contradicted: 1,
  });
  assert.equal(relationship.nonActionable, 1);
  assert.equal(relationship.unresolved, 1);
  assert.equal(relationship.errorRate, null);
  assert.equal(relationship.confirmedErrorRate, 3 / 5);
  assert.deepEqual(relationship.errorRateBounds, [3 / 5, 4 / 5]);
  for (const scope of [result.semantic, result.relationship]) {
    const unverified = scope.byVerdict.unverified;
    assert.equal(unverified.missedDecisions, 1);
    assert.equal(unverified.confirmedErrors, 1);
    assert.equal(unverified.errorRate, null);
    assert.equal(unverified.confirmedErrorRate, 1 / 2);
    assert.deepEqual(unverified.errorRateBounds, [1 / 2, 1]);
  }
  assert.equal(result.relationship.overallError.missedDecisions, 4);
  assert.equal(result.relationship.overallError.wrongDecisions, 0);
  assert.equal(result.relationship.overallError.confirmedErrors, 4);
  assert.equal(result.relationship.overallError.unresolved, 2);
  assert.equal(result.relationship.overallError.errorRate, null);
  assert.deepEqual(result.relationship.overallError.errorRateBounds, [4 / 7, 6 / 7]);
});

test('replacing every correct decision with uncertainty produces a 100 percent overall error', () => {
  const datasets = [
    { name: 'before', predictions: [0, 1, 2].map((i) => prediction(i)) },
    {
      name: 'after',
      predictions: [0, 1, 2].map((i) =>
        prediction(i, { verdict: 'uncertain', semantic: { verdict: 'uncertain' } })
      ),
    },
  ];
  const packet = prepareReview(datasets);
  const report = reportReview(datasets, packet, reviewOf(packet));
  for (const scope of ['semantic', 'relationship']) {
    assert.equal(report.datasets[0][scope].overallError.errorRate, 0);
    const after = report.datasets[1][scope];
    assert.equal(after.overallError.wrongDecisions, 0);
    assert.equal(after.overallError.missedDecisions, 3);
    assert.equal(after.overallError.errorRate, 1);
    assert.equal(after.byVerdict.uncertain.errorRate, 1);
    assert.equal(after.byVerdict.uncertain.falseDiscoveryRate, null);
  }
});

test('structural checks require no NLI decision and are not counted as missing semantic decisions', () => {
  const datasets = datasetsOf([
    prediction(0, {
      semantic: undefined,
      verification: { kind: 'record-membership', membership: true },
    }),
    prediction(1, {
      verdict: 'uncertain',
      semantic: undefined,
      verification: { kind: 'source-reconstruction' },
    }),
  ]);
  const packet = prepareReview(datasets);
  const result = reportReview(datasets, packet, reviewOf(packet)).datasets[0];
  assert.equal(result.semantic.notApplicable, 2);
  assert.equal(result.semantic.reviewed, 0);
  assert.equal(result.semantic.overallError.cases, 0);
  assert.equal(result.semantic.overallError.missedDecisions, 0);
  assert.equal(result.semantic.overallError.errorRate, null);
  assert.equal(result.semantic.byVerdict.unverified.predicted, 0);
  assert.equal(result.relationship.overallError.cases, 2);
  assert.equal(result.relationship.overallError.missedDecisions, 1);
  assert.equal(result.relationship.overallError.errorRate, 1 / 2);
});

test('a partial review elsewhere keeps per-verdict rates explicitly partial', () => {
  const datasets = datasetsOf([
    prediction(0),
    prediction(1, { verdict: 'uncertain', semantic: { verdict: 'uncertain' } }),
  ]);
  const packet = prepareReview(datasets);
  const reviewed = packet.cases.find((row) => row.source.noteTitle === 'note-0');
  const result = reportReview(datasets, packet, reviewOf(packet, [judgment(reviewed)]));
  for (const scope of [result.datasets[0].semantic, result.datasets[0].relationship]) {
    assert.equal(scope.byVerdict.supported.pending, 0);
    assert.equal(scope.byVerdict.supported.falseDiscoveryRate, null);
    assert.equal(scope.byVerdict.supported.reviewedFalseDiscoveryRate, 0);
    assert.equal(scope.byVerdict.uncertain.pending, 1);
    assert.equal(scope.byVerdict.uncertain.heldValidRate, null);
  }
});
