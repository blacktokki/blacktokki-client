/** Include cache decoding, shared indexing and model readiness in the five-second budget. */
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { test } = require('node:test');
const load = require('../loadTs.cjs');

test(
  'completed search cache and the first query are ready within five seconds',
  { timeout: 12000 },
  async (t) => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const scope = 'search-cache-performance';
    const revision = 'a'.repeat(64);
    const inputRevision = 'b'.repeat(64);
    const vector = Array.from({ length: 384 }, (_, index) => (index + 1) / 384);
    const nodes = Array.from({ length: 4096 }, (_, index) => ({
      id: `node:${index}`,
      kind: 'note',
      name: `Item ${index}`,
      typeLabel: 'Note',
      noteTitle: `Source ${index}`,
      body: '',
      sourceIds: [`source:${index}`],
    }));
    const snapshot = {
      version: 1,
      scope,
      revision,
      nodes,
      sources: nodes.map((node, index) => ({
        id: node.sourceIds[0],
        title: node.noteTitle,
        text: `Content ${index}`,
      })),
      edges: nodes.slice(1).map((node, index) => ({
        id: `edge:${index}`,
        source: nodes[index].id,
        target: node.id,
        type: 'REFERENCE',
        label: 'Reference',
        directed: true,
        sourceIds: nodes[index].sourceIds,
      })),
      coverage: { keywords: true, templates: true },
    };
    const identities = Array.from(
      { length: snapshot.nodes.length + snapshot.edges.length },
      (_, index) => (index + 1).toString(16).padStart(64, '0')
    );
    const { RELATION_MODELS } = load('search/models.ts');
    const serialized = JSON.stringify({
      model: `${RELATION_MODELS.embedding}:mean:normalized:search-v1`,
      vectors: identities.map((key) => [key, vector]),
      graph: {
        version: 1,
        revision,
        inputRevision,
        documentCount: identities.length,
        documents: identities,
      },
    });
    let reads = 0;
    let cacheReadComplete = false;
    let models = 0;
    let embeddings = 0;
    let snapshots = 0;
    let warmed = false;
    const cache = load('keywordRelationCache.ts');
    cache.keywordRelationEntries.read = async () => {
      reads++;
      await delay(1500);
      cacheReadComplete = true;
      return [serialized];
    };
    cache.keywordRelationEntries.write = async () =>
      assert.fail('a complete cache must not be rewritten');
    const semantic = load('search/semantic.ts', {
      '../keywordRelationCache': cache,
      './models': {
        RELATION_MODELS,
        createRelationDiscoveryRuntime: () => {
          models++;
          return {
            embed: async () => {
              embeddings++;
              if (!warmed) await delay(2300);
              warmed = true;
              return vector;
            },
            dispose: async () => {},
          };
        },
      },
      './snapshot': { yieldGraphSearch: async () => new Promise(setImmediate) },
    });
    const engine = load('search/engine.ts', {
      './snapshot': { yieldGraphSearch: async () => new Promise(setImmediate) },
    });
    const preparation = load('search/preparation.ts', {
      './semantic': semantic,
      './engine': engine,
      './snapshot': {
        graphSearchInputRevision: async () => inputRevision,
        createGraphSearchSnapshot: async () => {
          snapshots++;
          assert.equal(cacheReadComplete, false, 'index preparation must overlap storage I/O');
          await delay(1400);
          return snapshot;
        },
      },
    }).acquireGraphSearchPreparation(scope);
    t.after(() => preparation.dispose());
    const { prepareGraphSearchEmbeddings } = load(
      'components/RelationAnalysisBackground.tsx',
      {
        react: {},
        '../../../../hooks/useUsageMode': {},
        '@blacktokki/core': {},
        '../keywordRelationCache': { graphSearchCache: cache.graphSearchCache },
        '../search/preparation': {},
        '../search/semantic': semantic,
        '../search/snapshot': { graphSearchInputRevision: async () => inputRevision },
        '../search/useGraphSearch': {},
        '../useRelationAnalysis': {},
        '../useRelationAnalysisSession': {},
      },
      ['prepareGraphSearchEmbeddings']
    );
    const input = { scope, notes: [{ title: 'Source' }], coverage: snapshot.coverage };
    const started = performance.now();
    const result = await prepareGraphSearchEmbeddings(
      input,
      preparation,
      new AbortController().signal,
      () => assert.fail('complete vectors must not replay preparation progress')
    );
    const readyMs = performance.now() - started;
    assert.deepEqual(result, { revision, inputRevision, total: identities.length });
    assert.equal(reads, 1, 'checking and vector restoration must decode the stored payload once');
    assert.equal(models, 1);
    assert.equal(embeddings, 1, 'cached document vectors must not run inference');
    assert.equal(snapshots, 1);
    assert.ok(readyMs < 5000, `search cache readiness exceeded five seconds: ${readyMs} ms`);

    const index = await preparation.index(input, inputRevision);
    const vectors = await preparation.vectors({
      revision,
      inputRevision,
      documents: index.documents,
      cache: cache.graphSearchCache,
    });
    const scores = await preparation.scores('Query', vectors.byDocument);
    assert.equal(scores.size, identities.length);
    assert.equal(reads, 1, 'first query reuses the completed vector mapping');
    assert.equal(models, 1, 'first query reuses the initialized model');
    assert.equal(snapshots, 1, 'first query reuses the completed index');
    assert.ok(performance.now() - started < 5000, 'the first query is included in the same budget');
    t.diagnostic(
      JSON.stringify({
        documents: identities.length,
        bytes: serialized.length,
        readyMs: Math.round(readyMs),
        firstQueryMs: Math.round(performance.now() - started),
        reads,
        models,
      })
    );
  }
);
