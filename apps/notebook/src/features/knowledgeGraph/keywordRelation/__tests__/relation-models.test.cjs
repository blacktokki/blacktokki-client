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

function model({ fail = false, tokens = 4, dispose = async () => {}, embedding } = {}) {
  const result =
    embedding ||
    (async () => {
      if (fail) throw new Error('GPU inference failed');
      return { data: [1, 0] };
    });
  result.dispose = dispose;
  result.tokenizer = (text, options) => {
    assert.equal(options.truncation, false);
    return { input_ids: { dims: [1, tokens] } };
  };
  result.model = async () => {
    if (fail) throw new Error('GPU inference failed');
    return { logits: { data: [0, 5, 0] } };
  };
  result.model.config = {
    id2label: { 0: 'contradiction', 1: 'entailment', 2: 'neutral' },
    max_position_embeddings: 512,
  };
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
      options.progress_callback({ status: 'ready' });
      return result;
    },
  };
}

const models = (lib) => loadTs('relationModels.ts', { '@huggingface/transformers': lib });
const infer = (runtime, stage) =>
  stage === 'embedding'
    ? runtime.embed('same pattern')
    : runtime.entailment('same premise', 'same hypothesis');

test('non-browser CPU execution keeps the platform default execution provider', async (t) => {
  gpu(t, undefined);
  delete globalThis.document;
  const lib = library();
  const runtime = models(lib).createRelationDiscoveryRuntime();
  assert.deepEqual(await runtime.embed('pattern'), [1, 0]);
  assert.equal(lib.calls[0].options.device, undefined);
  assert.equal(lib.calls[0].options.dtype, 'q8');
  await runtime.dispose();
});

for (const stage of ['embedding', 'nli']) {
  for (const fp16 of [true, false, undefined]) {
    test(`${stage} loads directly and lazily with the supported device precision (${fp16})`, async (t) => {
      gpu(t, fp16);
      const lib = library();
      const progress = [];
      const runtime = models(lib).createRelationDiscoveryRuntime(undefined, (value) =>
        progress.push(value)
      );
      assert.equal(lib.calls.length, 0);
      const result = await infer(runtime, stage);
      if (stage === 'embedding') assert.deepEqual(result, [1, 0]);
      else assert.ok(result.entailment > 0.9);
      assert.equal(lib.calls[0].options.device, fp16 ? 'webgpu' : 'wasm');
      assert.equal(lib.calls[0].options.dtype, fp16 ? 'fp16' : 'q8');
      assert.equal(progress.at(-1).backend, lib.calls[0].options.device);
      assert.equal(progress.at(-1).dtype, lib.calls[0].options.dtype);
      assert.equal(lib.env.backends.onnx.wasm.numThreads, 1);
      assert.equal(lib.env.backends.onnx.wasm.proxy, false);
      await runtime.dispose();
    });
  }

  for (const failure of ['load', 'inference']) {
    test(`${stage} GPU ${failure} failure retries the same operation directly on CPU once`, async (t) => {
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
      await infer(runtime, stage);
      assert.deepEqual(
        lib.calls.map((call) => call.options.device),
        ['webgpu', 'wasm']
      );
      await infer(runtime, stage);
      assert.equal(lib.calls.length, 2, 'the successful CPU model is reused');
      if (failure === 'inference') assert.deepEqual(disposed, ['webgpu']);
      await runtime.dispose();
      assert.equal(disposed.at(-1), 'wasm');
    });
  }
}

test('releasing a model stage frees it before NLI and GPU fallback stays local to its stage', async (t) => {
  gpu(t, true);
  const active = new Set();
  const disposed = [];
  const lib = library((task, options) => {
    assert.equal(active.size, 0);
    if (task === 'feature-extraction' && options.device === 'webgpu')
      throw new Error('GPU load failed');
    active.add(task);
    return model({
      dispose: async () => {
        active.delete(task);
        disposed.push(task);
      },
    });
  });
  const runtime = models(lib).createRelationDiscoveryRuntime();
  await runtime.embed('pattern');
  await runtime.release('embedding');
  await runtime.entailment('premise', 'hypothesis');
  assert.equal(lib.calls.at(-1).options.device, 'webgpu');
  await runtime.dispose();
  await runtime.dispose();
  assert.equal(active.size, 0);
  assert.deepEqual(disposed, ['feature-extraction', 'text-classification']);
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
  const progress = [];
  const runtime = models(lib).createRelationDiscoveryRuntime(controller.signal, (value) =>
    progress.push(value)
  );
  const pending = runtime.embed('pattern');
  await entered;
  controller.abort();
  finish({ data: [1, 0] });
  await assert.rejects(pending, { name: 'AbortError' });
  const previous = progress.length;
  lib.calls[0].options.progress_callback({ status: 'late' });
  assert.equal(progress.length, previous);
  assert.equal(lib.calls.length, 1);
  await runtime.dispose();
});

test('NLI context errors keep their reason and never trigger CPU fallback', async (t) => {
  gpu(t, true);
  const lib = library(() => model({ tokens: 513 }));
  const runtime = models(lib).createRelationDiscoveryRuntime();
  await assert.rejects(runtime.entailment('long source', 'hypothesis'), {
    name: 'RelationContextTooLongError',
  });
  assert.equal(lib.calls.length, 1);
  await runtime.dispose();
});

test('CPU load failures are cached for the run and releasing the stage permits a new attempt', async (t) => {
  gpu(t, undefined);
  let failed = true;
  const lib = library(() => {
    if (failed) throw new Error('Model unavailable');
    return model();
  });
  const runtime = models(lib).createRelationDiscoveryRuntime();
  for (let i = 0; i < 2; i++)
    await assert.rejects(runtime.embed('pattern'), {
      name: 'RelationModelLoadError',
      message: 'Model unavailable',
    });
  assert.equal(lib.calls.length, 1);
  await runtime.release('embedding');
  failed = false;
  assert.deepEqual(await runtime.embed('pattern'), [1, 0]);
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
  const batches = [];
  const vectors = new Map();
  await runtime.embedMany(texts, {
    onBatch: (indices) => batches.push(indices),
    onResult: (index, vector) => vectors.set(index, vector),
  });
  assert.equal(batches.length, calls.length);
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
      onBatch: (indices) => assert.equal(indices.length, 1),
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
    onBatch: () => {},
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
      onBatch: () => {},
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

test('bulk embedding drops cancelled GPU results and does not retry on CPU', async (t) => {
  gpu(t, true);
  const controller = new AbortController();
  const texts = ['one', 'two'];
  const lib = library(() => batchModel(texts, [4, 4], () => controller.abort()));
  const runtime = models(lib).createRelationDiscoveryRuntime(controller.signal);
  await assert.rejects(
    runtime.embedMany(texts, {
      onBatch: () => {},
      onResult: () => assert.fail('cancelled results must be discarded'),
    }),
    { name: 'AbortError' }
  );
  assert.equal(lib.calls.length, 1);
  await runtime.dispose();
});

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
  const callbacks = { onBatch: () => {}, onResult: (index, vector) => (vectors[index] = vector) };
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
