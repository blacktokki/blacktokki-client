const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');
const relationProgress = loadTs('relationProgress.ts');
const cacheModule = loadTs('relationCheckpoint.ts', {
  '@react-native-async-storage/async-storage': {},
});
const { createRelationNliCacheStore, relationCacheHash } = cacheModule;
const discovery = loadTs('relationDiscovery.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
  './relationProgress': relationProgress,
  '@blacktokki/editor': { toRaw: (text) => text, toMarkdown: (text) => text },
});
const cacheIdentity = loadTs('relationCacheMetadata.ts', {
  './relationCheckpoint': cacheModule,
  './relationDiscovery': discovery,
});
const supported = { entailment: 0.95, neutral: 0.04, contradiction: 0.01 };
const notes = [{ title: 'One', description: 'version 1' }];

function entries() {
  const data = new Map();
  const writes = [],
    removals = [];
  return {
    data,
    writes,
    removals,
    read: async (keys) => keys.map((key) => data.get(key) ?? null),
    write: async (values) => {
      writes.push(values);
      values.forEach(([key, value]) => data.set(key, value));
    },
    remove: async (keys) => {
      removals.push(...keys);
      keys.forEach((key) => data.delete(key));
    },
    keys: async (prefix) => [...data.keys()].filter((key) => key.startsWith(prefix)),
  };
}
function result(count, candidates = 1, label = '') {
  const groups = Array.from({ length: candidates }, (_, i) => ({
    id: `candidate${i}`,
    label,
    template: 'template',
    variants: [],
    noteSupport: 1,
    pairSupport: 1,
    recurring: false,
    observations: [],
    validations: [],
  }));
  for (let i = 0; i < count; i++)
    groups[i % candidates].validations.push({
      noteTitle: `Note${i}`,
      evidence: `${label}${i}`,
      hypothesis: `${label}${i}`,
      heldOut: false,
      verdict: 'unverified',
      skipReason: 'pending',
    });
  return {
    noteCount: 1,
    entityCount: 2,
    observationCount: count,
    candidates: groups,
    warnings: [],
    entityExtraction: {
      status: 'completed',
      noteCount: 1,
      inputCount: 0,
      mentionCount: 0,
      entities: [],
    },
    nliStats: {
      mergeChecks: 0,
      validationChecks: 0,
      successfulChecks: 0,
      modelErrors: 0,
      oversizedInputs: 0,
    },
  };
}
function engine(build, models = { nli: 'test-nli', embedding: 'test-embedding' }) {
  let discoveries = 0;
  return {
    ...loadTs('relationAnalysis.ts', {
      './relationProgress': relationProgress,
      './relationCheckpoint': cacheModule,
      './relationCacheMetadata': cacheIdentity,
      './relationDiscovery': build
        ? {
            ...discovery,
            discoverInductiveRelations: async (sources, options) => {
              discoveries++;
              const built = structuredClone(build(sources));
              options.onEntities?.(built.entityExtraction);
              options.onPatterns?.(built.inputPatterns || []);
              return built;
            },
          }
        : discovery,
      './relationModels': {
        RELATION_MODELS: models,
        RELATION_MODEL_DTYPES: { nli: { webgpu: 'fp16', cpu: 'q8' } },
      },
    }),
    discoveries: () => discoveries,
  };
}
function options(store, entailment = async () => supported, extra = {}) {
  return {
    scope: 'user:1:1:normal',
    store,
    retryDelayMs: 0,
    runtimeFactory: () => ({ entailment }),
    ...extra,
  };
}
const validations = (value) => value.candidates.flatMap((c) => c.validations);
const settle = () => new Promise((resolve) => setImmediate(resolve));

for (const backend of ['webcrypto', 'native']) {
  test(`cache hashes match SHA-256 for Unicode, separators and long inputs (${backend})`, async (t) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: backend === 'webcrypto' ? webcrypto : undefined,
    });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete globalThis.crypto;
    });
    for (const value of [
      '',
      'abc',
      '가나다😀',
      '\ud800',
      ...[55, 56, 63, 64, 65].map((length) => 'x'.repeat(length)),
      'x'.repeat(10000),
      '한😀'.repeat(200000),
      'x'.repeat(8 * 1024 * 1024 + 1),
      JSON.stringify(['a\0b', 'c']),
    ])
      assert.equal(
        await relationCacheHash(value),
        createHash('sha256').update(value).digest('hex')
      );
  });
}

test('persists final scores, prunes obsolete NLI entries, and preserves search vectors', async () => {
  const data = entries();
  const prefix = '@blacktokki:notebook:keyword_relation:user:1:1:normal/';
  for (const suffix of ['nli/obsolete/0', 'nli/obsolete/1'])
    data.data.set(prefix + suffix, 'legacy private text');
  data.data.set(prefix + 'search/vectors', 'hashed vector data');
  const other = '@blacktokki:notebook:keyword_relation:user:2:1:normal/nli/obsolete/0';
  data.data.set(other, 'other account');
  const analyzer = engine(() => result(3, 1, 'source text'));
  await analyzer.runInductiveRelationAnalysis(notes, options(createRelationNliCacheStore(data)));
  const saved = [...data.data].filter(([key]) => key.startsWith(prefix + 'nli/'));
  assert.equal(saved.length, 3);
  for (const [key, json] of saved) {
    assert.match(key, /\/nli\/[a-f0-9]{64}\/[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(json), supported);
    assert.doesNotMatch(key + json, /source text|legacy|Note|candidate|entity|cursor|fingerprint/);
  }
  assert.equal(data.data.get(other), 'other account');
  assert.equal(data.data.get(prefix + 'search/vectors'), 'hashed vector data');
});

test('body edits update only changed final inputs and leave unchanged cache entries untouched across fresh runners', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data);
  const build = (sources) => {
    const built = result(3);
    built.candidates[0].validations[0].evidence = sources[0].description;
    return built;
  };
  await engine(build).runInductiveRelationAnalysis(notes, options(store));
  const before = new Map(data.data);
  data.writes.length = 0;
  let calls = 0;
  const changed = await engine(build).runInductiveRelationAnalysis(
    [{ ...notes[0], description: 'version 2' }],
    options(store, async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, 1);
  assert.equal(changed.nliStats.reusedValidationChecks, 2);
  assert.equal(data.data.size, 3);
  assert.equal(data.removals.length, 1);
  assert.equal(data.writes.flat().length, 1);
  assert.equal([...before].filter(([key, value]) => data.data.get(key) === value).length, 2);
});

test('title changes reuse identical sentence inputs while changed field owner inputs are updated', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data);
  const build = (sources) => {
    const built = result(2);
    const owner = sources[0].title.split('/').at(-1);
    built.candidates[0].validations[0].evidence = `${owner}\n담당자: 민수`;
    built.candidates[0].validations[0].hypothesis = `${owner}의 담당자는 민수이다.`;
    return built;
  };
  const analyzer = engine(build);
  await analyzer.runInductiveRelationAnalysis([{ title: 'Folder/Old' }], options(store));
  let calls = 0;
  const renamed = await analyzer.runInductiveRelationAnalysis(
    [{ title: 'Folder/New' }],
    options(store, async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, 1);
  assert.equal(renamed.nliStats.reusedValidationChecks, 1);
  calls = 0;
  await analyzer.runInductiveRelationAnalysis(
    [{ title: 'OtherFolder/New' }],
    options(store, async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, 0, 'a path-only move does not change NLI text');
});

test('deletion prunes obsolete scores while preserving inputs still referenced by another note', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data);
  const analyzer = engine((sources) => result(sources.length));
  await analyzer.runInductiveRelationAnalysis([{}, {}, {}], options(store));
  data.writes.length = 0;
  await analyzer.runInductiveRelationAnalysis(
    [{}],
    options(store, async () => assert.fail('remaining score should be reused'))
  );
  assert.equal(data.data.size, 1);
  assert.equal(data.writes.length, 0);
  await analyzer.runInductiveRelationAnalysis([], options(store));
  assert.equal(data.data.size, 0);
});

test('exact premise and hypothesis identify scores independently of notes, candidates, order and duplicate occurrences', async () => {
  const source = result(405, 3);
  source.candidates.forEach((c) =>
    c.validations.forEach((v) => {
      v.evidence = '동일 원문';
      v.hypothesis = '동일 검증';
    })
  );
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(() => source);
  let calls = 0;
  const config = options(store, async () => {
    calls++;
    return supported;
  });
  const first = await analyzer.runInductiveRelationAnalysis(notes, config);
  assert.equal(calls, 1);
  assert.equal(first.nliStats.reusedValidationChecks, 404);
  assert.equal(data.data.size, 1);
  const fresh = await engine(() => source).runInductiveRelationAnalysis(
    [...notes].reverse(),
    config
  );
  assert.equal(calls, 1);
  assert.equal(fresh.nliStats.reusedValidationChecks, 405);
  assert.equal(fresh.validationProgress.completed, 405);
});

test('changing direction, case, whitespace or either input text requires a separate score', async () => {
  const pairs = [
    ['a', 'b'],
    ['b', 'a'],
    ['A', 'b'],
    ['a ', 'b'],
    ['a', 'b '],
    ['a\0b', 'c'],
    ['a', 'b\0c'],
  ];
  const source = result(pairs.length);
  source.candidates[0].validations.forEach((v, i) => ([v.evidence, v.hypothesis] = pairs[i]));
  let calls = 0;
  const data = entries();
  await engine(() => source).runInductiveRelationAnalysis(
    notes,
    options(createRelationNliCacheStore(data), async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, pairs.length);
  assert.equal(data.data.size, pairs.length);
});

test('NLI model policy and account/notebook/privacy scope isolate scores without tying them to embedding settings', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data);
  const models = { nli: 'model1', embedding: 'embed1' };
  const analyzer = engine(() => result(1), models);
  let calls = 0;
  const config = options(store, async () => {
    calls++;
    return supported;
  });
  await analyzer.runInductiveRelationAnalysis(notes, config);
  models.embedding = 'embed2';
  await analyzer.runInductiveRelationAnalysis(notes, config);
  assert.equal(calls, 1);
  models.nli = 'model2';
  await analyzer.runInductiveRelationAnalysis(notes, config);
  assert.equal(calls, 2);
  for (const scope of ['user:2:1:normal', 'user:1:2:normal', 'user:1:1:private'])
    await analyzer.runInductiveRelationAnalysis(notes, { ...config, scope });
  assert.equal(calls, 5);
  assert.equal(data.data.size, 4, 'old versions are pruned only in their own scope');
});

test('cancelled inference saves completed partial results and a fresh runner computes only remaining inputs', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    controller = new AbortController();
  const analyzer = engine(() => result(3));
  let calls = 0,
    batches = 0;
  await assert.rejects(
    analyzer.runInductiveRelationAnalysis(
      notes,
      options(
        store,
        async () => {
          if (++calls === 2) {
            controller.abort();
            throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
          }
          return supported;
        },
        { signal: controller.signal, onBatch: () => batches++ }
      )
    ),
    { name: 'AbortError' }
  );
  assert.equal(data.data.size, 1);
  assert.equal(batches, 0);
  calls = 0;
  const resumed = await engine(() => result(3)).runInductiveRelationAnalysis(
    notes,
    options(store, async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, 2);
  assert.equal(resumed.validationProgress.completed, 3);
  assert.equal(resumed.validationProgress.resumed, true);
});

test('partial native writes remain reusable without advancing or depending on a saved cursor', async () => {
  const data = new Map();
  let interrupt = true;
  const native = {
    multiGet: async (keys) => keys.map((key) => [key, data.get(key) ?? null]),
    getAllKeys: async () => [...data.keys()],
    multiRemove: async (keys) => keys.forEach((key) => data.delete(key)),
    setItem: async (key, value) => {
      if (interrupt && data.size === 2) throw new Error('interrupted write');
      data.set(key, value);
    },
  };
  const nativeModule = loadTs('relationCheckpoint.ts', {
    '@react-native-async-storage/async-storage': native,
  });
  const store = nativeModule.createRelationNliCacheStore();
  const analyzer = engine(() => result(3));
  await assert.rejects(
    analyzer.runInductiveRelationAnalysis(notes, options(store, undefined, { batchSize: 2 })),
    /interrupted write/
  );
  assert.equal(data.size, 2);
  interrupt = false;
  let calls = 0;
  const resumed = await engine(() => result(3)).runInductiveRelationAnalysis(
    notes,
    options(store, async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, 2);
  assert.equal(resumed.validationProgress.completed, 3);
});

test('invalid cache entries are replaced and failed inference never becomes a durable hit', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(() => result(1));
  await analyzer.runInductiveRelationAnalysis(notes, options(store));
  const key = [...data.data.keys()][0];
  data.data.set(key, '{broken');
  let calls = 0;
  await analyzer.runInductiveRelationAnalysis(
    notes,
    options(store, async () => {
      calls++;
      return supported;
    })
  );
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(data.data.get(key)), supported);
  await store.prune('user:1:1:normal', 'obsolete', new Set());
  const failed = await analyzer.runInductiveRelationAnalysis(
    notes,
    options(
      store,
      async () => {
        throw new Error('offline');
      },
      { maxRetries: 0 }
    )
  );
  assert.equal(failed.validationProgress.status, 'failed');
  assert.equal(data.data.size, 0);
  const retried = await analyzer.runInductiveRelationAnalysis(notes, options(store));
  assert.equal(retried.validationProgress.completed, 1);
});

test('per-input retries preserve successful work and duplicate successes repair earlier failed occurrences', async () => {
  const source = result(2);
  source.candidates[0].validations.forEach((v) => {
    v.evidence = 'same';
    v.hypothesis = 'same';
  });
  let calls = 0;
  const data = entries();
  const analyzed = await engine(() => source).runInductiveRelationAnalysis(
    notes,
    options(createRelationNliCacheStore(data), async () => {
      if (++calls === 1) throw new Error('transient');
      return supported;
    })
  );
  assert.equal(calls, 2);
  assert.equal(analyzed.validationProgress.completed, 2);
  assert.equal(analyzed.validationProgress.failed, 0);
  assert.equal(data.data.size, 1);
});

test('persistent loading failures have bounded retries and no failed-result cache', async () => {
  let calls = 0;
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(() => result(5));
  const first = await analyzer.runInductiveRelationAnalysis(
    notes,
    options(store, async () => {
      calls++;
      throw Object.assign(new Error('offline'), { name: 'RelationModelLoadError' });
    })
  );
  assert.equal(calls, 3);
  assert.equal(first.validationProgress.status, 'failed');
  assert.equal(data.data.size, 0);
  const next = await analyzer.runInductiveRelationAnalysis(notes, options(store));
  assert.equal(next.validationProgress.completed, 5);
});

test('oversized inputs are terminal within a run and only successful scores survive later runs', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(() => result(2));
  let calls = 0;
  const config = options(store, async (text) => {
    calls++;
    if (text === '0')
      throw Object.assign(new Error('too long'), { name: 'RelationContextTooLongError' });
    return supported;
  });
  const first = await analyzer.runInductiveRelationAnalysis(notes, config);
  assert.equal(first.validationProgress.failed, 1);
  assert.equal(data.data.size, 1);
  await analyzer.runInductiveRelationAnalysis(notes, config);
  assert.equal(calls, 3, 'only the oversized input is attempted again in the next run');
});

test('NLI heartbeats still report pending model work before any score batch is saved', async (t) => {
  const timers = new Map();
  let id = 0;
  t.mock.method(globalThis, 'setInterval', (fn) => {
    timers.set(++id, fn);
    return id;
  });
  t.mock.method(globalThis, 'clearInterval', (key) => timers.delete(key));
  const output = [];
  let finish;
  const analyzer = engine(() => result(1));
  const promise = analyzer.runInductiveRelationAnalysis(
    notes,
    options(
      createRelationNliCacheStore(entries()),
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      {
        onInferenceProgress: (p) => output.push(p),
      }
    )
  );
  while (!finish) await settle();
  [...timers.values()][0]();
  assert.equal(output.at(-1).processed, 0);
  assert.equal(output.at(-1).modelChecks, 1);
  assert.equal(output.at(-1).savedBatch, 0);
  finish(supported);
  await promise;
  assert.equal(output.at(-1).processed, 1);
  assert.equal(timers.size, 0);
});

const corpus = () => [
  ...Array.from({ length: 3 }, (_, i) => ({
    title: `Dictionary${i}`,
    description: '# Alpha\n# Beta\n# Gamma\n# Delta',
  })),
  { title: 'One', description: 'Alpha uses Beta.' },
  { title: 'Two', description: 'Gamma visits Delta.' },
];
function realOptions(store, calls, extra = {}) {
  let phase;
  return options(store, undefined, {
    onInferenceProgress: (p) => {
      phase = p.phase;
    },
    runtimeFactory: () => ({
      embed: async (text) => {
        calls.push({ phase: 'embedding', text });
        return text.includes('visits') ? [0, 1] : [1, 0];
      },
      entailment: async (premise, hypothesis) => {
        calls.push({ phase, premise, hypothesis });
        return supported;
      },
      release: async () => {},
    }),
    ...extra,
  });
}

test('the shared batch runner validates concrete numeric endpoints without substituting classification patterns', async () => {
  const sources = ['First', 'Second', 'Third'].map((title) => ({
    title: `Projects/${title}/Sprint 1`,
    description:
      '# Minji\n## Sprint 2\n## Sprint 3\n담당자: Minji\n\nSprint 1 uses Minji.\nSprint 2 uses Minji.\nSprint 777 uses Minji.',
  }));
  const calls = [];
  const result = await engine().runInductiveRelationAnalysis(
    sources,
    realOptions(createRelationNliCacheStore(entries()), calls)
  );
  assert.equal(result.validationProgress.completed, 9);
  const checked = validations(result);
  assert.equal(checked.filter((item) => item.verdict === 'supported').length, 3);
  const reconstructed = checked.filter((item) => item.hypothesis.includes(' uses '));
  assert.equal(reconstructed.length, 6);
  assert.ok(reconstructed.every((item) => item.verdict === 'uncertain'));
  const finalCalls = calls.filter((call) => call.phase === 'validation');
  assert.ok(finalCalls.length > 0);
  assert.ok(
    finalCalls.every(
      (call) => !call.hypothesis.includes('{{NUM}}') && !call.premise.includes('777')
    )
  );
  assert.ok(finalCalls.some((call) => call.hypothesis.includes('Sprint 1')));
  assert.ok(finalCalls.some((call) => call.hypothesis.includes('Sprint 2')));
});

test('automatic preparation stops before embedding and persistence; manual analysis starts with embedding', async () => {
  const data = entries(),
    calls = [],
    access = [],
    lifecycle = [];
  const persisted = createRelationNliCacheStore(data);
  const store = Object.fromEntries(
    ['load', 'save', 'prune'].map((name) => [
      name,
      (...args) => {
        access.push(name);
        return persisted[name](...args);
      },
    ])
  );
  const analyzer = engine();
  const sources = corpus();
  const config = realOptions(store, calls, {
    runtimeFactory: () => ({
      embed: async (text) => {
        calls.push({ phase: 'embedding', text });
        return [1, 0];
      },
      entailment: async (premise, hypothesis) => {
        calls.push({ phase: 'nli', premise, hypothesis });
        return supported;
      },
      release: async (stage) => lifecycle.push(stage),
      dispose: async () => lifecycle.push('disposed'),
    }),
  });
  const prepared = await analyzer.runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
  });
  assert.equal(prepared.inputPatterns.length, 2);
  assert.equal(prepared.observationCount, 2);
  assert.equal(prepared.candidates.length, 0);
  assert.equal(prepared.nliStats.mergeChecks, 0);
  assert.equal(prepared.nliStats.validationChecks, 0);
  assert.equal(prepared.validationProgress, undefined);
  assert.deepEqual(calls, []);
  assert.deepEqual(access, []);
  assert.deepEqual(lifecycle, []);
  calls.length = 0;
  const complete = await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.equal(complete.discoveryStats.embeddingReuses, 0);
  assert.ok(complete.nliStats.mergeChecks > 0);
  assert.ok(complete.nliStats.validationChecks > 0);
  assert.deepEqual(
    calls.slice(0, 2).map((call) => call.phase),
    ['embedding', 'embedding']
  );
  assert.ok(calls.slice(2).every((call) => call.phase === 'nli'));
  assert.ok(access.includes('load') && access.includes('save') && access.includes('prune'));
  assert.equal(complete.validationProgress.status, 'completed');
  const previous = [...data.data];
  access.length = 0;
  calls.length = 0;
  sources[3] = { ...sources[3], description: 'Alpha admires Beta.' };
  const changed = await analyzer.runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
  });
  assert.equal(changed.discoveryStats.changedNotes, 1);
  assert.equal(changed.discoveryStats.reusedNotes, 4);
  assert.equal(changed.discoveryStats.embeddingReuses, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(access, []);
  assert.deepEqual(
    [...data.data],
    previous,
    'automatic preparation must not prune or overwrite existing final scores'
  );
});

test('preparation never starts a model and cancellation preserves final scores', async () => {
  const analyzer = engine();
  const data = entries();
  const config = {
    scope: 'local:1:normal',
    store: createRelationNliCacheStore(data),
    prepareOnly: true,
    runtimeFactory: () => assert.fail('preparation cannot create model runtimes'),
    onInferenceProgress: () => assert.fail('preparation cannot run embedding or NLI'),
  };
  const prepared = await analyzer.runInductiveRelationAnalysis(corpus(), config);
  assert.equal(prepared.inputPatterns.length, 2);
  assert.equal(prepared.discoveryIncomplete, undefined);
  const controller = new AbortController();
  await assert.rejects(
    analyzer.runInductiveRelationAnalysis(corpus(), {
      ...config,
      signal: controller.signal,
      onPatterns: () => controller.abort(),
    }),
    { name: 'AbortError' }
  );
  assert.deepEqual(data.writes, []);
  assert.deepEqual(data.removals, []);
});

test('pattern deltas compare persisted final results and a fresh session restores zero changes without NLI', async () => {
  const data = entries(),
    calls = [],
    store = createRelationNliCacheStore(data),
    analyzer = engine();
  const sources = corpus();
  const config = realOptions(store, calls);
  const first = await analyzer.runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(first.patternChanges, { added: 2, removed: 0 });
  assert.equal(first.cacheRestored, undefined);
  const repeated = await analyzer.runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(
    repeated.patternChanges,
    { added: 2, removed: 0 },
    'preparation alone never becomes the cache baseline'
  );
  const full = await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.deepEqual(
    full.patternChanges,
    { added: 0, removed: 0 },
    'successful final scores synchronize the persisted baseline'
  );
  const persistedCount = data.data.size;
  calls.length = 0;
  data.writes.length = 0;
  sources[3] = { ...sources[3], title: 'Renamed/One' };
  const fresh = engine();
  const restored = await fresh.runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(restored.patternChanges, { added: 0, removed: 0 });
  assert.equal(restored.cacheRestored, true);
  assert.equal(restored.validationProgress.status, 'completed');
  assert.equal(restored.validationProgress.reused, 2);
  assert.equal(restored.validationProgress.modelChecks, 0);
  assert.ok(validations(restored).some((item) => item.noteTitle === 'Renamed/One'));
  assert.deepEqual(calls, [], 'matching cached patterns restore before embedding or NLI');
  assert.deepEqual(data.writes, []);
  const again = await fresh.runInductiveRelationAnalysis(sources, config);
  assert.equal(again.validationProgress.status, 'completed');
  assert.deepEqual(calls, [], 'an explicit rerun also skips models when cached grouping matches');
  sources[3] = { ...sources[3], description: 'Alpha admires Beta.' };
  const edited = await engine().runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(edited.patternChanges, { added: 1, removed: 1 });
  assert.equal(edited.cacheRestored, undefined);
  const backToCached = await engine().runInductiveRelationAnalysis(corpus(), {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(
    backToCached.patternChanges,
    { added: 0, removed: 0 },
    'unsaved preparations never replace the persisted baseline'
  );
  assert.equal(backToCached.cacheRestored, true);
  const removed = await engine().runInductiveRelationAnalysis(corpus().slice(0, -1), {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(
    removed.patternChanges,
    { added: 0, removed: 1 },
    'a fresh screen can count patterns absent from current notes'
  );
  assert.equal(
    data.data.size,
    persistedCount,
    'preparation keeps main and alternative final-score caches intact'
  );
});

for (const [sharedControl, changedMain] of [
  [false, false],
  [true, false],
  [true, true],
]) {
  test(`deleting a pattern updates shared ${
    sharedControl ? 'control' : 'main'
  } score references across restarts (changed main: ${changedMain})`, async () => {
    const data = entries();
    const store = createRelationNliCacheStore(data);
    const sources = [{ title: 'One' }, { title: 'Two' }];
    const build = (current) => {
      const value = result(current.length, current.length);
      value.candidates.forEach((candidate, index) => {
        const observation = {
          noteTitle: current[index].title,
          section: '',
          source: 'Alpha',
          target: 'Beta',
          sourceType: null,
          targetType: null,
          origin: 'sentence',
          evidence: 'Shared source sentence',
          template: `{{E1}} predicate${index} {{E2}}.`,
          direction: 'text-order',
        };
        candidate.observations = [observation];
        candidate.template = observation.template;
        candidate.validations[0] = {
          ...candidate.validations[0],
          noteTitle: observation.noteTitle,
          evidence: observation.evidence,
          hypothesis: sharedControl
            ? `Claim ${index}${current[index].description || ''}`
            : 'Shared claim',
          ...(sharedControl && { control: { hypothesis: 'Shared control' } }),
        };
      });
      return value;
    };
    let calls = 0;
    const config = options(store, async (_, hypothesis) => {
      calls++;
      return hypothesis === 'Shared control'
        ? { entailment: 0.02, neutral: 0.96, contradiction: 0.02 }
        : supported;
    });
    await engine(build).runInductiveRelationAnalysis(sources, config);
    calls = 0;
    const remaining = sources.slice(0, 1).map((source) => ({
      ...source,
      description: changedMain ? ' updated' : '',
    }));
    const changed = await engine(build).runInductiveRelationAnalysis(remaining, config);
    assert.deepEqual(changed.patternChanges, { added: 0, removed: 0 });
    assert.equal(calls, changedMain ? 1 : 0, 'only a changed main input needs inference');
    const savedPatterns = new Set(
      [...data.data.values()].flatMap((json) =>
        (JSON.parse(json).relationships || []).flatMap((reference) => reference.patterns)
      )
    );
    assert.equal(savedPatterns.size, 1, 'shared scores must not retain the removed pattern');
    const reloaded = await engine(build).runInductiveRelationAnalysis(remaining, {
      ...config,
      prepareOnly: true,
      restoreUnchanged: true,
    });
    assert.deepEqual(reloaded.patternChanges, { added: 0, removed: 0 });
    assert.equal(reloaded.cacheRestored, true);
    assert.equal(calls, changedMain ? 1 : 0, 'reopening restores results without inference');
  });
}

test('final score records retain hashed identities and legacy grouping waits for explicit analysis', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    calls = [];
  const config = realOptions(store, calls);
  await engine().runInductiveRelationAnalysis(corpus(), config);
  for (const [key, json] of data.data) {
    const record = JSON.parse(json);
    assert.deepEqual(record.scores, supported);
    assert.equal(record.relationships.length, 1);
    assert.match(record.relationships[0].id, /^[a-f0-9]{64}$/);
    assert.ok(record.relationships[0].patterns.every((id) => /^[a-f0-9]{64}$/.test(id)));
    assert.doesNotMatch(json, /Alpha|Beta|uses|visits|Dictionary/);
    data.data.set(key, JSON.stringify(record.scores));
  }
  calls.length = 0;
  const analyzer = engine();
  const prepared = await analyzer.runInductiveRelationAnalysis(corpus(), {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.equal(prepared.cacheRestored, undefined);
  assert.equal(prepared.cacheIndexIncomplete, true);
  assert.deepEqual(calls, []);
  const restored = await analyzer.runInductiveRelationAnalysis(corpus(), config);
  assert.equal(restored.nliStats.validationChecks, 0);
  assert.equal(restored.cacheIndexIncomplete, false);
  assert.deepEqual(restored.patternChanges, { added: 0, removed: 0 });
  assert.ok(calls.every((call) => call.phase === 'embedding'));
  assert.ok([...data.data.values()].every((json) => JSON.parse(json).relationships.length));
});

test('cancelled validation retains pattern identities with each saved score for a fresh preparation', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    abort = new AbortController();
  const config = realOptions(store, [], {
    signal: abort.signal,
    runtimeFactory: () => ({
      embed: async (text) => (text.includes('visits') ? [0, 1] : [1, 0]),
      entailment: async () => {
        abort.abort();
        return supported;
      },
    }),
  });
  await assert.rejects(engine().runInductiveRelationAnalysis(corpus(), config), {
    name: 'AbortError',
  });
  assert.equal(data.data.size, 1);
  const prepared = await engine().runInductiveRelationAnalysis(corpus(), {
    ...realOptions(store, []),
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(prepared.patternChanges, { added: 1, removed: 0 });
  assert.equal(prepared.cacheRestored, undefined);
});

test('zero pattern changes never auto-infer missing final inputs and persisted groups restore after session loss', async () => {
  const data = entries(),
    calls = [],
    store = createRelationNliCacheStore(data),
    analyzer = engine();
  const sources = corpus();
  const config = realOptions(store, calls);
  await analyzer.runInductiveRelationAnalysis(sources, config);
  // Same pattern, new entity pair: final scores must match exact texts, not the template alone.
  sources[3] = { ...sources[3], description: 'Gamma uses Delta.' };
  calls.length = 0;
  const missing = await analyzer.runInductiveRelationAnalysis(sources, {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.deepEqual(missing.patternChanges, { added: 0, removed: 0 });
  assert.equal(missing.cacheRestored, undefined);
  assert.deepEqual(calls, []);
  // Final-result identity metadata restores prior groups without cached intermediate merge scores.
  const fresh = engine(),
    mergedCalls = [];
  const mergeConfig = realOptions(store, mergedCalls, {
    runtimeFactory: () => ({
      embed: async () => [1, 0],
      entailment: async () => {
        mergedCalls.push('NLI');
        return supported;
      },
    }),
  });
  await fresh.runInductiveRelationAnalysis(corpus(), { ...mergeConfig, prepareOnly: true });
  const mergeMiss = await fresh.runInductiveRelationAnalysis(corpus(), {
    ...mergeConfig,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.equal(mergeMiss.cacheRestored, true);
  assert.deepEqual(mergeMiss.patternChanges, { added: 0, removed: 0 });
  assert.deepEqual(mergedCalls, []);
});

test('persisted final group identities restore merged groups after a restart and remain scoped', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine();
  let modelCalls = 0;
  const config = realOptions(store, [], {
    runtimeFactory: () => ({
      embed: async () => [1, 0],
      entailment: async () => {
        modelCalls++;
        return supported;
      },
    }),
  });
  await analyzer.runInductiveRelationAnalysis(corpus(), config);
  modelCalls = 0;
  const restored = await engine().runInductiveRelationAnalysis(corpus(), {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.equal(restored.cacheRestored, true);
  assert.equal(restored.candidates.length, 1);
  assert.equal(modelCalls, 0);
  const privateConfig = {
    ...config,
    scope: 'user:1:1:private',
    prepareOnly: true,
    restoreUnchanged: true,
  };
  const privateResult = await analyzer.runInductiveRelationAnalysis(corpus(), privateConfig);
  assert.deepEqual(privateResult.patternChanges, { added: 2, removed: 0 });
  const privateAgain = await analyzer.runInductiveRelationAnalysis(corpus(), privateConfig);
  assert.equal(privateResult.cacheRestored, undefined);
  assert.equal(privateAgain.cacheRestored, undefined);
  assert.deepEqual(privateAgain.patternChanges, { added: 2, removed: 0 });
  assert.equal(modelCalls, 0);
});

test('legacy merged scores retain unknown pattern counts until group metadata can be rebuilt', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data);
  let phase;
  const nliPhases = [];
  const config = realOptions(store, [], {
    onInferenceProgress: (progress) => {
      phase = progress.phase;
    },
    runtimeFactory: () => ({
      embed: async () => [1, 0],
      entailment: async () => {
        nliPhases.push(phase);
        return supported;
      },
    }),
  });
  await engine().runInductiveRelationAnalysis(corpus(), config);
  for (const [key, json] of data.data) data.data.set(key, JSON.stringify(JSON.parse(json).scores));
  nliPhases.length = 0;
  const analyzer = engine();
  const prepared = await analyzer.runInductiveRelationAnalysis(corpus(), {
    ...config,
    prepareOnly: true,
    restoreUnchanged: true,
  });
  assert.equal(prepared.cacheIndexIncomplete, true);
  assert.equal(
    prepared.patternChanges,
    undefined,
    'missing persisted identities must not be presented as zero changes'
  );
  assert.equal(prepared.cacheRestored, undefined);
  assert.deepEqual(nliPhases, []);
  const rebuilt = await analyzer.runInductiveRelationAnalysis(corpus(), config);
  assert.deepEqual(rebuilt.patternChanges, { added: 0, removed: 0 });
  assert.equal(rebuilt.cacheIndexIncomplete, false);
  assert.equal(rebuilt.nliStats.validationChecks, 0, 'exact legacy final scores remain reusable');
  assert.ok(nliPhases.length > 0 && nliPhases.every((item) => item === 'merge'));
});

test('one edited note reuses other parsed notes and embeddings and updates only affected final scores', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(),
    sources = corpus(),
    calls = [];
  const config = realOptions(store, calls);
  await analyzer.runInductiveRelationAnalysis(sources, config);
  calls.length = 0;
  data.writes.length = 0;
  sources[3] = { ...sources[3], description: 'Alpha admires Beta.' };
  const changed = await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.equal(changed.discoveryStats.changedNotes, 1);
  assert.equal(changed.discoveryStats.reusedNotes, 4);
  assert.equal(changed.discoveryStats.rematchedNotes, 1);
  assert.equal(changed.discoveryStats.embeddingReuses, 1);
  assert.equal(calls.filter((c) => c.phase === 'validation').length, 1);
  assert.equal(calls.filter((c) => c.phase === 'embedding').length, 1);
  assert.equal(data.writes.flat().length, 1);
  assert.equal(data.data.size, 2);
  calls.length = 0;
  await analyzer.runInductiveRelationAnalysis([...sources].reverse(), config);
  assert.equal(calls.length, 0);
  analyzer.clearRelationAnalysisMemory();
  await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.equal(
    calls.filter((c) => c.phase === 'validation').length,
    0,
    'fresh discovery reuses final persistent scores'
  );
  assert.equal(
    calls.filter((c) => c.phase === 'embedding').length,
    0,
    'persisted grouping skips embedding after session memory is cleared'
  );
});

test('crossing the three-note entity threshold rematches unchanged dependent notes and prunes their vanished results', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(),
    calls = [];
  const sources = [0, 1, 2].map((i) => ({
    title: `Note${i}`,
    description: '**Alpha**\n\n**Beta**' + (i ? '' : '\n\nAlpha uses Beta.'),
  }));
  const config = realOptions(store, calls);
  const first = await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.equal(first.observationCount, 1);
  sources[2] = { ...sources[2], description: '**Beta**' };
  const next = await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.equal(next.discoveryStats.changedNotes, 1);
  assert.equal(next.discoveryStats.reusedNotes, 2);
  assert.equal(next.observationCount, 0);
  assert.equal(data.data.size, 0);
  assert.ok(!next.entityExtraction.entities.some((e) => e.text === 'Alpha'));
});

test('a changed paraphrase can invalidate the hypothesis of an unchanged source note', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(),
    sources = corpus(),
    calls = [];
  sources[4].description = 'Gamma utilizes Delta.';
  const config = realOptions(store, calls);
  const first = await analyzer.runInductiveRelationAnalysis(sources, config);
  const previous = validations(first).find((v) => v.noteTitle === 'One');
  calls.length = 0;
  const unchanged = await analyzer.runInductiveRelationAnalysis(sources, config);
  assert.equal(unchanged.nliStats.mergeChecks, 0);
  assert.equal(calls.length, 0, 'unchanged groups are restored from final-result metadata');
  sources[4] = { ...sources[4], description: 'Gamma employs Delta.' };
  const changed = await analyzer.runInductiveRelationAnalysis(sources, config);
  const current = validations(changed).find((v) => v.noteTitle === 'One');
  assert.equal(current.evidence, previous.evidence);
  assert.notEqual(current.hypothesis, previous.hypothesis);
  assert.ok(
    calls.some(
      (c) =>
        c.phase === 'validation' &&
        c.premise === current.evidence &&
        c.hypothesis === current.hypothesis
    )
  );
  assert.ok(changed.discoveryStats.mergeScoreReuses < changed.nliStats.mergeChecks);
});

test('incomplete discovery reuses exact final scores but retains potentially unobserved cache entries', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data);
  await engine(() => result(3)).runInductiveRelationAnalysis(notes, options(store));
  const partial = engine(() => ({ ...result(1), discoveryIncomplete: true }));
  await partial.runInductiveRelationAnalysis(
    notes,
    options(store, async () => assert.fail('existing input should be reused'))
  );
  assert.equal(data.data.size, 3);
});

test('final validation visits each candidate before its next example, including across batch boundaries', async () => {
  const calls = [];
  const completed = await engine(() => result(7, 3)).runInductiveRelationAnalysis(
    notes,
    options(
      createRelationNliCacheStore(entries()),
      async (premise) => {
        calls.push(premise);
        return supported;
      },
      { batchSize: 2 }
    )
  );
  assert.deepEqual(calls, ['0', '1', '2', '3', '4', '5', '6']);
  assert.equal(completed.validationProgress.completed, 7);
});

test('all 84,426 final inputs finish in 423 writes and subsequent runners infer none of them', async () => {
  const data = entries(),
    store = createRelationNliCacheStore(data),
    analyzer = engine(() => result(84426, 3));
  let calls = 0;
  const config = options(store, async () => {
    calls++;
    return supported;
  });
  const first = await analyzer.runInductiveRelationAnalysis(notes, config);
  assert.equal(first.validationProgress.completed, 84426);
  assert.equal(data.writes.length, 423);
  assert.equal(data.data.size, 84426);
  const next = await engine(() => result(84426, 3)).runInductiveRelationAnalysis(notes, config);
  assert.equal(calls, 84426);
  assert.equal(next.nliStats.validationChecks, 0);
  assert.equal(next.validationProgress.completed, 84426);
});

test('failed merge discovery preserves older final scores until a complete rebuild can prune obsolete inputs', async () => {
  const data = entries();
  const store = createRelationNliCacheStore(data);
  const analyzer = engine();
  const sources = corpus();
  sources[4].description = 'Gamma utilizes Delta.';
  await analyzer.runInductiveRelationAnalysis(sources, realOptions(store, []));
  // A legacy score-only cache has no persisted group metadata and must rebuild merging.
  for (const [key, json] of data.data) data.data.set(key, JSON.stringify(JSON.parse(json).scores));
  const previous = new Set(data.data.keys());
  analyzer.clearRelationAnalysisMemory();
  let phase;
  const partial = await analyzer.runInductiveRelationAnalysis(
    sources,
    options(store, undefined, {
      onInferenceProgress: (progress) => {
        phase = progress.phase;
      },
      runtimeFactory: () => ({
        embed: async () => [1, 0],
        entailment: async () => {
          if (phase === 'merge') throw new Error('temporary merge failure');
          return supported;
        },
        release: async () => {},
      }),
    })
  );
  assert.equal(partial.discoveryIncomplete, true);
  assert.ok([...previous].every((key) => data.data.has(key)));
  const calls = [];
  const complete = await analyzer.runInductiveRelationAnalysis(sources, realOptions(store, calls));
  assert.ok(!complete.discoveryIncomplete);
  assert.equal(calls.filter((call) => call.phase === 'validation').length, 0);
  assert.deepEqual(new Set(data.data.keys()), previous);
});

for (const cachedRows of [0, 199]) {
  test(
    `a finished NLI batch is durable before the next completes or is cancelled (${cachedRows} cached rows)`,
    { timeout: 10000 },
    async (t) => {
      const data = entries();
      const store = createRelationNliCacheStore(data);
      if (cachedRows) {
        const previous = result(200);
        previous.candidates[0].validations.shift();
        await engine(() => previous).runInductiveRelationAnalysis(notes, options(store));
        data.writes.length = 0;
      }
      const analyzer = engine(() => result(405));
      const controller = new AbortController();
      const batches = [];
      let rejectNext;
      const running = analyzer.runInductiveRelationAnalysis(
        notes,
        options(
          store,
          async (premise) => {
            if (premise === '200')
              return new Promise((_, reject) => {
                rejectNext = reject;
              });
            return supported;
          },
          {
            signal: controller.signal,
            onBatch: (progress) => {
              assert.equal(
                data.data.size,
                progress.completed,
                'completed scores must be stored before publishing the batch'
              );
              batches.push(progress);
            },
          }
        )
      );
      t.after(() => {
        controller.abort();
        rejectNext?.(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      });
      while (!rejectNext) await settle();
      assert.equal(data.data.size, 200);
      assert.equal(data.writes.length, 1);
      assert.equal(data.writes[0].length, 200 - cachedRows);
      assert.equal(batches.length, 1);
      assert.equal(batches[0].status, 'running');
      const key = [...data.data.keys()][0];
      const [, version, input] = /\/nli\/([^/]+)\/([^/]+)$/.exec(key);
      assert.deepEqual(
        (await createRelationNliCacheStore(data).load('user:1:1:normal', version, [input])).get(
          input
        ),
        supported
      );
      const cancelled = assert.rejects(running, { name: 'AbortError' });
      controller.abort();
      rejectNext(Object.assign(new Error('cancelled later batch'), { name: 'AbortError' }));
      await cancelled;
      assert.equal(batches.length, 1);
      let remaining = 0;
      const resumed = await engine(() => result(405)).runInductiveRelationAnalysis(
        notes,
        options(store, async () => {
          remaining++;
          return supported;
        })
      );
      assert.equal(remaining, 205);
      assert.equal(resumed.validationProgress.completed, 405);
    }
  );
}
