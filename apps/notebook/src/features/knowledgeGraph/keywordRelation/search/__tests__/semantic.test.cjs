const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const load = require('../../__tests__/loadTs.cjs');
const storage = () => {
  const entries = new Map();
  return {
    entries,
    read: async (scope, key) => entries.get(JSON.stringify([scope, key])),
    write: async (scope, key, value) => {
      entries.set(JSON.stringify([scope, key]), structuredClone(value));
    },
  };
};
const vector = (value = 1) => [value, 0, 0];
const doc = (id, text) => ({ id, name: id, kind: 'node', text });
const dependencies = {
  '../relationCheckpoint': {
    relationCacheHash: async (text) => createHash('sha256').update(text).digest('hex'),
  },
  '../relationModels': {
    RELATION_MODELS: { embedding: 'multilingual-MiniLM' },
    createRelationDiscoveryRuntime: () => assert.fail('tests must inject runtime'),
  },
  '../relationDiscovery': {
    checkRelationCancelled: (signal) => {
      if (signal?.aborted) throw new Error('cancelled');
    },
  },
  './snapshot': {
    yieldGraphSearch: async (signal) => {
      if (signal?.aborted) throw new Error('cancelled');
    },
  },
};
const { prepareGraphSearchVectors, graphSemanticScores } = load('search/semantic.ts', dependencies);
function runtime() {
  const calls = [];
  return {
    calls,
    embed: async (text) => {
      calls.push(text);
      return vector();
    },
    entailment: () => assert.fail('NLI is not part of search'),
  };
}

test('semantic vectors deduplicate inputs and incrementally reuse only the current scoped model cache', async () => {
  const cache = storage(),
    inference = runtime(),
    progress = [];
  const documents = [doc('a', 'Alpha'), doc('duplicate', 'Alpha'), doc('b', 'Beta')];
  const first = await prepareGraphSearchVectors({
    scope: 'one',
    documents,
    cache,
    runtime: inference,
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.deepEqual(inference.calls, ['Alpha', 'Beta']);
  assert.equal(first.byDocument.size, 3);
  assert.deepEqual(progress.at(-1), [2, 2]);
  inference.calls.length = 0;
  await prepareGraphSearchVectors({
    scope: 'one',
    documents: [doc('a', 'Alpha'), doc('c', 'Gamma')],
    cache,
    runtime: inference,
  });
  assert.deepEqual(inference.calls, ['Gamma']);
  const saved = await cache.read('one', 'vectors');
  assert.equal(saved.vectors.length, 2, 'deleted text is pruned');
  inference.calls.length = 0;
  await prepareGraphSearchVectors({
    scope: 'two',
    documents: [doc('a', 'Alpha')],
    cache,
    runtime: inference,
  });
  assert.deepEqual(inference.calls, ['Alpha'], 'another notebook cannot reuse this scope');
  saved.model = 'different-model';
  await cache.write('one', 'vectors', saved);
  inference.calls.length = 0;
  await prepareGraphSearchVectors({
    scope: 'one',
    documents: [doc('a', 'Alpha')],
    cache,
    runtime: inference,
  });
  assert.deepEqual(inference.calls, ['Alpha'], 'different models cannot mix');
});

test('cosine retrieval uses real vectors, validates dimensions, and rejects unavailable model output', async () => {
  const inference = runtime();
  const scores = await graphSemanticScores(
    'query',
    new Map([
      ['similar', vector()],
      ['other', [0, 1, 0]],
    ]),
    undefined,
    inference
  );
  assert.equal(scores.get('similar'), 1);
  assert.equal(scores.get('other'), 0);
  await assert.rejects(
    graphSemanticScores('query', new Map([['bad', [1, 0]]]), undefined, inference),
    /incompatible/
  );
  await assert.rejects(
    prepareGraphSearchVectors({
      scope: 'one',
      documents: [doc('a', 'Alpha')],
      cache: storage(),
      runtime: { embed: async () => undefined },
    }),
    /unavailable/
  );
});

test('embedding windows feed the runtime in groups of 128 and stop without publishing cancelled vectors', async () => {
  const cache = storage(),
    sizes = [],
    controller = new AbortController();
  const inference = {
    embed: async () => assert.fail('should batch'),
    embedMany: async (texts, { onResult }) => {
      sizes.push(texts.length);
      for (let i = 0; i < texts.length; i++) onResult(i, vector());
    },
  };
  await prepareGraphSearchVectors({
    scope: 'one',
    documents: Array.from({ length: 257 }, (_, i) => doc(String(i), `text${i}`)),
    cache,
    runtime: inference,
  });
  assert.deepEqual(sizes, [128, 128, 1]);
  await assert.rejects(
    prepareGraphSearchVectors({
      scope: 'cancelled',
      documents: [doc('x', 'X')],
      cache,
      signal: controller.signal,
      runtime: {
        embed: async () => {
          controller.abort();
          return vector();
        },
      },
    }),
    /cancelled/
  );
  assert.equal(await cache.read('cancelled', 'vectors'), undefined);
});

function sharedVectors(createRelationDiscoveryRuntime) {
  return load('search/semantic.ts', {
    ...dependencies,
    '../relationModels': {
      ...dependencies['../relationModels'],
      createRelationDiscoveryRuntime,
    },
  }).ensureGraphSearchVectors;
}

test('cancelling one search subscriber keeps the shared embedding job running for the other', async () => {
  const cache = storage();
  const controller = new AbortController();
  let finish;
  let signal;
  let loaded = 0;
  let disposed = 0;
  const ensure = sharedVectors((jobSignal) => {
    loaded++;
    signal = jobSignal;
    return {
      embed: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      dispose: async () => {
        disposed++;
      },
    };
  });
  const options = {
    scope: 'shared',
    revision: 'one',
    documents: [doc('one', 'Alpha')],
    cache,
  };
  const progress = [];
  const cancelled = ensure({
    ...options,
    signal: controller.signal,
    onProgress: (processed) => progress.push(processed),
  });
  const active = ensure(options);
  await new Promise(setImmediate);
  assert.equal(loaded, 1);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(signal.aborted, false);
  finish(vector());
  assert.deepEqual((await active).byDocument.get('one'), vector());
  assert.deepEqual(progress, [0], 'cancelled subscribers receive no later progress');
  assert.equal(disposed, 1);
  assert.ok(await cache.read('shared', 'vectors'));
});

test('late completion of a cancelled job does not remove its replacement from the shared jobs', async () => {
  const jobs = [];
  const cache = storage();
  const ensure = sharedVectors((signal) => {
    const job = { signal, disposed: false };
    jobs.push(job);
    return {
      embed: () =>
        new Promise((resolve) => {
          job.finish = resolve;
        }),
      dispose: async () => {
        job.disposed = true;
      },
    };
  });
  const options = {
    scope: 'replaced',
    revision: 'one',
    documents: [doc('one', 'Alpha')],
    cache,
  };
  const controller = new AbortController();
  const cancelled = ensure({ ...options, signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(jobs[0].signal.aborted, true);

  const replacement = ensure(options);
  await new Promise(setImmediate);
  jobs[0].finish(vector());
  await new Promise(setImmediate);
  assert.equal(jobs[0].disposed, true);
  assert.equal(await cache.read('replaced', 'vectors'), undefined);

  const joined = ensure(options);
  await new Promise(setImmediate);
  assert.equal(jobs.length, 2, 'the third subscriber joins the replacement job');
  jobs[1].finish(vector());
  const [first, second] = await Promise.all([replacement, joined]);
  assert.equal(first, second);
  assert.equal(jobs[1].disposed, true);
});

test('durable cache migrates only hashed vectors and discards raw graph snapshots', async () => {
  const entries = new Map();
  const oldPrefix = '@blacktokki:notebook:graph-search:v1:';
  const oldSnapshot = oldPrefix + JSON.stringify(['user:1:normal', 'snapshot']);
  const oldVectors = oldPrefix + JSON.stringify(['user:1:normal', 'vectors']);
  const hash = 'a'.repeat(64);
  entries.set(oldSnapshot, JSON.stringify({ raw: 'private source text' }));
  const model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2:mean:normalized:search-v1';
  entries.set(
    oldVectors,
    JSON.stringify({ model, vectors: [[hash, vector(), 'private vector note']] })
  );
  const { graphSearchCache } = load('search/cache.ts', {
    '@react-native-async-storage/async-storage': {
      multiGet: async (keys) => keys.map((key) => [key, entries.get(key) ?? null]),
      getAllKeys: async () => [...entries.keys()],
      multiRemove: async (keys) => keys.forEach((key) => entries.delete(key)),
      setItem: async (key, value) => entries.set(key, value),
    },
  });
  assert.deepEqual(await graphSearchCache.read('user:1:normal', 'vectors'), {
    model,
    vectors: [[hash, vector()]],
  });
  await graphSearchCache.write('user:1:normal', 'snapshot', { raw: 'new private source text' });
  await graphSearchCache.write('user:1:normal', 'vectors', {
    model,
    vectors: [[hash, vector(), 'new private vector note']],
    raw: 'new private graph text',
  });
  assert.equal(await graphSearchCache.read('user:1:normal', 'snapshot'), undefined);
  assert.equal(entries.has(oldSnapshot), false);
  assert.equal(entries.has(oldVectors), false);
  assert.equal(JSON.stringify([...entries]).includes('private source text'), false);
  assert.equal(JSON.stringify([...entries]).includes('private vector note'), false);
  assert.equal(JSON.stringify([...entries]).includes('new private graph text'), false);
  assert.equal(JSON.stringify([...entries]).includes('new private vector note'), false);
  assert.equal(
    entries.has('@blacktokki:notebook:keyword_relation:user:1:normal/search/vectors'),
    true
  );
});

test('shared cache migrates valid NLI scores while removing legacy private text', async () => {
  const entries = new Map();
  const digest = 'b'.repeat(64);
  const oldPrefix = '@blacktokki:notebook:relation-analysis:user:1:normal/';
  const scoreKey = oldPrefix + `nli/${digest}/${digest}`;
  const scores = { entailment: 0.8, neutral: 0.1, contradiction: 0.1 };
  entries.set(scoreKey, JSON.stringify({ ...scores, privateText: 'hidden score text' }));
  entries.set(oldPrefix + 'base/0', 'sensitive note contents');
  const cache = load('keywordRelationCache.ts', {
    '@react-native-async-storage/async-storage': {
      multiGet: async (keys) => keys.map((key) => [key, entries.get(key) ?? null]),
      getAllKeys: async () => [...entries.keys()],
      multiRemove: async (keys) => keys.forEach((key) => entries.delete(key)),
      setItem: async (key, value) => entries.set(key, value),
    },
  });
  const current = `@blacktokki:notebook:keyword_relation:user:1:normal/nli/${digest}/${digest}`;
  assert.deepEqual(
    (await cache.keywordRelationEntries.read([current])).map((value) => JSON.parse(value)),
    [scores]
  );
  assert.equal(entries.has(scoreKey), false);
  assert.equal(JSON.stringify([...entries]).includes('sensitive note contents'), false);
  assert.equal(JSON.stringify([...entries]).includes('hidden score text'), false);
});
