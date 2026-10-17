const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { moduleLoader } = require('../run-corpus.cjs');
const { reviewFamilies, calibrateReviewedPacket } = require('../review-calibration.cjs');
const { prepareReview } = require('../census.cjs');
const load = moduleLoader({
  '@blacktokki/editor': { toMarkdown: (text) => text },
  '@react-native-async-storage/async-storage': {},
});
const root = path.resolve(__dirname, '..');
const validation = load(path.join(root, 'validation.ts'));
const roles = load(path.join(root, 'role-evidence.ts'));
const schema = load(path.join(root, 'schema.ts'));
const syntax = load(path.join(root, 'syntax.ts'));
const claims = load(path.join(root, 'claims.ts'));
const tables = load(path.join(root, 'tables.ts'));
const evaluation = load(path.join(root, 'verdict-evaluation.ts'));
const supported = { entailment: 0.96, neutral: 0.03, contradiction: 0.01 };
const neutral = { entailment: 0.02, neutral: 0.96, contradiction: 0.02 };
const observation = (source = 'Alpha', target = 'Beta') => ({
  noteTitle: source,
  section: '',
  sectionPath: [],
  origin: 'sentence',
  source,
  target,
  sourceType: null,
  targetType: null,
  evidence: `${source} uses ${target}.`,
  template: '{{E1}} uses {{E2}}.',
  direction: 'text-order',
});
const resultOf = (observations) => ({
  candidates: observations.map((o) => ({
    observations: [o],
    validations: [
      {
        ...o,
        hypothesis: `${o.target} is used by ${o.source}.`,
        scores: supported,
        heldOut: false,
        verdict: 'unverified',
      },
    ],
  })),
});
const render = (template, o) => template.replace('{{E1}}', o.source).replace('{{E2}}', o.target);

test('unavailable, uncertain and inventory controls cannot erase a supported semantic claim', () => {
  for (const control of [
    undefined,
    {},
    { scores: { entailment: 0.4, neutral: 0.35, contradiction: 0.25 } },
  ]) {
    const value = {
      scores: supported,
      decisionPolicy: { controlMargin: 0.3 },
      controlMatch: { status: 'observed-role' },
      control,
    };
    assert.equal(validation.optimizedValidationVerdict(value), 'supported');
    assert.equal(value.semantic.verdict, 'supported');
  }
  const value = {
    scores: supported,
    control: { scores: supported },
    controlMatch: { status: 'inventory' },
    decisionPolicy: { controlMargin: 0.3 },
  };
  assert.equal(validation.optimizedValidationVerdict(value), 'supported');
  value.controlMatch.status = 'observed-role';
  assert.equal(validation.optimizedValidationVerdict(value), 'uncertain');
  assert.equal(value.decisionReason, 'calibrated-control-gap');
  assert.deepEqual(value.scores, supported);
});

test('controls require an explicit calibration and are invariant under corpus reordering', () => {
  const observations = [
    observation('One', 'Zeta'),
    observation('Two', 'Omega'),
    observation('Three', 'Delta'),
  ];
  const first = resultOf(observations),
    second = resultOf([...observations].reverse());
  validation.prepareResultValidations(first, validation.relationPolicy());
  validation.prepareResultValidations(second, validation.relationPolicy());
  const entries = (result) =>
    Object.fromEntries(
      result.candidates.map((c) => [c.observations[0].source, c.validations[0].control.hypothesis])
    );
  assert.deepEqual(entries(first), entries(second));
  const value = first.candidates[0].validations[0];
  assert.equal(validation.needsControlValidation(value, 0.8), false);
  value.decisionPolicy = { controlMargin: 0.2 };
  assert.equal(validation.needsControlValidation(value, 0.8), true);
});

test('coordinated and nominal parser attachments preserve every original candidate block', () => {
  syntax.configureRelationOptimization({
    stage: 2,
    parser: {
      revision: 'fixture',
      parse: (text) => [
        {
          id: 1,
          form: 'Alpha',
          upos: 'NOUN',
          xpos: '_',
          head: 0,
          deprel: 'root',
          start: 0,
          end: 5,
        },
        {
          id: 2,
          form: 'Beta',
          upos: 'NOUN',
          xpos: '_',
          head: 1,
          deprel: text.includes('and') ? 'conj' : 'compound',
          start: text.indexOf('Beta'),
          end: text.indexOf('Beta') + 4,
        },
      ],
    },
  });
  try {
    const blocks = ['Alpha and Beta interact.', 'Alpha Beta'].map((text) => ({
      section: '',
      sectionPath: [],
      text,
    }));
    const match = (text) =>
      ['Alpha', 'Beta'].map((name) => ({
        text: name,
        key: name.toLowerCase(),
        type: null,
        start: text.indexOf(name),
        end: text.indexOf(name) + name.length,
      }));
    claims.prepareRelationBlocks(blocks, match);
    assert.equal(blocks.length, 2);
    assert.deepEqual(claims.deferredRelationBlocks(blocks), []);
  } finally {
    syntax.configureRelationOptimization({ stage: 0 });
  }
});

function tableFixture() {
  const values = ['Migration planned', '@Xi / @Psi', 'Unrelated'];
  const blocks = values.map((text, i) => ({
    text,
    section: 'Context',
    sectionPath: ['Parent', 'Context'],
    table: 3,
    row: 7,
    columnIndex: i,
    column: ['Vorgang', 'Reviewer', 'Peer'][i],
  }));
  const names = ['Migration', '@Xi', '@Psi', 'Unrelated'];
  return tables.discoverTableRelations('Any document', blocks, (text) =>
    names
      .filter((name) => text.includes(name))
      .map((name) => ({
        text: name,
        key: name.toLowerCase(),
        type: null,
        start: text.indexOf(name),
        end: text.indexOf(name) + name.length,
      }))
  );
}

test('table observations keep coordinates and individual endpoints without selecting the unique column as a subject', () => {
  const result = tableFixture();
  const values = result.observations.filter((o) => o.source === 'Migration planned');
  assert.equal(values.length, 3);
  const people = values.filter((o) => o.schema.targetHeader === 'Reviewer');
  assert.deepEqual(
    people.map((o) => o.target),
    ['@Xi', '@Psi']
  );
  assert.notEqual(
    schema.schemaHypothesis(people[0].schema, people[0].target),
    schema.schemaHypothesis(people[1].schema, people[1].target)
  );
  for (const o of people) {
    assert.equal(schema.schemaMembership(o.schema, o.target), true);
    assert.equal(o.schema.location.table, 3);
    assert.equal(o.schema.location.row, 7);
    const v = validation.prepareRelationValidation(o, o.template, o, [], render);
    validation.prepareResultValidations(
      { candidates: [{ observations: [o], validations: [v] }] },
      validation.relationPolicy()
    );
    assert.equal(v.eligibility.status, 'unresolved');
    assert.equal(v.verification.kind, 'record-membership');
    assert.equal(validation.optimizedValidationVerdict(v), 'uncertain');
    assert.ok(v.hypothesis.includes('planned'));
  }
  const changed = structuredClone(people[0].schema);
  changed.location.targetStart++;
  assert.equal(schema.schemaMembership(changed, '@Xi'), false);
  assert.ok(result.observations.some((o) => o.source === 'Unrelated'));
});

test('role evidence learns numeric structure without name/pattern lookups or serialized exceptions', () => {
  const o = tableFixture().observations[0];
  const positive = Array.from({ length: 100 }, (_, i) => ({
    id: 'P' + i,
    family: 'PF' + i,
    split: 'calibration',
    reviewer: 'assistant',
    observation: { ...o, evidence: o.evidence + String(i).padStart(4, '0') },
    judgment: 'valid',
  }));
  const negative = positive.map((r, i) => ({
    ...r,
    id: 'N' + i,
    family: 'NF' + i,
    judgment: 'parse-error',
    observation: {
      ...r.observation,
      evidence: r.observation.evidence + '!',
      schema: {
        ...o.schema,
        structure: { ...o.schema.structure, sourcePosition: 2, sourceAtomic: 1 },
      },
    },
  }));
  const reviews = [...positive, ...negative];
  const options = { minFamilies: 60, minPrecision: 0.95 };
  const policy = roles.calibrateRoleEvidence(reviews, options);
  assert.equal(policy.summary.status, 'calibrated');
  const query = positive[0].observation;
  assert.equal(roles.reviewedRole(query, undefined, policy), true);
  assert.equal(roles.reviewedRole(negative[0].observation, undefined, policy), false);
  assert.equal(
    roles.calibrateRoleEvidence(reviews.slice(0, 3), options).summary.status,
    'insufficient-data'
  );
  assert.throws(
    () =>
      roles.calibrateRoleEvidence(
        reviews.map((r) => ({ ...r, observation: { ...r.observation, evidence: 'Same source' } })),
        options
      ),
    /Conflicting assistant validity reviews/
  );
  const renamed = {
    ...query,
    source: query.source.replace('Migration', 'Relocated'),
    evidence: query.evidence.replace('Migration', 'Relocated'),
    template: 'Arbitrary A: {{E1}}; Arbitrary B: {{E2}}',
    schema: { ...query.schema, sourceHeader: 'Arbitrary A', targetHeader: 'Arbitrary B' },
  };
  assert.equal(roles.reviewedRole(renamed, undefined, policy), true);
  const holdout = {
    ...negative[0],
    id: 'holdout',
    family: 'Unseen',
    split: 'holdout',
    observation: { ...o, evidence: 'Untouched source' },
  };
  assert.deepEqual(
    roles.calibrateRoleEvidence([...reviews, holdout], options).summary,
    policy.summary
  );
  assert.throws(
    () => roles.validateRoleEvidencePolicy(JSON.parse(JSON.stringify(policy))),
    /serialized role rules/
  );
  const result = resultOf([query]);
  validation.prepareResultValidations(result, validation.relationPolicy({ roleEvidence: policy }));
  assert.equal(
    validation.optimizedValidationVerdict(result.candidates[0].validations[0]),
    'supported'
  );
  assert.equal(result.candidates[0].validations[0].semantic, undefined);
});

test('literal reconstruction has no semantic inference or independent support, even with an old high score', () => {
  const value = {
    evidence: 'Alpha uses Beta.',
    hypothesis: 'Alpha uses Beta.',
    scores: supported,
    verification: { kind: 'source-reconstruction' },
    basis: 'reconstruction',
    eligibility: { status: 'eligible', reason: 'distinct-predicate-arguments' },
  };
  assert.equal(validation.needsSemanticValidation(value), false);
  assert.equal(validation.optimizedValidationVerdict(value), 'uncertain');
  assert.equal(value.semantic, undefined);
  assert.equal(validation.independentSupportRank([value]).supportCount, 0);
  assert.equal(validation.independentSupportRank([value]).meanSupport, 0);
  assert.deepEqual(value.scores, supported);
});

test('role precision alone cannot hide lost valid relations or unresolved acceptance risks', () => {
  const o = tableFixture().observations[0];
  const rows = Array.from({ length: 300 }, (_, i) => ({
    id: String(i),
    family: 'family-' + i,
    split: 'calibration',
    reviewer: 'assistant',
    judgment: i < 200 ? 'valid' : 'insufficient',
    observation: {
      ...o,
      evidence: o.evidence + String(i).padStart(4, '0'),
      schema: {
        ...o.schema,
        structure: { ...o.schema.structure, sourcePosition: i < 100 ? 0 : 2 },
      },
    },
  }));
  const options = { minFamilies: 60, minPrecision: 0.95 };
  const precisionOnly = roles.calibrateRoleEvidence(rows, options);
  assert.equal(precisionOnly.summary.status, 'calibrated');
  assert.equal(precisionOnly.summary.validRetention, 0.5);
  const balanced = roles.calibrateRoleEvidence(rows, { ...options, minValidRetention: 0.9 });
  assert.equal(balanced.summary.status, 'insufficient-data');
  assert.equal(balanced.summary.diagnostics.rejection, 'retention');
  assert.equal(balanced.summary.diagnostics.maxValidRetentionAtPrecision, 0.5);
  assert.equal(balanced.accepts(rows[0].observation), false);
});

test('a role policy maximizes recovery after meeting precision instead of retaining only the easiest relationships', () => {
  const o = tableFixture().observations[0];
  const rows = Array.from({ length: 310 }, (_, i) => ({
    id: String(i),
    family: 'family-' + i,
    split: 'calibration',
    reviewer: 'assistant',
    judgment: i < 200 ? 'valid' : 'cooccurrence',
    observation: {
      ...o,
      evidence: o.evidence + String(i).padStart(4, '0'),
      schema: {
        ...o.schema,
        structure: {
          ...o.schema.structure,
          sourcePosition: i < 100 ? 0 : i < 210 ? 1 : 2,
        },
      },
    },
  }));
  const fitted = roles.calibrateRoleEvidence(rows, {
    minFamilies: 40,
    minPrecision: 0.9,
  });
  assert.equal(fitted.summary.status, 'calibrated');
  assert.equal(fitted.summary.validRetention, 1);
  assert.ok(fitted.summary.lowerPrecision >= 0.9);
  assert.equal(fitted.summary.diagnostics.rejection, null);
  assert.equal(fitted.summary.diagnostics.reviewedExamples, rows.length);
  assert.equal(fitted.summary.diagnostics.maxValidRetentionAtPrecision, 1);
  assert.equal(fitted.accepts(rows[150].observation), true);
  assert.equal(fitted.accepts(rows[250].observation), false);
});

test('repeated positions cannot increase relationship weight or the reported recovery', () => {
  const o = tableFixture().observations[0];
  const rows = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    family: 'family-' + i,
    split: 'calibration',
    reviewer: 'assistant',
    judgment: i < 100 ? 'valid' : 'cooccurrence',
    observation: {
      ...o,
      evidence: o.evidence + String(i).padStart(4, '0'),
      schema: {
        ...o.schema,
        structure: { ...o.schema.structure, sourcePosition: i < 100 ? 0 : 2 },
      },
    },
  }));
  rows.push({
    ...rows[100],
    id: 'weak',
    family: rows[0].family,
    judgment: 'valid',
    observation: { ...rows[100].observation, evidence: o.evidence + 'weak' },
  });
  const options = { minFamilies: 60, minPrecision: 0.95 };
  const baseline = roles.calibrateRoleEvidence(rows, options);
  const repeated = roles.calibrateRoleEvidence(
    [...rows, ...Array.from({ length: 100 }, (_, i) => ({ ...rows[0], id: 'repeat-' + i }))],
    options
  );
  assert.equal(baseline.summary.status, 'calibrated');
  assert.equal(repeated.summary.status, 'calibrated');
  assert.equal(repeated.summary.caseValidRetention, 100 / 101);
  assert.equal(repeated.summary.validRetention, 99.5 / 100);
  assert.equal(repeated.summary.caseValidRetention, baseline.summary.caseValidRetention);
  assert.equal(repeated.summary.validRetention, baseline.summary.validRetention);
  assert.equal(repeated.summary.diagnostics.reviewedExamples, 301);
  assert.equal(repeated.summary.diagnostics.uniqueRelationships, 201);
  assert.equal(repeated.summary.diagnostics.validRelationships, 101);
  for (const row of rows)
    assert.equal(repeated.accepts(row.observation), baseline.accepts(row.observation));
  assert.throws(
    () =>
      roles.calibrateRoleEvidence(
        [...rows, { ...rows[0], id: 'conflict', judgment: 'cooccurrence' }],
        options
      ),
    /Conflicting assistant validity reviews/
  );
});

test('crossfit roundoff ties cannot separate identical roles or hide missed relationships in a large document', () => {
  const o = tableFixture().observations[0];
  const rows = Array.from({ length: 560 }, (_, i) => ({
    id: String(i),
    family: i < 160 ? 'family-' + i : 'large-family',
    split: 'calibration',
    reviewer: 'assistant',
    judgment: i < 80 || i >= 160 ? 'valid' : 'cooccurrence',
    observation: {
      ...o,
      evidence: o.evidence + String(i).padStart(4, '0'),
      schema: {
        ...o.schema,
        structure: { ...o.schema.structure, sourcePosition: i < 80 ? 0 : 2 },
      },
    },
  }));
  const options = { minFamilies: 60, minPrecision: 0.95 };
  const precisionOnly = roles.calibrateRoleEvidence(rows, options);
  assert.equal(precisionOnly.summary.status, 'calibrated');
  assert.ok(precisionOnly.summary.validRetention > 0.98);
  assert.equal(precisionOnly.summary.caseValidRetention, 1 / 6);
  assert.equal(precisionOnly.accepts(rows[80].observation), false);
  assert.equal(precisionOnly.accepts(rows[160].observation), false);
  const constrained = roles.calibrateRoleEvidence(rows, { ...options, minValidRetention: 0.75 });
  assert.equal(constrained.summary.status, 'insufficient-data');
  assert.equal(constrained.summary.diagnostics.rejection, 'retention');
  assert.equal(constrained.summary.diagnostics.maxCaseValidRetentionAtPrecision, 1 / 6);
  assert.equal(constrained.accepts(rows[0].observation), false);
});

test('a fitted role policy reaches validation in memory without requiring three semantic classes', () => {
  const o = tableFixture().observations[0];
  const predictions = Array.from({ length: 240 }, (_, i) => ({
    observation: {
      ...o,
      noteTitle: 'Family ' + i,
      evidence: o.evidence + String(i).padStart(4, '0'),
      schema: {
        ...o.schema,
        structure: { ...o.schema.structure, sourcePosition: i < 120 ? 0 : 2 },
      },
    },
    validation: {
      evidence: o.evidence + String(i).padStart(4, '0'),
      hypothesis: o.evidence,
      verification: { kind: 'record-membership', membership: true },
      verdict: 'uncertain',
    },
  }));
  const datasets = [{ name: 'Current', predictions }];
  const packet = prepareReview(datasets);
  const review = {
    packetHash: packet.packetHash,
    judgments: packet.cases.map((c) => ({
      id: c.id,
      contentHash: c.contentHash,
      reviewer: 'assistant',
      reviewedAt: new Date().toISOString(),
      expectedLabel: 'supported',
      sourceClarity: 'clear',
      relationJudgment:
        Number(c.source.noteTitle.split(' ').at(-1)) < 120 ? 'valid' : 'parse-error',
      reason: 'Generated structural fixture; not a notebook accuracy measurement.',
      evidenceQuotes: [c.premise],
    })),
  };
  const result = calibrateReviewedPacket(
    datasets,
    packet,
    review,
    {
      dataset: 'Current',
      holdoutFraction: 0.2,
      roles: { minFamilies: 20, minPrecision: 0.8, minValidRetention: 0.9 },
      semantic: {
        targetPrecision: { supported: 0.95, neutral: 0.9, contradicted: 0.9 },
        minCoverage: 0.5,
        minPerClass: 1,
      },
    },
    load
  );
  assert.equal(result.status, 'candidate-policy');
  assert.equal(result.policy, null, 'Missing semantic classes must not invent an NLI policy.');
  assert.ok(result.runtimePolicy.roleEvidence);
  assert.ok(!JSON.stringify(result).includes('runtimePolicy'));
  const target = resultOf([predictions[0].observation]);
  validation.prepareResultValidations(target, validation.relationPolicy(result.runtimePolicy));
  assert.equal(
    validation.optimizedValidationVerdict(target.candidates[0].validations[0]),
    'supported'
  );
});

test('the optimizer completes structural checks without calling or downloading any inference model', async () => {
  const run = load(path.join(root, 'analysis.ts')).runInductiveRelationAnalysis;
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const notes = [1, 2, 3].map((i) => ({
    title: 'Dictionary ' + i,
    description: names.map((name) => '## ' + name).join('\n'),
  }));
  notes.push({
    title: 'Data',
    description: 'Alpha uses Beta.\n\n| Record | Value |\n|---|---|\n| Gamma | Delta |',
  });
  const result = await run(notes, {
    scope: 'structural-only',
    policy: { maxMergeNliChecks: 0 },
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: () => assert.fail('no NLI for copies/cells'),
    }),
    store: { load: async () => new Map(), save: async () => {}, prune: async () => {} },
  });
  assert.equal(result.observationCount, 3);
  assert.equal(result.validationProgress.completed, 3);
  assert.equal(result.nliStats.validationChecks, 0);
  assert.deepEqual(result.verificationStats, {
    semantic: 0,
    'source-reconstruction': 1,
    'record-membership': 2,
  });
});

test('risk calibration cannot treat three perfect observations as 95 percent assured precision', () => {
  const rows = ['supported', 'neutral', 'contradicted'].map((label) => ({
    id: label,
    family: label,
    split: 'calibration',
    kind: 'natural',
    premise: 'Source ' + label,
    hypothesis: 'Claim ' + label,
    expectedLabel: label,
    validation: {
      scores:
        label === 'supported'
          ? supported
          : label === 'neutral'
          ? neutral
          : { entailment: 0.01, neutral: 0.03, contradiction: 0.96 },
    },
  }));
  assert.equal(
    evaluation.calibrateVerdicts(rows, {
      targetPrecision: { supported: 0.95, neutral: 0.9, contradicted: 0.9 },
      minCoverage: 0.75,
      minPerClass: 1,
    }),
    null
  );
});

test('calibration chooses lower error risk over more decisions at the required coverage', () => {
  const labels = ['supported', 'neutral', 'contradicted'];
  const keys = ['entailment', 'neutral', 'contradiction'];
  const rows = labels.flatMap((label, at) =>
    Array.from({ length: 120 }, (_, i) => ({
      id: label + i,
      family: label + i,
      split: 'calibration',
      kind: 'natural',
      premise: 'Source ' + label + i,
      hypothesis: 'Claim ' + label + i,
      expectedLabel: i >= 115 ? labels[(at + 1) % labels.length] : label,
      validation: {
        scores: Object.fromEntries(
          keys.map((name, k) => [
            name,
            k === at ? (i < 100 ? 0.95 : 0.65) : i < 100 ? 0.025 : 0.175,
          ])
        ),
      },
    }))
  );
  const fit = evaluation.calibrateVerdicts(rows, {
    targetPrecision: { supported: 0.8, neutral: 0.8, contradicted: 0.8 },
    minCoverage: 0.75,
    minPerClass: 50,
  });
  assert.equal(fit.coverage, 300 / 360);
  assert.deepEqual(fit.nli.thresholds, { supported: 0.95, neutral: 0.95, contradicted: 0.95 });
});

test('a failed calibrated diagnostic preserves the main decision and retries only that diagnostic', async () => {
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
    scope: 'optional-control-failure',
    store,
    maxRetries: 0,
    policy: { maxMergeNliChecks: 0, nli: { controlMargin: 0.1 } },
    inputBudget: async () => ({ tokens: 5, limit: 10 }),
  };
  const first = await run(notes, {
    ...options,
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async (p, h) => {
        if (
          (p.includes('Alpha') && h.includes('Delta')) ||
          (p.includes('Gamma') && h.includes('Beta'))
        )
          throw new Error('Diagnostic unavailable');
        return supported;
      },
    }),
  });
  assert.equal(first.validationProgress.failed, 0);
  assert.equal(first.validationProgress.completed, 2);
  assert.ok(
    first.candidates.every((c) =>
      c.validations.every((v) => v.verdict === 'supported' && v.controlError)
    )
  );
  const calls = [];
  const second = await run(notes, {
    ...options,
    runtimeFactory: () => ({
      embed: async () => [],
      entailment: async (p, h) => {
        calls.push([p, h]);
        return neutral;
      },
    }),
  });
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      ([p, h]) =>
        (p.includes('Alpha') && h.includes('Delta')) || (p.includes('Gamma') && h.includes('Beta'))
    )
  );
  assert.ok(
    second.candidates.every((c) =>
      c.validations.every((v) => v.verdict === 'supported' && !v.controlError)
    )
  );
});

test('document and copy families stay together under deterministic holdout assignment', () => {
  const packet = {
    documents: {},
    cases: [
      { source: { noteTitle: 'A' }, premise: 'Copy one' },
      { source: { noteTitle: 'B' }, premise: 'Copy one' },
      { source: { noteTitle: 'B' }, premise: 'Copy two' },
      { source: { noteTitle: 'C' }, premise: 'Copy two' },
      { source: { noteTitle: 'Other' }, premise: 'Different' },
    ],
  };
  const first = reviewFamilies(packet, 0.25);
  assert.deepEqual(first.get('A'), first.get('C'));
  assert.deepEqual(
    [...reviewFamilies({ ...packet, cases: [...packet.cases].reverse() }, 0.25)].sort(),
    [...first].sort()
  );
});

test('full-census calibration stays pending and writes no policy while any source remains unread', () => {
  const o = observation();
  const datasets = [
    {
      name: 'current',
      manifest: { observations: 1 },
      predictions: [
        { observation: o, validation: { evidence: o.evidence, hypothesis: o.evidence } },
      ],
    },
  ];
  const packet = prepareReview(datasets);
  const result = calibrateReviewedPacket(
    datasets,
    packet,
    { packetHash: packet.packetHash, judgments: [] },
    {}
  );
  assert.equal(result.status, 'pending-source-review');
  assert.equal(result.pending, 1);
  assert.equal(result.policy, null);
});
