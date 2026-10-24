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
  '../keywordRelationCache': {
    relationCacheHash: async (text) => createHash('sha256').update(text).digest('hex'),
  },
  './models': {
    RELATION_MODELS: { embedding: 'multilingual-MiniLM' },
    createRelationDiscoveryRuntime: () => assert.fail('tests must inject runtime'),
  },
  '../types': { ...load('types.ts') },
  './snapshot': {
    yieldGraphSearch: async (signal) => {
      if (signal?.aborted) throw new Error('cancelled');
    },
  },
  '../keyword/keywordUtils': {
    ...require('../../__tests__/loadTs.cjs')('keyword/keywordUtils.ts'),
    checkRelationCancelled: (signal) => {
      if (signal?.aborted) throw new Error('cancelled');
    },
  },
};
const { prepareGraphSearchVectors, graphSemanticScores, restoreGraphSearchEmbeddingCache } = load(
  'search/semantic.ts',
  dependencies,
  ['prepareGraphSearchVectors', 'graphSemanticScores']
);
function runtime() {
  const calls = [];
  return {
    calls,
    embed: async (text) => {
      calls.push(text);
      return vector();
    },
  };
}

test('a search session lazily reuses its model across queries and releases it once', async () => {
  let created = 0;
  let disposed = 0;
  const inference = runtime();
  const { createGraphSearchSession } = load('search/semantic.ts', {
    ...dependencies,
    './models': {
      ...dependencies['./models'],
      createRelationDiscoveryRuntime: () => {
        created++;
        return { ...inference, dispose: async () => disposed++ };
      },
    },
  });
  const session = createGraphSearchSession('interactive-model');
  const documents = new Map([['item', vector()]]);
  assert.equal(created, 0);
  for (const query of ['First', 'Second', 'First'])
    assert.equal((await session.scores(query, documents)).get('item'), 1);
  assert.equal(created, 1);
  assert.deepEqual(inference.calls, ['First', 'Second']);
  assert.equal(disposed, 0);
  await Promise.all([session.dispose(), session.dispose()]);
  assert.equal(disposed, 1);
  await assert.rejects(session.scores('After closing', documents), /cancelled/);
  assert.equal(created, 1);
});

test('queued queries skip cancellation and scope disposal rejects in-flight and queued results', async () => {
  const calls = [];
  let release;
  let disposed = false;
  let scopeSignal;
  const { createGraphSearchSession } = load('search/semantic.ts', {
    ...dependencies,
    './models': {
      ...dependencies['./models'],
      createRelationDiscoveryRuntime: (signal) => {
        scopeSignal = signal;
        return {
          embed: async (query) => {
            calls.push(query);
            return new Promise((resolve) => {
              release = () => resolve(vector());
            });
          },
          dispose: async () => {
            disposed = true;
          },
        };
      },
    },
  });
  const session = createGraphSearchSession('cancelled-interactive-model');
  const documents = new Map([['item', vector()]]);
  const first = session.scores('Running', documents);
  const controller = new AbortController();
  const second = session.scores('Obsolete', documents, controller.signal);
  controller.abort();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ['Running'], 'queries use the model sequentially');
  release();
  await first;
  await assert.rejects(second, /cancelled/);
  assert.deepEqual(calls, ['Running']);
  const third = session.scores('In flight at closing', documents);
  const fourth = session.scores('Queued at closing', documents);
  await new Promise(setImmediate);
  const closing = session.dispose();
  assert.equal(scopeSignal.aborted, true);
  release();
  await assert.rejects(third, /cancelled/);
  await assert.rejects(fourth, /cancelled/);
  await closing;
  assert.equal(disposed, true);
  assert.deepEqual(calls, ['Running', 'In flight at closing']);
});

test('a failed query model is released so the following query can retry in the same session', async () => {
  let created = 0;
  const released = [];
  const { createGraphSearchSession } = load('search/semantic.ts', {
    ...dependencies,
    './models': {
      ...dependencies['./models'],
      createRelationDiscoveryRuntime: () => {
        const instance = ++created;
        return {
          embed: async () => {
            if (instance === 1) throw new Error('temporary failure');
            return vector();
          },
          dispose: async () => released.push(instance),
        };
      },
    },
  });
  const session = createGraphSearchSession('retry-interactive-model');
  const documents = new Map([['item', vector()]]);
  await assert.rejects(session.scores('First query', documents), /temporary failure/);
  assert.deepEqual(released, [1]);
  assert.equal((await session.scores('Next query', documents)).get('item'), 1);
  assert.equal(created, 2);
  await session.dispose();
  assert.deepEqual(released, [1, 2]);
});

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

test('completed graph vectors restore after reload without text hashing, inference, progress or writes', async () => {
  const cache = storage();
  const options = {
    scope: 'saved-graph',
    revision: 'snapshot-revision',
    inputRevision: 'source-revision',
    documents: [doc('a', 'Alpha'), doc('duplicate', 'Alpha'), doc('b', 'Beta')],
    cache,
  };
  await prepareGraphSearchVectors({ ...options, runtime: runtime() });
  const saved = await cache.read(options.scope, 'vectors');
  assert.equal(saved.graph.documents.length, 3);
  assert.equal(saved.graph.documents[0], saved.graph.documents[1]);
  const fresh = load('search/semantic.ts', {
    ...dependencies,
    '../keywordRelationCache': { relationCacheHash: () => assert.fail('must not rehash text') },
  });
  const restoredCache = {
    read: cache.read,
    write: () => assert.fail('completed cache should not be rewritten'),
  };
  assert.deepEqual(
    await fresh.restoreGraphSearchEmbeddingCache({ ...options, cache: restoredCache }),
    { revision: options.revision, total: 2 }
  );
  const restored = await fresh.createGraphSearchSession(options.scope).vectors({
    ...options,
    cache: restoredCache,
    documents: options.documents.map(({ id }) => ({
      id,
      get text() {
        return assert.fail('must not rebuild embedding inputs');
      },
    })),
    onProgress: () => assert.fail('no preparation progress for a completed cache'),
  });
  assert.equal(restored.total, 2);
  assert.deepEqual([...restored.byDocument.keys()], ['a', 'duplicate', 'b']);
  assert.deepEqual([...restored.byDocument.values()], [vector(), vector(), vector()]);
});

test('changed graphs reuse unchanged vectors, prune removed documents and refresh completion metadata', async () => {
  const cache = storage();
  const inference = runtime();
  const options = { scope: 'edited', revision: 'before', inputRevision: 'old-source', cache };
  await prepareGraphSearchVectors({
    ...options,
    documents: [doc('a', 'Alpha'), doc('removed', 'Beta')],
    runtime: inference,
  });
  assert.equal(
    await restoreGraphSearchEmbeddingCache({ ...options, inputRevision: 'new-source' }),
    undefined
  );
  inference.calls.length = 0;
  await prepareGraphSearchVectors({
    ...options,
    revision: 'after',
    inputRevision: 'new-source',
    documents: [doc('a', 'Alpha'), doc('new', 'Gamma')],
    runtime: inference,
  });
  assert.deepEqual(inference.calls, ['Gamma']);
  assert.deepEqual(
    await restoreGraphSearchEmbeddingCache({ ...options, inputRevision: 'new-source' }),
    { revision: 'after', total: 2 }
  );
  const saved = await cache.read(options.scope, 'vectors');
  assert.equal(saved.vectors.length, 2);
  assert.equal(saved.graph.documents.length, 2);
});

test('legacy vector caches gain completion metadata without loading a model', async () => {
  const cache = storage();
  const options = { scope: 'legacy', documents: [doc('a', 'Alpha')], cache };
  await prepareGraphSearchVectors({ ...options, runtime: runtime() });
  assert.equal(
    await restoreGraphSearchEmbeddingCache({ ...options, inputRevision: 'source' }),
    undefined
  );
  await prepareGraphSearchVectors({
    ...options,
    revision: 'snapshot',
    inputRevision: 'source',
    onProgress: () => assert.fail('legacy cached vectors need no inference'),
  });
  assert.deepEqual(
    await restoreGraphSearchEmbeddingCache({ ...options, inputRevision: 'source' }),
    { revision: 'snapshot', total: 1 }
  );
  await prepareGraphSearchVectors({
    ...options,
    revision: 'snapshot',
    inputRevision: 'other-source',
  });
  assert.deepEqual(
    await restoreGraphSearchEmbeddingCache({ ...options, inputRevision: 'other-source' }),
    { revision: 'snapshot', total: 1 }
  );
});

test('incomplete, incompatible and corrupt vector metadata cannot mark embeddings complete', async (t) => {
  const cache = storage();
  const options = { scope: 'invalid', revision: 'snapshot', inputRevision: 'source', cache };
  await prepareGraphSearchVectors({
    ...options,
    documents: [doc('a', 'Alpha'), doc('b', 'Beta')],
    runtime: runtime(),
  });
  const complete = structuredClone(await cache.read(options.scope, 'vectors'));
  const cases = {
    'old model': (saved) => (saved.model = 'other-model'),
    'old format': (saved) => (saved.graph.version = 0),
    'missing vector': (saved) => saved.vectors.pop(),
    'invalid vector': (saved) => (saved.vectors[0][1] = [0, 0, 0]),
    'mixed dimensions': (saved) => (saved.vectors[0][1] = [1, 0]),
    'missing mapping': (saved) => delete saved.graph.documents,
    'truncated mapping': (saved) => saved.graph.documents.pop(),
    'bad mapping': (saved) => saved.graph.documents.push('unknown'),
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    await t.test(name, async () => {
      const saved = structuredClone(complete);
      corrupt(saved);
      await cache.write(options.scope, 'vectors', saved);
      assert.equal(await restoreGraphSearchEmbeddingCache(options), undefined);
    });
  }
  await cache.write(options.scope, 'vectors', complete);
  assert.equal(await restoreGraphSearchEmbeddingCache({ ...options, scope: 'other' }), undefined);
  const controller = new AbortController();
  await assert.rejects(
    restoreGraphSearchEmbeddingCache({
      ...options,
      signal: controller.signal,
      cache: {
        ...cache,
        read: async () => {
          controller.abort();
          return complete;
        },
      },
    }),
    /cancelled/
  );
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

test('durable search cache preserves only hashed vectors and completion metadata', async () => {
  const entries = new Map();
  const key = '@blacktokki:notebook:keyword_relation_vectors:1:0:normal';
  const hash = 'a'.repeat(64);
  const model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2:mean:normalized:search-v1';
  entries.set(key, JSON.stringify({ model, vectors: [[hash, vector(), 'private vector note']] }));
  const { graphSearchCache } = load('keywordRelationCache.ts', {
    '@react-native-async-storage/async-storage': {
      getAllKeys: async () => [...entries.keys()],
      multiRemove: async (keys) => keys.forEach((key) => entries.delete(key)),
      multiGet: async (keys) => keys.map((key) => [key, entries.get(key) ?? null]),
      setItem: async (key, value) => entries.set(key, value),
    },
  });
  assert.deepEqual(await graphSearchCache.read('1:0:normal', 'vectors'), {
    model,
    vectors: [[hash, vector()]],
  });
  assert.ok(
    !entries.get(key).includes('private vector note'),
    'reading removes unexpected source fields while retaining the vectors'
  );
  await graphSearchCache.write('1:0:normal', 'snapshot', { raw: 'new private source text' });
  await graphSearchCache.write('1:0:normal', 'vectors', {
    model,
    vectors: [[hash, vector(), 'new private vector note']],
    graph: {
      version: 1,
      revision: 'b'.repeat(64),
      documentCount: 1,
      inputRevision: 'c'.repeat(64),
      documents: [hash],
      raw: 'private graph metadata',
    },
    raw: 'new private graph text',
  });
  assert.deepEqual(await graphSearchCache.read('1:0:normal', 'vectors'), {
    model,
    vectors: [[hash, vector()]],
    graph: {
      version: 1,
      revision: 'b'.repeat(64),
      documentCount: 1,
      inputRevision: 'c'.repeat(64),
      documents: [hash],
    },
  });
  assert.equal(await graphSearchCache.read('1:0:normal', 'snapshot'), undefined);
  assert.equal(JSON.stringify([...entries]).includes('private vector note'), false);
  assert.equal(JSON.stringify([...entries]).includes('new private graph text'), false);
  assert.equal(JSON.stringify([...entries]).includes('new private vector note'), false);
  assert.equal(JSON.stringify([...entries]).includes('private graph metadata'), false);
  assert.deepEqual([...entries.keys()], [key], 'only the requested cache entry is written');
  entries.set(
    key,
    JSON.stringify({
      model: 'invalid synthetic model',
      raw: 'Synthetic source in unusable vector cache',
    })
  );
  assert.equal(await graphSearchCache.read('1:0:normal', 'vectors'), undefined);
  assert.equal(
    entries.get(key),
    'null',
    'an unusable vector record cannot retain raw source fields'
  );
});

test('browser cache writes and reloads scoped records using only the current database', async (t) => {
  const entries = new Map();
  const databaseName = '@blacktokki:notebook:keyword_relation';
  const opened = [];
  const database = {
    objectStoreNames: { contains: () => false },
    createObjectStore: (name) => assert.equal(name, 'entries'),
    transaction: (name) => {
      assert.equal(name, 'entries');
      const tx = {
        objectStore: () => ({
          get: (key) => {
            const request = {};
            queueMicrotask(() => {
              request.result = entries.get(key);
              request.onsuccess();
            });
            return request;
          },
          put: (value, key) => entries.set(key, value),
        }),
      };
      setImmediate(() => tx.oncomplete());
      return tx;
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  globalThis.indexedDB = {
    open: (name, version) => {
      assert.equal(name, databaseName);
      assert.equal(version, 2);
      opened.push(name);
      const request = { result: database };
      queueMicrotask(() => {
        if (opened.length === 1) request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    },
  };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else delete globalThis.indexedDB;
  });
  const dependencies = { '@react-native-async-storage/async-storage': {} };
  const cache = load('keywordRelationCache.ts', dependencies).keywordRelationEntries;
  const rows = [
    [`${databaseName}_patterns:1:7:normal`, JSON.stringify({ patterns: ['A'] })],
    [`${databaseName}_patterns:2:7:private`, JSON.stringify({ patterns: ['B'] })],
  ];
  await cache.write(rows);
  assert.deepEqual([...entries], rows, 'writes do not add migration or auxiliary records');
  const reloaded = load('keywordRelationCache.ts', dependencies).keywordRelationEntries;
  assert.deepEqual(await reloaded.read([rows[1][0], 'missing', rows[0][0]]), [
    rows[1][1],
    null,
    rows[0][1],
  ]);
  assert.deepEqual(opened, [databaseName, databaseName]);
});

test('vector storage uses standard subkeys and never reads or copies older key formats', async () => {
  const prefix = '@blacktokki:notebook:keyword_relation';
  const scope = '3:7:private';
  const key = `${prefix}_vectors:${scope}`;
  const legacy = `${prefix}:${JSON.stringify(['user:3:7:private', 'NOTEBOOK'])}/search/vectors`;
  const data = {
    model: 'synthetic:mean:normalized:search-v1',
    vectors: [['a'.repeat(64), vector()]],
  };
  const entries = new Map([[legacy, JSON.stringify(data)]]);
  const reads = [];
  const { graphSearchCache, keywordRelationCacheKey } = load('keywordRelationCache.ts', {
    '@react-native-async-storage/async-storage': {
      getAllKeys: async () => [...entries.keys()],
      multiRemove: async (keys) => keys.forEach((key) => entries.delete(key)),
      multiGet: async (keys) => {
        reads.push(...keys);
        return keys.map((key) => [key, entries.get(key) ?? null]);
      },
      setItem: async (key, value) => entries.set(key, value),
    },
  });
  assert.equal(keywordRelationCacheKey(':0:normal', 'patterns'), `${prefix}_patterns::0:normal`);
  assert.equal(
    keywordRelationCacheKey('3:7:private', 'metadata'),
    `${prefix}_metadata:3:7:private`
  );
  assert.equal(await graphSearchCache.read(scope, 'vectors'), undefined);
  assert.deepEqual(reads, [key]);
  assert.deepEqual(
    [...entries.keys()],
    [],
    'obsolete entries are deleted by key without reading or copying them'
  );
  await graphSearchCache.write(scope, 'vectors', data);
  assert.deepEqual(await graphSearchCache.read(scope, 'vectors'), data);
  for (const other of [':7:private', '4:7:private', '3:8:private', '3:7:normal'])
    assert.equal(await graphSearchCache.read(other, 'vectors'), undefined);
  assert.ok(reads.every((read) => read.startsWith(`${prefix}_vectors:`)));
  assert.deepEqual([...entries.keys()], [key]);
});

test('fallback retires source-bearing collections without reading their payload or recomputing vectors', async () => {
  const prefix = '@blacktokki:notebook:keyword_relation';
  const pattern = `${prefix}_patterns:1:7:normal`;
  const metadata = `${prefix}_metadata:1:7:normal`;
  const safe = `${prefix}_patterns:2:8:private`;
  const safeMetadata = `${prefix}_metadata:2:8:private`;
  const vectorKey = `${prefix}_vectors:1:7:normal`;
  const vectors = JSON.stringify({
    model: 'synthetic:mean:normalized:search-v1',
    vectors: [['a'.repeat(64), vector()]],
  });
  const entries = new Map([
    [pattern, 'Synthetic confidential title and source'],
    [metadata, JSON.stringify({ revision: 'relation-patterns-v2' })],
    [safe, 'safe source references'],
    [safeMetadata, JSON.stringify({ revision: 'relation-patterns-v3' })],
    [vectorKey, vectors],
    ['unrelated-setting', 'retained'],
  ]);
  const reads = [];
  const { graphSearchCache } = load('keywordRelationCache.ts', {
    '@react-native-async-storage/async-storage': {
      getAllKeys: async () => [...entries.keys()],
      multiGet: async (keys) => {
        reads.push(...keys);
        return keys.map((key) => [key, entries.get(key) ?? null]);
      },
      multiRemove: async (keys) => keys.forEach((key) => entries.delete(key)),
    },
  });
  assert.deepEqual(await graphSearchCache.read('1:7:normal', 'vectors'), JSON.parse(vectors));
  assert.ok(!reads.includes(pattern), 'retired source payload must never be read');
  assert.ok(!entries.has(pattern) && !entries.has(metadata));
  assert.equal(entries.get(vectorKey), vectors);
  assert.equal(entries.get(safe), 'safe source references');
  assert.equal(entries.get('unrelated-setting'), 'retained');
});
