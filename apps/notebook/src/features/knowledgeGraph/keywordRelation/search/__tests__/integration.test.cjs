const assert = require('node:assert/strict');
const { test } = require('node:test');

const { hookHarness, elements } = require('../../__tests__/loadTs.cjs');
const load = require('../../__tests__/loadTs.cjs');
const { buildGraphSearchContext: contextFor } = load('search/context.ts');
const noop = () => {};
const lang = (key) => key;
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('a new search observer immediately reuses completed templates across equivalent source selections', async () => {
  const observers = [hookHarness(), hookHarness()];
  let active = observers[0];
  let observer = 0;
  let scope = 'synthetic-normal';
  const notes = [
    { title: 'Shapes/One', description: '<h2>Vertices</h2><p>One</p>' },
    { title: 'Shapes/Two', description: '<h2>Vertices</h2><p>Two</p>' },
  ];
  const selections = [[...notes], [...notes]];
  const roots = [['Shapes'], ['Shapes']];
  const base = { nodes: [], edges: [], isLoading: false };
  const boards = [];
  const result = { candidates: [] };
  let discoveries = 0;
  let projections = 0;
  const react = Object.fromEntries(
    Object.keys(active.react).map((key) => [key, (...args) => active.react[key](...args)])
  );
  const { useSearchGraph } = load('search/useGraphSearch.ts', {
    react,
    '@blacktokki/core': { useLangContext: () => ({ lang }) },
    '@blacktokki/editor': { toHtml: lang },
    '../../../../hooks/useExtension': {
      useExtension: () => ({ data: { info: [{ key: 'inductiveTemplate', active: true }] } }),
    },
    '../../../../hooks/useNoteStorage': {
      useNotePages: () => ({ data: notes, isLoading: false }),
    },
    '../../../../hooks/useBoardStorage': {
      useBoardPages: () => ({ data: boards, isLoading: false }),
    },
    '../../../../hooks/usePrivate': { isHiddenTitle: () => false },
    '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    '../../../inductiveTemplate/useInductiveTemplates': {
      useInductiveTemplatesData: () => ({
        enabled: true,
        scope,
        examples: { data: selections[observer] },
        notebookRoots: roots[observer],
      }),
    },
    '../../../inductiveTemplate/discovery': {
      discoverTemplates: () => {
        discoveries++;
        return [];
      },
    },
    '../../../inductiveTemplate/templateSimilarity': { groupSimilarTemplates: () => [] },
    '../../inductiveTemplate/graph': {
      addTemplateGraph: (graph) => {
        projections++;
        return graph;
      },
    },
    '../../inductiveTemplate/palette': { getKnowledgeGraphPalette: () => ({}) },
    '../../utils/palette': { getKeywordRelationColors: () => ({}) },
    '../../useKnowledgeGraphData': { useKnowledgeGraphData: () => base },
    '../graph': { addKeywordRelationGraph: (graph) => graph },
    '../useRelationAnalysisSession': {
      useRelationAnalysisScope: () => ({ scope, available: true, privateMode: false }),
      useRelationAnalysisSession: () => ({
        data: { available: true, notes: { data: notes } },
        analysis: { status: 'completed', result },
      }),
    },
    '../../../../components/SearchBar': { urlToNoteLink: noop },
    '../useRelationAnalysis': {},
    '../keywordRelationCache': {},
    './preparation': {},
    './context': {},
    './engine': {},
  });
  const render = (index) => {
    observer = index;
    active = observers[index];
    return active.render(() => useSearchGraph(true));
  };
  assert.equal(render(0).input.coverage.templates, false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const completed = render(0);
  assert.equal(completed.input.scope, scope, 'search uses the account/notebook scope directly');
  assert.equal(completed.input.coverage.templates, true);
  const before = projections;
  const firstSearch = render(1);
  assert.equal(firstSearch.input.coverage.templates, true);
  assert.strictEqual(firstSearch.input, completed.input);
  assert.equal(discoveries, 1);
  assert.equal(projections, before, 'a new observer must not replace the completed search graph');
  scope = 'synthetic-private';
  assert.equal(render(1).input.coverage.templates, false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(render(1).input.coverage.templates, true);
  assert.equal(discoveries, 2, 'different access scopes must prepare their own templates');
  observers.forEach((harness) => harness.unmount());
});

function fixture() {
  const harness = hookHarness(),
    roots = [];
  const state = {
    scope: 'local:1:normal',
    available: true,
    notes: [{ title: 'Note', description: 'body' }],
    base: { nodes: [], edges: [], isLoading: false },
    semanticCalls: 0,
    semanticFails: false,
    queryFails: false,
    vectorJobs: [],
    scoredQueries: [],
    querySessions: [],
    holdVectors: false,
    embeddingStatuses: [],
    embeddingState: new Map(),
    keywordReady: true,
    keywordResult: { candidates: [] },
    keywordSources: undefined,
    keywordRefetches: 0,
    revision: 'revision',
    snapshots: [],
    searches: [],
    holdSnapshot: false,
    holdSearch: false,
    holdContext: false,
    contextJobs: [],
  };
  const snapshot = async (input) => {
    const task = { input, ...defer() };
    state.snapshots.push(task);
    if (state.holdSnapshot) return task.promise;
    return {
      version: 1,
      scope: input.scope,
      revision: state.revision,
      nodes: [],
      edges: [],
      sources: [],
      coverage: input.coverage,
    };
  };
  const hook = load('search/useGraphSearch.ts', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang }) },
    '@blacktokki/editor': { toHtml: lang },
    '../../../../hooks/useExtension': { useExtension: () => ({ data: { info: [] } }) },
    '../../../../hooks/useNoteStorage': {
      useNotePages: () => ({ data: state.notes, isLoading: false, isError: false }),
    },
    '../../../../hooks/useBoardStorage': {
      useBoardPages: () => ({ data: roots, isLoading: false, isError: false }),
    },
    '../../../../hooks/usePrivate': { isHiddenTitle: () => false },
    '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    '../../../inductiveTemplate/useInductiveTemplates': {
      useInductiveTemplatesData: () => ({ examples: { refetch: noop }, notebookRoots: roots }),
    },
    '../../../inductiveTemplate/discovery': { discoverTemplates: () => [] },
    '../../../inductiveTemplate/templateSimilarity': { groupSimilarTemplates: () => [] },
    '../../inductiveTemplate/graph': { addTemplateGraph: (graph) => graph },
    '../../inductiveTemplate/palette': { getKnowledgeGraphPalette: () => ({}) },
    '../../utils/palette': { getKeywordRelationColors: () => ({}) },
    '../../useKnowledgeGraphData': {
      useKnowledgeGraphData: (options) => {
        assert.equal(options.validation, false, 'search must not schedule document validation');
        return state.base;
      },
    },
    '../graph': { addKeywordRelationGraph: (graph) => graph },
    '../useRelationAnalysisSession': {
      ...{
        useRelationAnalysisScope: (requested) => ({
          scope: state.scope,
          available: requested && state.available,
          privateMode: false,
        }),
      },
      ...{
        useRelationAnalysisSession: () => ({
          data: {
            available: state.keywordReady,
            notes: {
              data: state.keywordSources ?? state.notes,
              refetch: () => state.keywordRefetches++,
            },
          },
          analysis: {
            status: state.keywordReady ? 'completed' : 'idle',
            result: state.keywordReady ? state.keywordResult : undefined,
          },
        }),
      },
    },
    '../../../../components/SearchBar': { urlToNoteLink: noop },
    './snapshot': {
      graphSearchInputRevision: async () => `input-${state.revision}`,
      createGraphSearchSnapshot: snapshot,
    },
    '../keywordRelationCache': {
      graphSearchCache: { read: async () => undefined, write: async () => {} },
    },
    '../useRelationAnalysis': {
      publishSearchEmbeddingStatus: (scope, status, source) => {
        state.embeddingStatuses.push({ scope, status, source });
        state.embeddingState.set(JSON.stringify([scope, source]), status);
      },
      useSearchEmbeddingStatus: (scope, source) =>
        state.embeddingState.get(JSON.stringify([scope, source])) || {
          phase: 'idle',
          processed: 0,
          total: 0,
        },
    },
    './engine': {
      createGraphSearchIndex: async (snapshot) => ({ snapshot, documents: [] }),
      searchKnowledgeGraph: async (index, query, options) => {
        const task = { index, query, options, ...defer() };
        state.searches.push(task);
        const result = {
          scope: index.snapshot.scope,
          query,
          nodes: [],
          edges: [],
          paths: [],
          sources: [],
          plan: { terms: [query.toLowerCase()], intent: 'related', maxHops: options.maxHops },
          limited: false,
          ...(state.holdSearch ? await task.promise : {}),
        };
        result.context = contextFor(result, options.contextChars);
        return result;
      },
    },
    './context': {
      buildGraphSearchContextAsync: async (result, size, translate, signal) => {
        const job = { size, signal, ...defer() };
        state.contextJobs.push(job);
        if (state.holdContext) await job.promise;
        return contextFor(result, size, translate);
      },
    },
    './preparation': {
      acquireGraphSearchPreparation: (scope) => {
        const session = {
          scope,
          disposed: false,
          revision: async () => `input-${state.revision}`,
          index: async (input, _revision, signal) => ({
            snapshot: await snapshot({ ...input, signal }),
            documents: [],
          }),
          vectors: async (options) => {
            state.semanticCalls++;
            const task = { options, ...defer() };
            state.vectorJobs.push(task);
            if (state.semanticFails) throw new Error('unavailable');
            if (state.holdVectors) return task.promise;
            return { byDocument: new Map(), total: 0 };
          },
          scores: async (query) => {
            assert.equal(session.disposed, false);
            state.scoredQueries.push(query);
            if (state.queryFails) throw new Error('query unavailable');
            return new Map();
          },
          dispose: async () => {
            session.disposed = true;
          },
        };
        state.querySessions.push(session);
        return session;
      },
    },
  });
  let query = 'Alpha';
  let maxHops = 2;
  let contextChars = 16000;
  const render = () =>
    harness.render(() => hook.useGraphSearch(query, maxHops, true, false, contextChars));
  const settle = async () => {
    let value;
    for (let i = 0; i < 6; i++) {
      await new Promise(setImmediate);
      value = render();
    }
    return value;
  };
  return {
    state,
    render,
    settle,
    harness,
    setQuery: (value) => {
      query = value;
    },
    setMaxHops: (value) => {
      maxHops = value;
    },
    setContextChars: (value) => {
      contextChars = value;
    },
  };
}

test('analysis publication lag does not refetch already shared source notes', async () => {
  const f = fixture();
  f.state.keywordSources = [{ title: 'Note', description: 'previous body' }];
  f.render();
  await f.settle();
  assert.equal(f.state.keywordRefetches, 0);
  assert.equal(f.state.snapshots.length, 0, 'incomplete graphs must not replace final preparation');
  f.state.keywordSources = f.state.notes;
  await f.settle();
  assert.equal(f.state.keywordRefetches, 0);
  assert.equal(f.state.snapshots.at(-1).input.coverage.keywords, true);
  f.harness.unmount();
});

test('completed analysis hands off before retrieval indexing finishes and starts the waiting query', async () => {
  const f = fixture();
  f.state.holdSnapshot = true;
  f.state.embeddingState.set(JSON.stringify([f.state.scope, 'extension']), {
    phase: 'completed',
    processed: 1,
    total: 1,
    revision: 'revision',
    inputRevision: 'input-revision',
  });
  f.render();
  await new Promise(setImmediate);
  let value = f.render();
  assert.equal(
    value.ready,
    true,
    'the completed analysis UI can close without waiting for an index'
  );
  assert.equal(value.loading, true);
  assert.equal(value.progress.phase, 'index');
  assert.equal(f.state.semanticCalls, 0);

  const interrupted = f.state.snapshots[0];
  f.state.base = { ...f.state.base, isLoading: true };
  f.render();
  assert.equal(interrupted.input.signal.aborted, true);
  f.state.base = { ...f.state.base, isLoading: false };
  f.render();
  await new Promise(setImmediate);
  f.render();
  assert.equal(f.state.snapshots.length, 2, 'an interrupted partial preparation must restart');
  const finish = (job) =>
    job.resolve({
      scope: job.input.scope,
      revision: 'revision',
      nodes: [],
      edges: [],
      sources: [],
      coverage: job.input.coverage,
    });
  finish(interrupted);
  await f.settle();
  assert.equal(f.state.searches.length, 0, 'an aborted index must not start a search');
  finish(f.state.snapshots[1]);
  value = await f.settle();
  assert.equal(value.result.query, 'Alpha');
  assert.equal(f.state.searches.length, 1, 'the waiting query starts automatically');
  f.harness.unmount();
});

test('early search handoff requires the current source identity and scope', async () => {
  const f = fixture();
  f.setQuery('');
  f.state.holdSnapshot = true;
  const publish = (inputRevision) =>
    f.state.embeddingState.set(JSON.stringify([f.state.scope, 'extension']), {
      phase: 'completed',
      processed: 1,
      total: 1,
      revision: 'revision',
      inputRevision,
    });
  publish('outdated-input');
  f.render();
  await new Promise(setImmediate);
  assert.equal(f.render().ready, false);
  publish('input-revision');
  assert.equal(f.render().ready, true);
  f.state.revision = 'edited';
  f.state.notes = [{ title: 'Note', description: 'edited' }];
  assert.equal(f.render().ready, false);
  await new Promise(setImmediate);
  assert.equal(f.render().ready, false, 'previous completion cannot hide analysis after edits');
  publish('input-edited');
  assert.equal(f.render().ready, true);
  f.state.scope = 'local:2:private';
  f.render();
  await new Promise(setImmediate);
  assert.equal(f.render().ready, false, 'another notebook or privacy scope must be verified again');
  f.harness.unmount();
});

test('new queries and hop ranges reuse the prepared index and vectors without analysis progress', async () => {
  const f = fixture();
  f.render();
  let value = await f.settle();
  assert.equal(value.result.query, 'Alpha');
  const statuses = [...f.state.embeddingStatuses];
  const index = f.state.searches[0].index;
  for (const query of ['Beta', 'Gamma']) {
    f.setQuery(query);
    assert.equal(f.render().ready, true);
    value = await f.settle();
    assert.equal(value.result.query, query);
    assert.equal(f.state.searches.at(-1).index, index);
  }
  f.setMaxHops(3);
  f.render();
  await f.settle();
  assert.equal(f.state.searches.at(-1).options.maxHops, 3);
  f.setQuery('');
  f.render();
  await f.settle();
  f.setQuery('Delta');
  f.render();
  value = await f.settle();
  assert.equal(value.result.query, 'Delta');
  assert.equal(f.state.snapshots.length, 1);
  assert.equal(f.state.semanticCalls, 1);
  assert.deepEqual(f.state.scoredQueries, ['Alpha', 'Beta', 'Gamma', 'Gamma', 'Delta']);
  assert.deepEqual(f.state.embeddingStatuses, statuses);
  assert.equal(f.state.querySessions.length, 1, 'all queries reuse the same model session');
  assert.equal(f.state.querySessions[0].disposed, false);
  f.harness.unmount();
  assert.equal(f.state.querySessions[0].disposed, true);
});

test('changing the context size repacks the existing result without indexing, embedding or retrieval', async () => {
  const f = fixture();
  f.render();
  const original = await f.settle();
  const statuses = [...f.state.embeddingStatuses];
  for (const size of [32000, 64000, 128000, 256000, 16000]) {
    f.setContextChars(size);
    f.render();
    const current = await f.settle();
    assert.equal(current.result.context.usage.limit, size);
    assert.equal(current.result.context.usage.characters, current.result.context.text.length);
    assert.equal(current.result.nodes, original.result.nodes);
    assert.equal(current.ready, true);
  }
  await f.settle();
  assert.equal(f.state.snapshots.length, 1);
  assert.equal(f.state.semanticCalls, 1);
  assert.equal(f.state.searches.length, 1);
  assert.deepEqual(f.state.scoredQueries, ['Alpha']);
  assert.deepEqual(f.state.embeddingStatuses, statuses);
  f.harness.unmount();
});

test('context changes clear visible results and a late obsolete size cannot overwrite the latest selection', async () => {
  const f = fixture();
  f.render();
  await f.settle();
  f.state.holdContext = true;
  f.setContextChars(32000);
  const pending = f.render();
  assert.equal(pending.result, undefined);
  assert.equal(pending.loading, true);
  await f.settle();
  const obsolete = f.state.contextJobs.at(-1);
  f.setContextChars(64000);
  f.render();
  await f.settle();
  assert.equal(obsolete.signal.aborted, true);
  const latest = f.state.contextJobs.at(-1);
  assert.equal(latest.size, 64000);
  obsolete.resolve();
  assert.equal((await f.settle()).result, undefined);
  latest.resolve();
  const completed = await f.settle();
  assert.equal(completed.result.context.usage.limit, 64000);
  assert.equal(completed.loading, false);
  assert.equal(f.state.snapshots.length, 1);
  assert.equal(f.state.semanticCalls, 1);
  assert.equal(f.state.searches.length, 1);
  f.setContextChars(128000);
  f.render();
  await f.settle();
  const stopped = f.state.contextJobs.at(-1);
  f.render().stop();
  assert.equal(stopped.signal.aborted, true);
  stopped.resolve();
  const cancelled = await f.settle();
  assert.equal(cancelled.result, undefined);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.loading, false);
  f.harness.unmount();
});

test('changing a query during document preparation keeps the same job and searches only the latest query', async () => {
  const f = fixture();
  f.state.holdVectors = true;
  f.render();
  await f.settle();
  const job = f.state.vectorJobs[0];
  for (const query of ['Beta', 'Gamma']) {
    f.setQuery(query);
    f.render();
    await f.settle();
  }
  assert.equal(job.options.signal.aborted, false);
  assert.equal(f.state.vectorJobs.length, 1);
  assert.equal(f.state.searches.length, 0);
  job.options.onProgress(1, 2);
  assert.equal(f.render().progress.phase, 'embedding');
  job.resolve({ byDocument: new Map(), total: 2 });
  const value = await f.settle();
  assert.equal(value.result.query, 'Gamma');
  assert.equal(value.ready, true);
  assert.deepEqual(f.state.scoredQueries, ['Gamma']);
  f.harness.unmount();
});

test('a query embedding failure preserves document readiness and later queries reuse it', async () => {
  const f = fixture();
  f.state.queryFails = true;
  f.render();
  let value = await f.settle();
  assert.equal(value.error, 'query unavailable');
  assert.equal(value.ready, true);
  assert.equal(f.state.embeddingStatuses.at(-1).status.phase, 'completed');
  const statuses = [...f.state.embeddingStatuses];
  f.state.queryFails = false;
  f.setQuery('Beta');
  f.render();
  value = await f.settle();
  assert.equal(value.result.query, 'Beta');
  assert.equal(value.error, undefined);
  assert.equal(f.state.semanticCalls, 1);
  assert.deepEqual(f.state.embeddingStatuses, statuses);
  f.harness.unmount();
});

test('edited notes and a new privacy scope invalidate prepared documents', async () => {
  const f = fixture();
  f.render();
  await f.settle();
  f.state.notes = [{ title: 'Note', description: 'changed' }];
  f.state.revision = 'changed';
  f.render();
  await f.settle();
  assert.equal(f.state.semanticCalls, 2);
  assert.equal(f.state.querySessions.length, 1, 'source edits retain the compatible model');
  assert.equal(f.state.querySessions[0].disposed, false);
  f.state.holdVectors = true;
  f.state.scope = 'local:2:normal';
  f.render();
  await f.settle();
  const oldJob = f.state.vectorJobs.at(-1);
  f.state.scope = 'local:2:private';
  f.render();
  await f.settle();
  assert.equal(oldJob.options.signal.aborted, true);
  oldJob.resolve({ byDocument: new Map(), total: 50 });
  let value = await f.settle();
  assert.equal(value.ready, false);
  assert.equal(value.result, undefined);
  f.state.vectorJobs.at(-1).resolve({ byDocument: new Map(), total: 1 });
  value = await f.settle();
  assert.match(value.result.scope, /local:2:private/);
  assert.equal(f.state.semanticCalls, 4);
  f.harness.unmount();
  assert.ok(f.state.querySessions.every((session) => session.disposed));
});

test('stopping document preparation cancels it and a new query can resume the same index', async () => {
  const f = fixture();
  f.state.holdVectors = true;
  f.render();
  let value = await f.settle();
  value.stop();
  f.render();
  const oldJob = f.state.vectorJobs[0];
  assert.equal(oldJob.options.signal.aborted, true);
  f.setQuery('Beta');
  f.render();
  await f.settle();
  assert.equal(f.state.vectorJobs.length, 2);
  assert.equal(f.state.snapshots.length, 1);
  oldJob.resolve({ byDocument: new Map(), total: 10 });
  value = await f.settle();
  assert.equal(value.result, undefined);
  f.state.vectorJobs[1].resolve({ byDocument: new Map(), total: 1 });
  value = await f.settle();
  assert.equal(value.result.query, 'Beta');
  f.harness.unmount();
});

test('semantic preparation is mandatory and an embedding failure blocks unscored results', async () => {
  const f = fixture();
  f.state.semanticFails = true;
  f.render();
  let value = await f.settle();
  assert.equal(value.result, undefined);
  assert.equal(value.error, 'unavailable');
  assert.equal(f.state.semanticCalls, 1);
  assert.ok(
    f.state.embeddingStatuses.some(
      ({ scope, status, source }) =>
        scope === f.state.scope && source === 'search' && status.phase === 'failed'
    )
  );
  f.state.semanticFails = false;
  value.retry();
  f.render();
  value = await f.settle();
  assert.equal(f.state.semanticCalls, 2);
  assert.equal(value.result.query, 'Alpha');
  assert.ok(
    f.state.embeddingStatuses.some(
      ({ scope, status, source }) =>
        scope === f.state.scope && source === 'search' && status.phase === 'completed'
    )
  );
  f.harness.unmount();
});

test('a query waits for completed NLI before preparing semantic search embeddings', async () => {
  const f = fixture();
  f.state.keywordReady = false;
  f.render();
  let value = await f.settle();
  assert.equal(f.state.semanticCalls, 0);
  assert.equal(f.state.searches.length, 0);
  assert.equal(value.result, undefined);
  f.state.keywordReady = true;
  f.render();
  value = await f.settle();
  assert.equal(f.state.semanticCalls, 1);
  assert.equal(value.result.query, 'Alpha');
  f.harness.unmount();
});

test('cancel during indexing aborts the index job; retry rebuilds it', async () => {
  const f = fixture();
  f.state.holdSnapshot = true;
  f.render();
  await new Promise(setImmediate);
  let value = f.render();
  value.stop();
  assert.equal(f.state.snapshots[0].input.signal.aborted, true);
  f.state.snapshots[0].resolve({ scope: 'old', nodes: [], edges: [], sources: [] });
  value = await f.settle();
  assert.equal(value.result, undefined);
  assert.equal(value.cancelled, true);
  f.state.holdSnapshot = false;
  value.retry();
  f.render();
  value = await f.settle();
  assert.equal(value.result.query, 'Alpha');
  f.harness.unmount();
});

test('full search readiness requires current analysis and embeddings for the same graph revision', async () => {
  const f = fixture();
  f.state.keywordReady = true;
  f.setQuery('');
  const publish = (revision) =>
    f.state.embeddingState.set(JSON.stringify([f.state.scope, 'extension']), {
      phase: 'completed',
      processed: 1,
      total: 1,
      revision,
    });
  publish('outdated');
  f.render();
  let value = await f.settle();
  assert.equal(value.ready, false);
  publish('revision');
  assert.equal(f.render().ready, true);
  f.state.revision = 'changed';
  f.state.notes = [{ title: 'Note', description: 'edited' }];
  assert.equal(f.render().ready, false);
  value = await f.settle();
  assert.equal(value.ready, false, 'old embeddings cannot hide preparation for edited notes');
  publish('changed');
  assert.equal(f.render().ready, true);
  f.state.keywordReady = false;
  f.render();
  value = await f.settle();
  assert.equal(
    value.ready,
    false,
    'base graph search does not imply completed relationship analysis'
  );
  f.state.keywordReady = true;
  f.state.embeddingState.clear();
  f.setQuery('Alpha');
  f.render();
  value = await f.settle();
  assert.equal(value.ready, true);
  f.setQuery('Beta');
  assert.equal(f.render().ready, true, 'changing a query keeps the same graph ready');
  f.setQuery('');
  f.state.scope = 'local:2:private';
  f.render();
  value = await f.settle();
  assert.equal(value.ready, false, 'another scope cannot reuse the previous graph readiness');
  f.harness.unmount();
});

test('late answers cannot cross query, notebook or privacy boundaries', async () => {
  const f = fixture();
  f.state.holdSearch = true;
  f.render();
  await f.settle();
  const first = f.state.searches.at(-1);
  f.setQuery('Beta');
  assert.equal(f.render().result, undefined);
  await f.settle();
  first.resolve({ query: 'Alpha', scope: 'old' });
  let value = await f.settle();
  assert.equal(value.result, undefined);
  const second = f.state.searches.at(-1);
  f.state.scope = 'local:2:private';
  f.render();
  await f.settle();
  second.resolve({ query: 'Beta', scope: 'normal' });
  value = await f.settle();
  assert.equal(value.result, undefined);
  const current = f.state.searches.at(-1);
  current.resolve({ query: 'Beta', scope: current.index.snapshot.scope });
  value = await f.settle();
  assert.match(value.result.scope, /local:2:private/);
  f.state.available = false;
  assert.equal(f.render().result, undefined);
  f.harness.unmount();
});

test('graph search renders Markdown, follows source links and hands analysis over to search', () => {
  const { renderer } = load(
    require
      .resolve('@blacktokki/editor/package.json')
      .replace(/package\.json$/, 'src/lib/markdown.ts')
  );
  const { buildGraphSearchContext } = load('search/engine.ts', {
    './snapshot': {},
    '../types': {},
  });
  const conversions = [],
    openedLinks = [];
  let focused = true;
  const harness = hookHarness(),
    routes = [];
  const source = {
    id: 's',
    title: 'Note',
    paragraph: 'Detail',
    section: 'Parent',
    text: 'evidence',
  };
  const node = { id: 'note:1', name: 'Note', kind: 'note', typeLabel: 'Note', sourceIds: ['s'] };
  const target = {
    id: 'link:2',
    name: 'Other',
    kind: 'connectedExternalLink',
    typeLabel: 'Connected external link',
    url: 'https://example.com/docs?q=one&next=two',
    sourceIds: [],
  };
  const edge = {
    id: 'edge:1',
    source: node.id,
    target: target.id,
    label: 'references',
    type: 'REFERENCES',
    directed: true,
    sourceIds: ['s'],
  };
  const result = {
    nodes: [{ node }, { node: target }],
    edges: [{ edge }],
    query: 'Note',
    plan: { terms: ['note'], intent: 'related', maxHops: 2 },
    paths: [{ nodes: [node.id, target.id], edges: [edge.id] }],
    sources: [source],
    limited: false,
  };
  result.context = buildGraphSearchContext(result);
  const searchState = {
    result,
  };
  const { GraphSearchSection } = load('search/GraphSearchSection.tsx', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang }) },
    '@blacktokki/editor': {
      EditorViewer: 'EditorViewer',
      toHtml: (markdown) => {
        conversions.push(markdown);
        return renderer(markdown);
      },
    },
    '@react-navigation/native': {
      useNavigation: () => ({ push: (...args) => routes.push(args) }),
      useIsFocused: () => focused,
    },
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      ActivityIndicator: 'Spinner',
      ScrollView: 'Scroll',
      StyleSheet: { create: (s) => s },
    },
    'react-native-vector-icons/MaterialCommunityIcons': 'Icon',
    './useGraphSearch': {
      useGraphSearch: (_query, _depth, _requested, _focused, limit) => {
        if (searchState.result && searchState.result.context.usage.limit !== limit)
          searchState.result.context = buildGraphSearchContext(searchState.result, limit);
        return searchState;
      },
    },
    '../../../../hooks/useExtension': {
      useEffectExtensionScreen: () => ({ isReady: true, isActive: true }),
    },
    '../../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({
        commonStyles: {
          text: { color: 'black' },
          smallText: { color: 'gray' },
          title: { color: 'black' },
          button: { backgroundColor: 'blue' },
          card: { backgroundColor: 'white', borderColor: 'gray' },
          input: { backgroundColor: 'white', borderColor: 'gray' },
          separator: { backgroundColor: 'gray' },
        },
        colorScheme: 'light',
      }),
    },
    '../../../../components/SearchBar': {
      onLink: (url, navigation) => openedLinks.push({ url, navigation }),
    },
    '../../components/KnowledgeGraphNavToolbar': { KnowledgeGraphNavToolbar: 'Nav' },
    '../components/AnalysisControls': { AnalysisAction: 'Action' },
    '../screens/AnalysisProgressSection': { AnalysisProgressSection: 'AnalysisProgress' },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({
        data: {
          scope: 'local:1:normal',
          available: true,
          notes: { data: [{ title: 'Note' }], isError: false, isFetching: false, refetch: noop },
        },
        analysis: { status: 'ready' },
      }),
    },
  });
  let tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.ok(!tree.some((item) => item.type === 'Scroll'), 'the search screen owns scrolling');
  assert.ok(tree.some((item) => item.type === 'AnalysisProgress'));
  let viewers = tree.filter((item) => item.type === 'EditorViewer');
  assert.equal(viewers.length, 1);
  const viewer = viewers[0];
  assert.equal(viewer.props.value, renderer(result.context.text));
  assert.ok(
    tree.some((item) => item.type === 'Text' && item.props.children.includes('Context usage'))
  );
  for (const limit of [16000, 32000, 64000, 128000, 256000])
    assert.ok(
      tree.some((item) => item.props.accessibilityLabel === `Context size: ${limit / 1000}k`)
    );
  assert.equal(viewer.props.active, true);
  assert.deepEqual(conversions, [result.context.text]);
  const hrefs = [...viewer.props.value.matchAll(/href="([^"]+)"/g)].map((match) =>
    match[1].replaceAll('&amp;', '&')
  );
  assert.ok(hrefs.every((href) => href.startsWith('?title=') || href === target.url));
  assert.ok(hrefs.includes(target.url));
  viewer.props.onLink(hrefs.find((href) => href.startsWith('?title=')));
  assert.deepEqual(routes, []);
  const noteParams = new URLSearchParams(openedLinks[0].url.slice(1));
  assert.deepEqual(Object.fromEntries(noteParams), {
    title: 'Note',
    paragraph: 'Detail',
    section: 'Parent',
  });
  assert.equal(typeof openedLinks[0].navigation.push, 'function');
  viewer.props.onLink(target.url);
  assert.equal(openedLinks[1].url, target.url);
  focused = false;
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  viewers = tree.filter((item) => item.type === 'EditorViewer');
  assert.equal(viewers[0].props.active, false);
  assert.equal(conversions.length, 1, 'unchanged context is not converted again');
  result.context = { ...result.context, text: '### Updated context\n\n> New evidence' };
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.equal(
    tree.find((item) => item.type === 'EditorViewer').props.value,
    renderer(result.context.text)
  );
  assert.equal(conversions.length, 2);
  result.context = { ...result.context, entries: [] };
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.equal(tree.filter((item) => item.type === 'EditorViewer').length, 1);
  assert.ok(
    tree.some(
      (item) =>
        item.type === 'View' && item.props.style?.some?.((style) => style?.display === 'none')
    ),
    'the existing viewer is hidden without tearing down its editor'
  );
  assert.ok(
    tree.some((item) => item.type === 'Text' && item.props.children.includes('No search results.'))
  );
  searchState.result = undefined;
  searchState.loading = true;
  searchState.progress = { phase: 'embedding', processed: 1, total: 2 };
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.equal(
    tree.filter((item) => item.type === 'EditorViewer').length,
    1,
    'the initialized viewer survives a pending query or hop change'
  );
  assert.ok(tree.some((item) => item.type === 'AnalysisProgress'));
  assert.equal(
    tree.some((item) => item.type === 'Spinner'),
    false
  );
  searchState.ready = true;
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.equal(
    tree.some((item) => item.type === 'AnalysisProgress'),
    false
  );
  assert.ok(
    tree.some((item) => item.type === 'Spinner'),
    'ready search keeps its normal search indicator'
  );
  searchState.progress = { phase: 'index', processed: 0, total: 2 };
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.ok(
    tree.some((item) => item.type === 'Spinner'),
    'completed analysis hands off to search immediately while its index is being prepared'
  );
  assert.equal(
    tree.some((item) => item.type === 'AnalysisProgress'),
    false
  );
  searchState.ready = false;
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.ok(tree.some((item) => item.type === 'AnalysisProgress'));
  assert.equal(
    tree.some((item) => item.type === 'Spinner'),
    false
  );
  searchState.result = result;
  searchState.loading = false;
  tree.find((item) => item.props.accessibilityLabel === 'Context size: 256k').props.onPress();
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.equal(result.context.usage.limit, 256000);
  assert.equal(result.context.usage.characters, result.context.text.length);
  assert.equal(
    tree.find((item) => item.props.accessibilityLabel === 'Context size: 256k').props
      .accessibilityState.selected,
    true
  );
  const usage = tree.find(
    (item) => item.type === 'Text' && item.props.children.includes('Context usage')
  );
  assert.ok(
    usage.props.children.includes(
      `${(result.context.text.length / 1000).toLocaleString(undefined, {
        maximumFractionDigits: 3,
      })}k`
    )
  );
  assert.ok(usage.props.children.includes('256k'));
  harness.unmount();
});

test('final graph and query embedding status do not overwrite each other', () => {
  const { publishSearchEmbeddingStatus, useSearchEmbeddingStatus } = load(
    'useRelationAnalysis.ts',
    {
      react: {
        useCallback: (callback) => callback,
        useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      },
    }
  );
  const scope = 'local:1:normal';
  publishSearchEmbeddingStatus(scope, { phase: 'running', processed: 1, total: 4 });
  publishSearchEmbeddingStatus(scope, { phase: 'running', processed: 2, total: 3 }, 'search');
  assert.deepEqual(useSearchEmbeddingStatus(scope), {
    phase: 'running',
    processed: 1,
    total: 4,
  });
  publishSearchEmbeddingStatus(scope, { phase: 'completed', processed: 4, total: 4 });
  assert.deepEqual(useSearchEmbeddingStatus(scope), {
    phase: 'running',
    processed: 2,
    total: 3,
  });
  assert.equal(useSearchEmbeddingStatus(scope, 'extension').phase, 'completed');
  publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 }, 'search');
  assert.equal(useSearchEmbeddingStatus(scope).phase, 'completed');
  for (const analysisRunId of [1, 2]) {
    publishSearchEmbeddingStatus(scope, {
      phase: 'completed',
      processed: 4,
      total: 4,
      analysisRunId,
    });
    assert.equal(useSearchEmbeddingStatus(scope, 'extension').analysisRunId, analysisRunId);
  }
  for (const inputRevision of ['source-a', 'source-b']) {
    publishSearchEmbeddingStatus(scope, {
      phase: 'completed',
      processed: 4,
      total: 4,
      revision: 'same-result',
      inputRevision,
    });
    assert.equal(useSearchEmbeddingStatus(scope, 'extension').inputRevision, inputRevision);
  }
  publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 });
  assert.equal(useSearchEmbeddingStatus(scope).phase, 'idle');
});

test('global search reuses the shared screen for consecutive queries and stores only the query', () => {
  const harness = hookHarness(),
    routes = [],
    history = [];
  const feature = {
    search: { text: { Section: 'TextSearch' }, graph: { Section: 'GraphSearch' } },
    elements: () => [],
  };
  const { SearchBar } = load('../../../components/SearchBar.tsx', {
    react: harness.react,
    '@blacktokki/core': { Text: 'Text', useLangContext: () => ({ lang }) },
    '@blacktokki/account': { useAuthContext: () => ({ auth: {} }) },
    '@blacktokki/editor': { extractHtmlLinks: () => [] },
    '@react-navigation/native': {
      useNavigation: () => ({
        navigate: (...args) => routes.push(args),
        push: () => assert.fail('a new query must reuse the existing search screen'),
      }),
      useFocusEffect: noop,
    },
    'react-native': {
      View: 'View',
      TextInput: 'Input',
      TouchableOpacity: 'Touchable',
      FlatList: 'List',
      StyleSheet: { create: (s) => s },
      PanResponder: { create: (panHandlers) => ({ panHandlers }) },
    },
    'react-native-vector-icons/FontAwesome': 'Icon',
    '../hooks/useBoardStorage': { useBoardPages: () => ({ data: [] }) },
    '../hooks/useNoteStorage': { useNotePages: () => ({ data: [] }) },
    '../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: { text: {}, smallText: {}, placeholder: {} } }),
    },
    '../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    '../hooks/useKeywordStorage': {
      useKeywords: () => ({ data: [] }),
      useAddKeyowrd: () => ({ mutate: (item) => history.push(item) }),
    },
    '../hooks/useExtension': { useExtension: () => ({ data: { feature } }) },
  });
  const render = () => elements(harness.render(() => SearchBar({})));
  render()
    .find((n) => n.type === 'Input')
    .props.onChangeText('find this');
  const tree = render();
  tree
    .find(
      (n) =>
        n.type === 'Touchable' &&
        elements(n.props.children).some(
          (child) => child.type === 'Icon' && child.props.name === 'search'
        )
    )
    .props.onPress();
  assert.deepEqual(routes, [['SearchPage', { query: 'find this' }]]);
  assert.deepEqual(history, [{ type: '_QUERY', query: 'find this' }]);
  render()
    .find((n) => n.type === 'Input')
    .props.onChangeText('next query');
  render()
    .find((n) => n.type === 'Input')
    .props.onSubmitEditing();
  assert.deepEqual(routes.at(-1), ['SearchPage', { query: 'next query' }]);
  assert.deepEqual(history.at(-1), { type: '_QUERY', query: 'next query' });
  harness.unmount();
});

test('the shared search screen owns scrolling, lazily mounts tabs and paginates only the selected section', () => {
  const harness = hookHarness();
  const config = {
    data: {
      info: [
        { key: 'text', title: 'Search', active: true },
        { key: 'graph', title: 'Knowledge Graph', active: true },
      ],
      feature: { search: { text: { Section: 'TextSection' }, graph: { Section: 'GraphSection' } } },
    },
  };
  const route = { params: { query: 'Alpha' } };
  const { SearchScreen } = load('../../../screens/main/SearchScreens.tsx', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang }) },
    '@react-navigation/native': { useRoute: () => route },
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      ScrollView: 'Scroll',
      StyleSheet: { create: (s) => s },
    },
    '../../components/LoadingView': 'Loading',
    '../../components/SearchBar': { ResponsiveSearchBar: 'SearchBar' },
    '../../hooks/useExtension': { useExtension: () => config },
    '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
  });
  const render = () => elements(harness.render(SearchScreen));
  let tree = render();
  assert.equal(tree.filter((n) => n.type === 'Scroll').length, 1);
  assert.ok(elements(tree.find((n) => n.type === 'Scroll')).some((n) => n.type === 'SearchBar'));
  const loaded = [];
  tree.find((n) => n.type === 'TextSection').props.registerScrollEnd(() => loaded.push('text'));
  const scroll = (y) =>
    tree
      .find((n) => n.type === 'Scroll')
      .props.onScroll({
        nativeEvent: {
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 400 },
          contentOffset: { y },
        },
      });
  scroll(100);
  assert.deepEqual(loaded, []);
  scroll(600);
  assert.deepEqual(loaded, ['text']);
  assert.equal(tree.filter((n) => n.type === 'TextSection').length, 1);
  assert.equal(tree.filter((n) => n.type === 'GraphSection').length, 0);
  tree.find((n) => n.props.accessibilityLabel === 'Knowledge Graph').props.onPress();
  tree = render();
  assert.equal(tree.filter((n) => n.type === 'TextSection').length, 1);
  assert.equal(tree.filter((n) => n.type === 'GraphSection').length, 1);
  tree.find((n) => n.type === 'GraphSection').props.registerScrollEnd(() => loaded.push('graph'));
  scroll(600);
  assert.deepEqual(loaded, ['text', 'graph']);
  assert.ok(
    tree.find((n) => n.props.accessibilityLabel === 'Knowledge Graph').props.accessibilityState
      .selected
  );
  assert.equal(
    tree.find((n) => n.type === 'View' && n.props.accessibilityElementsHidden === true).props
      .children[0].type,
    'TextSection'
  );
  route.params.query = 'Beta';
  tree = render();
  assert.equal(tree.find((n) => n.type === 'GraphSection').props.query, 'Beta');
  assert.equal(tree.find((n) => n.type === 'TextSection').props.query, 'Beta');
  config.data.info[1].title = 'Renamed graph';
  tree = render();
  assert.ok(
    tree.find((n) => n.props.accessibilityLabel === 'Renamed graph').props.accessibilityState
      .selected
  );
  config.data.info[1].active = false;
  delete config.data.feature.search.graph;
  tree = render();
  assert.equal(tree.filter((n) => n.type === 'GraphSection').length, 0);
  assert.ok(
    tree.find((n) => n.props.accessibilityLabel === 'Search').props.accessibilityState.selected
  );
  config.data.feature.search = {};
  tree = render();
  assert.ok(
    tree.some(
      (n) => n.type === 'Text' && n.props.children.includes('No search extensions enabled.')
    )
  );
  harness.unmount();
});

test('text search uses the screen scroll handler and stops pagination while fetching or exhausted', () => {
  const harness = hookHarness();
  let handler;
  let requests = 0;
  const state = {
    data: { pages: [] },
    isLoading: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: () => requests++,
  };
  const { SearchPageSection } = load('../../search/SearchPageSection.tsx', {
    react: harness.react,
    '@react-navigation/native': { useNavigation: () => ({ push: noop }) },
    './useSearch': { useSearch: () => state },
    '../../screens/main/NoteListSection': { NoteListSection: 'NoteList' },
    '../../components/SearchBar': { onLink: noop },
  });
  const props = {
    query: 'Alpha',
    registerScrollEnd: (value) => {
      handler = value;
    },
  };
  const render = () => harness.render(() => SearchPageSection(props));
  assert.equal(render().props.scrollEnabled, false);
  handler();
  assert.equal(requests, 1);
  state.isFetchingNextPage = true;
  render();
  handler();
  assert.equal(requests, 1);
  state.isFetchingNextPage = false;
  state.hasNextPage = false;
  render();
  handler();
  assert.equal(requests, 1);
  harness.unmount();
  assert.equal(handler, undefined);
});
