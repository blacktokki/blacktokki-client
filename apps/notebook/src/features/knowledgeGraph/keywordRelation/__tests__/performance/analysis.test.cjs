/** Regression coverage for source loading, cache readiness, analysis and restored candidates. */
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { test } = require('node:test');

const { createCachedLoader } = require('../loadTs.cjs');
const ko = require(path.resolve(__dirname, '../../../../../lang/ko.json'));
const budgetMs = 15000;
const cacheBudgetMs = 5000;

/** Generated in memory without notebook files or exported notebook structure. */
function fixture(metrics) {
  const body = [
    '# Services',
    '- **Service Alpha**',
    '- **Service Beta**',
    '- **Service Gamma**',
    '# Tools',
    '- **Tool Alpha**',
    '- **Tool Beta**',
    '- **Tool Gamma**',
    ...Array.from(
      { length: 24 },
      (_, index) =>
        `\n## Section ${index}\nService Alpha uses Tool Alpha.\nService Beta uses Tool Beta.\nService Gamma uses Tool Gamma.\n\n` +
        '| Service | Tool |\n| --- | --- |\n| Service Alpha | Tool Alpha |\n| Service Beta | Tool Beta |'
    ),
  ].join('\n');
  return {
    kind: 'directory',
    async *entries() {
      for (let index = 0; index < 72; index++) {
        const name = `Note ${index}.md`;
        metrics.notePaths.add(name);
        yield [
          name,
          {
            kind: 'file',
            getFile: async () => {
              metrics.noteReads++;
              return { size: body.length, lastModified: 1000, text: async () => body };
            },
          },
        ];
      }
    },
  };
}

function harness() {
  const load = createCachedLoader();
  const rows = new Map();
  const reads = [];
  const writes = [];
  const cache = load('keywordRelationCache.ts');
  cache.relationPatternCacheStore = cache.createRelationPatternCacheStore({
    read: async (keys) => {
      reads.push(...keys);
      return keys.map((key) => rows.get(key) ?? null);
    },
    write: async (entries) => {
      writes.push(...entries.map(([key]) => key));
      for (const [key, value] of entries) rows.set(key, value);
    },
  });
  return {
    rows,
    reads,
    writes,
    analyzer: load('relationAnalysis.ts'),
    summaries: load('useRelationAnalysis.ts', ['localizeRelationLog']),
    storage: load('../../../services/storage/fsHelper.ts'),
  };
}

function resultDigest(result) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        [result.entityExtraction, result.candidates, result.inputPatterns],
        (_, value) =>
          value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(
                Object.keys(value)
                  .sort()
                  .map((key) => [key, value[key]])
              )
            : value
      )
    )
    .digest('hex');
}

async function regress(t, createDirectory, rounds) {
  t.mock.method(console, 'log', () => {});
  let expected;
  for (const backend of ['webcrypto', 'fallback']) {
    await t.test(backend, async (backendTest) => {
      const crypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: backend === 'webcrypto' ? webcrypto : undefined,
      });
      backendTest.after(() => {
        if (crypto) Object.defineProperty(globalThis, 'crypto', crypto);
        else delete globalThis.crypto;
      });
      const { analyzer, storage, summaries, rows, reads, writes } = harness();
      backendTest.after(() => analyzer.clearRelationAnalysisMemory());
      for (let round = 1; round <= rounds; round++) {
        rows.clear();
        for (const mode of ['refresh', 'reuse']) {
          await backendTest.test(
            `round ${round}: ${mode} completes within 15 seconds`,
            async (sample) => {
              analyzer.clearRelationAnalysisMemory();
              reads.length = 0;
              writes.length = 0;
              const metrics = { notePaths: new Set(), noteReads: 0 };
              const root = createDirectory(metrics);
              const started = performance.now();
              const loaded = await Promise.all([
                ...Array.from({ length: 3 }, () => storage.readContentsFromDir(root, 'NOTE', 0)),
                storage.readContentsFromDir(root, 'BOARD', 0),
              ]);
              const notes = loaded[0]
                .filter((note) => !!note.description?.trim())
                .sort((a, b) => a.title.localeCompare(b.title))
                .map(({ title, description }) => ({ title, description }));
              const sourceMs = performance.now() - started;
              const options = {
                scope: 'analysis-performance',
                signal: new AbortController().signal,
              };
              const checking = performance.now();
              const checked = await analyzer.inspectRelationAnalysisCache(notes, options);
              const cacheCheckMs = performance.now() - checking;
              const readinessMs = performance.now() - started;
              assert.equal(
                checked.patternCache.status,
                mode === 'refresh' ? 'missing' : 'reusable'
              );
              assert.equal(
                checked.entityExtraction,
                undefined,
                'readiness must not collect or restore'
              );
              assert.deepEqual(checked.candidates, []);
              const events = {};
              const collected = [];
              const result = await analyzer.runInductiveRelationAnalysis(notes, {
                ...options,
                cachePolicy: mode,
                translate: (key) => ko[key] || key,
                onEntityProgress: () => {
                  events.keywords = (events.keywords || 0) + 1;
                },
                onInferenceProgress: ({ stage }) => {
                  events[stage] = (events[stage] || 0) + 1;
                },
                onEntities: (entities) => {
                  collected.push('entities');
                  summaries.summarizeRelationEntities(entities);
                },
                onEntityTypes: (entities) => {
                  collected.push('types');
                  summaries.summarizeRelationEnumerations(entities.enumerations);
                  summaries.summarizeRelationEntityTypes(entities.entityTypes);
                },
                onPatterns: (patterns) => {
                  collected.push('patterns');
                  summaries.summarizeRelationInputPatterns(patterns);
                },
              });
              summaries.localizeRelationLog(result);
              const elapsed = performance.now() - started;
              sample.diagnostic(
                JSON.stringify({
                  notes: notes.length,
                  ms: Math.round(elapsed),
                  sourceMs: Math.round(sourceMs),
                  readinessMs: Math.round(readinessMs),
                  cacheCheckMs: Math.round(cacheCheckMs),
                  fileReads: metrics.noteReads,
                  cacheReads: reads.length,
                  cacheWrites: writes.length,
                  events,
                })
              );
              assert.ok(
                readinessMs <= cacheBudgetMs,
                `source loading and cache readiness exceeded 5 seconds: ${readinessMs} ms`
              );
              assert.ok(
                cacheCheckMs <= cacheBudgetMs,
                `cache checking exceeded 5 seconds: ${cacheCheckMs} ms`
              );
              assert.ok(elapsed <= budgetMs, `analysis exceeded 15 seconds: ${elapsed} ms`);
              assert.ok(
                notes.length && metrics.notePaths.size,
                'the source dataset must not be empty'
              );
              assert.equal(
                metrics.noteReads,
                metrics.notePaths.size,
                'parallel consumers must read each file once'
              );
              const sharedSources = JSON.stringify(loaded[0]);
              for (const contents of loaded.slice(1, 3))
                assert.ok(
                  JSON.stringify(contents) === sharedSources,
                  'parallel consumers must receive the same sources'
                );
              assert.equal(result.associationProgress.status, 'completed');
              assert.ok(
                result.entityExtraction.entities.length,
                'entity extraction must not be skipped'
              );
              assert.ok(
                result.candidates.length,
                'the dataset must exercise relationship evaluation'
              );
              assert.ok(result.candidates.some((candidate) => candidate.measurements.length));
              assert.deepEqual(collected, ['entities', 'types', 'patterns']);
              const digest = resultDigest(result);
              expected ||= digest;
              assert.equal(
                digest,
                expected,
                'repeated runs and restored candidates must preserve results and evidence'
              );
              if (mode === 'reuse') {
                assert.equal(result.cacheRestored, true);
                assert.equal(reads.filter((key) => key.includes(':keyword_relation_patterns:')).length, 1);
                assert.equal(reads.length, 2, 'one metadata read and one collection read');
                assert.equal(writes.length, 0, 'restoration must not rewrite the saved cache');
                for (const stage of ['keywords', 'types', 'contexts', 'collection', 'grouping'])
                  assert.equal(
                    events[stage],
                    undefined,
                    `${stage} must not run during restoration`
                  );
              } else {
                assert.equal(writes.length, 2);
                assert.ok(events.keywords && events.collection && events.evaluation);
              }
            }
          );
        }
      }
    });
  }
}

test(
  'analysis performance regression uses a portable notebook fixture',
  { timeout: 90000 },
  async (t) => {
    await regress(t, fixture, 1);
  }
);

test(
  'cache preparation stays within five seconds with asynchronous file API latency',
  { timeout: 15000 },
  async (t) => {
    t.mock.method(console, 'log', () => {});
    const { storage, analyzer } = harness();
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let fileReads = 0;
    const root = {
      async *entries() {
        for (let folder = 0; folder < 32; folder++) {
          await new Promise(setImmediate);
          yield [
            `Folder ${folder}`,
            {
              kind: 'directory',
              async *entries() {
                for (let note = 0; note < 20; note++) {
                  await new Promise(setImmediate);
                  yield [
                    `Note ${note}.md`,
                    {
                      kind: 'file',
                      getFile: async () => {
                        fileReads++;
                        await delay(70);
                        return {
                          size: 10,
                          lastModified: 1000,
                          text: async () => {
                            await delay(50);
                            return '**Source**';
                          },
                        };
                      },
                    },
                  ];
                }
              },
            },
          ];
        }
      },
    };
    const started = performance.now();
    const sources = await Promise.all(
      Array.from({ length: 3 }, () => storage.readContentsFromDir(root, 'NOTE', 0))
    );
    const loaded = performance.now();
    const notes = sources[0].filter((note) => !!note.description?.trim());
    await analyzer.inspectRelationAnalysisCache(notes, { scope: 'file-api-latency' });
    const elapsed = performance.now() - started;
    t.diagnostic(
      JSON.stringify({
        notes: notes.length,
        sourceMs: Math.round(loaded - started),
        readinessMs: Math.round(elapsed),
        fileReads,
      })
    );
    assert.equal(notes.length, 672, 'file notes and their virtual parent notes remain available');
    assert.equal(fileReads, 640, 'concurrent consumers share the same filesystem read');
    assert.deepEqual(sources[1], sources[0]);
    assert.deepEqual(sources[2], sources[0]);
    assert.ok(elapsed <= cacheBudgetMs, `file API latency exceeded 5 seconds: ${elapsed} ms`);
  }
);
