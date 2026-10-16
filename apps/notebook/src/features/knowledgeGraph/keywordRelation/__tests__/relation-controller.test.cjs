const assert = require('node:assert/strict');
const { test } = require('node:test');

const { hookHarness } = require('./hookHarness.cjs');
const loadTs = require('./loadTs.cjs');
const summary = loadTs('relationSummary.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
});

function workspace() {
  const harness = hookHarness();
  const calls = [];
  const clears = [];
  const props = {
    scope: 'local:1:normal',
    active: true,
    notes: [{ title: 'One', description: 'body' }],
    refreshing: false,
  };
  const { useRelationAnalysis } = loadTs('useRelationAnalysis.ts', {
    react: harness.react,
    './types': loadTs('types.ts'),
    './relationSummary': summary,
    './relationAnalysis': {
      clearRelationAnalysisMemory: (scope) => clears.push(scope),
      runInductiveRelationAnalysis: (notes, options) =>
        new Promise((resolve, reject) => calls.push({ notes, options, resolve, reject })),
    },
  });
  return {
    calls,
    clears,
    props,
    render: () => harness.render(() => useRelationAnalysis(props)),
    unmount: harness.unmount,
  };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));

function preparation() {
  return {
    ...analysis(''),
    candidates: [],
    entityExtraction: {
      status: 'completed',
      noteCount: 3,
      inputCount: 2,
      mentionCount: 4,
      entities: [{ text: 'React Native', type: 'KEYWORD', noteCount: 3, mentionCount: 4 }],
    },
    inputPatterns: [
      {
        label: 'uses',
        template: '{{E1}} uses {{E2}}',
        origin: 'sentence',
        sourceType: 'KEYWORD',
        targetType: 'KEYWORD',
        observationCount: 1,
        noteSupport: 1,
        pairSupport: 1,
      },
    ],
  };
}
async function prepare(screen) {
  screen.render();
  const call = screen.calls.at(-1);
  assert.equal(call.options.prepareOnly, true);
  call.resolve(preparation());
  await settled();
  assert.equal(screen.render().status, 'ready');
}

test('entry automatically extracts patterns and waits for the button before embedding and NLI', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  screen.render();
  assert.equal(screen.calls.length, 1);
  assert.equal(screen.render().status, 'running');
  assert.equal(screen.render().prepareOnly, true);
  const automatic = screen.calls[0];
  assert.equal(automatic.options.prepareOnly, true);
  const prepared = preparation();
  automatic.options.onEntities(prepared.entityExtraction);
  automatic.options.onPatterns(prepared.inputPatterns);
  automatic.resolve(prepared);
  await settled();
  let state = screen.render();
  assert.equal(state.status, 'ready');
  assert.equal(state.entities, prepared.entityExtraction);
  assert.equal(state.patterns, prepared.inputPatterns);
  assert.equal(state.result, undefined);
  assert.equal(state.total, 1);
  assert.equal(state.phase, 'embedding');
  assert.equal(state.processed, 0);
  assert.equal(state.modelChecks, 0);
  assert.equal(state.reused, 0);
  assert.equal(state.elapsedMs, 0);
  assert.equal(state.model, undefined);
  screen.render();
  assert.equal(
    screen.calls.length,
    1,
    'pattern preparation must not automatically start embedding or NLI'
  );
  state.start();
  const nli = screen.calls[1];
  assert.equal(nli.options.prepareOnly, false);
  nli.options.onInferenceProgress({
    model: 'embedding',
    phase: 'embedding',
    total: 2,
    processed: 1,
    modelChecks: 1,
    modelFailures: 0,
    elapsedMs: 400,
  });
  assert.equal(screen.render().phase, 'embedding');
  assert.equal(screen.render().prepareOnly, false);
  nli.options.onInferenceProgress({
    model: 'nli',
    phase: 'validation',
    total: 201,
    processed: 200,
    modelChecks: 150,
    modelFailures: 0,
    reusedChecks: 50,
    savedBatch: 1,
    elapsedMs: 3000,
  });
  const batch = {
    batch: 1,
    total: 201,
    completed: 200,
    failed: 0,
    pending: 1,
    resumed: false,
    phase: 'validation',
    status: 'running',
  };
  const result = analysis('uses');
  nli.options.onBatch(batch, [
    { candidate: 0, index: 0, validation: result.candidates[0].validations[0] },
  ]);
  state = screen.render();
  assert.equal(state.prepareOnly, false);
  assert.equal(state.savedBatch, 1);
  assert.equal(state.reused, 50);
  assert.equal(state.processed, 200);
  nli.resolve(result);
  await settled();
  assert.equal(screen.render().status, 'completed');
  assert.equal(screen.render().result, result);
  assert.equal(screen.calls.length, 2);
});

test('preparation with no relationship evidence reports zero embedding inputs', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  screen.render();
  screen.calls[0].resolve({ ...preparation(), observationCount: 0, inputPatterns: [] });
  await settled();
  const state = screen.render();
  assert.equal(state.status, 'ready');
  assert.equal(state.phase, 'embedding');
  assert.equal(state.processed, 0);
  assert.equal(state.total, 0);
  assert.equal(screen.calls.length, 1);
});

test('an unchanged cached result immediately becomes completed without another button or model run', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  screen.render();
  assert.equal(screen.calls[0].options.restoreUnchanged, true);
  const cached = {
    ...analysis('cached'),
    ...preparation(),
    candidates: analysis('cached').candidates,
    cacheRestored: true,
    patternChanges: { added: 0, removed: 0 },
    validationProgress: {
      batch: 0,
      total: 1,
      completed: 1,
      failed: 0,
      pending: 0,
      resumed: true,
      reused: 1,
      modelChecks: 0,
      phase: 'validation',
      status: 'completed',
    },
  };
  screen.calls[0].resolve(cached);
  await settled();
  const state = screen.render();
  assert.equal(state.status, 'completed');
  assert.equal(state.result, cached);
  assert.deepEqual(state.patternChanges, { added: 0, removed: 0 });
  assert.equal(state.processed, 1);
  assert.equal(state.total, 1);
  assert.equal(state.reused, 1);
  assert.equal(state.modelChecks, 0);
  state.start();
  assert.equal(screen.calls[1].options.prepareOnly, false);
  screen.calls[1].resolve(analysis('again'));
  await settled();
});

test('stop waits for the cancellation save, retains committed batches and resumes NLI only on request', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  await prepare(screen);
  screen.render().start();
  const call = screen.calls[1];
  call.options.onBatch(
    {
      batch: 2,
      total: 600,
      completed: 400,
      failed: 0,
      pending: 200,
      phase: 'validation',
      status: 'running',
    },
    []
  );
  screen.render().stop();
  assert.equal(call.options.signal.aborted, true);
  assert.equal(screen.render().status, 'stopping');
  call.options.onInferenceProgress({
    phase: 'validation',
    total: 600,
    processed: 500,
    savedBatch: 9,
  });
  call.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  await settled();
  assert.equal(screen.render().status, 'cancelled');
  assert.equal(screen.render().savedBatch, 2);
  screen.props.refreshing = true;
  screen.render();
  screen.props.refreshing = false;
  screen.render();
  assert.equal(screen.calls.length, 2);
  screen.render().start();
  assert.equal(screen.calls[2].options.prepareOnly, false);
  screen.calls[2].resolve(analysis('resumed'));
  await settled();
  assert.equal(screen.render().status, 'completed');
});

test('a note edit cancels old NLI after refresh, automatically updates patterns and waits for a new analysis request', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  await prepare(screen);
  screen.render().start();
  const old = screen.calls[1];
  screen.props.refreshing = true;
  screen.props.notes = [{ title: 'Renamed', description: 'new content' }];
  screen.render();
  assert.equal(screen.calls.length, 2);
  screen.props.refreshing = false;
  screen.render();
  assert.equal(screen.calls.length, 3);
  assert.equal(screen.calls[2].options.prepareOnly, true);
  assert.equal(old.options.signal.aborted, true);
  assert.deepEqual(screen.clears, []);
  old.options.onEntities({ entities: [{ text: 'stale' }] });
  old.resolve(analysis('stale'));
  screen.calls[2].resolve(preparation());
  await settled();
  assert.equal(screen.render().status, 'ready');
  assert.equal(screen.render().result, undefined);
  assert.equal(screen.calls.length, 3);
  screen.render().start();
  screen.calls[3].resolve(analysis('updated'));
  await settled();
  assert.equal(screen.render().result.candidates[0].label, 'updated');
});

test('visiting a source note and returning retains completed results without restarting analysis', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  await prepare(screen);
  screen.render().start();
  const result = { ...analysis('retained'), entityExtraction: preparation().entityExtraction };
  screen.calls[1].resolve(result);
  await settled();
  screen.render();
  assert.equal(screen.render().status, 'completed');
  assert.equal(screen.render().result, result);
  assert.equal(screen.render().entities, result.entityExtraction);
  assert.equal(screen.calls.length, 2);
  assert.deepEqual(screen.clears, []);
  screen.props.refreshing = true;
  screen.render();
  screen.props.refreshing = false;
  screen.render();
  assert.equal(screen.render().result, result);
  assert.equal(screen.calls.length, 2, 'back must not reset or repeat completed analysis');
  screen.render().start();
  assert.equal(screen.calls[2].options.prepareOnly, false);
  screen.unmount();
  assert.equal(screen.clears.at(-1), screen.props.scope);
});

test('unchanged-source refresh preserves in-flight validation, progress and final results', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  await prepare(screen);
  screen.render().start();
  const call = screen.calls[1];
  const entities = preparation().entityExtraction;
  call.options.onEntities(entities);
  for (const refreshing of [true, false, true, false]) {
    screen.props.refreshing = refreshing;
    screen.render();
    assert.equal(call.options.signal.aborted, false);
    assert.equal(screen.render().status, 'running');
    assert.equal(screen.calls.length, 2);
  }
  call.options.onInferenceProgress({
    model: 'nli',
    phase: 'validation',
    processed: 20,
    total: 30,
    modelChecks: 20,
    modelFailures: 0,
    elapsedMs: 100,
  });
  assert.equal(screen.render().processed, 20);
  assert.equal(screen.render().entities, entities);
  const result = analysis('retained');
  call.resolve(result);
  await settled();
  assert.equal(screen.render().status, 'completed');
  assert.equal(screen.render().result, result);
  assert.deepEqual(screen.clears, []);
});

test('preparation waits for an explicit validation request and source edits still replace the running job', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  screen.render();
  const automatic = screen.calls[0];
  for (let index = 0; index < 4; index++) {
    screen.render();
    assert.equal(automatic.options.signal.aborted, false);
    assert.equal(screen.calls.length, 1);
  }
  automatic.resolve(preparation());
  await settled();
  assert.equal(screen.render().status, 'ready');
  assert.equal(screen.calls.length, 1);
  screen.render().start();
  const nli = screen.calls[1];
  assert.equal(nli.options.prepareOnly, false);
  screen.props.notes = [{ title: 'Updated while elsewhere', description: 'New body' }];
  screen.render();
  assert.equal(nli.options.signal.aborted, true);
  assert.equal(screen.calls[2].options.prepareOnly, true);
  assert.equal(screen.calls[2].options.signal.aborted, false);
  nli.resolve(analysis('late'));
  await settled();
  assert.equal(screen.render().result, undefined);
});

test('scope changes automatically prepare the new scope while disabled and unmounted screens suppress old callbacks', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args));
  const screen = workspace();
  screen.props.scope = 'local:1:private';
  screen.render();
  const privateCall = screen.calls[0];
  screen.props.scope = 'local:2:normal';
  screen.render();
  assert.equal(privateCall.options.signal.aborted, true);
  assert.deepEqual(screen.clears, ['local:1:private']);
  assert.equal(screen.calls[1].options.prepareOnly, true);
  privateCall.options.onPatterns([]);
  privateCall.resolve(analysis('private'));
  await settled();
  assert.equal(screen.render().result, undefined);
  assert.equal(logs.length, 0);
  screen.props.active = false;
  screen.render();
  assert.equal(screen.render().status, 'idle');
  assert.equal(screen.calls[1].options.signal.aborted, true);
  screen.render().start();
  assert.equal(screen.calls.length, 2);
  screen.props.active = true;
  screen.render();
  assert.equal(screen.calls.length, 3);
  screen.unmount();
  assert.equal(screen.calls[2].options.signal.aborted, true);
  assert.equal(screen.clears.at(-1), 'local:2:normal');
  screen.calls[1].resolve(analysis('late'));
  screen.calls[2].resolve(preparation());
  await settled();
  assert.equal(logs.length, 0);
});

test('preparation waits for loaded sources and requires retry after failure instead of starting NLI', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  screen.props.refreshing = true;
  screen.render();
  assert.equal(screen.calls.length, 0);
  screen.props.refreshing = false;
  screen.props.notes = undefined;
  screen.render();
  assert.equal(screen.calls.length, 0);
  screen.props.notes = [];
  screen.render();
  screen.calls[0].reject(new Error('offline'));
  await settled();
  assert.equal(screen.render().status, 'failed');
  assert.equal(screen.render().error, 'offline');
  screen.render().start();
  assert.equal(screen.calls[1].options.prepareOnly, true);
  screen.calls[1].resolve({
    ...preparation(),
    discoveryIncomplete: true,
    warnings: ['embedding offline'],
  });
  await settled();
  assert.equal(screen.render().status, 'failed');
  assert.equal(screen.render().error, 'embedding offline');
  assert.equal(screen.render().result, undefined);
  screen.render().start();
  screen.calls[2].resolve(preparation());
  await settled();
  assert.equal(screen.render().status, 'ready');
  screen.render().start();
  const result = { ...analysis('incomplete'), discoveryIncomplete: true };
  screen.calls[3].resolve(result);
  await settled();
  assert.equal(screen.render().status, 'failed');
  assert.equal(screen.render().prepareOnly, false);
  assert.equal(screen.render().result, result);
});

test('cancelled automatic preparation does not restart on rerender or refresh and resumes without starting NLI', async (t) => {
  t.mock.method(console, 'log', () => {});
  const screen = workspace();
  screen.render();
  screen.render().stop();
  const call = screen.calls[0];
  call.options.onEntities(preparation().entityExtraction);
  call.resolve(preparation());
  await settled();
  assert.equal(screen.render().status, 'cancelled');
  assert.equal(screen.render().entities, undefined);
  screen.props.refreshing = true;
  screen.render();
  screen.props.refreshing = false;
  screen.render();
  assert.equal(screen.calls.length, 1);
  screen.render().start();
  assert.equal(screen.calls[1].options.prepareOnly, true);
  screen.calls[1].resolve(preparation());
  await settled();
  assert.equal(screen.render().status, 'ready');
  assert.equal(screen.calls.length, 2);
});

function analysis(label) {
  return {
    noteCount: 1,
    entityCount: 2,
    observationCount: 1,
    warnings: [],
    candidates: [
      {
        id: 'candidate',
        label,
        template: '{{E1}}는 {{E2}}에서 일한다.',
        variants: [],
        noteSupport: 1,
        pairSupport: 1,
        recurring: false,
        observations: [
          {
            noteTitle: 'One',
            section: '활동',
            source: '민수',
            target: '서울대학교',
            sourceType: 'PER',
            targetType: 'ORG',
            origin: 'sentence',
            direction: 'text-order',
            evidence: '민수는 서울대학교에서 일한다.',
            template: '{{E1}}는 {{E2}}에서 일한다.',
          },
        ],
        validations: [
          {
            noteTitle: 'One',
            evidence: '민수는 서울대학교에서 일한다.',
            hypothesis: '민수는 서울대학교에서 일한다.',
            heldOut: false,
            verdict: 'uncertain',
            scores: { entailment: 0.72, neutral: 0.22, contradiction: 0.06 },
          },
        ],
      },
    ],
  };
}

test('summary shows checked examples first while retaining the original observation order', () => {
  const result = analysis('일한다');
  const candidate = result.candidates[0];
  candidate.observations.unshift({ ...candidate.observations[0], noteTitle: 'Unchecked' });
  candidate.validations.unshift({
    ...candidate.validations[0],
    noteTitle: 'Unchecked',
    verdict: 'unverified',
    scores: undefined,
    skipReason: 'pending',
  });
  const before = JSON.stringify(result);
  const output = summary.summarizeInductiveRelations(result).관계후보[0];
  assert.equal(output.대표사례[0].출처.노트, 'One');
  assert.equal(output.대표사례[1].미검증사유, '검증 대기');
  assert.equal(output.미검증사유별건수['검증 대기'], 1);
  assert.equal(JSON.stringify(result), before);
});
