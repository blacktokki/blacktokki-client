const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../../__tests__/loadTs.cjs');
const { hookHarness, elements } = require('../../__tests__/hookHarness.cjs');
const noop = () => {};
const lang = (key) => key;
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

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
    embeddingStatuses: [],
    embeddingState: new Map(),
    keywordReady: true,
    keywordResult: { candidates: [] },
    revision: 'revision',
    snapshots: [],
    searches: [],
    holdSnapshot: false,
    holdSearch: false,
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
    '../../useKnowledgeGraphData': { useKnowledgeGraphData: () => state.base },
    '../graph': { addKeywordRelationGraph: (graph) => graph },
    '../useRelationAnalysisNotes': {
      useRelationAnalysisScope: (requested) => ({
        scope: state.scope,
        available: requested && state.available,
        privateMode: false,
      }),
    },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({
        data: { available: state.keywordReady, notes: { data: state.notes, refetch: noop } },
        analysis: {
          status: state.keywordReady ? 'completed' : 'idle',
          result: state.keywordReady ? state.keywordResult : undefined,
        },
      }),
    },
    '../../../../components/SearchBar': { urlToNoteLink: noop },
    './snapshot': { createGraphSearchSnapshot: snapshot },
    './cache': { graphSearchCache: { read: async () => undefined, write: async () => {} } },
    './embeddingStatus': {
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
        return state.holdSearch ? task.promise : { scope: index.snapshot.scope, query };
      },
    },
    './semantic': {
      ensureGraphSearchVectors: async () => {
        state.semanticCalls++;
        if (state.semanticFails) throw new Error('unavailable');
        return { byDocument: new Map() };
      },
      graphSemanticScores: async () => new Map(),
    },
  });
  let query = 'Alpha';
  const render = () => harness.render(() => hook.useGraphSearch(query, 2));
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
  };
}

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

test('SearchFeature collects all enabled sections without selecting or routing a provider', () => {
  const config = { data: [] };
  const { features, useExtension } = load('../../../hooks/useExtension.ts', {
    react: { useMemo: (fn) => fn() },
    '@blacktokki/account': { useAuthContext: () => ({ auth: { isLocal: true, user: { id: 1 } } }) },
    '@react-native-async-storage/async-storage': {},
    '@react-navigation/native': {},
    'react-query': { useQuery: () => config },
    './useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE', notebook: { id: 1 } }) },
  });
  for (const key of ['text', 'graph'])
    features[key] = {
      title: key,
      elements: [],
      NoteSections: [],
      NotePageSections: [],
      search: { Section: key },
    };
  for (const order of [
    ['text', 'graph'],
    ['graph', 'text'],
  ]) {
    config.data = order;
    assert.deepEqual(
      useExtension().data.feature.search,
      Object.fromEntries(order.map((key) => [key, { Section: key }]))
    );
  }
  config.data = ['text'];
  assert.deepEqual(Object.keys(useExtension().data.feature.search), ['text']);
  config.data = [];
  assert.deepEqual(useExtension().data.feature.search, {});
});

test('UI context links to sources and graph details while RAW keeps the evidence text', () => {
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
  const target = { id: 'note:2', name: 'Other', kind: 'note', typeLabel: 'Note', sourceIds: [] };
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
    paths: [{ nodes: [node.id, target.id], edges: [edge.id], disputed: false }],
    sources: [source],
    context: {
      text: '[Edge] Note references Other [S1]\n[Node] ["Note","Note"] [S1]\n[Path] Note → Other',
      citations: [source],
      entries: [
        { kind: 'edge', id: edge.id, citationIds: [source.id] },
        { kind: 'node', id: node.id, citationIds: [source.id] },
        { kind: 'path', index: 0, citationIds: [] },
      ],
      truncated: false,
    },
    limited: false,
  };
  const searchState = {
    result,
    snapshot: {
      nodes: [node, target],
      edges: [edge],
      sources: [source],
      coverage: { keywords: true, templates: true },
    },
  };
  const { GraphSearchSection } = load('search/GraphSearchSection.tsx', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang }) },
    '@react-navigation/native': {
      useNavigation: () => ({ push: (...args) => routes.push(args) }),
      useRoute: () => ({ params: { query: 'Note' } }),
      useIsFocused: () => true,
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
      useGraphSearch: () => searchState,
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
      ResponsiveSearchBar: 'Search',
      toNoteParams: (title, paragraph, section) => ({ title, paragraph, section }),
    },
    '../../components/KnowledgeGraphNavToolbar': { KnowledgeGraphNavToolbar: 'Nav' },
    '../components/AnalysisAction': { AnalysisAction: 'Action' },
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
  assert.ok(tree.some((item) => item.type === 'AnalysisProgress'));
  const tab = (label) =>
    tree.find(
      (item) =>
        item.type === 'Pressable' &&
        item.props.accessibilityRole === 'tab' &&
        item.props.accessibilityLabel === label
    );
  assert.ok(tab('UI'));
  assert.ok(tab('RAW'));
  assert.equal(tree.filter((item) => item.props.accessibilityRole === 'tab').length, 2);
  assert.ok(
    tree.some((item) => item.type === 'Text' && item.props.children.includes('Relationships'))
  );
  assert.ok(
    tree.some((item) => item.type === 'Text' && item.props.children.includes('Search paths'))
  );
  tree
    .find(
      (item) => item.type === 'Pressable' && item.props.accessibilityLabel === 'View in graph: Note'
    )
    .props.onPress();
  tree
    .find((item) => item.type === 'Pressable' && item.props.accessibilityRole === 'link')
    .props.onPress();
  assert.deepEqual(routes, [
    ['KnowledgeGraph', { nodeId: 'note:1' }],
    ['NotePage', { title: 'Note', paragraph: 'Detail', section: 'Parent' }],
  ]);
  tab('RAW').props.onPress();
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.ok(
    tree.some((item) => item.type === 'Text' && item.props.children.includes(result.context.text))
  );
  searchState.result = undefined;
  searchState.loading = true;
  searchState.progress = { phase: 'embedding', processed: 1, total: 2 };
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.ok(tree.some((item) => item.type === 'AnalysisProgress'));
  assert.equal(
    tree.some((item) => item.type === 'Spinner'),
    false
  );
  assert.equal(
    tree.some(
      (item) => item.type === 'Text' && item.props.children.includes('Preparing embeddings')
    ),
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
  assert.equal(
    tree.some((item) => item.type === 'Spinner'),
    false
  );
  assert.equal(
    tree.some(
      (item) => item.type === 'Text' && item.props.children.includes('Preparing search index')
    ),
    false
  );
  searchState.ready = false;
  tree = elements(harness.render(() => GraphSearchSection({ query: 'Note' })));
  assert.ok(tree.some((item) => item.type === 'AnalysisProgress'));
  assert.equal(
    tree.some((item) => item.type === 'Spinner'),
    false
  );
});

test('final graph and query embedding status do not overwrite each other', () => {
  const { publishSearchEmbeddingStatus, useSearchEmbeddingStatus } = load(
    'search/embeddingStatus.ts',
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
  publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 });
  assert.equal(useSearchEmbeddingStatus(scope).phase, 'idle');
});

test('global search opens the shared screen and stores only the query', () => {
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
      useNavigation: () => ({ push: (...args) => routes.push(args) }),
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
  harness.unmount();
});

test('opening a hidden paragraph from graph search reveals it and selects it once', () => {
  const harness = hookHarness(),
    selected = [];
  const paragraph = {
    id: 'p',
    name: 'Detail',
    noteTitle: 'Note',
    role: 'INSTANCE',
    instanceKind: 'PARAGRAPH',
  };
  const { KnowledgeGraphView } = load('../components/KnowledgeGraphView.tsx', {
    react: harness.react,
    '@blacktokki/core': { Text: 'Text', useLangContext: () => ({ lang }) },
    'react-native': {
      Platform: { OS: 'web' },
      View: 'View',
      ScrollView: 'Scroll',
      TouchableOpacity: 'Touchable',
      StyleSheet: { create: (s) => s },
    },
    'react-native-vector-icons/FontAwesome': 'Icon',
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({
        commonStyles: { text: {}, smallText: {}, container: {} },
        colorScheme: 'light',
      }),
    },
    '../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    './KnowledgeGraphCanvasView': { KnowledgeGraphCanvasView: 'Canvas' },
    './KnowledgeGraphSearch': { KnowledgeGraphSearch: 'Search' },
  });
  const props = {
    nodes: [paragraph],
    edges: [],
    axioms: { violations: [] },
    selectedNode: null,
    requestedNodeId: 'p',
    onSelectNode: (node) => selected.push(node),
    focusedNodeIds: null,
    selectionTrigger: 0,
    reservedBottomHeight: 0,
    focusDepth: 1,
  };
  const render = () => elements(harness.render(() => KnowledgeGraphView(props)));
  render();
  const tree = render();
  assert.equal(selected.length, 1);
  assert.equal(selected[0], paragraph);
  assert.ok(tree.find((n) => n.type === 'Canvas').props.nodes.includes(paragraph));
  render();
  assert.equal(selected.length, 1);
  harness.unmount();
});

test('the shared search screen lazily mounts enabled sections and retains visited tabs', () => {
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
      StyleSheet: { create: (s) => s },
    },
    '../../components/LoadingView': 'Loading',
    '../../components/SearchBar': { ResponsiveSearchBar: 'SearchBar' },
    '../../hooks/useExtension': { useExtension: () => config },
    '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
  });
  const render = () => elements(harness.render(SearchScreen));
  let tree = render();
  assert.equal(tree.filter((n) => n.type === 'TextSection').length, 1);
  assert.equal(tree.filter((n) => n.type === 'GraphSection').length, 0);
  tree.find((n) => n.props.accessibilityLabel === 'Knowledge Graph').props.onPress();
  tree = render();
  assert.equal(tree.filter((n) => n.type === 'TextSection').length, 1);
  assert.equal(tree.filter((n) => n.type === 'GraphSection').length, 1);
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

test('the former full-text screen is a section receiving its query from the shared screen', () => {
  const harness = hookHarness(),
    routes = [],
    queries = [];
  const { SearchPageSection } = load('../../search/SearchPageSection.tsx', {
    react: harness.react,
    '@blacktokki/editor': { toHtml: lang, toRaw: lang },
    '@react-navigation/native': { useNavigation: () => ({ push: (...args) => routes.push(args) }) },
    './useSearch': {
      useSearch: (query) => {
        queries.push(query);
        return {
          data: { pages: [[{ title: 'Note', paragraph: 'Part', description: 'body' }]] },
          fetchNextPage: noop,
        };
      },
    },
    '../../components/SearchBar': { onLink: noop },
    '../../screens/main/NoteListSection': { NoteListSection: 'NoteList' },
  });
  const tree = harness.render(() => SearchPageSection({ query: 'Alpha' }));
  assert.deepEqual(queries, ['Alpha']);
  assert.equal(tree.type, 'NoteList');
  tree.props.onPress('Note', 'Part');
  assert.deepEqual(routes, [['NotePage', { title: 'Note', paragraph: 'Part' }]]);
  harness.unmount();
});
