const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { moduleLoader } = require('../run-corpus.cjs');
const root = path.join(__dirname, '..');
const good = { entailment: 0.96, neutral: 0.02, contradiction: 0.02 };
const neutral = { entailment: 0.05, neutral: 0.93, contradiction: 0.02 };
const dictionary = [1, 2, 3].map((i) => ({
  title: 'Dictionary ' + i,
  description: '## Alpha\n\n## Beta\n\n## Omega\n\n## Delta',
}));
const notes = [
  ...dictionary,
  { title: 'Record one', description: 'Alpha uses Beta.' },
  { title: 'Record two', description: 'Omega uses Delta.' },
];
function engine() {
  const load = moduleLoader({
    '@blacktokki/editor': { toMarkdown: (text) => text },
    '@react-native-async-storage/async-storage': {},
  });
  const discovery = load(path.join(root, '../relationDiscovery.ts'));
  const discover = discovery.discoverInductiveRelations;
  discovery.discoverInductiveRelations = async (...args) => {
    const result = await discover(...args);
    for (const candidate of result.candidates)
      candidate.validations.forEach((value, index) => {
        const o = candidate.observations[index];
        value.hypothesis = `${o.target} is used by ${o.source}.`;
        value.basis = 'source';
        value.verification = { kind: 'semantic' };
      });
    return result;
  };
  return {
    run: load(path.join(root, 'analysis.ts')).runInductiveRelationAnalysis,
    checkpoint: load(path.join(root, '../relationCheckpoint.ts')),
  };
}
function entries() {
  const data = new Map(),
    batches = [];
  return {
    data,
    batches,
    read: async (keys) => keys.map((k) => data.get(k) ?? null),
    write: async (values) => {
      batches.push(structuredClone(values));
      for (const [k, v] of values) data.set(k, v);
    },
    remove: async (keys) => keys.forEach((k) => data.delete(k)),
    keys: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
}
const inputBudget = async (premise) => ({ tokens: premise.includes('Omega') ? 20 : 5, limit: 10 });
const options = (store, infer, extra = {}) => ({
  scope: 'test:local:user1',
  store,
  batchSize: 1,
  maxRetries: 0,
  inputBudget,
  runtimeFactory: () => ({ embed: async () => [], entailment: infer }),
  ...extra,
});

test('one oversized input does not hide completed final scores or invent an added pattern', async () => {
  const first = engine(),
    io = entries(),
    store = first.checkpoint.createRelationNliCacheStore(io);
  let calls = 0;
  const result = await first.run(
    notes,
    options(store, async (_p, h) => {
      calls++;
      return h.includes('Beta') ? good : neutral;
    })
  );
  assert.equal(result.observationCount, 2);
  assert.equal(result.validationProgress.completed, 1);
  assert.equal(result.validationProgress.failed, 1);
  assert.equal(result.nliStats.oversizedInputs, 1);
  assert.equal(result.nliStats.validationChecks, calls);
  assert.ok(io.data.size > 0);
  for (const value of io.data.values()) {
    const record = JSON.parse(value);
    assert.ok(record.scores);
    assert.equal(record.evidence, undefined);
    assert.equal(record.hypothesis, undefined);
    assert.ok(record.relationships.every((r) => /^[a-f\d]{64}$/.test(r.id)));
  }
  const restored = await first.run(
    notes,
    options(store, () => assert.fail('no model call'), {
      embeddingOnly: true,
      restoreUnchanged: true,
    })
  );
  assert.deepEqual(restored.patternChanges, { added: 0, removed: 0 });
  assert.equal(restored.cacheRestored, false, 'partial restore is not a complete success');
  assert.equal(restored.validationProgress.completed, 1);
  assert.equal(restored.validationProgress.failed, 1);
  assert.equal(restored.validationProgress.pending, 0);
  assert.equal(restored.nliStats.validationChecks, 0);
  assert.ok(restored.candidates.some((c) => c.validations.some((v) => v.scores)));
  const tokenizerUnavailable = await first.run(
    notes,
    options(store, () => assert.fail('cached results require no model'), {
      embeddingOnly: true,
      restoreUnchanged: true,
      inputBudget: async () => {
        throw new Error('Tokenizer unavailable offline');
      },
    })
  );
  assert.equal(tokenizerUnavailable.validationProgress.completed, 1);
  assert.equal(tokenizerUnavailable.validationProgress.failed, 1);
  assert.equal(tokenizerUnavailable.nliStats.validationChecks, 0);
  assert.ok(tokenizerUnavailable.candidates.some((c) => c.validations.some((v) => v.scores)));
});

test('a completed batch survives interruption and a fresh runner; only changed note inputs rerun', async () => {
  const first = engine(),
    io = entries(),
    store = first.checkpoint.createRelationNliCacheStore(io);
  const abort = new AbortController();
  await assert.rejects(
    first.run(
      notes,
      options(store, async () => neutral, {
        inputBudget: async () => ({ tokens: 5, limit: 10 }),
        signal: abort.signal,
        onBatch: () => abort.abort(),
      })
    ),
    { name: 'AbortError' }
  );
  assert.equal(io.data.size, 1, 'first completed batch was saved before cancellation');
  const second = engine();
  let resumedCalls = 0;
  const resumed = await second.run(
    notes,
    options(
      store,
      async () => {
        resumedCalls++;
        return neutral;
      },
      { inputBudget: async () => ({ tokens: 5, limit: 10 }) }
    )
  );
  assert.equal(resumedCalls, 1);
  assert.equal(resumed.validationProgress.completed, 2);
  const changed = notes.map((n) =>
    n.title === 'Record one' ? { ...n, title: 'Renamed record' } : n
  );
  const renamed = await second.run(
    changed,
    options(store, () => assert.fail('identical final input should be reused'), {
      inputBudget: async () => ({ tokens: 5, limit: 10 }),
    })
  );
  assert.equal(renamed.nliStats.validationChecks, 0);
  assert.equal(renamed.discoveryStats.changedNotes, 1);
});
