const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');

const { hookHarness } = require('../../__tests__/loadTs.cjs');
const load = require('../../__tests__/loadTs.cjs');
beforeEach((t) => t.mock.method(console, 'log', () => {}));

function vectorSession(vectors) {
  return {
    createGraphSearchSession: (scope) => ({
      vectors: (options) => vectors({ ...options, scope }),
      warmup: async () => {},
      initialize: async () => {},
      timing: () => ({ details: {}, steps: [] }),
      dispose: async () => {},
    }),
  };
}

function background(dependencies) {
  const semantic = dependencies['../search/semantic'];
  const preparation = load('search/preparation.ts', {
    './snapshot': dependencies['../search/snapshot'],
    './engine': {
      createGraphSearchIndex: async (snapshot) => ({
        snapshot,
        documents: dependencies['../search/engine'].graphSearchDocuments(snapshot),
      }),
    },
    './semantic': semantic,
  });
  return {
    ...load('components/RelationAnalysisBackground.tsx', {
      '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
      ...dependencies,
      '../search/semantic': {
        restoreGraphSearchEmbeddingCache: async () => undefined,
        ...semantic,
      },
      '../search/preparation': preparation,
    }),
    acquireGraphSearchPreparation: preparation.acquireGraphSearchPreparation,
  };
}

test('cache checking publishes completion before mounting graph and template preparation', async () => {
  const harness = hookHarness();
  const publications = [];
  let analysis = { runId: 7, status: 'idle' };
  const data = {
    scope: 'account-notebook-scope',
    available: true,
    notes: { data: [{ title: 'One', description: 'original' }], isFetching: false },
  };
  const { RelationAnalysisBackground, GraphSearchEmbeddingBackground } = load(
    'components/RelationAnalysisBackground.tsx',
    {
      react: harness.react,
      '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
      '@blacktokki/core': { useLangContext: () => ({ lang: (value) => value }) },
      '../keywordRelationCache': {},
      '../search/preparation': {
        acquireGraphSearchPreparation: () => ({
          initialize: async () => {},
          warmup: async () => {},
          cache: () => ({ read: async () => undefined }),
          dispose: async () => {},
        }),
      },
      '../search/semantic': {},
      '../search/snapshot': {},
      '../search/useGraphSearch': {},
      '../useRelationAnalysis': { useRelationAnalysis: () => analysis },
      '../useRelationAnalysisSession': {
        useRelationAnalysisNotes: () => data,
        publishRelationAnalysisSession: (_, __, value) => publications.push(value.analysis.status),
        clearRelationAnalysisSession: () => {},
      },
    }
  );
  const render = () => harness.render(RelationAnalysisBackground);
  for (const status of ['idle', 'ready', 'running', 'stopping', 'cancelled', 'failed']) {
    analysis = { ...analysis, status };
    assert.equal(render(), null, `${status} must not mount search graph preparation`);
  }
  analysis = { ...analysis, status: 'completed' };
  assert.equal(render(), null, 'completion is published without rendering the search graph');
  assert.equal(publications.at(-1), 'completed');
  data.notes.isFetching = true;
  assert.equal(render(), null, 'initial preparation waits for a pending source refresh');
  data.notes.isFetching = false;
  assert.equal(render(), null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(render().type, GraphSearchEmbeddingBackground);
  data.notes.isFetching = true;
  assert.equal(
    render().type,
    GraphSearchEmbeddingBackground,
    'shared source polling must not unmount completed preparation'
  );
  data.notes.isFetching = false;
  assert.equal(
    render().type,
    GraphSearchEmbeddingBackground,
    'unchanged source refresh must retain completed preparation'
  );
  data.notes.data = [{ title: 'One', description: 'edited' }];
  assert.equal(render(), null, 'new sources cannot mount preparation for the previous analysis');
  analysis = { ...analysis, status: 'running', runId: analysis.runId + 1 };
  assert.equal(render(), null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(render(), null, 'cancelled deferred mounting cannot restart graph preparation');
  harness.unmount();
});

test('model and vector storage start before notes finish loading and remain shared through analysis completion', async () => {
  const harness = hookHarness();
  const leases = [];
  const data = {
    scope: 'synthetic-account:normal',
    available: true,
    notes: { data: undefined, isFetching: true },
  };
  let analysis = { runId: 1, status: 'idle', phase: 'checking', prepareOnly: true };
  const { RelationAnalysisBackground } = load('components/RelationAnalysisBackground.tsx', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang: (key) => key }) },
    '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTEBOOK' }) },
    '../keywordRelationCache': { graphSearchCache: {} },
    '../search/preparation': {
      acquireGraphSearchPreparation: (scope) => {
        const lease = {
          scope,
          reads: [],
          initializations: 0,
          disposed: false,
          initialize: async () => {
            lease.initializations++;
          },
          cache: () => ({
            read: async (...args) => {
              lease.reads.push(args);
            },
          }),
          dispose: async () => {
            lease.disposed = true;
          },
        };
        leases.push(lease);
        return lease;
      },
    },
    '../search/useGraphSearch': {
      useSearchGraph: () => assert.fail('search projection must wait for completed relations'),
    },
    '../search/semantic': {},
    '../search/snapshot': {},
    '../useRelationAnalysis': { useRelationAnalysis: () => analysis },
    '../useRelationAnalysisSession': {
      useRelationAnalysisNotes: () => data,
      publishRelationAnalysisSession: () => {},
      clearRelationAnalysisSession: () => {},
    },
  });
  const render = () => harness.render(RelationAnalysisBackground);
  assert.equal(render(), null);
  assert.equal(leases.length, 1);
  assert.equal(leases[0].initializations, 1);
  assert.deepEqual(leases[0].reads, [[data.scope, 'vectors']]);
  data.notes.data = [{ title: 'Synthetic source' }];
  data.notes.isFetching = false;
  analysis = { ...analysis, status: 'running' };
  render();
  assert.equal(leases.length, 1);
  analysis = { ...analysis, status: 'completed' };
  render();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(
    render(),
    'final graph mounting follows preparation started during relation inspection'
  );
  assert.equal(leases.length, 1, 'completion must not unload and reload the model');
  data.scope = 'synthetic-account:private';
  render();
  assert.equal(leases[0].disposed, true);
  assert.equal(leases.length, 2);
  assert.equal(leases[1].scope, data.scope);
  harness.unmount();
  assert.equal(leases[1].disposed, true);
});

test('search embeddings run once for the final graph after association evaluation and templates are ready', async () => {
  const harness = hookHarness();
  const statuses = [];
  const input = { scope: 'graph-scope', coverage: { keywords: false } };
  let state = {
    analysisScope: 'account-notebook-scope',
    available: true,
    loading: false,
    sourceError: false,
    input,
  };
  const analysis = { runId: 7, status: 'ready', prepareOnly: true };
  let jobs = 0;
  const { GraphSearchEmbeddingBackground } = background({
    '@blacktokki/core': {},
    react: harness.react,
    '../keywordRelationCache': { graphSearchCache: {} },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (scope, status) => statuses.push([scope, status]),
    },
    '../search/useGraphSearch': { useSearchGraph: () => state },
    '../useRelationAnalysisSession': { useRelationAnalysisSession: () => ({ analysis }) },
    '../search/snapshot': {
      graphSearchInputRevision: async () => 'input-revision',
      createGraphSearchSnapshot: async ({ scope }) => ({ scope, revision: 'current' }),
    },
    '../search/engine': {
      graphSearchDocuments: () => [{ id: 'one' }],
    },
    '../search/semantic': {
      restoreGraphSearchEmbeddingCache: async () => undefined,
      ...vectorSession(async ({ scope, revision, documents, onProgress }) => {
        jobs++;
        assert.equal(scope, 'graph-scope');
        assert.equal(revision, 'current');
        assert.equal(documents.length, 1);
        onProgress(1, 1);
        return { total: 1 };
      }),
    },
  });
  harness.render(GraphSearchEmbeddingBackground);
  assert.equal(jobs, 0);
  analysis.status = 'running';
  harness.render(GraphSearchEmbeddingBackground);
  assert.equal(jobs, 0, 'automatic preparation does not load the search model');
  analysis.prepareOnly = false;
  state = { ...state, loading: true };
  harness.render(GraphSearchEmbeddingBackground);
  assert.equal(jobs, 0);
  state = { ...state, loading: false };
  analysis.phase = 'association';
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 0, 'association evaluation must finish before search embeddings start');
  analysis.status = 'completed';
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 0, 'the graph must include final association results');
  state = {
    ...state,
    templatesEnabled: true,
    input: { scope: 'graph-scope', coverage: { keywords: true, templates: false } },
  };
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 0, 'enabled templates must be included before embedding');
  state.input = { scope: 'graph-scope', coverage: { keywords: true, templates: true } };
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 1);
  assert.deepEqual(statuses.at(-1), [
    'account-notebook-scope',
    {
      analysisRunId: 7,
      phase: 'completed',
      processed: 1,
      total: 1,
      revision: 'current',
      inputRevision: 'input-revision',
    },
  ]);
  const running = statuses
    .filter(([, status]) => status.phase === 'running')
    .map(([, status]) => status.stageProgress);
  assert.ok(
    running.every(
      (ratio, index) => ratio >= 0 && ratio < 1 && (!index || ratio >= running[index - 1])
    )
  );
  assert.ok(
    running.some((ratio) => ratio > 0.75),
    'individual vectors update the final stage before cache completion'
  );
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 1, 'ordinary rerenders do not repeat final graph embedding');
  analysis.runId = 8;
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 2, 'a fast reanalysis still validates embeddings for its own run');
  assert.equal(statuses.at(-1)[1].analysisRunId, 8);
  harness.unmount();
  assert.deepEqual(statuses.at(-1), [
    'account-notebook-scope',
    { phase: 'idle', processed: 0, total: 0 },
  ]);
});

test('reanalysis aborts final graph embedding and discards late progress', async () => {
  const harness = hookHarness();
  const statuses = [];
  const analysis = { status: 'completed' };
  const data = {
    analysisScope: 'account-notebook-scope',
    available: true,
    loading: false,
    sourceError: false,
    input: { scope: 'graph-scope', coverage: { keywords: true } },
  };
  let job;
  let finish;
  const { GraphSearchEmbeddingBackground } = background({
    '@blacktokki/core': {},
    react: harness.react,
    '../keywordRelationCache': { graphSearchCache: {} },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (_scope, status) => statuses.push(status),
    },
    '../search/useGraphSearch': { useSearchGraph: () => data },
    '../useRelationAnalysisSession': { useRelationAnalysisSession: () => ({ analysis }) },
    '../search/snapshot': {
      graphSearchInputRevision: async () => 'input-revision',
      createGraphSearchSnapshot: async () => ({ scope: 'graph-scope', revision: 'current' }),
    },
    '../search/engine': { graphSearchDocuments: () => [] },
    '../search/semantic': {
      restoreGraphSearchEmbeddingCache: async () => undefined,
      ...vectorSession((options) => {
        job = options;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }),
    },
  });
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  analysis.status = 'running';
  harness.render(GraphSearchEmbeddingBackground);
  assert.equal(job.signal.aborted, true);
  job.onProgress(1, 1);
  finish({ total: 1 });
  await new Promise(setImmediate);
  assert.deepEqual(statuses.at(-1), { phase: 'idle', processed: 0, total: 0 });
  harness.unmount();
});

test('complete saved vectors wait for the shared index and model before completion without replaying vector progress', async () => {
  const harness = hookHarness();
  const statuses = [];
  const model = 'test-model:mean:normalized:search-v1';
  const saved = {
    model,
    vectors: [['text-hash', [1, 0, 0]]],
    graph: {
      version: 1,
      revision: 'saved-revision',
      documentCount: 1,
      inputRevision: 'source',
      documents: ['text-hash'],
    },
  };
  let modelLoads = 0;
  let finishWarmup;
  const semantic = load('search/semantic.ts', {
    './snapshot': {},
    '../keywordRelationCache': {},
    './models': {
      RELATION_MODELS: { embedding: 'test-model' },
      createRelationDiscoveryRuntime: () => {
        modelLoads++;
        return {
          embed: () =>
            new Promise((resolve) => {
              finishWarmup = () => resolve([1, 0, 0]);
            }),
          dispose: async () => {},
        };
      },
    },
    '../keyword/keywordUtils': {
      ...require('../../__tests__/loadTs.cjs')('keyword/keywordUtils.ts'),
      checkRelationCancelled: (signal) => {
        if (signal?.aborted) throw new Error('cancelled');
      },
    },
  });
  let snapshots = 0;
  let finishSnapshot;
  let reads = 0;
  const input = {
    scope: 'graph-scope',
    coverage: { keywords: true },
    notes: [{ title: 'Prepared source' }],
  };
  const analysis = { runId: 7, status: 'completed' };
  const cache = {
    read: async (scope) => {
      reads++;
      assert.equal(scope, 'graph-scope');
      return saved;
    },
  };
  const { GraphSearchEmbeddingBackground, acquireGraphSearchPreparation } = background({
    '@blacktokki/core': {},
    react: harness.react,
    '../keywordRelationCache': {
      graphSearchCache: cache,
    },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (scope, status) => statuses.push([scope, status]),
    },
    '../search/useGraphSearch': {
      useSearchGraph: () => ({
        analysisScope: 'analysis-scope',
        available: true,
        loading: false,
        sourceError: false,
        input,
      }),
    },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({ analysis }),
    },
    '../search/snapshot': {
      graphSearchInputRevision: async () => 'source',
      createGraphSearchSnapshot: () => {
        snapshots++;
        return new Promise((resolve) => {
          finishSnapshot = () => resolve({ scope: input.scope, revision: 'saved-revision' });
        });
      },
    },
    '../search/engine': {
      graphSearchDocuments: () => [{ id: 'one', text: 'Prepared source' }],
    },
    '../search/semantic': semantic,
  });
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(snapshots, 1);
  assert.equal(reads, 1);
  assert.equal(modelLoads, 1, 'model warmup starts before the index has finished');
  assert.equal(statuses[0][1].phase, 'checking');
  assert.ok(statuses.every(([, status]) => status.phase !== 'running'));
  assert.ok(statuses.every(([, status]) => status.phase !== 'completed'));
  finishSnapshot();
  await new Promise(setImmediate);
  assert.equal(modelLoads, 1);
  assert.ok(statuses.every(([, status]) => status.phase !== 'completed'));
  finishWarmup();
  await new Promise(setImmediate);
  assert.deepEqual(
    statuses.filter(([, status]) => status.phase === 'completed'),
    [
      [
        'analysis-scope',
        {
          analysisRunId: 7,
          phase: 'completed',
          processed: 1,
          total: 1,
          revision: 'saved-revision',
          inputRevision: 'source',
        },
      ],
    ]
  );
  const search = acquireGraphSearchPreparation(input.scope);
  const index = await search.index(input, 'source');
  await search.vectors({
    revision: index.snapshot.revision,
    inputRevision: 'source',
    documents: index.documents,
    cache,
  });
  assert.equal(snapshots, 1, 'the first search attaches to the completed shared index');
  assert.equal(reads, 1, 'cache checking, vector restoration and first search share one read');
  await search.warmup('Prepared source');
  assert.equal(modelLoads, 1, 'the first search reuses the warmed model');
  assert.ok(statuses.every(([, status]) => status.phase !== 'running'));
  await search.dispose();
  const beforeRun = statuses.length;
  analysis.runId = 8;
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(statuses.at(-1)[1].phase, 'checking');
  assert.ok(statuses.slice(beforeRun).every(([, status]) => status.phase !== 'running'));
  finishSnapshot();
  await new Promise(setImmediate);
  finishWarmup();
  await new Promise(setImmediate);
  assert.equal(statuses.at(-1)[1].phase, 'completed');
  assert.equal(statuses.at(-1)[1].analysisRunId, 8);
  harness.unmount();
});

test('a cache check completing after the accessible scope changes cannot restore stale completion', async () => {
  const harness = hookHarness();
  const statuses = [];
  let restore;
  const state = {
    analysisScope: 'old',
    available: true,
    loading: false,
    sourceError: false,
    input: { scope: 'old', coverage: { keywords: true } },
  };
  const { GraphSearchEmbeddingBackground } = background({
    '@blacktokki/core': {},
    react: harness.react,
    '../keywordRelationCache': { graphSearchCache: {} },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (scope, status) => statuses.push([scope, status]),
    },
    '../search/useGraphSearch': { useSearchGraph: () => state },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({ analysis: { runId: 7, status: 'completed' } }),
    },
    '../search/snapshot': {
      graphSearchInputRevision: async () => 'source',
      createGraphSearchSnapshot: () => assert.fail('an abandoned scope cannot warm an index'),
    },
    '../search/engine': { graphSearchDocuments: () => [] },
    '../search/semantic': {
      ...vectorSession(() => assert.fail('an abandoned scope cannot prepare vectors')),
      restoreGraphSearchEmbeddingCache: () => new Promise((resolve) => (restore = resolve)),
    },
  });
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(statuses.at(-1)[1].phase, 'checking');
  state.available = false;
  state.analysisScope = 'new';
  harness.render(GraphSearchEmbeddingBackground);
  const afterScopeChange = [...statuses];
  restore({ revision: 'cached', total: 1 });
  await new Promise(setImmediate);
  assert.deepEqual(statuses, afterScopeChange);
  assert.ok(statuses.every(([, status]) => status.phase !== 'completed'));
  harness.unmount();
});

test('late preparation cannot publish completion after the scope changes', async () => {
  const harness = hookHarness();
  const statuses = [];
  let resolve;
  const state = {
    analysisScope: 'old-scope',
    available: true,
    loading: false,
    sourceError: false,
    input: { scope: 'old-graph', coverage: { keywords: true } },
  };
  const { GraphSearchEmbeddingBackground } = background({
    '@blacktokki/core': {},
    react: harness.react,
    '../keywordRelationCache': { graphSearchCache: {} },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (scope, status) => statuses.push([scope, status]),
    },
    '../search/useGraphSearch': { useSearchGraph: () => state },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({ analysis: { status: 'completed' } }),
    },
    '../search/snapshot': {
      graphSearchInputRevision: async () => 'source',
      createGraphSearchSnapshot: async ({ scope }) => ({ scope, revision: 'old-revision' }),
    },
    '../search/engine': { graphSearchDocuments: () => [] },
    '../search/semantic': {
      ...vectorSession(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      ),
    },
  });
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  state.available = false;
  state.analysisScope = 'new-scope';
  harness.render(GraphSearchEmbeddingBackground);
  const afterScopeChange = [...statuses];
  resolve({ revision: 'old-revision', total: 1 });
  await new Promise(setImmediate);
  assert.deepEqual(statuses, afterScopeChange);
  assert.equal(statuses.at(-1)[1].phase, 'idle');
  harness.unmount();
});
