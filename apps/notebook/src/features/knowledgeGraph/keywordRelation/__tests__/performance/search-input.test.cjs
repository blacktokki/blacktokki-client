/** Measure source projection, identity, snapshot and indexing, not a prebuilt snapshot delay. */
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { test } = require('node:test');
const load = require('../loadTs.cjs');
const { hookHarness } = load;

/** Only the browser DOM surface is adapted; all graph and retrieval algorithms run unchanged. */
function paragraphs(html) {
  const matches = [...html.matchAll(/<h2>(.*?)<\/h2>/g)];
  return [
    { title: '', path: '', level: 0, description: '', header: '' },
    ...matches.map((match, index) => ({
      title: match[1],
      path: btoa(match[1]),
      level: 2,
      header: match[0],
      description: html.slice(match.index + match[0].length, matches[index + 1]?.index),
    })),
  ];
}

function sources() {
  const notes = Array.from({ length: 512 }, (_, index) => ({
    id: index + 1,
    title: `Generated source ${index}`,
    type: 'NOTE',
    description: Array.from(
      { length: 16 },
      (_, section) =>
        `<h2>Section ${section}</h2><p>Record ${index}:${section}. ` +
        'A generated observation retains its original conditions and source. '.repeat(4) +
        '</p>'
    ).join(''),
    option: {},
  }));
  const entities = Array.from({ length: 2048 }, (_, index) => ({
    text: `Object ${Math.imul(index + 1, 2654435761) >>> 0}`,
    type: null,
    noteCount: 1,
    mentionCount: 1,
  }));
  const details = Object.fromEntries(
    entities.map((entity, index) => [
      entity.text.toLowerCase(),
      {
        sources: [
          {
            noteTitle: notes[index % notes.length].title,
            section: 'Section 0',
            sectionPath: ['Section 0'],
          },
        ],
        sentences: [],
      },
    ])
  );
  return { notes, extraction: { entities, details }, candidates: [] };
}

function graphFixture(data) {
  let active;
  const react = Object.fromEntries(
    ['useMemo', 'useState', 'useRef', 'useEffect', 'useCallback'].map((name) => [
      name,
      (...args) => active.react[name](...args),
    ])
  );
  const translate = (key) => key;
  const useLanguage = () => ({
    lang: react.useCallback((key) => translate(key), [translate]),
    locale: 'synthetic-locale',
  });
  const boards = [];
  const notePages = () => ({ data: data.notes, isLoading: false });
  const boardPages = () => ({ data: boards, isLoading: false });
  const editor = { toRaw: (html) => html.replace(/<[^>]*>/g, ''), extractHtmlLinks: () => [] };
  const header = {
    parseHtmlToParagraphs: paragraphs,
    paragraphDescription: (items, path) =>
      items.find((item) => item.path === path)?.description || '',
    base64Decode: atob,
  };
  let baseBuilds = 0;
  let previousNodes;
  const result = { candidates: data.candidates, entityExtraction: data.extraction };
  const base = load('../useKnowledgeGraphData.ts', {
    react,
    '@blacktokki/core': { useLangContext: useLanguage },
    '@blacktokki/editor': editor,
    '../../components/HeaderSelectBar': header,
    '../../components/SearchBar': { urlToNoteLink: () => undefined },
    '../../hooks/useNoteStorage': { useNotePages: notePages },
    '../../hooks/useBoardStorage': { useBoardPages: boardPages },
    '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ colorScheme: 'light' }) },
    '../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    '../problem/useProblem': {
      __esModule: true,
      default: (_, options) => {
        assert.equal(options.enabled, false);
        return { data: [], isLoading: true };
      },
    },
  });
  const graph = load('search/useGraphSearch.ts', {
    react,
    '@blacktokki/core': { useLangContext: useLanguage },
    '../../../../hooks/useNoteStorage': { useNotePages: notePages },
    '../../../../hooks/useBoardStorage': { useBoardPages: boardPages },
    '../../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    '../../../../hooks/usePrivate': { isHiddenTitle: () => false },
    '../../../../hooks/useExtension': { useExtension: () => ({ data: { info: [] } }) },
    '../../../../components/SearchBar': { urlToNoteLink: () => undefined },
    '../../../inductiveTemplate/useInductiveTemplates': {
      useInductiveTemplatesData: () => ({ examples: {}, notebookRoots: boards }),
    },
    '../../../inductiveTemplate/discovery': {},
    '../../../inductiveTemplate/templateSimilarity': {},
    './preparation': {},
    './engine': {},
    './context': {},
    '../useRelationAnalysis': {},
    '../../useKnowledgeGraphData': {
      useKnowledgeGraphData: (options) => {
        const result = base.useKnowledgeGraphData(options);
        if (result.nodes !== previousNodes) baseBuilds++;
        previousNodes = result.nodes;
        return result;
      },
    },
    '../useRelationAnalysisSession': {
      useRelationAnalysisScope: () => ({
        scope: 'synthetic-search',
        available: true,
        privateMode: false,
      }),
      useRelationAnalysisSession: () => ({
        data: { available: true, notes: { data: data.notes } },
        analysis: { status: 'completed', result },
      }),
    },
  });
  const snapshot = load('search/snapshot.ts', {
    '@blacktokki/editor': editor,
    '../../../../components/HeaderSelectBar': header,
  });
  const engine = load('search/engine.ts', { './snapshot': snapshot });
  return {
    snapshot,
    engine,
    render: (harness) => {
      active = harness;
      return harness.render(() => graph.useSearchGraph(true));
    },
    builds: () => baseBuilds,
  };
}

test(
  'source projection, cached vectors, model and first query complete in five seconds',
  { timeout: 20000 },
  async (t) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete globalThis.crypto;
    });
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const data = sources();
    const fixture = graphFixture(data);
    const before = hookHarness();
    const baseline = fixture.render(before).input;
    const inputRevision = await fixture.snapshot.graphSearchInputRevision(baseline);
    const snapshot = await fixture.snapshot.createGraphSearchSnapshot(baseline);
    const documents = fixture.engine.graphSearchDocuments(snapshot);
    const { RELATION_MODELS } = load('search/models.ts');
    const { GRAPH_SEARCH_EMBEDDING_CHARS } = load('types.ts');
    const model = `${RELATION_MODELS.embedding}:mean:normalized:search-v1`;
    const vector = Array.from({ length: 384 }, (_, index) => (index + 1) / 384);
    const keys = documents.map((document) =>
      createHash('sha256')
        .update(JSON.stringify([model, document.text.slice(0, GRAPH_SEARCH_EMBEDDING_CHARS)]))
        .digest('hex')
    );
    const serialized = JSON.stringify({
      model,
      vectors: [...new Set(keys)].map((key) => [key, vector]),
      graph: {
        version: 1,
        revision: snapshot.revision,
        inputRevision,
        documentCount: keys.length,
        documents: keys,
      },
    });
    before.unmount();
    // Reload modules and clone all inputs so setup cannot warm the measured projection or identity.
    const measured = graphFixture(structuredClone(data));
    const first = hookHarness(),
      second = hookHarness();
    t.after(() => {
      first.unmount();
      second.unmount();
    });
    const cache = load('keywordRelationCache.ts');
    let reads = 0,
      models = 0,
      inferences = 0,
      identities = 0;
    cache.keywordRelationEntries.read = async () => {
      reads++;
      await delay(1400);
      return [serialized];
    };
    cache.keywordRelationEntries.write = async () =>
      assert.fail('healthy vectors must not be recomputed');
    const semantic = load('search/semantic.ts', {
      '../keywordRelationCache': cache,
      './models': {
        RELATION_MODELS,
        createRelationDiscoveryRuntime: () => {
          models++;
          return {
            embed: async () => {
              if (++inferences === 1) await delay(2300);
              return vector;
            },
            dispose: async () => {},
          };
        },
      },
      './snapshot': measured.snapshot,
    });
    const preparation = load('search/preparation.ts', {
      './snapshot': {
        ...measured.snapshot,
        graphSearchInputRevision: (input) => {
          identities++;
          return measured.snapshot.graphSearchInputRevision(input);
        },
      },
      './engine': measured.engine,
      './semantic': semantic,
    }).acquireGraphSearchPreparation(baseline.scope);
    t.after(() => preparation.dispose());
    const { prepareGraphSearchEmbeddings } = load(
      'components/RelationAnalysisBackground.tsx',
      {
        react: {},
        '@blacktokki/core': {},
        '../../../../hooks/useUsageMode': {},
        '../keywordRelationCache': { graphSearchCache: cache.graphSearchCache },
        '../search/preparation': {},
        '../search/semantic': semantic,
        '../search/useGraphSearch': {},
        '../useRelationAnalysis': {},
        '../useRelationAnalysisSession': {},
      },
      ['prepareGraphSearchEmbeddings']
    );
    const started = performance.now();
    const warming = preparation.warmup('Generated source');
    warming.catch(() => undefined);
    const reading = preparation.cache(cache.graphSearchCache).read(baseline.scope, 'vectors');
    const input = measured.render(first).input;
    const observerInput = measured.render(second).input;
    assert.ok(
      observerInput === input,
      'concurrent consumers must share the whole source projection'
    );
    assert.equal(measured.builds(), 1);
    const projectedMs = performance.now() - started;
    const [completed, revision] = await Promise.all([
      prepareGraphSearchEmbeddings(input, preparation, new AbortController().signal, () =>
        assert.fail('complete vectors must not replay analysis progress')
      ),
      preparation.revision(observerInput),
    ]);
    assert.equal(revision, inputRevision);
    assert.equal(completed.total, new Set(keys).size);
    await Promise.all([warming, reading]);
    const readyMs = performance.now() - started;
    const index = await preparation.index(input, revision);
    const restored = await preparation.vectors({
      revision: index.snapshot.revision,
      inputRevision: revision,
      documents: index.documents,
      cache: cache.graphSearchCache,
    });
    assert.equal(restored.total, new Set(keys).size);
    const scores = await preparation.scores('Generated query', restored.byDocument);
    const elapsedMs = performance.now() - started;
    assert.equal(scores.size, documents.length);
    assert.equal(reads, 1);
    assert.equal(models, 1);
    assert.equal(inferences, 2, 'only model warmup and query inference may run');
    assert.equal(identities, 1);
    assert.ok(elapsedMs < 5000, `source-to-first-query exceeded five seconds: ${elapsedMs} ms`);
    t.diagnostic(
      JSON.stringify({
        notes: data.notes.length,
        nodes: input.graph.nodes.length,
        edges: input.graph.edges.length,
        documents: documents.length,
        bytes: serialized.length,
        projectedMs: Math.round(projectedMs),
        readyMs: Math.round(readyMs),
        firstQueryMs: Math.round(elapsedMs),
      })
    );
  }
);
