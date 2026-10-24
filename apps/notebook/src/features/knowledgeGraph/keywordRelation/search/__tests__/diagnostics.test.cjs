const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../../__tests__/loadTs.cjs');

function clock(t) {
  let now = 100;
  const timers = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  t.after(() => Object.defineProperty(globalThis, 'performance', original));
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', (timer) => {
    timer.cleared = true;
  });
  t.mock.method(console, 'log', () => {});
  return {
    timers,
    set: (value) => {
      now = value;
    },
    add: (value) => {
      now += value;
    },
    logs: () => console.log.mock.calls.map(({ arguments: [label, data] }) => ({ label, data })),
  };
}

test('prefetch timings retain their earlier start and shared work cannot erase cache reuse', (t) => {
  const c = clock(t);
  const { createSearchDiagnostic } = load('search/diagnostics.ts');
  c.set(0);
  const storage = createSearchDiagnostic(undefined, {});
  const end = storage.begin('저장소조회');
  c.set(1200);
  end();
  const diagnostic = createSearchDiagnostic('single-summary', {}, 1000);
  diagnostic.record({ ...storage.readTiming(), reused: true });
  diagnostic.record({ details: {}, steps: [{ name: '모델파일준비', start: 100, end: 1500 }] });
  c.set(1600);
  diagnostic.finish('완료');
  const result = c.logs()[0].data;
  assert.equal(result.경과ms, 600);
  assert.equal(result.작업시간.저장소조회.시작ms, -1000);
  assert.equal(result.작업시간.저장소조회.경과ms, 1200);
  assert.equal(result.작업시간.모델파일준비.시작ms, -900);
  assert.equal(result.저장소조회재사용, true);
});

test('one final diagnostic preserves pre-render waiting and overlapping steps without intermediate logs', (t) => {
  const c = clock(t);
  c.set(2500);
  const { createSearchDiagnostic } = load('search/diagnostics.ts');
  const diagnostic = createSearchDiagnostic('test', { 분석실행ID: 7 }, 100);
  const ready = diagnostic.begin('검색입력준비', 100);
  assert.equal(c.timers.length, 0, 'single-summary logging schedules no intermediate output');
  c.set(3300);
  ready();
  const model = diagnostic.begin('모델초기화');
  const cache = diagnostic.begin('캐시읽기');
  c.set(3900);
  cache();
  c.set(5600);
  assert.equal(c.logs().length, 0, 'slow work must still produce only one final entry');
  const pending = diagnostic.readTiming();
  c.set(6000);
  model();
  diagnostic.finish('완료');
  diagnostic.finish('중단');
  assert.equal(c.logs().length, 1, 'completion and cleanup must not duplicate the final summary');
  const finished = c.logs()[0].data;
  assert.equal(finished.경과ms, 5900);
  assert.equal(finished.작업시간.검색입력준비.경과ms, 3200);
  assert.equal(finished.작업시간.모델초기화.경과ms, 2700);
  assert.equal(finished.작업시간.캐시읽기.경과ms, 600);
  assert.equal(
    pending.steps.find((step) => step.name === '모델초기화').end,
    undefined,
    'stored timing snapshots remain immutable'
  );
  assert.equal(finished['5초초과'], true);
});

test('failed operations retain timings and propagate errors in one summary', async (t) => {
  const c = clock(t);
  const { createSearchDiagnostic } = load('search/diagnostics.ts');
  const diagnostic = createSearchDiagnostic('test', {});
  await assert.rejects(
    diagnostic.measure('캐시읽기', async () => {
      c.add(600);
      throw new Error('unavailable');
    }),
    /unavailable/
  );
  diagnostic.finish('실패');
  const result = c.logs()[0].data;
  assert.equal(result.작업시간.캐시읽기.경과ms, 600);
  assert.equal(result.작업시간.캐시읽기.상태, '실패');
  assert.equal(result.상태, '실패');
  assert.equal(c.logs().length, 1);
});

test('cancellation records pending work once and ignores its late completion', async (t) => {
  const c = clock(t);
  const { createSearchDiagnostic } = load('search/diagnostics.ts');
  const diagnostic = createSearchDiagnostic('test', {});
  let release;
  const pending = diagnostic.measure(
    '모델',
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  c.add(1200);
  diagnostic.finish('중단');
  const cancelled = c.logs()[0].data;
  assert.equal(cancelled.상태, '중단');
  assert.deepEqual(cancelled.진행중, ['모델']);
  release();
  await pending;
  diagnostic.finish('완료');
  assert.equal(c.logs().length, 1);
  assert.equal(c.timers.length, 0);
  assert.equal(cancelled.작업시간.모델.경과ms, 1200);
});

test('one preparation summary includes shared durable-read, synchronous parsing and validation timings', async (t) => {
  const c = clock(t);
  const cache = load('keywordRelationCache.ts');
  const serialized = JSON.stringify({
    model: 'test-model:mean:normalized:search-v1',
    vectors: [['a'.repeat(64), [1, 0]]],
  });
  let reads = 0;
  cache.keywordRelationEntries.read = async () => {
    reads++;
    c.add(700);
    return [serialized];
  };
  const parse = JSON.parse;
  t.mock.method(JSON, 'parse', (value) => {
    c.add(60);
    return parse(value);
  });
  const { createSearchDiagnostic } = load('search/diagnostics.ts');
  const diagnostic = createSearchDiagnostic('검색 준비: 처리 시간', {});
  const { acquireGraphSearchPreparation } = load('search/preparation.ts', {
    './engine': {},
    './snapshot': {},
    './semantic': { createGraphSearchSession: () => ({ dispose: async () => {} }) },
  });
  const first = acquireGraphSearchPreparation('local:7:normal');
  const second = acquireGraphSearchPreparation('local:7:normal');
  t.after(() => Promise.all([first.dispose(), second.dispose()]));
  await first.cache(cache.graphSearchCache).read('local:7:normal', 'vectors');
  assert.equal(c.logs().length, 0, 'the storage layer does not print a separate log');
  await diagnostic.measure('캐시읽기', () =>
    second.cache(cache.graphSearchCache).read('local:7:normal', 'vectors', diagnostic.record)
  );
  diagnostic.finish('완료');
  const [{ label, data }] = c.logs();
  assert.equal(label, '검색 준비: 처리 시간');
  assert.equal(c.logs().length, 1);
  assert.equal(reads, 1);
  assert.equal(data.저장소조회재사용, true);
  assert.equal(data.경과ms, 760);
  assert.equal(data.작업시간.저장소조회.경과ms, 700);
  assert.equal(data.작업시간.JSON해석.경과ms, 60);
  assert.equal(data.작업시간.저장형식검증.경과ms, 0);
  assert.equal(data.저장문자수, serialized.length);
  assert.equal(data.벡터수, 1);
  assert.equal(
    JSON.stringify(data).includes('a'.repeat(64)),
    false,
    'vector payloads are not logged'
  );
});

test('background diagnostics start before graph rendering and include prerequisite waiting in the final duration', async (t) => {
  const c = clock(t);
  const harness = load.hookHarness();
  t.after(harness.unmount);
  const statuses = [];
  const diagnostics = load('search/diagnostics.ts');
  diagnostics.recordRelationCacheTiming(JSON.stringify(['analysis', 'label']), {
    관계캐시확인ms: 100,
    관계원문식별ms: 30,
    관계캐시조회ms: 70,
  });
  const state = {
    analysisScope: 'analysis',
    available: true,
    loading: true,
    templatesEnabled: false,
    input: { scope: 'graph', notes: [{ title: 'Source' }], coverage: { keywords: false } },
  };
  const { GraphSearchEmbeddingBackground } = load('components/RelationAnalysisBackground.tsx', {
    '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    react: harness.react,
    '@blacktokki/core': {},
    '../keywordRelationCache': { graphSearchCache: {} },
    '../search/diagnostics': diagnostics,
    '../search/useGraphSearch': {
      useSearchGraph: () => {
        c.add(900);
        return state;
      },
    },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({ analysis: { runId: 7, status: 'completed' } }),
    },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (_, status) => statuses.push(status),
    },
    '../search/snapshot': { graphSearchInputRevision: async () => 'source' },
    '../search/semantic': { restoreGraphSearchEmbeddingCache: async () => ({ total: 1 }) },
    '../search/preparation': {
      acquireGraphSearchPreparation: () => ({
        revision: async () => 'source',
        cache: (source) => source,
        warmup: async () => {},
        modelTiming: () => ({ details: {}, steps: [] }),
        index: async () => ({ snapshot: { revision: 'revision' }, documents: [] }),
        vectors: async () => ({ total: 1 }),
        dispose: async () => {},
      }),
    },
  });
  const render = () => harness.render(() => GraphSearchEmbeddingBackground({ startedAt: 100 }));
  render();
  assert.equal(c.logs().length, 0);
  c.set(5500);
  assert.equal(c.logs().length, 0, 'pending inputs do not create another performance log');
  state.loading = false;
  state.input.coverage.keywords = true;
  render();
  await new Promise(setImmediate);
  const finished = c.logs().at(-1).data;
  assert.equal(finished.상태, '완료');
  assert.equal(c.logs().length, 1);
  assert.equal(finished.관계캐시확인ms, 100);
  assert.equal(finished.관계원문식별ms, 30);
  assert.equal(finished.관계캐시조회ms, 70);
  assert.equal(finished.경과ms, 6300, 'prerequisite and render time must remain in the total');
  assert.equal(finished.작업시간.검색입력준비.경과ms, 6300);
  assert.equal(statuses.at(-1).phase, 'completed');
  diagnostics.clearRelationCacheTiming('analysis');
  assert.deepEqual(diagnostics.readRelationCacheTiming('analysis'), {});
});
