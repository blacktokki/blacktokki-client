const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');

function gpu(t, fp16) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value:
      fp16 === undefined
        ? {}
        : {
            gpu: { requestAdapter: async () => ({ features: { has: () => fp16 } }) },
          },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
}

function model({ fail = false, dispose = async () => {}, embedding } = {}) {
  const result =
    embedding ||
    (async () => {
      if (fail) throw new Error('GPU inference failed');
      return { data: [1, 0] };
    });
  result.dispose = dispose;
  return result;
}

function library(create = () => model()) {
  const calls = [];
  return {
    calls,
    env: { backends: { onnx: { wasm: { numThreads: 4, proxy: true } } } },
    pipeline: async (task, name, options) => {
      calls.push({ task, name, options });
      const result = await create(task, options);
      options.progress_callback?.({ status: 'ready' });
      return result;
    },
  };
}

const models = (lib) => loadTs('search/models.ts', { '@huggingface/transformers': lib });

test('model files can prepare before source text exists without running inference or loading twice', async (t) => {
  gpu(t, false);
  let inferences = 0;
  const lib = library(() =>
    model({
      embedding: async () => {
        inferences++;
        return { data: [1, 0] };
      },
    })
  );
  const runtime = models(lib).createRelationDiscoveryRuntime();
  await Promise.all([runtime.prepare(), runtime.prepare()]);
  assert.equal(lib.calls.length, 1);
  assert.equal(inferences, 0);
  assert.deepEqual(await runtime.embed('Generated source'), [1, 0]);
  assert.equal(lib.calls.length, 1);
  assert.equal(inferences, 1);
  await runtime.dispose();
});

for (const fp16 of [true, false, undefined]) {
  test(`embedding loads directly and lazily with the supported device precision (${fp16})`, async (t) => {
    gpu(t, fp16);
    const lib = library();
    const runtime = models(lib).createRelationDiscoveryRuntime();
    assert.equal(lib.calls.length, 0);
    const result = await runtime.embed('same pattern');
    assert.deepEqual(result, [1, 0]);
    assert.equal(lib.calls[0].options.device, fp16 ? 'webgpu' : 'wasm');
    assert.equal(lib.calls[0].options.dtype, fp16 ? 'fp16' : 'q8');
    assert.equal(lib.env.backends.onnx.wasm.numThreads, 1);
    assert.equal(lib.env.backends.onnx.wasm.proxy, false);
    await runtime.dispose();
  });
}

for (const failure of ['load', 'inference']) {
  test(`embedding GPU ${failure} failure retries the same operation directly on CPU once`, async (t) => {
    gpu(t, true);
    const disposed = [];
    const lib = library((task, options) => {
      if (options.device === 'webgpu' && failure === 'load') throw new Error('GPU load failed');
      return model({
        fail: options.device === 'webgpu',
        dispose: async () => disposed.push(options.device),
      });
    });
    const runtime = models(lib).createRelationDiscoveryRuntime();
    await runtime.embed('same pattern');
    assert.deepEqual(
      lib.calls.map((call) => call.options.device),
      ['webgpu', 'wasm']
    );
    await runtime.embed('same pattern');
    assert.equal(lib.calls.length, 2, 'the successful CPU model is reused');
    if (failure === 'inference') assert.deepEqual(disposed, ['webgpu']);
    await runtime.dispose();
    assert.equal(disposed.at(-1), 'wasm');
  });
}

test('disposing the search model frees it exactly once and rejects later inference', async (t) => {
  gpu(t, true);
  let disposed = 0;
  const lib = library(() => model({ dispose: async () => disposed++ }));
  const runtime = models(lib).createRelationDiscoveryRuntime();
  await runtime.embed('pattern');
  await runtime.dispose();
  await runtime.dispose();
  assert.equal(disposed, 1);
  assert.equal(lib.calls.length, 1);
  assert.equal(lib.calls[0].task, 'feature-extraction');
  await assert.rejects(runtime.embed('inactive'), { name: 'AbortError' });
});

test('cancellation discards a pending direct inference result without starting a CPU retry', async (t) => {
  gpu(t, true);
  let finish;
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const lib = library(() =>
    model({
      embedding: () => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    })
  );
  const controller = new AbortController();
  const runtime = models(lib).createRelationDiscoveryRuntime(controller.signal);
  const pending = runtime.embed('pattern');
  await entered;
  controller.abort();
  finish({ data: [1, 0] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(lib.calls.length, 1);
  await runtime.dispose();
});

function batchModel(texts, lengths, run) {
  const extractor = model({
    embedding: async (input, options) => {
      assert.deepEqual(options, { pooling: 'mean', normalize: true });
      if (run) await run(input);
      const rows = typeof input === 'string' ? [input] : input;
      return {
        dims: [rows.length, 2],
        data: rows.flatMap((text) => [texts.indexOf(text) + 1, -1]),
      };
    },
  });
  extractor.tokenizer = (text, options) => {
    assert.equal(options.truncation, true);
    return { input_ids: { dims: [1, lengths[texts.indexOf(text)]] } };
  };
  return extractor;
}

test('GPU batches use token lengths and bounded padding, then restore original vector indices', async (t) => {
  gpu(t, true);
  const texts = Array.from({ length: 13 }, (_, i) => `pattern ${i}`);
  const lengths = [300, 5, 220, 7, 3, 9, 4, 6, 8, 2, 10, 12, 11];
  const calls = [];
  const lib = library(() => batchModel(texts, lengths, (input) => calls.push(input)));
  const runtime = models(lib).createRelationDiscoveryRuntime();
  const vectors = new Map();
  await runtime.embedMany(texts, {
    onResult: (index, vector) => vectors.set(index, vector),
  });
  const batches = calls.map((input) =>
    (Array.isArray(input) ? input : [input]).map((text) => texts.indexOf(text))
  );
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [8, 3, 1, 1]
  );
  assert.notEqual(batches[0][0], 0, 'execution order is based on tokens');
  for (const batch of batches) {
    assert.ok(batch.length <= 8);
    assert.ok(Math.max(...batch.map((i) => lengths[i])) * batch.length <= 512);
  }
  texts.forEach((_, index) => assert.deepEqual(vectors.get(index), [index + 1, -1]));
  await runtime.dispose();
});

for (const fp16 of [false, undefined]) {
  test(`CPU q8 keeps every embedding unpadded and never invokes the batch tokenizer (${fp16})`, async (t) => {
    gpu(t, fp16);
    const texts = ['first', 'second', 'third'];
    const calls = [];
    const lib = library(() => {
      const extractor = batchModel(texts, [], (input) => calls.push(input));
      extractor.tokenizer = () => assert.fail('CPU planning must not tokenize or pad a batch');
      return extractor;
    });
    const runtime = models(lib).createRelationDiscoveryRuntime();
    const vectors = [];
    await runtime.embedMany(texts, {
      onResult: (index, vector) => (vectors[index] = vector),
    });
    assert.deepEqual(calls, texts);
    assert.deepEqual(vectors, [
      [1, -1],
      [2, -1],
      [3, -1],
    ]);
    assert.equal(lib.calls[0].options.dtype, 'q8');
    await runtime.dispose();
  });
}

test('a failed GPU batch splits without changing precision, and invalid tensors never enter results', async (t) => {
  gpu(t, true);
  const texts = ['one', 'two', 'three', 'four'];
  const calls = [];
  const lib = library(() => {
    const extractor = batchModel(texts, [4, 4, 4, 4], (input) => calls.push(input));
    const original = extractor;
    const wrapped = async (input, options) => {
      if (Array.isArray(input) && input.length > 2) {
        calls.push(input);
        return { dims: [1, 2], data: [NaN, 0] };
      }
      return original(input, options);
    };
    return Object.assign(wrapped, extractor);
  });
  const runtime = models(lib).createRelationDiscoveryRuntime();
  const vectors = [];
  await runtime.embedMany(texts, {
    onResult: (index, vector) => (vectors[index] = vector),
  });
  assert.deepEqual(
    calls.map((input) => input.length),
    [4, 2, 2]
  );
  assert.equal(lib.calls.length, 1);
  assert.deepEqual(vectors, [
    [1, -1],
    [2, -1],
    [3, -1],
    [4, -1],
  ]);
  await runtime.dispose();
});

for (const failure of ['load', 'inference']) {
  test(`GPU ${failure} failure switches bulk embeddings to individual CPU calls`, async (t) => {
    gpu(t, true);
    const texts = ['one', 'two', 'three', 'four'];
    const cpuCalls = [];
    const lib = library((task, options) => {
      if (options.device === 'webgpu' && failure === 'load') throw new Error('GPU unavailable');
      return batchModel(texts, [4, 4, 4, 4], (input) => {
        if (options.device === 'webgpu') throw new Error('GPU unavailable');
        assert.equal(typeof input, 'string');
        cpuCalls.push(input);
      });
    });
    const runtime = models(lib).createRelationDiscoveryRuntime();
    const vectors = [];
    await runtime.embedMany(texts, {
      onResult: (index, vector) => (vectors[index] = vector),
    });
    assert.deepEqual(cpuCalls, texts);
    assert.deepEqual(vectors, [
      [1, -1],
      [2, -1],
      [3, -1],
      [4, -1],
    ]);
    assert.deepEqual(
      lib.calls.map((call) => call.options.device),
      ['webgpu', 'wasm']
    );
    await runtime.dispose();
  });
}

test('non-finite GPU vectors fall back to CPU and empty work never loads a model', async (t) => {
  gpu(t, true);
  const texts = ['one', 'two'];
  const lib = library((task, options) => {
    const extractor = batchModel(texts, [4, 4]);
    if (options.device !== 'webgpu') return extractor;
    return Object.assign(async (input) => {
      const rows = typeof input === 'string' ? 1 : input.length;
      return { dims: [rows, 2], data: Array(rows * 2).fill(NaN) };
    }, extractor);
  });
  const runtime = models(lib).createRelationDiscoveryRuntime();
  const vectors = [];
  const callbacks = { onResult: (index, vector) => (vectors[index] = vector) };
  await runtime.embedMany([], callbacks);
  assert.equal(lib.calls.length, 0);
  await runtime.embedMany(texts, callbacks);
  assert.deepEqual(vectors, [
    [1, -1],
    [2, -1],
  ]);
  assert.deepEqual(
    lib.calls.map((call) => call.options.device),
    ['webgpu', 'wasm']
  );
  await runtime.dispose();
});
