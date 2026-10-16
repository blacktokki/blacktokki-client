const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../../__tests__/loadTs.cjs');
const { hookHarness } = require('../../__tests__/hookHarness.cjs');

test('search embeddings run once for the final graph after NLI and templates are ready', async () => {
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
  const analysis = { status: 'ready', prepareOnly: true };
  let jobs = 0;
  const { GraphSearchEmbeddingBackground } = load('search/GraphSearchEmbeddingBackground.tsx', {
    react: harness.react,
    './cache': { graphSearchCache: {} },
    './embeddingStatus': {
      publishSearchEmbeddingStatus: (scope, status) => statuses.push([scope, status]),
    },
    './useGraphSearch': { useSearchGraph: () => state },
    '../useRelationAnalysisSession': { useRelationAnalysisSession: () => ({ analysis }) },
    './snapshot': {
      createGraphSearchSnapshot: async ({ scope }) => ({ scope, revision: 'current' }),
    },
    './engine': {
      graphSearchDocuments: () => [{ id: 'one' }],
    },
    './semantic': {
      ensureGraphSearchVectors: async ({ scope, revision, documents, onProgress }) => {
        jobs++;
        assert.equal(scope, 'graph-scope');
        assert.equal(revision, 'current');
        assert.equal(documents.length, 1);
        onProgress(1, 1);
      },
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
  for (const phase of ['embedding', 'merge', 'validation', 'retry']) {
    analysis.phase = phase;
    harness.render(GraphSearchEmbeddingBackground);
    await new Promise(setImmediate);
    assert.equal(jobs, 0, `${phase} does not start semantic search embeddings`);
  }
  analysis.status = 'completed';
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 0, 'the graph must include final NLI results');
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
    { phase: 'completed', processed: 1, total: 1, revision: 'current' },
  ]);
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  assert.equal(jobs, 1, 'ordinary rerenders do not repeat final graph embedding');
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
  const { GraphSearchEmbeddingBackground } = load('search/GraphSearchEmbeddingBackground.tsx', {
    react: harness.react,
    './cache': { graphSearchCache: {} },
    './embeddingStatus': {
      publishSearchEmbeddingStatus: (_scope, status) => statuses.push(status),
    },
    './useGraphSearch': { useSearchGraph: () => data },
    '../useRelationAnalysisSession': { useRelationAnalysisSession: () => ({ analysis }) },
    './snapshot': {
      createGraphSearchSnapshot: async () => ({ scope: 'graph-scope', revision: 'current' }),
    },
    './engine': { graphSearchDocuments: () => [] },
    './semantic': {
      ensureGraphSearchVectors: (options) => {
        job = options;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  harness.render(GraphSearchEmbeddingBackground);
  await new Promise(setImmediate);
  analysis.status = 'running';
  harness.render(GraphSearchEmbeddingBackground);
  assert.equal(job.signal.aborted, true);
  job.onProgress(1, 1);
  finish();
  await new Promise(setImmediate);
  assert.deepEqual(statuses.at(-1), { phase: 'idle', processed: 0, total: 0 });
  harness.unmount();
});
