const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const load = require('../../__tests__/loadTs.cjs');

function fixture({ holdSnapshot = false, holdEmbedding = false } = {}) {
  const records = new Map();
  const calls = {
    revisions: 0,
    snapshots: [],
    indexes: 0,
    reads: 0,
    models: 0,
    initializations: 0,
    released: 0,
    embedded: [],
  };
  const cache = {
    read: async (scope, key) => {
      calls.reads++;
      return records.get(JSON.stringify([scope, key]));
    },
    write: async (scope, key, value) => {
      records.set(JSON.stringify([scope, key]), structuredClone(value));
    },
  };
  const semantic = load('search/semantic.ts', {
    '../keywordRelationCache': {
      relationCacheHash: async (value) => createHash('sha256').update(value).digest('hex'),
    },
    './models': {
      RELATION_MODELS: { embedding: 'preparation-test' },
      createRelationDiscoveryRuntime: () => {
        calls.models++;
        return {
          prepare: async () => {
            calls.initializations++;
          },
          embed: async (text) => {
            calls.embedded.push(text);
            if (holdEmbedding)
              await new Promise((resolve) => {
                calls.finishEmbedding = resolve;
              });
            return [1, 0];
          },
          dispose: async () => {
            calls.released++;
          },
        };
      },
    },
    './snapshot': { yieldGraphSearch: async () => {} },
  });
  const { acquireGraphSearchPreparation } = load('search/preparation.ts', {
    './semantic': semantic,
    './snapshot': {
      graphSearchInputRevision: async (input) => {
        calls.revisions++;
        return input.notes[0].description;
      },
      createGraphSearchSnapshot: async (input) => {
        let finish;
        const pending = new Promise((resolve) => {
          finish = resolve;
        });
        calls.snapshots.push({ input, finish });
        input.onProgress?.(1, 2);
        if (holdSnapshot) await pending;
        input.onProgress?.(2, 2);
        return { scope: input.scope, revision: input.notes[0].description };
      },
    },
    './engine': {
      createGraphSearchIndex: async (snapshot, signal, onProgress) => {
        calls.indexes++;
        onProgress?.(0, 2);
        onProgress?.(1, 2);
        onProgress?.(2, 2);
        return { snapshot, documents: [{ id: 'one', text: 'source ' + snapshot.revision }] };
      },
    },
  });
  const input = (scope, revision = 'original') => ({
    scope,
    notes: [{ title: 'Note', description: revision }],
  });
  const vectors = (lease, index, revision = 'source-v1') =>
    lease.vectors({
      revision: index.snapshot.revision,
      inputRevision: revision,
      documents: index.documents,
      cache,
    });
  return { acquire: acquireGraphSearchPreparation, input, vectors, calls, cache, records };
}

test('model initialization needs no graph input and both owners share files and first inference', async () => {
  const f = fixture();
  const first = f.acquire('early-model');
  const second = f.acquire('early-model');
  await Promise.all([first.initialize(), second.initialize()]);
  assert.equal(f.calls.models, 1);
  assert.equal(f.calls.initializations, 1);
  assert.deepEqual(f.calls.embedded, []);
  await Promise.all([first.warmup('Synthetic input'), second.warmup('Synthetic input')]);
  assert.deepEqual(f.calls.embedded, ['Synthetic input']);
  assert.deepEqual(
    first.modelTiming().steps.map((step) => step.name),
    ['모델파일준비', '모델첫추론']
  );
  await first.dispose();
  assert.equal(f.calls.released, 0);
  await second.dispose();
  assert.equal(f.calls.released, 1);
});

test('concurrent observers identify the same immutable input once and new input is reidentified', async () => {
  const f = fixture();
  const first = f.acquire('shared-revision');
  const second = f.acquire('shared-revision');
  const original = f.input('shared-revision');
  const cancelled = new AbortController();
  const leaving = first.revision(original, cancelled.signal);
  const staying = second.revision(original);
  cancelled.abort();
  await assert.rejects(leaving, { name: 'AbortError' });
  assert.equal(await staying, 'original');
  assert.equal(await first.revision(original), 'original');
  assert.equal(f.calls.revisions, 1);
  assert.equal(await second.revision(f.input('shared-revision', 'edited')), 'edited');
  assert.equal(f.calls.revisions, 2);
  await first.dispose();
  await second.dispose();
});

test('completed analysis hands the same index, vectors and warm model to the first search', async () => {
  const f = fixture();
  const background = f.acquire('account/notebook/normal');
  const initial = await background.index(f.input('account/notebook/normal'), 'source-v1');
  const prepared = await f.vectors(background, initial);
  assert.equal(f.calls.models, 1);
  assert.equal(f.calls.released, 0);
  const search = f.acquire('account/notebook/normal');
  const reused = await search.index(f.input('account/notebook/normal'), 'source-v1');
  const restored = await f.vectors(search, reused);
  assert.equal(reused, initial);
  assert.equal(restored, prepared);
  assert.equal(f.calls.snapshots.length, 1);
  assert.equal(f.calls.indexes, 1);
  assert.equal(f.calls.reads, 1, 'the first search does not reload the vector cache');
  const scores = await search.scores('First query', restored.byDocument);
  assert.equal(await search.scores('First query', restored.byDocument), scores);
  await search.scores('Another query', restored.byDocument);
  assert.equal(f.calls.models, 1, 'query inference uses the model loaded during analysis');
  assert.deepEqual(f.calls.embedded, ['source original', 'First query', 'Another query']);
  await background.dispose();
  assert.equal(f.calls.released, 0, 'the active search retains the model');
  await search.dispose();
  assert.equal(f.calls.released, 1);
  await search.dispose();
  assert.equal(f.calls.released, 1);
  assert.throws(() => search.index(f.input('account/notebook/normal'), 'source-v1'), /cancelled/);
  const reopened = f.acquire('account/notebook/normal');
  const fresh = await reopened.index(f.input('account/notebook/normal'), 'source-v1');
  assert.notEqual(fresh, initial, 'raw indexes do not survive the last owner');
  await f.vectors(reopened, fresh);
  assert.equal(f.calls.models, 1, 'restored vectors do not load a model');
  assert.equal(JSON.stringify([...f.records]).includes('source original'), false);
  await reopened.dispose();
});

test('a cache check shares its pending read with another owner and releases it after writes or final disposal', async () => {
  const f = fixture();
  const background = f.acquire('shared-cache');
  const search = f.acquire('shared-cache');
  const read = f.cache.read;
  let release;
  const waiting = new Promise((resolve) => (release = resolve));
  f.cache.read = async (...args) => {
    const result = await read(...args);
    await waiting;
    return result;
  };
  const checking = background.cache(f.cache).read('shared-cache', 'vectors');
  const index = await search.index(f.input('shared-cache'), 'v1');
  const restoring = f.vectors(search, index);
  await new Promise(setImmediate);
  assert.equal(f.calls.reads, 1, 'background checking and search must share the in-flight read');
  release();
  assert.equal(await checking, undefined);
  await restoring;
  const saved = await background.cache(f.cache).read('shared-cache', 'vectors');
  assert.equal(f.calls.reads, 2, 'vector writes invalidate the previous missing-cache snapshot');
  assert.equal(saved.graph.documentCount, 1);
  await background.dispose();
  assert.equal(await search.cache(f.cache).read('shared-cache', 'vectors'), saved);
  assert.equal(f.calls.reads, 2, 'the remaining owner retains this preparation');
  await search.dispose();
  assert.throws(() => search.cache(f.cache), /cancelled/);
  const reopened = f.acquire('shared-cache');
  await reopened.cache(f.cache).read('shared-cache', 'vectors');
  assert.equal(f.calls.reads, 3, 'a new preparation must revalidate durable storage');
  await reopened.dispose();
});

test('a failed shared cache read can be retried without retaining a rejected promise', async () => {
  const f = fixture();
  const lease = f.acquire('cache-retry');
  let reads = 0;
  const cache = lease.cache({
    read: async () => {
      if (++reads === 1) throw new Error('temporarily unavailable');
      return { vectors: [] };
    },
    write: async () => {},
  });
  await assert.rejects(cache.read('cache-retry', 'vectors'), /temporarily unavailable/);
  assert.deepEqual(await cache.read('cache-retry', 'vectors'), { vectors: [] });
  assert.equal(reads, 2);
  await lease.dispose();
});

test('restored vectors warm the shared query model before the first search and only once per lifetime', async () => {
  const f = fixture();
  const first = f.acquire('warm-after-restore');
  await f.vectors(first, await first.index(f.input('warm-after-restore'), 'source-v1'));
  await first.dispose();
  const background = f.acquire('warm-after-restore');
  const index = await background.index(f.input('warm-after-restore'), 'source-v1');
  const vectors = await f.vectors(background, index);
  assert.equal(f.calls.models, 1, 'vector restoration does not itself initialize inference');
  await background.warmup(index.documents[0].text);
  assert.equal(f.calls.models, 2);
  const embedded = f.calls.embedded.length;
  await background.warmup('Another available source');
  assert.equal(f.calls.embedded.length, embedded, 'warmup runs once for the shared runtime');
  const search = f.acquire('warm-after-restore');
  await search.scores('First query after restored analysis', vectors.byDocument);
  assert.equal(f.calls.models, 2, 'the first search does not load another model');
  await background.dispose();
  assert.equal(f.calls.released, 1);
  await search.dispose();
  assert.equal(f.calls.released, 2);
});

test('concurrent preparation is shared and cancellation belongs to each observer', async () => {
  const f = fixture({ holdSnapshot: true });
  const first = f.acquire('shared'),
    second = f.acquire('shared');
  const controller = new AbortController();
  const cancelled = first.index(f.input('shared'), 'v1', controller.signal);
  const kept = second.index(f.input('shared'), 'v1');
  await new Promise(setImmediate);
  assert.equal(f.calls.snapshots.length, 1);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(f.calls.snapshots[0].input.signal.aborted, false);
  f.calls.snapshots[0].finish();
  const index = await kept;
  assert.equal(index.snapshot.scope, 'shared');
  assert.equal(f.calls.indexes, 1);
  const old = first.index(f.input('shared', 'edited'), 'v2');
  await new Promise(setImmediate);
  await first.dispose();
  await assert.rejects(old, { name: 'AbortError' });
  assert.equal(f.calls.snapshots[1].input.signal.aborted, true);
  const replacement = second.index(f.input('shared', 'edited'), 'v2');
  await new Promise(setImmediate);
  f.calls.snapshots[1].finish();
  f.calls.snapshots[2].finish();
  const updated = await replacement;
  assert.equal(await second.index(f.input('shared', 'edited'), 'v2'), updated);
  await second.dispose();
});

test('shared index preparation replays snapshot and indexing progress and stops updates to cancelled observers', async () => {
  const f = fixture({ holdSnapshot: true });
  const first = f.acquire('progress');
  const second = f.acquire('progress');
  const cancelledProgress = [];
  const retainedProgress = [];
  const controller = new AbortController();
  const cancelled = first.index(f.input('progress'), 'v1', controller.signal, (...progress) =>
    cancelledProgress.push(progress)
  );
  await new Promise(setImmediate);
  const retained = second.index(f.input('progress'), 'v1', undefined, (...progress) =>
    retainedProgress.push(progress)
  );
  assert.deepEqual(retainedProgress, [[1, 2, 'snapshot']]);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  f.calls.snapshots[0].finish();
  await retained;
  assert.deepEqual(cancelledProgress, [[1, 2, 'snapshot']]);
  assert.deepEqual(retainedProgress, [
    [1, 2, 'snapshot'],
    [2, 2, 'snapshot'],
    [0, 2, 'index'],
    [1, 2, 'index'],
    [2, 2, 'index'],
  ]);
  const restoredProgress = [];
  await second.index(f.input('progress'), 'v1', undefined, (...progress) =>
    restoredProgress.push(progress)
  );
  assert.deepEqual(restoredProgress, [[2, 2, 'index']]);
  assert.equal(f.calls.indexes, 1);
  await first.dispose();
  await second.dispose();
});

test('source revisions and notebook/privacy scopes never reuse another index or vector mapping', async () => {
  const f = fixture();
  const normal = f.acquire('notebook/normal');
  const first = await normal.index(f.input('notebook/normal'), 'v1');
  const original = await f.vectors(normal, first, 'v1');
  const changed = await normal.index(f.input('notebook/normal', 'edited'), 'v2');
  const edited = await f.vectors(normal, changed, 'v2');
  assert.notEqual(changed, first);
  assert.notEqual(edited, original);
  const privateLease = f.acquire('notebook/private');
  const privateIndex = await privateLease.index(f.input('notebook/private'), 'v1');
  assert.notEqual(privateIndex, first);
  const other = f.acquire('other-notebook/normal');
  const otherIndex = await other.index(f.input('other-notebook/normal'), 'v1');
  assert.notEqual(otherIndex, first);
  assert.throws(() => normal.index(f.input('notebook/private'), 'v1'), /scope mismatch/);
  assert.equal(f.calls.snapshots.length, 4);
  await Promise.all([normal.dispose(), privateLease.dispose(), other.dispose()]);
  assert.equal(f.calls.released, 1);
});

test('the final owner stops preparation but releases the model only after active inference settles', async () => {
  const f = fixture({ holdEmbedding: true });
  const lease = f.acquire('closing');
  const index = await lease.index(f.input('closing'), 'v1');
  const pending = f.vectors(lease, index);
  await new Promise(setImmediate);
  assert.equal(f.calls.models, 1);
  assert.equal(typeof f.calls.finishEmbedding, 'function');
  const closing = lease.dispose();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.calls.released, 0, 'a model still running inference must stay alive');
  f.calls.finishEmbedding();
  await closing;
  assert.equal(f.calls.released, 1);
  assert.equal(f.records.size, 0, 'cancelled preparation cannot publish completed vectors');
});
