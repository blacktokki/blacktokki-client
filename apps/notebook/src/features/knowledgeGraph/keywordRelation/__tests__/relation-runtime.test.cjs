const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { hookHarness } = require('./hookHarness.cjs');
const loadTs = require('./loadTs.cjs');
const summary = loadTs('relationSummary.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
});
const types = loadTs('types.ts');
const settled = () => new Promise((resolve) => setImmediate(resolve));

function runtime() {
  const calls = [];
  const cleared = [];
  const sources = { scope: 'local:7:normal', notes: [{ title: 'One', description: 'Body' }] };
  let enabled = false;
  let host;
  const observer = hookHarness();
  const store = loadTs('useRelationAnalysisSession.ts', {
    react: { ...observer.react, useSyncExternalStore: (_, snapshot) => snapshot() },
    './types': types,
    './useRelationAnalysisNotes': {
      useRelationAnalysisScope: (requested) => ({
        scope: sources.scope,
        available: enabled && requested,
      }),
    },
  });
  const { useRelationAnalysisSession } = store;
  const consume = (requested = true) =>
    observer.render(() => useRelationAnalysisSession(requested));
  const mount = () => {
    const harness = hookHarness();
    const controller = loadTs('useRelationAnalysis.ts', {
      react: harness.react,
      './types': types,
      './relationSummary': summary,
      './relationAnalysis': {
        clearRelationAnalysisMemory: (scope) => cleared.push(scope),
        runInductiveRelationAnalysis: (notes, options) =>
          new Promise((resolve, reject) => calls.push({ notes, options, resolve, reject })),
      },
    });
    const background = loadTs('components/RelationAnalysisBackground.tsx', {
      react: harness.react,
      '../search/GraphSearchEmbeddingBackground': {
        GraphSearchEmbeddingBackground: 'EmbeddingBackground',
      },
      '../useRelationAnalysisSession': store,
      '../useRelationAnalysis': controller,
      '../useRelationAnalysisNotes': {
        useRelationAnalysisNotes: () => ({
          scope: sources.scope,
          available: true,
          notes: { data: sources.notes, isError: false, isFetching: false, refetch: () => {} },
        }),
      },
    });
    return {
      render: () => {
        const tree = harness.render(background.RelationAnalysisBackground);
        assert.equal(tree.type, 'EmbeddingBackground');
        return null;
      },
      unmount: harness.unmount,
    };
  };
  return {
    sources,
    calls,
    cleared,
    consume,
    store,
    render: (active = true) => {
      enabled = active;
      if (active) {
        host ||= mount();
        assert.equal(host.render(), null);
      } else {
        host?.unmount();
        host = undefined;
      }
      return consume();
    },
    unmount: () => {
      enabled = false;
      host?.unmount();
      host = undefined;
    },
  };
}

const prepared = () => ({
  noteCount: 1,
  entityCount: 0,
  observationCount: 0,
  candidates: [],
  warnings: [],
  inputPatterns: [],
  entityExtraction: { status: 'completed', entities: [], details: {}, noteCount: 1 },
});

test('the background slot prepares once before any screen is mounted and observers share its progress without starting jobs', async (t) => {
  t.mock.method(console, 'log', () => {});
  const session = runtime();
  session.render(false);
  assert.equal(session.calls.length, 0);
  session.render(true);
  assert.equal(session.calls.length, 1);
  const call = session.calls[0];
  assert.equal(call.options.prepareOnly, true);
  assert.equal(call.options.restoreUnchanged, true);
  call.options.onEntityProgress({ completedNotes: 3, noteCount: 10, elapsedMs: 20 });
  let current = session.render();
  assert.equal(current.analysis.processed, 3);
  assert.equal(current.analysis.total, 10);
  assert.equal(session.consume(), current);
  assert.equal(session.consume().analysis, current.analysis);
  for (const requested of [true, false, true, false]) {
    session.consume(requested);
    current = session.render();
    assert.equal(session.calls.length, 1);
    assert.equal(call.options.signal.aborted, false);
  }
  call.resolve(prepared());
  await settled();
  current = session.render();
  assert.equal(current.analysis.status, 'ready');
  assert.equal(session.calls.length, 1);
  assert.equal(
    session.consume(),
    current,
    'a late observer immediately sees completed preparation'
  );
  current.analysis.start();
  assert.equal(session.calls[1].options.prepareOnly, false);
  session.unmount();
});

test('validation survives graph navigation, result-screen unmount and re-entry with live progress', async (t) => {
  t.mock.method(console, 'log', () => {});
  const session = runtime();
  session.render();
  session.calls[0].resolve(prepared());
  await settled();
  session.render();
  const navigation = { focused: true };
  const mountScreen = () => {
    const harness = hookHarness();
    const { RelationAnalysisScreen } = loadTs('screens/RelationAnalysisScreens.tsx', {
      react: harness.react,
      '@blacktokki/core': { useLangContext: () => ({ lang: (key) => key }) },
      '@react-navigation/native': { useIsFocused: () => navigation.focused },
      '../../../../hooks/useExtension': {
        useEffectExtensionScreen: () => ({ isActive: true, isReady: true }),
      },
      '../../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
      '../../../../components/LoadingView': 'Loading',
      '../../../../components/SearchBar': { ResponsiveSearchBar: 'Search' },
      '../../components/KnowledgeGraphNavToolbar': { KnowledgeGraphNavToolbar: 'Toolbar' },
      '../components/AnalysisAction': { AnalysisAction: 'Action' },
      './AnalysisProgressSection': { AnalysisProgressSection: 'Progress' },
      './RelationResultsSection': { RelationResultsSection: 'Results' },
      '../useRelationAnalysisSession': { useRelationAnalysisSession: session.consume },
      '../search/embeddingStatus': {
        useSearchEmbeddingStatus: () => ({ phase: 'idle', processed: 0, total: 0 }),
      },
      '../styles': { relationAnalysisStyles: {} },
      'react-native-paper': { ProgressBar: 'ProgressBar' },
      'react-native': { View: 'View', StyleSheet: { flatten: (style) => style } },
    });
    return { render: () => harness.render(RelationAnalysisScreen), unmount: harness.unmount };
  };
  const screen = mountScreen();
  screen.render();
  session.consume().analysis.start();
  session.render();
  const call = session.calls[1];
  for (const focused of [false, true, false]) {
    navigation.focused = focused;
    screen.render();
    call.options.onInferenceProgress({
      model: 'nli',
      phase: 'validation',
      processed: 2,
      total: 8,
      modelChecks: 2,
      modelFailures: 0,
      elapsedMs: 100,
    });
    const current = session.render();
    assert.equal(call.options.signal.aborted, false);
    assert.equal(current.analysis.status, 'running');
    assert.equal(current.analysis.processed, 2);
    assert.equal(session.calls.length, 2);
  }
  screen.unmount();
  assert.equal(call.options.signal.aborted, false);
  call.options.onInferenceProgress({
    model: 'nli',
    phase: 'validation',
    processed: 6,
    total: 8,
    modelChecks: 6,
    modelFailures: 0,
    elapsedMs: 200,
  });
  session.render();
  navigation.focused = true;
  const returned = mountScreen();
  returned.render();
  assert.equal(session.consume().analysis.processed, 6);
  assert.equal(session.calls.length, 2);
  const result = { ...prepared(), validationProgress: { status: 'completed' } };
  call.resolve(result);
  await settled();
  const completed = session.render();
  returned.render();
  assert.equal(completed.analysis.status, 'completed');
  assert.equal(completed.analysis.result, result);
  returned.unmount();
  session.unmount();
});

test('slot unmount and scope changes cancel old jobs, clear shared snapshots and suppress late callbacks', async (t) => {
  t.mock.method(console, 'log', () => {});
  const session = runtime();
  session.render();
  const old = session.calls[0];
  old.options.onEntities({ entities: [{ text: 'Private keyword' }] });
  assert.equal(session.render().analysis.entities.entities[0].text, 'Private keyword');
  assert.equal(session.consume(false).analysis.entities, undefined);
  const disabled = session.render(false);
  assert.equal(old.options.signal.aborted, true);
  assert.equal(disabled.analysis.entities, undefined);
  assert.equal(disabled.analysis.status, 'idle');
  assert.equal(session.store.readRelationAnalysisSession(session.sources.scope), undefined);
  old.resolve(prepared());
  await settled();
  assert.equal(session.consume().analysis.entities, undefined);
  session.render(true);
  const other = session.calls[1];
  other.options.onEntities({ entities: [{ text: 'Old scope' }] });
  session.sources.scope = 'user:4:8:normal';
  session.sources.notes = [{ title: 'Other account', description: 'Different source' }];
  assert.equal(
    session.consume().analysis.entities,
    undefined,
    'scope changes hide old data before effects run'
  );
  const changed = session.render();
  assert.equal(other.options.signal.aborted, true);
  assert.equal(changed.analysis.entities, undefined);
  assert.equal(session.store.readRelationAnalysisSession('local:7:normal'), undefined);
  assert.equal(session.calls[2].options.scope, 'user:4:8:normal');
  assert.ok(session.cleared.includes('local:7:normal'));
  session.unmount();
  assert.equal(session.calls[2].options.signal.aborted, true);
});

test('shared-store notifications remove snapshots on cleanup and an old owner cannot clear its replacement', () => {
  const store = loadTs('useRelationAnalysisSession.ts', {
    './useRelationAnalysisNotes': {},
  });
  const first = {},
    second = {};
  const seen = [];
  const unsubscribe = store.subscribeRelationAnalysisSession(() =>
    seen.push(store.readRelationAnalysisSession('scope'))
  );
  store.publishRelationAnalysisSession('scope', first, { id: 'first' });
  store.publishRelationAnalysisSession('scope', second, { id: 'second' });
  store.clearRelationAnalysisSession('scope', first);
  assert.equal(store.readRelationAnalysisSession('scope').id, 'second');
  store.clearRelationAnalysisSession('scope', second);
  assert.deepEqual(seen, [{ id: 'first' }, { id: 'second' }, undefined]);
  unsubscribe();
  store.publishRelationAnalysisSession('scope', first, { id: 'later' });
  assert.equal(seen.length, 3);
  store.clearRelationAnalysisSession('scope', first);
});

test('useExtension supplies background elements only for enabled features and supported usage modes', () => {
  const harness = hookHarness();
  let config = ['analysis'];
  let usageMode = 'NOTEBOOK';
  const extension = loadTs('../../../hooks/useExtension.ts', {
    react: harness.react,
    '@blacktokki/account': { useAuthContext: () => ({ auth: { isLocal: true, user: null } }) },
    '@blacktokki/navigation': {},
    '@react-native-async-storage/async-storage': {},
    '@react-navigation/native': {},
    'react-query': { useQuery: () => ({ data: config }) },
    './useUsageMode': { useUsageMode: () => ({ usageMode, notebook: { id: 7 } }) },
  });
  extension.features.analysis = {
    title: 'Analysis',
    description: '',
    useNoteMode: true,
    screens: {},
    NoteSections: [],
    NotePageSections: [],
    elements: [
      { type: 'background', Component: 'Background' },
      { type: 'button', Component: 'Button' },
    ],
  };
  const render = () => harness.render(extension.useExtension).data;
  assert.deepEqual(render().feature.elements('background'), ['Background']);
  assert.deepEqual(render().feature.elements('button'), ['Button']);
  config = [];
  assert.deepEqual(render().feature.elements('background'), []);
  config = ['analysis'];
  usageMode = 'SIMPLE';
  assert.deepEqual(render().feature.elements('background'), []);
  usageMode = 'NOTE';
  extension.features.analysis.useNoteMode = false;
  assert.deepEqual(render().feature.elements('background'), []);
});

test('the navigator mounts the generic background slot used by the unified graph extension', () => {
  const source = readFileSync(path.resolve(__dirname, '../../../../navigation/index.tsx'), 'utf8');
  assert.match(source, /extension\.feature\.elements\('background'\)/);
  assert.doesNotMatch(source, /RelationAnalysis|relationAnalysis/);
  const registry = readFileSync(path.resolve(__dirname, '../../../index.tsx'), 'utf8');
  assert.match(registry, /type: 'background',\s*Component: <RelationAnalysisBackground/);
});
