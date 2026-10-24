const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Analysis execution and cancellation', () => {
  const { createHash, webcrypto } = require('node:crypto');

  const cacheHarness = require('./loadTs.cjs').cacheHarness;
  const loadTs = require('./loadTs.cjs');
  const { relationCacheHash } = loadTs('keywordRelationCache.ts', {
    '@react-native-async-storage/async-storage': {},
  });
  const analyzer = loadTs('relationAnalysis.ts', cacheHarness().dependencies);
  const {
    runInductiveRelationAnalysis: run,
    inspectRelationAnalysisCache: inspect,
    clearRelationAnalysisMemory: clear,
  } = analyzer;
  const dictionaries = () =>
    Array.from({ length: 3 }, (_, index) => ({
      title: `Dictionary ${index}`,
      description:
        '- **Service Alpha**\n- **Service Beta**\n- **Service Gamma**\n\n## Tools\n- **Tool Alpha**\n- **Tool Beta**\n- **Tool Gamma**',
    }));
  const notes = () => [
    ...dictionaries(),
    { title: 'First', description: 'Service Alpha uses Tool Alpha.' },
    { title: 'Second', description: 'Service Beta works with Tool Beta.' },
  ];

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

  test('large source identities use native SHA-256 without changing existing cache identities', async (t) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    let nativeCalls = 0;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: (...args) => {
            nativeCalls++;
            return webcrypto.subtle.digest(...args);
          },
        },
      },
    });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete globalThis.crypto;
    });
    const text = 'generated'.repeat(1024 * 1024 + 1);
    assert.equal(await relationCacheHash(text), createHash('sha256').update(text).digest('hex'));
    assert.equal(nativeCalls, 1);
  });

  test('readiness checks leave collection and evaluation to the actual analysis', async () => {
    clear();
    const analysisEvents = [];
    let entities;
    let patterns;
    const input = notes();
    const prepared = await inspect(input, { scope: 'prepare' });
    assert.equal(prepared.patternCache.status, 'missing');
    assert.equal(prepared.entityExtraction, undefined);
    assert.equal(prepared.inputPatterns, undefined);
    assert.deepEqual(prepared.candidates, []);
    assert.equal(prepared.associationProgress, undefined);
    const analyzed = await run(structuredClone(input).reverse(), {
      scope: 'prepare',
      onEntityTypes: (result) => {
        entities = result;
      },
      onPatterns: (result) => {
        patterns = result;
      },
      onInferenceProgress: (progress) => analysisEvents.push(progress),
    });
    assert.equal(analyzed.entityExtraction, entities);
    assert.equal(analyzed.inputPatterns, patterns);
    assert.ok(analyzed.inputPatterns.length);
    assert.equal(analyzed.method, 'association');
    assert.ok(analyzed.candidates.some((candidate) => candidate.measurements.length));
    assert.equal(analyzed.associationProgress.status, 'completed');
    assert.ok(analysisEvents.every((progress) => progress.model === 'statistics'));
    assert.ok(analysisEvents.some((progress) => progress.stage === 'collection'));
    assert.ok(analysisEvents.some((progress) => progress.stage === 'evaluation'));
    for (const stage of ['contexts', 'collection', 'grouping', 'evaluation']) {
      const events = analysisEvents.filter((progress) => progress.stage === stage);
      assert.ok(events.length >= 2, stage);
      assert.equal(new Set(events.map((progress) => progress.total)).size, 1, stage);
      assert.equal(events.at(-1).processed, events.at(-1).total, stage);
      assert.ok(
        events.every(
          (progress, index) =>
            progress.processed <= progress.total &&
            (!index || progress.processed >= events[index - 1].processed)
        ),
        stage
      );
    }
    assert.equal(
      analyzed.associationProgress.total,
      analyzed.candidates.reduce((sum, candidate) => sum + candidate.measurements.length, 0)
    );
    assert.ok(
      analyzed.candidates.every((candidate) =>
        candidate.measurements.every((row) => row.association && !row.scores)
      )
    );
  });

  test('an unchanged source restores the completed result only inside its account/notebook/privacy scope', async () => {
    clear();
    const input = notes();
    const completed = await run(input, { scope: 'local:1:normal' });
    const restored = await run(structuredClone(input).reverse(), {
      scope: 'local:1:normal',
      cachePolicy: 'reuse',
    });
    assert.equal(restored.cacheRestored, true);
    assert.equal(restored.candidates, completed.candidates);
    await assert.rejects(
      run(input, {
        scope: 'local:1:private',
        cachePolicy: 'reuse',
        onEntityProgress: () => assert.fail('another scope must not recollect during reuse'),
      }),
      /Update the cache/
    );
    clear('local:1:normal');
    await assert.rejects(
      run(input, {
        scope: 'local:1:private',
        cachePolicy: 'reuse',
      }),
      /Update the cache/
    );
  });

  test('cache checking shares source serialization and hashing with analysis while detecting in-place edits', async (t) => {
    t.mock.method(console, 'log', () => {});
    const cache = cacheHarness();
    let hashes = 0;
    const analyzer = loadTs('relationAnalysis.ts', {
      ...cache.dependencies,
      './keywordRelationCache': {
        ...cache.dependencies['./keywordRelationCache'],
        relationCacheHash: (...args) => {
          hashes++;
          return relationCacheHash(...args);
        },
      },
    });
    const input = notes();
    const options = { scope: 'source-sharing' };
    assert.equal(
      (await analyzer.inspectRelationAnalysisCache(input, options)).patternCache.status,
      'missing'
    );
    assert.equal(
      (await analyzer.inspectRelationAnalysisCache(input, options)).patternCache.status,
      'missing'
    );
    assert.equal(hashes, 1, 'repeated checks share only the source identity');
    await analyzer.runInductiveRelationAnalysis(input, options);
    assert.equal(hashes, 1, 'analysis uses the source digest already computed during checking');
    assert.equal(
      (await analyzer.inspectRelationAnalysisCache(input, { scope: 'another-scope' })).patternCache
        .status,
      'missing'
    );
    assert.equal(hashes, 1, 'sharing a digest cannot share results between scopes');
    input[0].description += '\nChanged source.';
    assert.equal(
      (await analyzer.inspectRelationAnalysisCache(input, options)).patternCache.reason,
      'source'
    );
    assert.equal(hashes, 2);
    input[0].title += ' renamed';
    assert.equal(
      (await analyzer.inspectRelationAnalysisCache(input, options)).patternCache.reason,
      'source'
    );
    assert.equal(hashes, 3);
    input.push({ title: 'New source', description: 'More content.' });
    assert.equal(
      (await analyzer.inspectRelationAnalysisCache(input, options)).patternCache.reason,
      'source'
    );
    assert.equal(hashes, 4);
  });

  test('source edits invalidate durable patterns and a completed reanalysis replaces the saved result', async () => {
    const cache = cacheHarness();
    const first = loadTs('relationAnalysis.ts', cache.dependencies);
    const input = notes();
    const previous = await first.runInductiveRelationAnalysis(input, { scope: 'durable-edits' });
    const edited = [...input, { title: 'Extra', description: 'Service Alpha meets Tool Alpha.' }];
    const reopened = loadTs('relationAnalysis.ts', cache.dependencies);
    const prepared = await reopened.inspectRelationAnalysisCache(edited, {
      scope: 'durable-edits',
    });
    assert.notEqual(prepared.cacheRestored, true);
    const completed = await reopened.runInductiveRelationAnalysis(edited, {
      scope: 'durable-edits',
    });
    assert.notDeepEqual(completed.candidates, previous.candidates);
    const next = loadTs('relationAnalysis.ts', cache.dependencies);
    const restored = await next.inspectRelationAnalysisCache(edited, {
      scope: 'durable-edits',
    });
    assert.equal(restored.patternCache.status, 'reusable');
    assert.equal(restored.associationProgress, undefined);
    const evaluated = await next.runInductiveRelationAnalysis(edited, {
      scope: 'durable-edits',
      cachePolicy: 'reuse',
    });
    assert.deepEqual(evaluated.candidates, completed.candidates);
  });

  test('storage failures retain completed results with a visible save notice', async () => {
    const cache = cacheHarness();
    cache.entries.read = async () => {
      throw new Error('unavailable');
    };
    cache.entries.write = async () => {
      throw new Error('quota');
    };
    const analyzer = loadTs('relationAnalysis.ts', cache.dependencies);
    await assert.rejects(
      analyzer.runInductiveRelationAnalysis(notes(), {
        scope: 'unavailable',
        cachePolicy: 'reuse',
      }),
      /Update the cache/
    );
    const completed = await analyzer.runInductiveRelationAnalysis(notes(), {
      scope: 'unavailable',
    });
    assert.equal(completed.associationProgress.status, 'completed');
    assert.deepEqual(completed.warnings, [
      'Could not save relationship patterns. Reopening will require analysis again.',
    ]);
    assert.ok(completed.candidates.every((candidate) => candidate.measurements.length));
    assert.equal(cache.values.size, 0);
  });

  test('readiness checks reuse compatible in-memory evaluations without scoring or rewriting', async () => {
    const cache = cacheHarness();
    const analyzer = loadTs('relationAnalysis.ts', cache.dependencies);
    const input = notes();
    const previous = await analyzer.runInductiveRelationAnalysis(input, { scope: 'auto-memory' });
    const saved = [...cache.values];
    const progress = [];
    const inspected = await analyzer.inspectRelationAnalysisCache(
      structuredClone(input).reverse(),
      {
        scope: 'auto-memory',
        onCacheProgress: (event) => progress.push(event),
      }
    );
    assert.equal(inspected.cacheRestored, true);
    assert.equal(inspected.candidates, previous.candidates);
    assert.equal(inspected.patternCache.hasEvaluations, true);
    for (const phase of ['checking', 'restoring']) {
      const events = progress.filter((event) => event.phase === phase);
      assert.equal(events[0].ratio, 0);
      assert.equal(events.at(-1).ratio, 1);
    }
    const reused = await analyzer.runInductiveRelationAnalysis(structuredClone(input).reverse(), {
      scope: 'auto-memory',
      cachePolicy: 'reuse',
      onEntityProgress: () => assert.fail('unchanged memory reuse must not extract again'),
      onInferenceProgress: () => assert.fail('memory evaluations must be reused'),
    });
    assert.equal(reused.cacheRestored, true);
    assert.equal(reused.candidates, previous.candidates);
    assert.equal(reused.associationProgress.status, 'completed');
    assert.deepEqual([...cache.values], saved);
  });

  test('cache reuse reads the collection once and evaluates saved candidates without collecting or rewriting', async () => {
    const cache = cacheHarness();
    const analyzer = loadTs('relationAnalysis.ts', cache.dependencies);
    const input = [
      ...notes(),
      {
        title: 'Singletons',
        description: 'Service Alpha exists alone.\n\nService Alpha is available.',
      },
    ];
    const previous = await analyzer.runInductiveRelationAnalysis(input, { scope: 'auto-durable' });
    const saved = [...cache.values];
    const reads = [];
    const restoration = [];
    const read = cache.entries.read;
    cache.entries.read = async (keys) => {
      assert.equal(restoration.at(-1)?.ratio, 2 / 5, 'reading remains unfinished until it returns');
      reads.push(...keys);
      return read(keys);
    };
    const reopened = loadTs('relationAnalysis.ts', {
      ...cache.dependencies,
      './keyword/extractKeywords': {
        extractKeywords: () => assert.fail('cached candidates must not be recollected'),
      },
    });
    const events = [];
    const restored = await reopened.runInductiveRelationAnalysis(input, {
      scope: 'auto-durable',
      cachePolicy: 'reuse',
      onCacheProgress: (progress) => restoration.push(progress),
      onEntityProgress: () => assert.fail('cached extraction must not run again'),
      onInferenceProgress: (progress) => events.push(progress.stage),
    });
    assert.equal(restored.cacheRestored, true);
    assert.equal(restored.associationProgress.status, 'completed');
    assert.ok(restoration.every((progress) => progress.phase === 'restoring'));
    assert.deepEqual(
      [...new Set(restoration.map((progress) => progress.ratio))],
      [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5, 1]
    );
    assert.deepEqual(restored.candidates, previous.candidates);
    assert.deepEqual(
      JSON.parse(JSON.stringify(restored.entityExtraction)),
      JSON.parse(JSON.stringify(previous.entityExtraction))
    );
    assert.ok(!events.includes('collection'));
    assert.ok(events.includes('evaluation'));
    assert.equal(reads.filter((key) => key.includes(':keyword_relation_patterns:')).length, 1);
    assert.deepEqual([...cache.values], saved);
    const record = JSON.parse(saved[0][1]);
    assert.equal(record.preparation.revision, 'association-candidates-v2');
    const { restoreRelationSource } = loadTs('relationSourceCache.ts');
    const source = JSON.stringify(
      [...input]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((note) => [note.title, note.description || ''])
    );
    const data = JSON.parse(await restoreRelationSource(record.preparation.references, source));
    assert.ok(
      data.result.candidates.every(
        (candidate) => !candidate.association && candidate.measurements.length === 0
      )
    );
    for (const note of input) {
      assert.ok(!saved[0][1].includes(note.title), 'saved collections contain no note titles');
      assert.ok(
        !saved[0][1].includes(note.description),
        'saved collections contain no source copies'
      );
    }
    assert.doesNotMatch(saved[0][1], /"(score|lift|npmi|specificity|generalizationScore)":/);
  });

  test('invalid cached candidates require an update and never fall back to collection during reuse', async (t) => {
    const cache = cacheHarness();
    const first = loadTs('relationAnalysis.ts', cache.dependencies);
    const input = notes();
    await first.runInductiveRelationAnalysis(input, { scope: 'invalid-candidates' });
    const saved = [...cache.values];
    const [key, json] = saved[0];
    const functions = loadTs('keyword/evaluateKeywordAssociations.ts', cache.dependencies);
    const references = loadTs('relationSourceCache.ts');
    const { relationCacheHash } = loadTs('keywordRelationCache.ts');
    const source = JSON.stringify(
      [...input]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((note) => [note.title, note.description || ''])
    );
    const alterData = (change) => async (record) => {
      const data = JSON.parse(
        await references.restoreRelationSource(record.preparation.references, source)
      );
      change(data);
      const changed = JSON.stringify(data);
      record.preparation.digest = await relationCacheHash(changed);
      record.preparation.references = await references.referenceRelationSource(changed, source);
    };
    const cases = {
      'missing collection': (record) => delete record.preparation,
      'old collection format': (record) => (record.preparation.revision = 'old'),
      'damaged references': (record) => record.preparation.references.parts.push([0, 0, 1]),
      'damaged evidence digest': (record) => (record.preparation.digest = 'b'.repeat(64)),
      'invalid source position': (record) =>
        record.preparation.references.parts.unshift([0, -1, 3]),
      'invalid occurrence counts': alterData((data) => (data.families[0][1].contextCount = 0)),
      'missing supporting observation': alterData((data) =>
        data.result.candidates[0].observations.pop()
      ),
      'missing pattern': (record) => record.patterns.pop(),
      'different source': (record) => (record.source = 'b'.repeat(64)),
      'different rules': (record) => (record.rules = 'old'),
    };
    for (const [name, change] of Object.entries(cases)) {
      await t.test(name, async () => {
        const record = JSON.parse(json);
        await change(record);
        cache.values.set(key, JSON.stringify(record));
        const before = [...cache.values];
        const reopened = loadTs('relationAnalysis.ts', {
          ...cache.dependencies,
          './keyword/extractKeywords': {
            extractKeywords: () => assert.fail('invalid reuse must not collect candidates'),
          },
          './keyword/evaluateKeywordAssociations': {
            ...functions,
            evaluateKeywordAssociations: () => assert.fail('invalid reuse must not evaluate'),
          },
        });
        await assert.rejects(
          reopened.runInductiveRelationAnalysis(input, {
            scope: 'invalid-candidates',
            cachePolicy: 'reuse',
            onEntities: () => assert.fail('invalid cached inputs must not be published'),
            onEntityTypes: () => assert.fail('invalid cached types must not be published'),
            onPatterns: () => assert.fail('invalid cached patterns must not be published'),
          }),
          /Update the cache|no longer match/
        );
        assert.deepEqual([...cache.values], before);
      });
    }
  });

  test('cancelling restored evaluation preserves the cache and resumes without collecting candidates', async () => {
    const cache = cacheHarness();
    const first = loadTs('relationAnalysis.ts', cache.dependencies);
    const input = notes();
    const previous = await first.runInductiveRelationAnalysis(input, {
      scope: 'resume-candidates',
    });
    const before = [...cache.values];
    const reopened = loadTs('relationAnalysis.ts', {
      ...cache.dependencies,
      './keyword/extractKeywords': {
        extractKeywords: () => assert.fail('restored evaluation must not collect'),
      },
    });
    const controller = new AbortController();
    await assert.rejects(
      reopened.runInductiveRelationAnalysis(input, {
        scope: 'resume-candidates',
        cachePolicy: 'reuse',
        signal: controller.signal,
        onInferenceProgress: (progress) => {
          if (progress.stage === 'evaluation' && progress.processed) controller.abort();
        },
      }),
      { name: 'AbortError' }
    );
    assert.deepEqual([...cache.values], before);
    const resumed = await reopened.runInductiveRelationAnalysis(input, {
      scope: 'resume-candidates',
      cachePolicy: 'reuse',
      onInferenceProgress: (progress) => assert.notEqual(progress.stage, 'collection'),
    });
    assert.deepEqual(resumed.candidates, previous.candidates);
    assert.deepEqual([...cache.values], before);
  });

  test('readiness checks return missing, stale or unavailable cache status without collecting', async (t) => {
    for (const reason of ['missing', 'source', 'rules', 'invalid', 'unavailable']) {
      await t.test(reason, async () => {
        const cache = cacheHarness();
        const analyzer = loadTs('relationAnalysis.ts', cache.dependencies);
        let input = notes();
        await analyzer.runInductiveRelationAnalysis(input, { scope: 'auto-invalid' });
        const [key, json] = [...cache.values][0];
        const record = JSON.parse(json);
        if (reason === 'missing') cache.values.clear();
        if (reason === 'source')
          input = [...input, { title: 'Extra', description: 'Service Alpha is common.' }];
        if (reason === 'rules' || reason === 'invalid') {
          record[reason === 'rules' ? 'rules' : 'revision'] = 'older';
          cache.values.set(key, JSON.stringify(record));
          cache.values.delete(
            key.replace(':keyword_relation_patterns:', ':keyword_relation_metadata:')
          );
        }
        if (reason === 'unavailable')
          cache.entries.read = async () => {
            throw new Error('unavailable');
          };
        const saved = [...cache.values];
        const reopened = loadTs('relationAnalysis.ts', {
          ...cache.dependencies,
          './keyword/extractKeywords': {
            extractKeywords: () => assert.fail('readiness must not collect candidates'),
          },
          './keyword/evaluateKeywordAssociations': {
            evaluateKeywordAssociations: () => assert.fail('readiness must not evaluate'),
          },
        });
        const prepared = await reopened.inspectRelationAnalysisCache(input, {
          scope: 'auto-invalid',
        });
        assert.notEqual(prepared.cacheRestored, true);
        assert.equal(prepared.associationProgress, undefined);
        assert.deepEqual(prepared.candidates, []);
        assert.equal(prepared.entityExtraction, undefined);
        assert.equal(
          prepared.patternCache.status,
          reason === 'missing' || reason === 'unavailable' ? reason : 'outdated'
        );
        assert.deepEqual([...cache.values], saved);
      });
    }
  });
});

describe('Cache preparation', () => {
  const { createHash } = require('node:crypto');

  const cacheHarness = require('./loadTs.cjs').cacheHarness;
  const load = require('./loadTs.cjs');

  const scope = 'user:7:notebook:normal';
  const source = [{ title: 'Note', description: 'original source' }];
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const cancel = (signal) => {
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
  };

  function fixture(extra = {}) {
    const cache = cacheHarness();
    const analysis = load('relationAnalysis.ts', {
      ...cache.dependencies,
      './keyword/extractKeywords': {
        extractKeywords: () =>
          assert.fail('preparation must not extract entities or collect candidates'),
      },
      './keyword/evaluateKeywordAssociations': {
        evaluateKeywordAssociations: () => assert.fail('preparation must not evaluate'),
      },
      ...extra,
      './keywordRelationCache': {
        ...cache.dependencies['./keywordRelationCache'],
        relationCacheHash: async (value, signal) => {
          cancel(signal);
          return digest(value);
        },
        ...extra['./keywordRelationCache'],
      },
      './keyword/keywordUtils': {
        ...require('./loadTs.cjs')('keyword/keywordUtils.ts'),
        createRelationDiscoveryMemory: () => ({}),
        checkRelationCancelled: cancel,
      },
    });
    return {
      ...cache,
      ...analysis,
      prepare: (notes = source, options = {}) =>
        analysis.inspectRelationAnalysisCache(notes, { scope, ...options }),
    };
  }

  test('a pending cache read has no timer deadline and completes only when compatibility is known', async (t) => {
    let finish;
    const delays = [];
    const originalTimeout = globalThis.setTimeout;
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
      delays.push(delay);
      return originalTimeout(callback, delay, ...args);
    });
    const f = fixture({
      './keywordRelationCache': {
        relationPatternCacheStore: {
          probe: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        },
      },
    });
    let completed = false;
    const progress = [];
    const pending = f
      .prepare(source, { onCacheProgress: (event) => progress.push(event) })
      .then((result) => {
        completed = true;
        return result;
      });
    while (!finish) await new Promise(setImmediate);
    assert.equal(completed, false);
    assert.equal(progress.at(-1).ratio, 2 / 3, 'pending storage cannot complete cache checking');
    assert.ok(
      delays.every((delay) => delay === 0),
      'only cooperative yields may use timers'
    );
    finish({ status: 'reusable', hasEvaluations: false });
    assert.equal((await pending).patternCache.status, 'reusable');
    assert.ok(progress.every((event) => event.phase === 'checking'));
    assert.deepEqual(
      progress.map((event) => event.ratio),
      [0, 1 / 3, 2 / 3, 1]
    );
  });

  test('cache preparation diagnostics separate source identification from storage waiting', async (t) => {
    let clock = 100;
    const logs = [];
    t.mock.method(Date, 'now', () => clock);
    t.mock.method(console, 'log', (...args) => logs.push(args));
    const diagnostics = load('search/diagnostics.ts');
    const f = fixture({
      './search/diagnostics': diagnostics,
      './keywordRelationCache': {
        relationCacheHash: async (value) => {
          clock += 30;
          return digest(value);
        },
        relationPatternCacheStore: {
          probe: async () => {
            clock += 70;
            return { status: 'reusable', hasEvaluations: false };
          },
        },
      },
    });
    assert.equal((await f.prepare()).patternCache.status, 'reusable');
    assert.deepEqual(logs, [], 'performance data is collected for the single search summary');
    assert.deepEqual(diagnostics.readRelationCacheTiming(scope), {
      관계캐시상태: 'reusable',
      관계캐시실행대기ms: 0,
      관계원문식별ms: 30,
      관계캐시조회ms: 70,
      관계캐시확인ms: 100,
    });
  });

  test('scope cancellation aborts a pending cache check without waiting for storage', async () => {
    let finish;
    const f = fixture({
      './keywordRelationCache': {
        relationPatternCacheStore: {
          probe: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        },
      },
    });
    const controller = new AbortController();
    const progress = [];
    const pending = f.prepare(source, {
      signal: controller.signal,
      onCacheProgress: (event) => progress.push(event),
    });
    while (!finish) await new Promise(setImmediate);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    const stopped = [...progress];
    finish({ status: 'reusable', hasEvaluations: false });
    await new Promise(setImmediate);
    assert.deepEqual(progress, stopped, 'late storage results cannot advance cancelled progress');
  });

  test('native source hashing cooperatively stops on user cancellation', async () => {
    const { relationCacheHash } = load('keywordRelationCache.ts', {
      './keyword/keywordUtils': {
        ...require('./loadTs.cjs')('keyword/keywordUtils.ts'),
        checkRelationCancelled: cancel,
      },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5);
    try {
      await assert.rejects(relationCacheHash('x'.repeat(9 * 1024 * 1024), controller.signal), {
        name: 'AbortError',
      });
      const text = '가나다😀'.repeat(10000);
      assert.equal(await relationCacheHash(text, new AbortController().signal), digest(text));
    } finally {
      clearTimeout(timer);
    }
  });

  test('fallback hashing yields through the task channel without a timer per input chunk', async (t) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete globalThis.crypto;
    });
    let clock = 0;
    t.mock.method(Date, 'now', () => (clock += 10));
    const delays = [];
    const timeout = globalThis.setTimeout;
    t.mock.method(globalThis, 'setTimeout', (...args) => {
      delays.push(args[1]);
      return timeout(...args);
    });
    const { relationCacheHash } = load('keywordRelationCache.ts');
    const text = 'é漢😀'.repeat(50000);
    assert.equal(await relationCacheHash(text, new AbortController().signal), digest(text));
    assert.deepEqual(delays, []);
  });
});

describe('Durable pattern collections', () => {
  const cacheHarness = require('./loadTs.cjs').cacheHarness;
  const loadTs = require('./loadTs.cjs');
  const { resultFixture } = require('./loadTs.cjs');

  const source = 'a'.repeat(64);
  const scope = '1:7:normal';
  function fixture() {
    const cache = cacheHarness();
    const { createRelationPatternCacheStore } = loadTs(
      'keywordRelationCache.ts',
      cache.dependencies
    );
    const completed = {
      ...resultFixture().result,
      associationProgress: { total: 3, completed: 3, status: 'completed' },
    };
    completed.candidates[0].patternTemplate = '{{E1: type=Service}} uses {{E2: type=Tool}}';
    completed.candidates[0].variants = [completed.candidates[0].patternTemplate];
    return { ...cache, store: createRelationPatternCacheStore(cache.entries), completed };
  }

  test('pattern signatures survive a new store without persisting pattern text, source or evaluation results', async () => {
    const { store, values, entries, dependencies, completed } = fixture();
    await store.save(scope, source, completed);
    assert.equal(values.size, 2);
    const [key, json] = [...values][0];
    assert.equal(key, '@blacktokki:notebook:keyword_relation_patterns:1:7:normal');
    assert.doesNotMatch(
      json,
      /Folder\/One|Shared source text|measurements|"association"|"score"|"lift"|"npmi"|"specificity"|"pairCount"/
    );
    const record = JSON.parse(json);
    assert.equal(record.source, source);
    assert.equal(record.patterns.length, completed.candidates.length);
    assert.ok(record.patterns.every(({ id }) => /^[a-f0-9]{64}$/.test(id)));
    const { relationCacheHash } = loadTs('keywordRelationCache.ts');
    assert.equal(
      record.patterns[0].template,
      await relationCacheHash(completed.candidates[0].template)
    );
    assert.equal(
      record.patterns[0].patternTemplate,
      await relationCacheHash(completed.candidates[0].patternTemplate)
    );
    assert.deepEqual(
      record.patterns[0].variants,
      await Promise.all(completed.candidates[0].variants.map((text) => relationCacheHash(text)))
    );
    const reloaded = loadTs(
      'keywordRelationCache.ts',
      dependencies
    ).createRelationPatternCacheStore(entries);
    assert.equal((await reloaded.inspect(scope, source, completed)).status === 'reusable', true);
    const rescored = structuredClone(completed);
    rescored.candidates[0].association.score = 0.1;
    rescored.candidates[0].measurements = [];
    assert.equal(
      (await reloaded.inspect(scope, source, rescored)).status === 'reusable',
      true,
      'pattern restoration uses current evaluation results'
    );
  });

  test('pattern inspection ignores older keys without moving their records', async () => {
    const { store, values, entries, completed } = fixture();
    await store.save(scope, source, completed);
    const saved = [...values];
    values.clear();
    const oldPrefix = '@blacktokki:notebook:keyword_relation:user:1:7:normal/patterns/';
    for (const [key, value] of saved)
      values.set(oldPrefix + (key.includes('_metadata:') ? 'metadata' : 'result'), value);
    const before = [...values];
    const read = entries.read;
    const reads = [];
    entries.read = async (keys) => {
      reads.push(...keys);
      return read(keys);
    };
    assert.equal((await store.inspect(scope, source, completed)).status, 'missing');
    assert.equal((await store.probe(scope, source)).status, 'missing');
    assert.ok(reads.every((key) => key.startsWith('@blacktokki:notebook:keyword_relation_')));
    assert.deepEqual([...values], before);
  });

  test('localized label signatures stay in the payload while keys retain only account/notebook/privacy', async () => {
    const { store, values, completed } = fixture();
    const labels = ['Category A', 'Category B'];
    const localized = JSON.stringify([scope, ...labels]);
    const other = JSON.stringify([scope, 'Category C', 'Category D']);
    await store.save(localized, source, completed);
    assert.deepEqual(
      [...values.keys()],
      [
        '@blacktokki:notebook:keyword_relation_patterns:1:7:normal',
        '@blacktokki:notebook:keyword_relation_metadata:1:7:normal',
      ]
    );
    const signature = await loadTs('keywordRelationCache.ts').relationCacheHash(
      JSON.stringify(labels)
    );
    assert.ok(
      [...values.values()].every(
        (json) => JSON.parse(json).labels === signature && !json.includes(labels[0])
      )
    );
    assert.equal((await store.inspect(localized, source, completed)).status, 'reusable');
    assert.equal((await store.inspect(other, source, completed)).reason, 'rules');
    assert.equal((await store.probe(other, source)).reason, 'rules');
    await store.save(other, source, completed);
    assert.equal(values.size, 2, 'changing language does not add a separate key format');
    assert.equal((await store.inspect(other, source, completed)).status, 'reusable');
    assert.equal((await store.inspect(localized, source, completed)).reason, 'rules');
  });

  test('source, scope and changed pattern or evidence identities cannot reuse a saved collection', async () => {
    const { store, completed } = fixture();
    await store.save(scope, source, completed);
    assert.equal(
      (await store.inspect('user:2:7:normal', source, completed)).status === 'reusable',
      false
    );
    assert.equal(
      (await store.inspect(scope, 'b'.repeat(64), completed)).status === 'reusable',
      false
    );
    for (const change of [
      (candidate) => {
        candidate.template += ' changed';
      },
      (candidate) => {
        candidate.patternTemplate = 'different role';
      },
      (candidate) => {
        candidate.variants.push('another pattern');
      },
      (candidate) => {
        candidate.observations[0].evidence += ' edited';
      },
      (candidate) => {
        candidate.observations.reverse();
      },
    ]) {
      const changed = structuredClone(completed);
      change(changed.candidates[0]);
      assert.equal((await store.inspect(scope, source, changed)).status === 'reusable', false);
    }
  });

  test('malformed, incomplete and incompatible pattern records become misses', async () => {
    const { store, values, completed } = fixture();
    await store.save(scope, source, completed);
    const [key, json] = [...values][0];
    const original = JSON.parse(json);
    for (const change of [
      (record) => {
        record.revision = 'obsolete';
      },
      (record) => {
        record.patterns.pop();
      },
      (record) => {
        record.patterns[1] = record.patterns[0];
      },
      (record) => {
        record.patterns[0].id = 'not-a-hash';
      },
      (record) => {
        record.patterns[0].template = null;
      },
      (record) => {
        record.patterns[0].variants = null;
      },
    ]) {
      const record = structuredClone(original);
      change(record);
      values.set(key, JSON.stringify(record));
      assert.equal((await store.inspect(scope, source, completed)).status === 'reusable', false);
    }
    values.set(key, '{truncated');
    assert.equal((await store.inspect(scope, source, completed)).status === 'reusable', false);
  });

  test('unfinished and cancelled runs never overwrite the last completed pattern collection', async () => {
    const { store, values, completed } = fixture();
    await store.save(scope, source, completed);
    const before = [...values];
    await assert.rejects(
      store.save(scope, source, { ...completed, associationProgress: undefined }),
      /completed/
    );
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(store.save(scope, source, completed, abort.signal), {
      name: 'AbortError',
    });
    assert.deepEqual([...values], before);
  });

  test('cache comparison identifies source, rule, pattern and evidence changes before evaluation', async () => {
    const { store, values, completed } = fixture();
    assert.equal((await store.inspect(scope, source, completed)).status, 'missing');
    await store.save(scope, source, completed);
    const saved = [...values];
    const compatible = await store.inspect(scope, source, completed);
    assert.equal(compatible.status, 'reusable');
    assert.equal(compatible.hasEvaluations, false);
    assert.equal((await store.inspect(scope, 'b'.repeat(64), completed)).reason, 'source');
    const changed = structuredClone(completed);
    changed.candidates[0].observations[0].evidence += ' edited';
    const inspection = await store.inspect(scope, source, changed);
    assert.equal(inspection.reason, 'patterns');
    changed.candidates.pop();
    changed.candidates.push({ ...changed.candidates[0], id: 'new-pattern' });
    assert.equal((await store.inspect(scope, source, changed)).reason, 'patterns');
    assert.deepEqual([...values], saved, 'inspection never updates the saved collection');
    const [key, json] = saved[0];
    const record = JSON.parse(json);
    record.rules = 'older-rules';
    values.set(key, JSON.stringify(record));
    assert.equal((await store.inspect(scope, source, completed)).reason, 'rules');
  });
});
