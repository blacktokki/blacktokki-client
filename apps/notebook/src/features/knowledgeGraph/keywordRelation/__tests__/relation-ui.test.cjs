const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { hookHarness, elements } = require('./hookHarness.cjs');
const loadTs = require('./loadTs.cjs');
const { resultFixture } = require('./resultFixtures.cjs');
const resultIndex = loadTs('relationResults.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
});
const presentation = loadTs('relationPresentation.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
});
const filters = loadTs('relationFilters.ts');
const sourceTypes = filters;
const entityTypes = filters;
const relationStatus = loadTs('relationStatus.ts');

function ui(relativePath, dependencies = {}) {
  const harness = hookHarness();
  const components = new Map();
  const localNames = {
    RelationDetail: 'RelationDetail',
    KeywordSourceNoteCard: 'SourceNoteCard',
    AnalysisSentenceText: 'SentenceText',
    AnalysisVerdictBadge: 'VerdictBadge',
  };
  const tabSections = new Map();
  const tabDependencies = {};
  if (relativePath === 'screens/RelationResultsSection.tsx') {
    for (const name of ['EntityKeywordsSection', 'RelationListSection']) {
      const section = ui(`screens/${name}.tsx`);
      const component = section.module[name];
      tabSections.set(component, (props) => section.render(() => component(props)));
      tabDependencies[`./${name}`] = { [name]: component };
    }
  }
  const routes = [];
  const navigationMethods = [];
  const styles = { text: {}, smallText: {}, placeholder: {}, button: {}, buttonText: {} };
  const baseDependencies = {
    react: {
      ...harness.react,
      createElement: (type, props, ...children) => {
        if (tabSections.has(type)) return tabSections.get(type)({ ...props, children });
        if (typeof type === 'function' && localNames[type.name]) {
          components.set(type.name, type);
          return harness.react.createElement(localNames[type.name], props, ...children);
        }
        return harness.react.createElement(type, props, ...children);
      },
    },
    '@blacktokki/core': { useLangContext: () => ({ lang: (value) => value }) },
    '@blacktokki/navigation': {
      navigate: (...args) => {
        routes.push(args);
        navigationMethods.push('navigate');
      },
      push: (...args) => {
        routes.push(args);
        navigationMethods.push('push');
      },
    },
    'react-native': { Text: 'Text', View: 'View', TextInput: 'Input', Pressable: 'Pressable' },
    'react-native-paper': {
      Button: 'Button',
      IconButton: 'IconButton',
      Icon: 'Icon',
      Chip: 'Chip',
      ProgressBar: 'Progress',
      List: { Item: 'ListItem', Icon: 'ListIcon' },
    },
    '../../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: styles }) },
    '../styles': { relationAnalysisStyles: {} },
  };
  const action = loadTs('components/AnalysisAction.tsx', baseDependencies);
  tabSections.set(action.AnalysisAction, (props) => action.AnalysisAction(props));
  const pagination = loadTs('components/AnalysisPagination.tsx', {
    ...baseDependencies,
    './AnalysisAction': action,
  });
  const filter = loadTs('components/AnalysisFilter.tsx', {
    ...baseDependencies,
    '../relationFilters': filters,
  });
  tabSections.set(filter.AnalysisFilter, (props) =>
    harness.react.createElement('Filter', props, filter.AnalysisFilter(props))
  );
  const componentDependencies = {
    ...baseDependencies,
    '../relationPresentation': presentation,
    '../relationResults': resultIndex,
    '../relationFilters': filters,
    '../relationStatus': relationStatus,
    '../search/embeddingStatus': {
      useSearchEmbeddingStatus: () => ({ phase: 'idle', processed: 0, total: 0 }),
    },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({
        analysis: {
          status: 'ready',
          prepareOnly: true,
          phase: 'validation',
          processed: 0,
          total: 1,
        },
      }),
    },
    './AnalysisAction': action,
    '../components/AnalysisAction': action,
    './AnalysisPagination': pagination,
    './AnalysisNameLink': { AnalysisNameLink: 'NameLink' },
    './AnalysisDetailField': { AnalysisDetailField: 'DetailField' },
    './AnalysisSectionLink': { AnalysisSectionLink: 'SectionLink' },
    './AnalysisFilter': filter,
    './EntityDetailSection': { EntityDetailSection: 'EntityDetail' },
    './EntityProvenanceSection': { EntityProvenanceSection: 'Provenance' },
    './EntityRelationshipGroup': { EntityRelationshipGroup: 'RelationshipGroup' },
    './RelationEvidenceSection': {
      RelationEvidenceSection: 'Evidence',
    },
    ...dependencies,
  };
  const module = loadTs(relativePath, {
    ...componentDependencies,
    ...Object.fromEntries(
      Object.entries(componentDependencies)
        .filter(([request]) => request.startsWith('./'))
        .map(([request, value]) => [request.replace('./', '../components/'), value])
    ),
    ...tabDependencies,
  });
  return { module, routes, navigationMethods, components, render: harness.render };
}

function entityEvidenceProps({ relationship, sentence, ...props }) {
  const group = ui('components/EntityRelationshipGroup.tsx');
  return elements(
    group.render(() =>
      group.module.EntityRelationshipGroup({
        ...props,
        name: relationship.name,
        rows: [{ relationship, sentence }],
      })
    )
  ).find((node) => node.type === 'Evidence').props;
}

test('all source-note links push a new screen on every visit', () => {
  const fixture = resultFixture();
  const index = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const relationship = index.entities.get('orama').relationships.get('uses-storage');
  const relation = index.relations.get('uses-storage');
  const cases = [
    ['KeywordSourceNoteCard', { noteTitle: 'Folder/One', sources: [] }],
    [
      'EntityRelationshipGroup',
      {
        relationship,
        sentence: relationship.sentences[0],
        entityKey: 'orama',
        entities: index.entities,
        onSelectEntity: () => {},
      },
    ],
    [
      'RelationEvidenceSection',
      {
        template: relation.candidate.template,
        observation: relation.evidence[0].observation,
        validation: relation.evidence[0].validation,
        entities: index.entities,
        onSelectEntity: () => {},
      },
    ],
  ];
  for (const [name, props] of cases) {
    const component = name === 'EntityRelationshipGroup' ? 'RelationEvidenceSection' : name;
    const cardProps = name === 'EntityRelationshipGroup' ? entityEvidenceProps(props) : props;
    const screen = ui(
      `components/${
        component === 'KeywordSourceNoteCard' ? 'EntityProvenanceSection' : component
      }.tsx`
    );
    const render = () => elements(screen.render(() => screen.module[component](cardProps)));
    if (component === 'RelationEvidenceSection')
      render()
        .find((node) => node.props.accessibilityLabel === 'Preview')
        .props.onPress();
    for (let visit = 0; visit < 2; visit++)
      render()
        .find((node) => node.type === 'NameLink' && node.props.name === 'Folder/One')
        .props.onPress();
    assert.deepEqual(screen.navigationMethods, ['push', 'push'], name);
    assert.deepEqual(screen.routes, Array(2).fill(['NotePage', { title: 'Folder/One' }]), name);
  }
});

function graphEntry() {
  return ui('../components/KnowledgeGraphButton.tsx', {
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: { smallText: {} } }),
    },
    '../../../screens/main/home/ContentGroupSection': { CountBadge: 'CountBadge' },
    '../useKnowledgeGraphData': { useKnowledgeGraphData: () => ({ axioms: { violations: [] } }) },
    'react-native-vector-icons/MaterialCommunityIcons': 'Icon',
    'react-native': {
      Text: 'Text',
      View: 'View',
      StyleSheet: { create: (value) => value },
    },
  });
}

test('the unified entry opens the graph while both screens and preparation belong to one extension', () => {
  const screen = graphEntry();
  const button = screen.render(() => screen.module.default());
  assert.equal(button.props.title, 'Knowledge Graph');
  button.props.onPress();
  assert.deepEqual(screen.routes, [['KnowledgeGraph']]);
  const registry = readFileSync(path.resolve(__dirname, '../../../index.tsx'), 'utf8');
  const graphFeature = registry.slice(
    registry.indexOf("features['knowledgeGraph']"),
    registry.indexOf("features['inductiveTemplate']")
  );
  assert.match(graphFeature, /component: KnowledgeGraphScreen/);
  assert.match(graphFeature, /component: RelationAnalysisScreen/);
  assert.match(graphFeature, /type: 'background',\s*Component: <RelationAnalysisBackground/);
  assert.equal((graphFeature.match(/type: 'button'/g) || []).length, 1);
  assert.doesNotMatch(registry, /features\['relationAnalysis'\]|RelationAnalysisButton/);
  const home = readFileSync(
    path.resolve(__dirname, '../../../../screens/main/home/HomeScreen.tsx'),
    'utf8'
  );
  assert.doesNotMatch(home, /[Rr]elationAnalysis|runInductiveRelationAnalysis/);
});

test('the graph entry keeps its validation badge without relationship progress', () => {
  const screen = graphEntry();
  const button = screen.render(() => screen.module.default());
  assert.equal(button.props.description, undefined);
  assert.equal(button.props.accessibilityState, undefined);
  assert.equal(button.props.right().type, 'CountBadge');
});

test('the graph and relationship toolbar navigates between existing screens and preserves usage access', () => {
  const calls = [];
  const screen = ui('../components/KnowledgeGraphNavToolbar.tsx', {
    '@blacktokki/core': { Text: 'Text', useLangContext: () => ({ lang: (value) => value }) },
    '@react-navigation/native': {
      useNavigation: () => ({
        navigate: (...args) => calls.push(['navigate', ...args]),
        push: (...args) => calls.push(['push', ...args]),
      }),
    },
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: { container: {}, text: {} } }),
    },
    'react-native-vector-icons/MaterialCommunityIcons': 'Icon',
    'react-native': {
      View: 'View',
      TouchableOpacity: 'Touchable',
      StyleSheet: { create: (value) => value },
    },
  });
  const buttons = (view) =>
    elements(screen.render(() => screen.module.KnowledgeGraphNavToolbar({ view }))).filter(
      (node) => node.type === 'Touchable'
    );
  buttons('graph')[0].props.onPress();
  buttons('relations')[0].props.onPress();
  assert.deepEqual(calls, [
    ['navigate', 'RelationAnalysis'],
    ['navigate', 'KnowledgeGraph'],
  ]);
  assert.equal(buttons('graph').length, 2);
  assert.equal(buttons('relations').length, 2);
  assert.ok(
    elements(buttons('graph')[0]).some(
      (node) =>
        node.type === 'Text' && node.props.children.join('') === 'Keywords and Relationships'
    )
  );
  buttons('graph')[1].props.onPress();
  assert.deepEqual(calls.at(-1), [
    'push',
    'NoteViewer',
    { key: 'Usage', paragraph: '🕸️ Knowledge Graph' },
  ]);
  buttons('relations')[1].props.onPress();
  assert.deepEqual(calls.at(-1), [
    'push',
    'NoteViewer',
    { key: 'Usage', paragraph: '🏷️ Keywords and Relationships' },
  ]);
  for (let index = 0; index < 2; index++)
    assert.equal(buttons('graph')[index].props.style, buttons('relations')[index].props.style);
});

test('the result screen preserves its workspace across focus changes and only refreshes sources on entry', () => {
  const state = { active: false, ready: true, focused: true, scope: 'local:1:normal' };
  const reads = [];
  const analysis = resultFixture();
  const refetch = () => reads.push(state.scope);
  const screen = ui('screens/RelationAnalysisScreens.tsx', {
    '../../../../hooks/useExtension': {
      useEffectExtensionScreen: (key) => {
        assert.equal(key, 'knowledgeGraph');
        return { isReady: state.ready, isActive: state.active };
      },
    },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    '../../../../components/LoadingView': 'Loading',
    '../../../../components/SearchBar': { ResponsiveSearchBar: 'SearchBar' },
    '../useRelationAnalysisSession': {
      useRelationAnalysisSession: () => ({
        data: {
          scope: state.scope,
          available: state.active,
          notes: { data: [], isError: false, isFetching: false, refetch },
        },
        analysis,
      }),
    },
    '../search/embeddingStatus': {
      useSearchEmbeddingStatus: () => ({ phase: 'idle', processed: 0, total: 0 }),
    },
    'react-native-paper': { ProgressBar: 'ProgressBar' },
    'react-native': {
      Text: 'Text',
      View: 'View',
      ScrollView: 'ScrollView',
      StyleSheet: { flatten: (value) => value },
    },
    './AnalysisProgressSection': { AnalysisProgressSection: 'Progress' },
    './RelationResultsSection': { RelationResultsSection: 'Results' },
    '../../components/KnowledgeGraphNavToolbar': { KnowledgeGraphNavToolbar: 'GraphToolbar' },
  });
  const render = () => elements(screen.render(() => screen.module.RelationAnalysisScreen()));
  const workspace = () => render().find((node) => typeof node.type === 'function');
  assert.equal(workspace(), undefined);
  assert.equal(reads.length, 0);
  state.active = true;
  const original = workspace();
  assert.equal(reads.length, 1);
  assert.equal(original.props.key, state.scope);
  assert.equal(original.props.analysis, analysis);
  for (const focused of [false, true, false, true]) {
    state.focused = focused;
    const retained = workspace();
    assert.equal(retained.type, original.type);
    assert.equal(retained.props.key, original.props.key);
    assert.equal(retained.props.analysis, analysis);
  }
  assert.equal(reads.length, 3);
  const workspaceElements = elements(original.type(original.props));
  assert.ok(!workspaceElements.some((node) => node.props.accessibilityRole === 'header'));
  assert.equal(render().find((node) => node.type === 'GraphToolbar').props.view, 'relations');
  const results = workspaceElements.find((node) => node.type === 'Results');
  assert.equal(results.props.analysis, analysis);
  state.scope = 'local:2:private';
  assert.equal(workspace().props.key, state.scope);
  assert.notEqual(workspace().props.key, original.props.key);
  state.ready = false;
  assert.equal(workspace(), undefined);
});

test('preparation has no start button and exposes analysis start before embedding', () => {
  let starts = 0;
  let stops = 0;
  let refreshes = 0;
  const screen = ui('screens/AnalysisProgressSection.tsx');
  const analysis = {
    status: 'idle',
    prepareOnly: true,
    phase: 'embedding',
    processed: 200,
    total: 600,
    savedBatch: 1,
    modelChecks: 170,
    reused: 30,
    failed: 0,
    elapsedMs: 3000,
    start: () => starts++,
    stop: () => stops++,
  };
  const render = (extra = {}) =>
    elements(
      screen.render(() =>
        screen.module.AnalysisProgressSection({
          analysis,
          noteCount: 5,
          ready: true,
          loading: false,
          refresh: () => refreshes++,
          ...extra,
        })
      )
    );
  const button = (nodes, text) =>
    nodes.find((node) => node.type === 'Button' && node.props.accessibilityLabel === text);
  assert.equal(
    render().filter((node) => node.type === 'Button' && node.props.icon === 'play').length,
    0
  );
  analysis.status = 'running';
  assert.equal(
    render().filter((node) => node.type === 'Button' && node.props.icon === 'play').length,
    0
  );
  analysis.status = 'ready';
  analysis.phase = 'embedding';
  analysis.processed = 0;
  assert.ok(
    render().some(
      (node) => node.type === 'Text' && node.props.children.includes('Ready to analyze')
    )
  );
  assert.equal(render().find((node) => node.type === 'Progress').props.progress, 0);
  assert.equal(
    render().find((node) => node.type === 'Progress').props.accessibilityLabel,
    'Embedding patterns'
  );
  analysis.total = 0;
  assert.equal(render().find((node) => node.type === 'Progress').props.progress, 0);
  analysis.total = 600;
  button(render(), 'Start analysis').props.onPress();
  assert.equal(starts, 1);
  assert.equal(button(render({ loading: true }), 'Start analysis').props.disabled, true);
  analysis.status = 'running';
  analysis.prepareOnly = false;
  analysis.processed = 200;
  assert.equal(render().find((node) => node.type === 'Progress').props.progress, 1 / 12);
  button(render(), 'cancel').props.onPress();
  assert.equal(stops, 1);
  analysis.status = 'stopping';
  assert.equal(button(render(), 'cancel').props.disabled, true);
  analysis.status = 'cancelled';
  button(render(), 'Resume analysis').props.onPress();
  assert.equal(starts, 2);
  analysis.prepareOnly = true;
  assert.ok(button(render(), 'Resume analysis'));
  analysis.status = 'failed';
  assert.ok(button(render(), 'Retry'));
  analysis.status = 'completed';
  analysis.prepareOnly = false;
  const completedButtons = render().filter((node) => node.type === 'Button');
  assert.deepEqual(
    completedButtons.map((node) => node.props.children.join('')),
    ['Refresh notes', 'Run analysis again']
  );
  button(render(), 'Refresh notes').props.onPress();
  assert.equal(refreshes, 1);
  assert.equal(starts, 2);
  button(render(), 'Run analysis again').props.onPress();
  assert.equal(starts, 3);
});

test('the shared analysis card uses one progress bar for search embeddings and cancellation', () => {
  let searchStops = 0;
  const screen = ui('screens/AnalysisProgressSection.tsx', {
    '../search/embeddingStatus': {
      useSearchEmbeddingStatus: () => ({ phase: 'running', processed: 2, total: 5 }),
    },
  });
  const analysis = {
    status: 'completed',
    prepareOnly: false,
    phase: 'embedding',
    processed: 0,
    total: 1,
    savedBatch: 0,
    modelChecks: 0,
    reused: 0,
    failed: 0,
    elapsedMs: 0,
    start: () => {},
    stop: () => {},
  };
  const tree = elements(
    screen.render(() =>
      screen.module.AnalysisProgressSection({
        analysis,
        scope: 'local:1:normal',
        noteCount: 1,
        ready: true,
        loading: false,
        refresh: () => {},
        onStopSearch: () => searchStops++,
      })
    )
  );
  assert.ok(
    tree.some(
      (node) => node.type === 'Text' && node.props.children.includes('Preparing search embeddings')
    )
  );
  assert.ok(tree.some((node) => node.type === 'Progress' && node.props.progress === 0.85));
  assert.equal(tree.filter((node) => node.type === 'Progress').length, 1);
  assert.equal(
    tree.some((node) => node.type === 'Text' && node.props.children.includes('Search embeddings')),
    false,
    'there is no separate search embedding heading'
  );
  tree
    .find((node) => node.type === 'Button' && node.props.accessibilityLabel === 'cancel')
    .props.onPress();
  assert.equal(searchStops, 1);
});

test('the shared analysis bar gives 25 percent to each model stage in execution order', () => {
  const analysis = {
    status: 'running',
    prepareOnly: false,
    phase: 'embedding',
    processed: 5,
    total: 10,
  };
  const search = { phase: 'idle', processed: 0, total: 0 };
  const progress = () => relationStatus.relationAnalysisDisplay(analysis, search);
  assert.equal(progress().ratio, 0.125);
  assert.equal(progress().phaseLabel, 'Pattern embeddings');
  analysis.phase = 'merge';
  analysis.processed = 5;
  assert.equal(progress().ratio, 0.375);
  assert.equal(progress().phaseLabel, 'NLI duplicate check');
  analysis.phase = 'validation';
  assert.equal(progress().ratio, 0.625);
  assert.equal(progress().phaseLabel, 'NLI final check');
  search.phase = 'completed';
  assert.equal(progress().ratio, 0.625, 'previous search vectors do not advance current NLI');
  search.phase = 'idle';
  analysis.status = 'completed';
  assert.equal(progress().ratio, 0.75);
  assert.equal(progress().statusLabel, 'Analysis in progress');
  assert.equal(progress().phaseLabel, 'Preparing search embeddings');
  search.phase = 'running';
  search.processed = 2;
  search.total = 4;
  assert.equal(progress().ratio, 0.875);
  search.phase = 'completed';
  assert.equal(progress().ratio, 1);
  assert.equal(progress().statusLabel, 'Analysis complete');
});

test('three tabs show entity results and inline relationship details without relationship navigation links', () => {
  const screen = ui('screens/RelationResultsSection.tsx');
  let navigations = 0;
  const analysis = resultFixture();
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.RelationResultsSection({ analysis, onNavigate: () => navigations++ })
      )
    );
  const tab = (label) =>
    render().find(
      (node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label
    );
  assert.deepEqual(
    render()
      .filter((node) => node.props.accessibilityRole === 'tab')
      .map((node) => node.props.accessibilityLabel),
    ['Keyword', 'Entity', 'Relationship list']
  );
  assert.equal(tab('Keyword').props.accessibilityState.selected, true);
  assert.doesNotMatch(JSON.stringify(render()), /Hidden pattern inventory|Relationship patterns/);
  render()
    .find((node) => node.type === 'Input')
    .props.onChangeText('orama');
  assert.deepEqual(
    render()
      .filter((node) => node.type === 'NameLink')
      .map((node) => node.props.name),
    ['Orama']
  );
  render()
    .find((node) => node.type === 'NameLink')
    .props.onPress();
  let details = render().find((node) => node.type === 'EntityDetail');
  assert.equal(tab('Entity').props.accessibilityState.selected, true);
  assert.equal(details.props.entity.text, 'Orama');
  assert.equal(
    render().filter((node) => node.type === 'Button').length,
    0,
    'detail navigation uses tabs rather than back-to-list buttons'
  );
  const entityUI = ui('screens/EntityDetailSection.tsx');
  const rows = elements(entityUI.render(() => entityUI.module.EntityDetailSection(details.props)));
  const groups = rows.filter((node) => node.type === 'RelationshipGroup');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].props.name, 'uses');
  const groupUI = ui('components/EntityRelationshipGroup.tsx');
  const groupNodes = elements(
    groupUI.render(() => groupUI.module.EntityRelationshipGroup(groups[0].props))
  );
  const cards = groupNodes.filter((node) => node.type === 'Evidence');
  assert.deepEqual(
    cards.map((node) => node.props.template),
    ['{{E1}} uses {{E2}}.', '{{E1}} uses {{E2}}.']
  );
  assert.deepEqual(
    cards.map((item) => item.props.entityContext.relatedEntityKey),
    ['react native', 'indexeddb']
  );
  const groupTitle = groupNodes.find(
    (node) => node.type === 'Text' && node.props.accessibilityRole === 'header'
  );
  assert.deepEqual(groupTitle.props.children, ['uses']);
  assert.equal(groupTitle.props.onPress, undefined);
  assert.equal(groupNodes.filter((node) => node.type === 'NameLink').length, 0);
  assert.equal(details.props.onSelectRelation, undefined);
  assert.equal(tab('Entity').props.accessibilityState.selected, true);
  tab('Relationship list').props.onPress();
  assert.equal(render().filter((node) => node.type === 'NameLink').length, 0);
  render()
    .find((node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Expand')
    .props.onPress();
  const relation = render().find((node) => node.type === 'RelationDetail');
  assert.equal(relation.props.relation.candidate.id, 'uses-ui');
  const relationUI = ui('screens/RelationListSection.tsx');
  const relationRows = elements(
    relationUI.render(() => relationUI.module.RelationDetail(relation.props))
  );
  assert.equal(relationRows.filter((node) => node.type === 'NameLink').length, 0);
  assert.ok(!relationRows.some((node) => node.props.label?.startsWith('Related entities')));
  const evidenceUI = ui('components/RelationEvidenceSection.tsx');
  elements(
    evidenceUI.render(() =>
      evidenceUI.module.RelationEvidenceSection(
        relationRows.find((node) => node.type === 'Evidence').props
      )
    )
  )
    .find((node) => node.type === 'SentenceText')
    .props.onSelectEntity('react native');
  details = render().find((node) => node.type === 'EntityDetail');
  assert.equal(details.props.entity.text, 'React Native');
  assert.equal(navigations, 2, 'only entity links navigate within the analysis workspace');
  assert.equal(tab('Entity').props.accessibilityState.selected, true);
  tab('Keyword').props.onPress();
  assert.equal(render().find((node) => node.type === 'Input').props.value, 'orama');
  assert.deepEqual(
    render()
      .filter((node) => node.type === 'NameLink')
      .map((node) => node.props.name),
    ['Orama']
  );
  tab('Relationship list').props.onPress();
  assert.equal(
    render().find((node) => node.type === 'RelationDetail').props.relation.candidate.id,
    'uses-ui'
  );
  analysis.result = { candidates: [] };
  assert.equal(
    render().find((node) => node.type === 'RelationDetail'),
    undefined
  );
  assert.ok(
    render().some(
      (node) => node.type === 'Text' && node.props.children.includes('No relationships found.')
    )
  );
  analysis.entities = {
    entities: analysis.entities.entities.filter((entity) => entity.text !== 'React Native'),
  };
  tab('Entity').props.onPress();
  assert.equal(
    render().find((node) => node.type === 'EntityDetail'),
    undefined
  );
});

test('relationship list has no search, ignores the entity search and opens the exact id when names are equal', () => {
  const screen = ui('screens/RelationResultsSection.tsx');
  const analysis = resultFixture();
  let navigations = 0;
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.RelationResultsSection({ analysis, onNavigate: () => navigations++ })
      )
    );
  const tab = (label) =>
    render().find(
      (node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label
    );
  render()
    .find((node) => node.type === 'Input')
    .props.onChangeText('orama');
  tab('Relationship list').props.onPress();
  assert.equal(tab('Relationship list').props.accessibilityState.selected, true);
  assert.equal(render().filter((node) => node.type === 'Input').length, 0);
  const titles = render().filter(
    (node) => node.type === 'Text' && node.props.accessibilityRole === 'header'
  );
  assert.ok(titles.every((node) => node.props.onPress === undefined));
  assert.equal(render().filter((node) => node.type === 'NameLink').length, 0);
  assert.deepEqual(
    titles.map((node) => node.props.children.join('')),
    ['uses', 'uses']
  );
  render()
    .find((node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Expand')
    .props.onPress();
  assert.equal(tab('Relationship list').props.accessibilityState.selected, true);
  assert.equal(
    render().find((node) => node.type === 'RelationDetail').props.relation.candidate.id,
    'uses-ui'
  );
  assert.equal(navigations, 0, 'expanding a list item keeps the current scroll position');
  tab('Relationship list').props.onPress();
  assert.equal(render().filter((node) => node.type === 'Input').length, 0);
  assert.equal(render().filter((node) => node.type === 'NameLink').length, 0);
  tab('Keyword').props.onPress();
  assert.equal(render().find((node) => node.type === 'Input').props.value, 'orama');
  assert.deepEqual(
    render()
      .filter((node) => node.type === 'NameLink')
      .map((node) => node.props.name),
    ['Orama']
  );
});

test('relationship expand buttons preserve the exact item and page across tabs and apply the list filter', () => {
  const analysis = resultFixture();
  const base = analysis.result.candidates[0];
  analysis.result.candidates = Array.from({ length: 25 }, (_, index) => ({
    ...base,
    id: `relationship-${index}`,
    label: 'same label',
  }));
  const screen = ui('screens/RelationResultsSection.tsx');
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  const tab = (label) =>
    render().find(
      (node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label
    );
  const detail = () => render().find((node) => node.type === 'RelationDetail');
  const pagination = () =>
    render().find((node) => node.props.size === 20 && typeof node.props.onChange === 'function');
  const expand = () =>
    render().filter(
      (node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Expand'
    );
  tab('Relationship list').props.onPress();
  pagination().props.onChange(1);
  expand()[3].props.onPress();
  assert.equal(detail().props.relation.candidate.id, 'relationship-23');
  render()
    .find((node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Collapse')
    .props.onPress();
  assert.equal(detail(), undefined);
  expand()[4].props.onPress();
  assert.equal(detail().props.relation.candidate.id, 'relationship-24');
  detail().props.onSelectEntity('indexeddb');
  assert.equal(tab('Entity').props.accessibilityState.selected, true);
  tab('Relationship list').props.onPress();
  assert.equal(pagination().props.page, 1);
  assert.equal(detail().props.relation.candidate.id, 'relationship-24');
  render()
    .find((node) => node.type === 'Chip' && node.props.accessibilityLabel === 'Contradicted')
    .props.onPress();
  pagination().props.onChange(1);
  assert.equal(detail().props.relation.evidence.length, 1);
  assert.ok(
    detail().props.relation.evidence.every(
      ({ validation }) => validation.verdict === 'contradicted'
    )
  );
});

test('relationship list paginates, resets on judgment and clamps after results change', () => {
  const screen = ui('screens/RelationResultsSection.tsx');
  const analysis = resultFixture();
  const base = analysis.result.candidates[0];
  analysis.result.candidates = Array.from({ length: 25 }, (_, i) => ({
    ...base,
    id: `relationship-${i}`,
    label: `Relationship ${String(i + 1).padStart(2, '0')}`,
    validations:
      i === 24
        ? base.validations.map((validation) => ({ ...validation, verdict: 'neutral' }))
        : base.validations,
  }));
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  render()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  const links = () =>
    render().filter((node) => node.type === 'Text' && node.props.accessibilityRole === 'header');
  const pagination = () =>
    render().find((node) => node.props.size === 20 && typeof node.props.onChange === 'function');
  assert.equal(links().length, 20);
  pagination().props.onChange(1);
  assert.equal(links().length, 5);
  assert.equal(links()[0].props.children.join(''), 'Relationship 21');
  render()
    .find((node) => node.props.accessibilityLabel === 'Keyword')
    .props.onPress();
  render()
    .find((node) => node.type === 'Input')
    .props.onChangeText('orama');
  render()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  assert.equal(
    pagination().props.page,
    1,
    'the relationship section retains its page after remount'
  );
  assert.equal(links()[0].props.children.join(''), 'Relationship 21');
  render()
    .find((node) => node.type === 'Chip' && node.props.accessibilityLabel === 'Neutral')
    .props.onPress();
  assert.equal(pagination().props.page, 0);
  assert.deepEqual(
    links().map((node) => node.props.children.join('')),
    ['Relationship 25']
  );
  render()
    .find((node) => node.type === 'Chip' && node.props.accessibilityLabel === 'All')
    .props.onPress();
  assert.equal(links().length, 20);
  pagination().props.onChange(1);
  analysis.result = { ...analysis.result, candidates: analysis.result.candidates.slice(0, 2) };
  assert.equal(pagination().props.page, 0);
  assert.deepEqual(
    links().map((node) => node.props.children.join('')),
    ['Relationship 01', 'Relationship 02']
  );
});

test('relationship evidence filters count all evidence, retain pending rows and preserve selection after navigation', () => {
  const screen = ui('screens/RelationResultsSection.tsx');
  const analysis = resultFixture();
  const [mixed, supported] = analysis.result.candidates;
  analysis.result.candidates = [
    { ...mixed, label: 'storage' },
    { ...supported, label: 'ui' },
    { ...supported, id: 'pending', label: 'storage pending', validations: [] },
    ...['neutral', 'uncertain', 'unverified'].map((verdict) => ({
      ...supported,
      id: verdict,
      label: `storage ${verdict}`,
      validations: [
        {
          ...supported.validations[0],
          verdict,
          scores:
            verdict === 'unverified'
              ? undefined
              : {
                  entailment: verdict === 'neutral' ? 0.02 : 0.4,
                  neutral: verdict === 'neutral' ? 0.96 : 0.3,
                  contradiction: verdict === 'neutral' ? 0.02 : 0.3,
                },
        },
      ],
    })),
  ];
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  const tab = (label) =>
    render().find(
      (node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label
    );
  const chip = (label) =>
    render().find((node) => node.type === 'Chip' && node.props.accessibilityLabel === label);
  const names = () =>
    render()
      .filter((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')
      .map((node) => node.props.children.join(''));
  tab('Relationship list').props.onPress();
  for (const [label, count] of [
    ['All', 7],
    ['Supported', 2],
    ['Contradicted', 1],
    ['Neutral', 1],
    ['Uncertain', 1],
    ['Unverified', 2],
  ]) {
    assert.ok(chip(label).props.children.includes(` · ${count}`));
  }
  assert.equal(chip('All').props.accessibilityState.selected, true);
  chip('Supported').props.onPress();
  assert.deepEqual(names(), ['ui', 'storage']);
  chip('Contradicted').props.onPress();
  assert.equal(chip('Supported').props.accessibilityState.selected, true);
  assert.equal(chip('Contradicted').props.accessibilityState.selected, true);
  assert.deepEqual(
    names(),
    ['ui', 'storage'],
    'multiple judgments use OR without duplicate relationships'
  );
  chip('Supported').props.onPress();
  assert.deepEqual(names(), ['storage'], 'mixed-verdict relationships match any of their evidence');
  assert.ok(
    render().some(
      (node) =>
        node.type === 'Text' && node.props.children.join('').endsWith('Validation evidence: 1')
    ),
    'relationship cards count only evidence matching the selected judgment'
  );
  chip('Unverified').props.onPress();
  assert.deepEqual(names(), ['storage', 'storage pending', 'storage unverified']);
  chip('Contradicted').props.onPress();
  assert.deepEqual(names(), ['storage pending', 'storage unverified']);
  chip('All').props.onPress();
  chip('Neutral').props.onPress();
  assert.deepEqual(names(), ['storage neutral']);
  chip('Uncertain').props.onPress();
  assert.deepEqual(names(), ['storage uncertain', 'storage neutral']);
  chip('Neutral').props.onPress();
  assert.deepEqual(names(), ['storage uncertain']);
  chip('Uncertain').props.onPress();
  assert.equal(chip('All').props.accessibilityState.selected, true);
  assert.ok(chip('All').props.children.includes(' · 7'));
  assert.ok(chip('Supported').props.children.includes(' · 2'));
  chip('Contradicted').props.onPress();
  render()
    .find((node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Expand')
    .props.onPress();
  assert.equal(
    render().find((node) => node.type === 'RelationDetail').props.relation.candidate.id,
    'uses-storage'
  );
  tab('Relationship list').props.onPress();
  assert.equal(chip('Contradicted').props.accessibilityState.selected, true);
  assert.equal(render().filter((node) => node.type === 'Input').length, 0);
  analysis.result = { ...analysis.result, candidates: [{ ...supported, label: 'ui' }] };
  assert.deepEqual(names(), []);
  assert.ok(render().some((node) => node.props.children.includes('No matching analysis results.')));
  assert.ok(chip('Contradicted').props.children.includes(' · 0'));
  chip('All').props.onPress();
  assert.deepEqual(names(), ['ui']);
});

test('relationship list distinguishes preparation, NLI readiness and empty results', () => {
  const screen = ui('screens/RelationResultsSection.tsx');
  const analysis = { ...resultFixture(), status: 'running', result: undefined };
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  render()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  const hasMessage = (message) => render().some((node) => node.props.children.includes(message));
  assert.ok(hasMessage('Results will appear as analysis progresses.'));
  analysis.status = 'ready';
  assert.ok(hasMessage('Start analysis'));
  analysis.status = 'completed';
  analysis.result = { candidates: [] };
  assert.ok(hasMessage('No relationships found.'));
});

test('template entity placeholders have an inline emphasis style without changing the surrounding sentence', () => {
  const emphasis = { backgroundColor: 'theme-highlight' };
  const weight = { fontWeight: '700' };
  const screen = ui('screens/RelationListSection.tsx', {
    '../../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: { text: {}, activeTab: emphasis } }),
    },
    '../styles': { relationAnalysisStyles: { inlineKeyword: weight } },
  });
  const fixture = resultFixture();
  fixture.result.candidates[0].template = 'Before {{E1}} uses {{E2}} and {{E1}}; {{E3}} literal.';
  const index = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const nodes = elements(
    screen.render(() =>
      screen.module.RelationDetail({
        relation: index.relations.get('uses-storage'),
        entities: index.entities,
        onSelectEntity: () => {},
      })
    )
  );
  const placeholders = nodes.filter(
    (node) =>
      node.type === 'Text' && Array.isArray(node.props.style) && node.props.style.includes(emphasis)
  );
  assert.deepEqual(
    placeholders.map((node) => node.props.children.join('')),
    ['〈Entity 1〉', '〈Entity 2〉', '〈Entity 1〉']
  );
  assert.ok(placeholders.every((node) => node.props.style.includes(weight) && !node.props.onPress));
  assert.ok(
    nodes
      .filter((node) => node.type === 'Evidence')
      .every((node) => node.props.template === fixture.result.candidates[0].template)
  );
  const statement = nodes.find(
    (node) => node.type === 'Text' && node.props.selectable && !node.props.accessibilityRole
  );
  const text = (value) =>
    Array.isArray(value)
      ? value.map(text).join('')
      : typeof value === 'string'
      ? value
      : text(value.props.children);
  assert.equal(
    text(statement),
    'Before 〈Entity 1〉 uses 〈Entity 2〉 and 〈Entity 1〉; {{E3}} literal.'
  );
});

test('expanded relationship evidence uses only the list judgment filter', () => {
  const analysis = resultFixture();
  const screen = ui('screens/RelationResultsSection.tsx');
  const body = ui('screens/RelationListSection.tsx');
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  render()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  render()
    .filter((node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Expand')[1]
    .props.onPress();
  const chip = (label) =>
    render().find((node) => node.type === 'Chip' && node.props.accessibilityLabel === label);
  const evidence = () => {
    const detail = render().find((node) => node.type === 'RelationDetail');
    if (!detail) return [];
    const nodes = elements(body.render(() => body.module.RelationDetail(detail.props)));
    assert.equal(nodes.filter((node) => node.type === 'Filter' || node.type === 'Chip').length, 0);
    return nodes.filter((node) => node.type === 'Evidence');
  };
  chip('Supported').props.onPress();
  assert.equal(evidence().length, 1);
  chip('Contradicted').props.onPress();
  assert.equal(evidence().length, 2);
  chip('Supported').props.onPress();
  assert.equal(evidence()[0].props.validation.verdict, 'contradicted');
  chip('All').props.onPress();
  assert.equal(evidence().length, 2);
});

test('entity related relationships filter before grouping and retain whole-entity judgment counts', () => {
  const fixture = resultFixture();
  const index = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const original = index.entities.get('orama');
  const relationship = original.relationships.get('uses-storage');
  const base = relationship.sentences[0];
  const supported = Array.from({ length: 22 }, (_, i) => ({
    ...base,
    context: { ...base.context, text: `Supported ${i}` },
    evidence: {
      ...base.evidence,
      validation: { ...base.evidence.validation, verdict: 'supported' },
    },
  }));
  let entity = {
    ...original,
    relationships: new Map([
      [
        relationship.id,
        {
          ...relationship,
          sentences: [
            ...supported,
            ...['contradicted', 'neutral', 'uncertain', 'unverified'].map((verdict) => ({
              ...base,
              context: { ...base.context, text: verdict },
              evidence: {
                ...base.evidence,
                validation:
                  verdict === 'unverified' ? undefined : { ...base.evidence.validation, verdict },
              },
            })),
          ],
        },
      ],
    ]),
  };
  const screen = ui('screens/EntityDetailSection.tsx');
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.EntityDetailSection({
          entity,
          entities: index.entities,
          validated: true,
          onSelectEntity: () => {},
        })
      )
    );
  const chip = (label) =>
    render().find((node) => node.type === 'Chip' && node.props.accessibilityLabel === label);
  const groups = () => render().filter((node) => node.type === 'RelationshipGroup');
  const rows = () => groups().flatMap((node) => node.props.rows);
  const pagination = () => render().find((node) => node.props.size === 10);
  for (const [label, count] of [
    ['All', 26],
    ['Supported', 22],
    ['Contradicted', 1],
    ['Neutral', 1],
    ['Uncertain', 1],
    ['Unverified', 1],
  ])
    assert.ok(chip(label).props.children.includes(` · ${count}`));
  assert.equal(groups().length, 1);
  assert.equal(groups()[0].props.name, 'uses');
  assert.equal(rows().length, 26);
  const originalGroupKey = groups()[0].props.key;
  chip('Supported').props.onPress();
  assert.equal(pagination().props.page, 0);
  assert.equal(pagination().props.count, 1);
  assert.equal(rows().length, 22);
  assert.notEqual(groups()[0].props.key, originalGroupKey, 'filter changes reset nested pages');
  assert.equal(rows().at(-1).sentence.context.text, 'Supported 21');
  chip('Contradicted').props.onPress();
  assert.equal(chip('Supported').props.accessibilityState.selected, true);
  assert.equal(chip('Contradicted').props.accessibilityState.selected, true);
  assert.equal(pagination().props.page, 0);
  assert.equal(rows().length, 23);
  assert.ok(chip('All').props.children.includes(' · 26'));
  chip('Supported').props.onPress();
  assert.deepEqual(
    rows().map((row) => row.sentence.evidence.validation?.verdict ?? 'unverified'),
    ['contradicted']
  );
  chip('Unverified').props.onPress();
  assert.deepEqual(
    rows().map((row) => row.sentence.evidence.validation?.verdict ?? 'unverified'),
    ['contradicted', 'unverified']
  );
  chip('Contradicted').props.onPress();
  assert.deepEqual(
    rows().map((row) => row.sentence.evidence.validation?.verdict ?? 'unverified'),
    ['unverified']
  );
  chip('Unverified').props.onPress();
  assert.equal(chip('All').props.accessibilityState.selected, true);
  assert.equal(rows().length, 26);
  chip('Neutral').props.onPress();
  chip('Uncertain').props.onPress();
  assert.deepEqual(
    rows().map((row) => row.sentence.evidence.validation?.verdict ?? 'unverified'),
    ['neutral', 'uncertain']
  );
  chip('All').props.onPress();
  assert.equal(rows().length, 26);
  chip('Neutral').props.onPress();
  entity = {
    ...entity,
    relationships: new Map([[relationship.id, { ...relationship, sentences: supported }]]),
  };
  assert.equal(rows().length, 0);
  assert.ok(chip('Neutral').props.children.includes(' · 0'));
  assert.ok(JSON.stringify(render()).includes('No matching analysis results.'));
  chip('All').props.onPress();
  assert.equal(rows().length, 22);
  assert.equal(pagination().props.count, 1);
});

test('relationship list and entity related relationships sort by confidence before pagination', () => {
  const analysis = resultFixture();
  const base = analysis.result.candidates[0];
  analysis.result.candidates = Array.from({ length: 25 }, (_, i) => ({
    ...base,
    id: `R${String(i).padStart(2, '0')}`,
    label: `R${String(i).padStart(2, '0')}`,
    observations: [{ ...base.observations[0], evidence: `Sentence ${i}` }],
    validations: [
      {
        ...base.validations[0],
        scores: { entailment: (i + 1) / 30, neutral: 0, contradiction: 0 },
      },
    ],
  }));
  const list = ui('screens/RelationResultsSection.tsx');
  const renderList = () =>
    elements(list.render(() => list.module.RelationResultsSection({ analysis })));
  renderList()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  assert.deepEqual(
    renderList()
      .filter((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')
      .slice(0, 2)
      .map((node) => node.props.children.join('')),
    ['R24', 'R23']
  );
  renderList()
    .find((node) => node.props.size === 20 && typeof node.props.onChange === 'function')
    .props.onChange(1);
  assert.deepEqual(
    renderList()
      .filter((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')
      .map((node) => node.props.children.join('')),
    ['R04', 'R03', 'R02', 'R01', 'R00']
  );
  const index = resultIndex.createRelationResultsIndex(
    analysis.entities.entities,
    analysis.result.candidates
  );
  const detail = ui('screens/EntityDetailSection.tsx');
  const renderDetail = () =>
    elements(
      detail.render(() =>
        detail.module.EntityDetailSection({
          entity: index.entities.get('orama'),
          entities: index.entities,
          validated: true,
          onSelectEntity: () => {},
        })
      )
    );
  const rows = () => renderDetail().filter((node) => node.type === 'RelationshipGroup');
  assert.deepEqual(
    rows()
      .slice(0, 2)
      .map((node) => node.props.name),
    ['R24', 'R23']
  );
  renderDetail()
    .find((node) => node.props.size === 10)
    .props.onChange(2);
  assert.deepEqual(
    rows().map((node) => node.props.name),
    ['R04', 'R03', 'R02', 'R01', 'R00']
  );
  renderDetail()
    .find((node) => node.type === 'Chip' && node.props.accessibilityLabel === 'Supported')
    .props.onPress();
  assert.equal(renderDetail().find((node) => node.props.size === 10).props.page, 0);
  assert.equal(rows()[0].props.name, 'R24');
});

test('relationship evidence shares the ranking rule before pagination and filtering without detaching source-validation pairs', () => {
  const fixture = resultFixture();
  const index = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const relation = index.relations.get('uses-storage');
  const base = relation.evidence[0];
  const cases = [
    ['unverified', 0.99],
    ['contradicted', 0.02],
    ['supported', 0.81],
    ['supported', 0.95],
    ['neutral', 0.1],
    [undefined, undefined],
    ['supported', 0.9],
    ['supported', 0.85],
    ['supported', 0.88],
    ['supported', 0.84],
    ['supported', 0.83],
    ['supported', 0.82],
  ];
  relation.evidence = cases.map(([verdict, score], i) => ({
    observation: { ...base.observation, noteTitle: `Note ${i}`, evidence: `Evidence ${i}` },
    validation: verdict
      ? {
          ...base.validation,
          noteTitle: `Note ${i}`,
          hypothesis: `Hypothesis ${i}`,
          verdict,
          scores: { entailment: score, neutral: 0, contradiction: 1 - score },
        }
      : undefined,
  }));
  const original = [...relation.evidence];
  let visibleRelation = relation;
  const screen = ui('screens/RelationListSection.tsx');
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.RelationDetail({
          relation: visibleRelation,
          entities: index.entities,
          onSelectEntity: () => {},
        })
      )
    );
  const rows = () => render().filter((node) => node.type === 'Evidence');
  const notes = () => rows().map((node) => node.props.observation.noteTitle);
  assert.deepEqual(notes(), [
    'Note 3',
    'Note 6',
    'Note 8',
    'Note 7',
    'Note 9',
    'Note 10',
    'Note 11',
    'Note 2',
    'Note 4',
    'Note 1',
  ]);
  for (const node of rows()) {
    assert.equal(node.props.validation.noteTitle, node.props.observation.noteTitle);
    assert.equal(
      node.props.validation.hypothesis,
      `Hypothesis ${node.props.observation.noteTitle.slice(5)}`
    );
  }
  render()
    .find((node) => node.props.size === 10)
    .props.onChange(1);
  assert.deepEqual(notes(), ['Note 0', 'Note 5']);
  visibleRelation = {
    ...relation,
    evidence: relation.evidence.filter(({ validation }) => validation?.verdict === 'supported'),
  };
  assert.equal(render().find((node) => node.props.size === 10).props.page, 0);
  assert.deepEqual(notes(), [
    'Note 3',
    'Note 6',
    'Note 8',
    'Note 7',
    'Note 9',
    'Note 10',
    'Note 11',
    'Note 2',
  ]);
  assert.deepEqual(relation.evidence, original, 'ranking never mutates the stored evidence order');
});

test('keyword list and relationship evidence paginate without a card filter or search field', () => {
  const analysis = resultFixture();
  analysis.entities = {
    entities: Array.from({ length: 25 }, (_, i) => ({
      text: `Keyword${String.fromCharCode(65 + i)}`,
      type: 'KEYWORD',
      noteCount: 3,
      mentionCount: 5,
    })),
  };
  const list = ui('screens/RelationResultsSection.tsx');
  const renderList = () =>
    elements(list.render(() => list.module.RelationResultsSection({ analysis })));
  assert.equal(renderList().filter((node) => node.type === 'NameLink').length, 20);
  renderList()
    .find((node) => node.props.size === 20 && node.props.count === 25)
    .props.onChange(1);
  assert.equal(renderList().filter((node) => node.type === 'NameLink').length, 5);
  renderList()
    .find((node) => node.type === 'Input')
    .props.onChangeText('KeywordA');
  assert.equal(renderList().filter((node) => node.type === 'NameLink')[0].props.name, 'KeywordA');
  const fixture = resultFixture();
  const index = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const detail = ui('screens/RelationListSection.tsx');
  const relation = index.relations.get('uses-storage');
  const render = () =>
    elements(
      detail.render(() =>
        detail.module.RelationDetail({
          relation,
          entities: index.entities,
          onSelectEntity: () => {},
        })
      )
    );
  assert.equal(render().filter((node) => node.type === 'Evidence').length, 2);
  assert.equal(render().filter((node) => node.type === 'Chip' || node.type === 'Filter').length, 0);
  assert.equal(render().filter((node) => node.type === 'Input').length, 0);
  const pagedUI = ui('screens/RelationListSection.tsx');
  let pagedRelation = {
    ...relation,
    evidence: Array.from({ length: 12 }, (_, i) => ({
      observation: relation.evidence[0].observation,
      validation: { ...relation.evidence[0].validation, hypothesis: `Paged ${i}` },
    })),
  };
  const parent = ui('screens/RelationListSection.tsx');
  const paged = () => {
    const detail = elements(
      parent.render(() =>
        parent.module.RelationListSection({
          relations: new Map([[pagedRelation.candidate.id, pagedRelation]]),
          state: { page: 0, verdicts: [], expanded: pagedRelation.candidate.id },
          onChange: () => {},
          validated: true,
          pending: false,
          entities: index.entities,
          onSelectEntity: () => {},
        })
      )
    ).find((node) => node.type === 'RelationDetail');
    assert.equal(parent.components.get('RelationDetail'), parent.module.RelationDetail);
    assert.equal(detail.props.key, '', 'an ordinary parent rerender keeps the detail key');
    return elements(pagedUI.render(() => pagedUI.module.RelationDetail(detail.props)));
  };
  assert.equal(paged().filter((node) => node.type === 'Evidence').length, 10);
  paged()
    .find((node) => node.props.size === 10)
    .props.onChange(1);
  assert.equal(paged().filter((node) => node.type === 'Evidence').length, 2);
  assert.equal(
    paged().find((node) => node.type === 'Evidence').props.validation.hypothesis,
    'Paged 10'
  );
  pagedRelation = { ...pagedRelation, evidence: [...pagedRelation.evidence] };
  assert.equal(paged().find((node) => node.props.size === 10).props.page, 1);
  assert.equal(paged().filter((node) => node.type === 'Evidence').length, 2);
});

test('keywords sharing a classification pattern still open their own original entity', () => {
  const { relationKeyword } = loadTs('relationKeywords.ts');
  for (const names of [
    ['Sprint {{NUM}}', 'Sprint 123'],
    ['Task {{NUM}} 1', 'Task 1 2'],
  ]) {
    const inventory = names.map((name) => ({
      ...relationKeyword(name),
      noteCount: 3,
      mentionCount: 3,
    }));
    assert.notEqual(inventory[0].text, inventory[1].text);
    const analysis = { entities: { entities: inventory } };
    const screen = ui('screens/RelationResultsSection.tsx');
    const render = () =>
      elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
    for (const expected of inventory) {
      const links = render().filter((node) => node.type === 'NameLink');
      links[inventory.indexOf(expected)].props.onPress();
      const detail = render().find((node) => node.type === 'EntityDetail');
      assert.equal(detail.props.entity.key, expected.key);
      assert.equal(detail.props.entity.type, expected.type);
      render()
        .find((node) => node.props.accessibilityLabel === 'Keyword')
        .props.onPress();
    }
  }
});

test('an entity without relationships still has details and a name link is an accessible local navigation action', () => {
  const fixture = resultFixture();
  const index = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const detail = ui('screens/EntityDetailSection.tsx');
  const nodes = elements(
    detail.render(() =>
      detail.module.EntityDetailSection({
        entity: index.entities.get('unconnected'),
        validated: true,
      })
    )
  );
  assert.ok(
    nodes.some((node) => node.type === 'Text' && node.props.children.includes('Unconnected'))
  );
  assert.ok(
    nodes.some(
      (node) => node.type === 'Text' && node.props.children.includes('No relationships found.')
    )
  );
  const link = ui('components/AnalysisNameLink.tsx');
  let opens = 0;
  const element = link.render(() =>
    link.module.AnalysisNameLink({ name: 'React Native', onPress: () => opens++ })
  );
  assert.equal(element.props.accessibilityRole, 'link');
  assert.equal(element.props.accessibilityLabel, 'React Native');
  element.props.onPress();
  assert.equal(opens, 1);
});

test('keyword sources remain navigable before NLI and sentences belong to each related relationship', () => {
  const fixture = resultFixture();
  const details = {
    orama: {
      sources: [
        {
          noteTitle: 'Folder/One',
          kind: 'bold',
          keyword: 'Orama',
          section: 'Storage',
          text: 'Orama uses IndexedDB.',
        },
      ],
      sentences: [
        {
          noteTitle: 'Folder/One',
          section: 'Storage',
          text: 'Orama uses IndexedDB and React Native to preserve the complete predicate.',
          entities: ['Orama', 'IndexedDB', 'React Native'],
        },
      ],
    },
  };
  const index = resultIndex.createRelationResultsIndex(fixture.entities.entities, [], details);
  const screen = ui('components/EntityProvenanceSection.tsx');
  const selected = [];
  const nodes = elements(
    screen.render(() =>
      screen.module.EntityProvenanceSection({
        entity: index.entities.get('orama'),
        onSelectEntity: (name) => selected.push(name),
      })
    )
  );
  const noteCards = nodes.filter((node) => node.type === 'SourceNoteCard');
  assert.equal(noteCards.length, 1);
  const noteUI = ui('components/EntityProvenanceSection.tsx');
  const noteNodes = elements(
    noteUI.render(() => noteUI.module.KeywordSourceNoteCard(noteCards[0].props))
  );
  assert.ok(
    noteNodes.some((node) => node.type === 'Text' && node.props.children.includes('Bold text'))
  );
  assert.deepEqual(
    noteNodes.filter((node) => node.type === 'DetailField').map((node) => node.props.label),
    ['Note', 'Paragraph', 'Category', 'Source text']
  );
  assert.equal(
    noteNodes.find((node) => node.type === 'DetailField' && node.props.label === 'Paragraph').props
      .showIcon,
    false
  );
  noteNodes
    .find((node) => node.type === 'NameLink' && node.props.name === 'Folder/One')
    .props.onPress();
  assert.deepEqual(noteUI.routes, [['NotePage', { title: 'Folder/One' }]]);
  assert.ok(
    !nodes.some(
      (node) =>
        node.type === 'Text' && node.props.children.includes('Sentences containing this entity')
    )
  );
  const candidate = fixture.result.candidates[0];
  candidate.observations[0].evidence = 'Orama uses IndexedDB';
  candidate.observations[1].evidence = 'React Native uses IndexedDB.';
  candidate.validations[0].hypothesisSource = {
    noteTitle: 'Pattern donor',
    section: 'Parent / Literal / heading',
    sectionPath: ['Parent', 'Literal / heading'],
  };
  const relations = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates,
    details
  );
  const evidenceUI = ui('components/RelationEvidenceSection.tsx');
  const renderItem = () =>
    elements(
      evidenceUI.render(() =>
        evidenceUI.module.RelationEvidenceSection(
          entityEvidenceProps({
            relationship: relations.entities.get('orama').relationships.get('uses-storage'),
            sentence: relations.entities.get('orama').relationships.get('uses-storage')
              .sentences[0],
            entityKey: 'orama',
            entities: relations.entities,
            onSelectEntity: (name) => selected.push(name),
          })
        )
      )
    );
  assert.equal(renderItem().filter((node) => node.type === 'DetailField').length, 0);
  renderItem()
    .find((node) => node.props.accessibilityLabel === 'Preview')
    .props.onPress();
  const itemNodes = renderItem();
  assert.equal(itemNodes.find((node) => node.type === 'VerdictBadge').props.verdict, 'supported');
  assert.ok(
    itemNodes.findIndex((node) => node.type === 'VerdictBadge') <
      itemNodes.findIndex((node) => node.type === 'SentenceText')
  );
  assert.deepEqual(
    itemNodes.filter((node) => node.type === 'DetailField').map((node) => node.props.label),
    [
      'Entity',
      'Source text',
      'Note',
      'Paragraph',
      'Validation statement',
      'Note',
      'Paragraph',
      'Entity order',
      'Judgment',
    ]
  );
  assert.equal(
    itemNodes.find((node) => node.type === 'SentenceText').props.text,
    'ORAMA uses IndexedDB.'
  );
  assert.ok(
    itemNodes.some(
      (node) =>
        node.type === 'SentenceText' &&
        node.props.variant === 'body' &&
        node.props.text === details.orama.sentences[0].text
    )
  );
  assert.ok(
    !itemNodes.some(
      (node) => node.type === 'DetailField' && node.props.label === 'Relationship name'
    )
  );
  assert.equal(
    itemNodes.find((node) => node.type === 'SentenceText').props.linkCurrentEntity,
    false
  );
  assert.equal(
    itemNodes.find((node) => node.type === 'SentenceText').props.relatedEntityKey,
    'indexeddb'
  );
  assert.equal(
    itemNodes.filter((node) => node.type === 'NameLink' && node.props.name === 'IndexedDB').length,
    1
  );
  assert.ok(!JSON.stringify(itemNodes).includes('React Native uses IndexedDB.'));
  itemNodes
    .find((node) => node.type === 'NameLink' && node.props.name === 'IndexedDB')
    .props.onPress();
  assert.deepEqual(selected, ['indexeddb']);
  assert.ok(!itemNodes.some((node) => node.props.accessibilityLabel === 'Relationship details'));
  assert.deepEqual(selected, ['indexeddb']);
  itemNodes
    .find((node) => node.type === 'NameLink' && node.props.name === 'Folder/One')
    .props.onPress();
  assert.deepEqual(evidenceUI.routes, [['NotePage', { title: 'Folder/One' }]]);
  const donorSection = itemNodes.find(
    (node) => node.type === 'SectionLink' && node.props.noteTitle === 'Pattern donor'
  );
  assert.deepEqual(donorSection.props.sectionPath, ['Parent', 'Literal / heading']);
  assert.ok(JSON.stringify(itemNodes).includes('Hypothesis 0'));
  assert.ok(
    itemNodes.some((node) => node.type === 'Text' && node.props.children.join('').includes('97.0%'))
  );

  const sourcesUI = ui('components/EntityProvenanceSection.tsx');
  const renderSources = () =>
    elements(
      sourcesUI.render(() =>
        sourcesUI.module.EntityProvenanceSection({ entity: relations.entities.get('orama') })
      )
    );
  const sourceToggle = () =>
    renderSources().find(
      (node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Source Notes'
    );
  assert.equal(sourceToggle().props.accessibilityState.expanded, false);
  assert.ok(!JSON.stringify(renderSources()).includes(details.orama.sources[0].text));
  sourceToggle().props.onPress();
  assert.equal(sourceToggle().props.accessibilityState.expanded, true);
  assert.ok(JSON.stringify(renderSources()).includes(details.orama.sources[0].text));

  const relationship = relations.entities.get('orama').relationships.get('uses-storage');
  assert.ok(JSON.stringify(renderItem()).includes(details.orama.sentences[0].text));
  renderItem()
    .find((node) => node.props.accessibilityLabel === 'Preview')
    .props.onPress();
  assert.equal(renderItem().filter((node) => node.type === 'DetailField').length, 0);
  assert.equal(renderItem().filter((node) => node.type === 'SentenceText').length, 1);

  const entityUI = ui('screens/EntityDetailSection.tsx');
  const entity = {
    ...relations.entities.get('orama'),
    relationships: new Map([
      [
        relationship.id,
        {
          ...relationship,
          sentences: Array.from({ length: 23 }, (_, i) => ({
            ...relationship.sentences[0],
            context: { ...relationship.sentences[0].context, text: `Sentence ${i}` },
          })),
        },
      ],
    ]),
  };
  const renderDetail = () =>
    elements(
      entityUI.render(() =>
        entityUI.module.EntityDetailSection({
          entity,
          validated: true,
          entities: relations.entities,
          onSelectEntity: () => {},
        })
      )
    );
  const groupNode = renderDetail().find((node) => node.type === 'RelationshipGroup');
  assert.equal(groupNode.props.name, 'uses');
  assert.equal(groupNode.props.rows.length, 23);
  const groupUI = ui('components/EntityRelationshipGroup.tsx');
  const renderGroup = () =>
    elements(groupUI.render(() => groupUI.module.EntityRelationshipGroup(groupNode.props)));
  assert.equal(renderGroup().filter((node) => node.type === 'Evidence').length, 20);
  renderGroup()
    .find((node) => node.props.count === 23 && node.props.size === 20)
    .props.onChange(1);
  const lastPage = renderGroup().filter((node) => node.type === 'Evidence');
  assert.equal(lastPage.length, 3);
  assert.equal(lastPage[0].props.entityContext.sourceText, 'Sentence 20');
});

test('entity verification keeps the original endpoint order and shows pending or failed details through the shared card', () => {
  for (const failed of [false, true]) {
    const fixture = resultFixture();
    const candidate = fixture.result.candidates[0];
    candidate.observations.length = 1;
    candidate.validations = failed
      ? [
          {
            ...candidate.validations[0],
            verdict: 'unverified',
            skipReason: 'model-error',
            scores: undefined,
            error: 'Inference failed',
          },
        ]
      : [];
    const index = resultIndex.createRelationResultsIndex(fixture.entities.entities, [candidate]);
    const relationship = index.entities.get('indexeddb').relationships.get(candidate.id);
    const cardProps = entityEvidenceProps({
      relationship,
      sentence: relationship.sentences[0],
      entityKey: 'indexeddb',
      entities: index.entities,
      onSelectEntity: () => {},
    });
    assert.equal(cardProps.observation, candidate.observations[0]);
    if (failed) assert.equal(cardProps.validation, candidate.validations[0]);
    const sharedUI = ui('components/RelationEvidenceSection.tsx');
    const render = () =>
      elements(sharedUI.render(() => sharedUI.module.RelationEvidenceSection(cardProps)));
    const title = render().find((node) => node.type === 'SentenceText');
    assert.equal(title.props.text, 'ORAMA uses IndexedDB.');
    assert.equal(title.props.entityKey, 'indexeddb');
    assert.equal(title.props.relatedEntityKey, 'orama');
    assert.equal(title.props.linkCurrentEntity, false);
    assert.equal(render().filter((node) => node.type === 'IconButton').length, 1);
    render()
      .find((node) => node.props.accessibilityLabel === 'Preview')
      .props.onPress();
    assert.equal(render().find((node) => node.type === 'DetailField').props.label, 'Entity');
    assert.ok(render().some((node) => node.type === 'NameLink' && node.props.name === 'Orama'));
    assert.ok(
      JSON.stringify(render()).includes(failed ? 'Inference failed' : 'Waiting for validation')
    );
  }
});

test('source-type controls toggle multiple selections, clear with All and count each keyword once per type', () => {
  const counts = sourceTypes.countRelationSourceTypes([['title', 'bold', 'bold'], ['heading'], []]);
  assert.equal(counts.all, 3);
  assert.equal(counts.bold, 1);
  const screen = ui('components/AnalysisFilter.tsx');
  let selected = ['bold'];
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.AnalysisFilter({
          value: selected,
          counts,
          label: 'Category',
          labels: sourceTypes.relationSourceTypeLabels,
          onChange: (value) => {
            selected = value;
          },
        })
      )
    );
  const chips = render().filter((node) => node.type === 'Chip');
  const chip = (label) => render().find((node) => node.props.accessibilityLabel === label);
  assert.equal(chips.length, 9);
  assert.equal(
    chips.find((node) => node.props.accessibilityLabel === 'Bold text').props.accessibilityState
      .selected,
    true
  );
  assert.ok(
    chips
      .find((node) => node.props.accessibilityLabel === 'Bold text')
      .props.children.includes(' · 1')
  );
  chips.find((node) => node.props.accessibilityLabel === 'Note').props.onPress();
  assert.deepEqual(selected, ['bold', 'title']);
  assert.equal(chip('Bold text').props.accessibilityState.selected, true);
  assert.equal(chip('Note').props.accessibilityState.selected, true);
  chip('Bold text').props.onPress();
  assert.deepEqual(selected, ['title']);
  chip('Note').props.onPress();
  assert.deepEqual(selected, []);
  assert.equal(chip('All').props.accessibilityState.selected, true);
  chip('Bold text').props.onPress();
  chip('Note').props.onPress();
  chip('All').props.onPress();
  assert.deepEqual(selected, []);
});

test('entity-type badges filter keyword results together with source filters and source notes', () => {
  const inventory = [
    ['Sprint 1', 'Sprint {{NUM}}', 'title'],
    ['API: Read', 'API:{{TEXT}}', 'bold'],
    ['Task row', '{{TABLE_RECORD}}', 'table-cell'],
    ['Task: Restore', 'Task: {{TABLE_RECORD}}', 'table-cell'],
    ['Plain', null, 'bold'],
  ];
  const details = Object.fromEntries(
    inventory.map(([text, , kind]) => [
      text.toLowerCase(),
      {
        sources: (text === 'API: Read' ? ['bold', 'title'] : [kind]).map((kind) => ({
          noteTitle: 'Folder/One',
          kind,
          keyword: text,
          section: '',
          text,
        })),
        sentences: [],
      },
    ])
  );
  const analysis = {
    status: 'completed',
    entities: {
      entities: inventory.map(([text, type]) => ({ text, type, noteCount: 1, mentionCount: 1 })),
      details,
    },
  };
  const screen = ui('screens/RelationResultsSection.tsx');
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  const filter = (label) =>
    render().find((node) => node.type === 'Filter' && node.props.label === label);
  const names = () =>
    render()
      .filter((node) => node.type === 'NameLink')
      .map((node) => node.props.name);
  assert.deepEqual(entityTypes.countRelationEntityTypes(inventory.map(([, type]) => type)), {
    all: 5,
    numeric: 1,
    prefix: 2,
    'table-record': 1,
    untyped: 1,
  });
  assert.equal(Object.keys(filter('Entity type').props.labels).length, 4);
  filter('Entity type').props.onChange(['numeric']);
  assert.deepEqual(names(), ['Sprint 1']);
  filter('Entity type').props.onChange(['numeric', 'prefix']);
  assert.deepEqual(names(), ['API: Read', 'Sprint 1', 'Task: Restore']);
  filter('Keyword source').props.onChange(['bold']);
  assert.deepEqual(names(), ['API: Read']);
  assert.equal(filter('Entity type').props.counts.all, 2);
  const operator = (label, value) =>
    render().find((node) => node.props.accessibilityLabel === `${label} ${value}`);
  assert.equal(operator('Keyword source', 'OR').props.accessibilityState.selected, true);
  assert.equal(operator('Entity type', 'OR').props.accessibilityState.selected, true);
  operator('Entity type', 'AND').props.onPress();
  assert.deepEqual(
    names(),
    [],
    'a single-valued entity type cannot satisfy two different required types'
  );
  operator('Entity type', 'OR').props.onPress();
  assert.deepEqual(names(), ['API: Read']);
  filter('Entity type').props.onChange([]);
  assert.deepEqual(names(), ['API: Read', 'Plain']);
  filter('Keyword source').props.onChange(['bold', 'title']);
  assert.deepEqual(names(), ['API: Read', 'Plain', 'Sprint 1']);
  operator('Keyword source', 'AND').props.onPress();
  assert.deepEqual(
    names(),
    ['API: Read'],
    'source AND requires every selected origin on the same keyword'
  );
  assert.equal(filter('Entity type').props.counts.all, 1);
  assert.equal(
    operator('Entity type', 'OR').props.accessibilityState.selected,
    true,
    'operators are independent'
  );
  render()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  render()
    .find((node) => node.props.accessibilityLabel === 'Keyword')
    .props.onPress();
  assert.equal(operator('Keyword source', 'AND').props.accessibilityState.selected, true);
  assert.deepEqual(names(), ['API: Read']);
  render()
    .find((node) => node.type === 'Input')
    .props.onChangeText('Task');
  assert.deepEqual(names(), [], 'search remains an additional condition');
  filter('Keyword source').props.onChange([]);
  assert.deepEqual(names(), ['Task row', 'Task: Restore'], 'All is unrestricted even in AND mode');
  render()
    .find((node) => node.type === 'Input')
    .props.onChangeText('');
  assert.equal(names().length, 5);

  const entity = resultIndex
    .createRelationResultsIndex(
      [{ text: 'Task row', type: '{{TABLE_RECORD}}', noteCount: 1, mentionCount: 2 }],
      [],
      {
        'task row': {
          sources: [
            {
              noteTitle: 'Folder/One',
              kind: 'table-cell',
              keyword: 'Task row',
              section: '',
              text: 'A',
            },
            {
              noteTitle: 'Folder/Two',
              kind: 'table-cell',
              keyword: 'Task row',
              section: '',
              text: 'B',
            },
          ],
          sentences: [],
        },
      }
    )
    .entities.get('task row');
  const provenance = ui('components/EntityProvenanceSection.tsx');
  const renderSources = () =>
    elements(provenance.render(() => provenance.module.EntityProvenanceSection({ entity })));
  const typeFilter = () =>
    renderSources().find((node) => node.type === 'Filter' && node.props.label === 'Entity type');
  const cards = () => renderSources().filter((node) => node.type === 'SourceNoteCard');
  assert.equal(typeFilter().props.counts['table-record'], 2);
  assert.equal(cards().length, 2);
  typeFilter().props.onChange(['untyped']);
  assert.equal(cards().length, 0);
  const sourceFilter = () =>
    renderSources().find((node) => node.type === 'Filter' && node.props.label === 'Keyword source');
  const sourceOperator = (label, value) =>
    renderSources().find((node) => node.props.accessibilityLabel === `${label} ${value}`);
  typeFilter().props.onChange(['untyped', 'table-record']);
  assert.equal(cards().length, 2);
  sourceOperator('Entity type', 'AND').props.onPress();
  assert.equal(cards().length, 0);
  sourceOperator('Entity type', 'OR').props.onPress();
  assert.equal(cards().length, 2);
  sourceFilter().props.onChange(['bold']);
  assert.equal(cards().length, 0, 'the two filter groups still combine with AND');
  sourceFilter().props.onChange(['bold', 'table-cell']);
  assert.equal(cards().length, 2);
  sourceOperator('Keyword source', 'AND').props.onPress();
  assert.equal(cards().length, 0, 'a note must contain all selected source types');
  sourceOperator('Keyword source', 'OR').props.onPress();
  assert.equal(cards().length, 2);
  sourceFilter().props.onChange([]);
  typeFilter().props.onChange([]);
  assert.equal(cards().length, 2);
});

test('entity source-type filters compose with search, reset pagination and survive detail navigation', () => {
  const inventory = Array.from({ length: 26 }, (_, i) => ({
    text: `Keyword${String.fromCharCode(65 + i)}`,
    type: null,
    noteCount: 3,
    mentionCount: 3,
  }));
  const details = Object.fromEntries(
    inventory.map((entity, i) => [
      entity.text.toLowerCase(),
      {
        sources: (i === 0 ? ['heading', 'heading', 'bold'] : [i < 23 ? 'heading' : 'bold']).map(
          (kind) => ({
            noteTitle: 'Folder/One',
            kind,
            keyword: entity.text,
            section: 'Storage',
            text: entity.text,
          })
        ),
        sentences: [],
      },
    ])
  );
  const analysis = { status: 'completed', entities: { entities: inventory, details } };
  const screen = ui('screens/RelationResultsSection.tsx');
  const render = () =>
    elements(screen.render(() => screen.module.RelationResultsSection({ analysis })));
  const filter = () => render().find((node) => node.type === 'Filter');
  const names = () => render().filter((node) => node.type === 'NameLink');
  assert.equal(filter().props.counts.all, 26);
  assert.equal(filter().props.counts.heading, 23);
  assert.equal(filter().props.counts.bold, 4);
  filter().props.onChange(['heading']);
  assert.equal(names().length, 20);
  render()
    .find((node) => node.props.count === 23 && node.props.size === 20)
    .props.onChange(1);
  assert.equal(names().length, 3);
  render()
    .find((node) => node.props.accessibilityLabel === 'Relationship list')
    .props.onPress();
  render()
    .find((node) => node.props.accessibilityLabel === 'Keyword')
    .props.onPress();
  assert.deepEqual(filter().props.value, ['heading']);
  assert.equal(
    render().find((node) => node.props.count === 23 && node.props.size === 20).props.page,
    1,
    'the keyword section retains its own page after remount'
  );
  assert.equal(names().length, 3);
  filter().props.onChange(['heading', 'bold']);
  assert.equal(names().length, 20);
  assert.equal(
    render().find((node) => node.props.count === 26 && node.props.size === 20).props.page,
    0
  );
  filter().props.onChange(['bold']);
  assert.equal(names().length, 4);
  assert.equal(
    render().find((node) => node.props.count === 4 && node.props.size === 20).props.page,
    0
  );
  names()[0].props.onPress();
  assert.equal(render().find((node) => node.type === 'EntityDetail').props.entity.text, 'KeywordA');
  render()
    .find((node) => node.props.accessibilityLabel === 'Keyword')
    .props.onPress();
  assert.deepEqual(filter().props.value, ['bold']);
  render()
    .find((node) => node.type === 'Input')
    .props.onChangeText('KeywordA');
  assert.deepEqual(
    names().map((node) => node.props.name),
    ['KeywordA']
  );
  assert.equal(filter().props.counts.heading, 1);
  assert.equal(filter().props.counts.bold, 1);
  filter().props.onChange(['title']);
  assert.equal(names().length, 0);
  assert.ok(JSON.stringify(render()).includes('No matching analysis results.'));
  filter().props.onChange([]);
  assert.deepEqual(
    names().map((node) => node.props.name),
    ['KeywordA']
  );
});

test('source filtering groups complete note paths and independently paginates nested entries', () => {
  const entry = (noteTitle, kind, index) => ({
    noteTitle,
    kind,
    keyword: 'Orama',
    section: 'Storage',
    sectionPath: ['Storage'],
    text: `${kind} source ${index}`,
  });
  const sources = [
    ...Array.from({ length: 12 }, (_, i) => entry('Folder/One', 'bold', i)),
    entry('Folder/One', 'heading', 12),
    entry('Elsewhere/One', 'bold', 13),
    entry('Elsewhere/One', 'bold', 14),
    entry('Elsewhere/One', 'link', 15),
    ...Array.from({ length: 12 }, (_, i) => entry(`Note ${i}`, 'heading', 16 + i)),
  ];
  const entity = resultIndex
    .createRelationResultsIndex(
      [{ text: 'Orama', type: null, noteCount: 14, mentionCount: sources.length }],
      [],
      { orama: { sources, sentences: [] } }
    )
    .entities.get('orama');
  const screen = ui('components/EntityProvenanceSection.tsx');
  const render = () =>
    elements(screen.render(() => screen.module.EntityProvenanceSection({ entity })));
  const cards = () => render().filter((node) => node.type === 'SourceNoteCard');
  const filter = () => render().find((node) => node.type === 'Filter');
  assert.equal(filter().props.counts.all, 28);
  assert.equal(filter().props.counts.bold, 14);
  assert.equal(cards().length, 10);
  assert.equal(new Set(cards().map((node) => node.props.noteTitle)).size, 10);
  const folder = cards().find((node) => node.props.noteTitle === 'Folder/One');
  assert.equal(folder.props.sources.length, 13);
  assert.ok(folder.props.sources.every((source) => source.noteTitle === 'Folder/One'));
  const noteUI = ui('components/EntityProvenanceSection.tsx');
  const renderNote = (props = folder.props) =>
    elements(noteUI.render(() => noteUI.module.KeywordSourceNoteCard(props)));
  assert.equal(renderNote().filter((node) => node.props.label === 'Note').length, 1);
  assert.equal(renderNote().filter((node) => node.props.label === 'Category').length, 10);
  renderNote()
    .find((node) => node.props.count === 13 && node.props.size === 10)
    .props.onChange(1);
  assert.equal(renderNote().filter((node) => node.props.label === 'Category').length, 3);
  entity.sources = [...entity.sources];
  const updatedFolder = cards().find((node) => node.props.noteTitle === 'Folder/One');
  assert.equal(
    screen.components.get('KeywordSourceNoteCard'),
    screen.module.KeywordSourceNoteCard,
    'the card component identity survives a parent rerender'
  );
  assert.equal(updatedFolder.props.key, folder.props.key);
  const updatedNote = renderNote(updatedFolder.props);
  assert.equal(updatedNote.find((node) => node.props.count === 13).props.page, 1);
  assert.equal(updatedNote.filter((node) => node.props.label === 'Category').length, 3);
  assert.equal(
    renderNote({ ...folder.props, sources: folder.props.sources.slice(0, 2) }).find(
      (node) => node.props.count === 2
    ).props.page,
    0
  );
  render()
    .find((node) => node.props.count === 14 && node.props.size === 10)
    .props.onChange(1);
  assert.equal(cards().length, 4);
  filter().props.onChange(['bold']);
  assert.equal(cards().length, 2);
  assert.deepEqual(
    cards()
      .map((node) => node.props.sources.length)
      .sort((a, b) => a - b),
    [2, 12]
  );
  assert.ok(cards().every((node) => node.props.sources.every((source) => source.kind === 'bold')));
  assert.equal(
    render().find((node) => node.props.count === 2 && node.props.size === 10).props.page,
    0
  );
  filter().props.onChange(['bold', 'link']);
  assert.equal(cards().length, 2);
  assert.equal(
    cards().reduce((sum, node) => sum + node.props.sources.length, 0),
    15
  );
  filter().props.onChange(['link']);
  assert.equal(cards().length, 1);
  assert.equal(cards()[0].props.noteTitle, 'Elsewhere/One');
  filter().props.onChange(['title']);
  assert.equal(cards().length, 0);
  assert.ok(JSON.stringify(render()).includes('No matching analysis results.'));
  filter().props.onChange(['bold', 'heading']);
  render()
    .find((node) => node.props.accessibilityLabel === 'Keyword source AND')
    .props.onPress();
  assert.deepEqual(
    cards().map((node) => node.props.noteTitle),
    ['Folder/One']
  );
  assert.equal(cards()[0].props.sources.length, 13);
  assert.deepEqual(
    new Set(cards()[0].props.sources.map((source) => source.kind)),
    new Set(['bold', 'heading'])
  );
  assert.equal(
    render().find((node) => node.props.count === 1 && node.props.size === 10).props.page,
    0
  );
  render()
    .find((node) => node.props.accessibilityLabel === 'Keyword source OR')
    .props.onPress();
  assert.equal(cards().length, 10);
  assert.equal(
    render().find((node) => node.props.count === 14 && node.props.size === 10).props.page,
    0
  );
});

test('inline keywords preserve the complete sentence, longest matches and original keyword identities', () => {
  const names = ['Orama', 'React', 'React Native', 'C++', '소라', '한빛', '2023년', '2024년'];
  const { entities } = resultIndex.createRelationResultsIndex(
    names.map((text) => ({
      text,
      type: null,
      noteCount: 3,
      mentionCount: 3,
    })),
    []
  );
  const screen = ui('components/RelationEvidenceSection.tsx');
  const selected = [];
  const text =
    'ORAMA uses React Native, not Reactivity; React Native uses C++. 소라는 한빛에서 근무한다. 2023년 / 2024년.';
  const tree = screen.render(() =>
    screen.module.AnalysisSentenceText({
      text,
      entityKey: 'orama',
      relatedEntityKey: 'react native',
      entities,
      onSelectEntity: (key) => selected.push(key),
    })
  );
  const readText = (node) =>
    Array.isArray(node)
      ? node.map(readText).join('')
      : typeof node === 'string'
      ? node
      : node?.props
      ? readText(node.props.children)
      : '';
  assert.equal(readText(tree), text);
  const nodes = elements(tree);
  const links = nodes.filter((node) => node.props.accessibilityRole === 'link');
  assert.deepEqual(
    links.map((node) => node.props.accessibilityLabel),
    ['React Native', 'React Native']
  );
  links[0].props.onPress();
  const numeric = screen.render(() =>
    screen.module.AnalysisSentenceText({
      text,
      entityKey: 'orama',
      relatedEntityKey: '2024년',
      entities,
      onSelectEntity: (key) => selected.push(key),
    })
  );
  const numericLinks = elements(numeric).filter((node) => node.props.accessibilityRole === 'link');
  assert.deepEqual(
    numericLinks.map((node) => node.props.accessibilityLabel),
    ['2024년']
  );
  numericLinks[0].props.onPress();
  assert.deepEqual(selected, ['react native', '2024년']);
  const shorter = screen.render(() =>
    screen.module.AnalysisSentenceText({
      text,
      entityKey: 'orama',
      relatedEntityKey: 'react',
      entities,
      onSelectEntity: (key) => selected.push(key),
    })
  );
  assert.equal(
    elements(shorter).filter((node) => node.props.accessibilityRole === 'link').length,
    0
  );
  assert.equal(nodes.find((node) => readText(node) === 'ORAMA').props.onPress, undefined);
  const relationTitle = screen.render(() =>
    screen.module.AnalysisSentenceText({
      text,
      entityKey: 'orama',
      relatedEntityKey: 'react native',
      entities,
      onSelectEntity: (key) => selected.push(key),
      linkCurrentEntity: true,
    })
  );
  const endpoints = elements(relationTitle).filter(
    (node) => node.props.accessibilityRole === 'link'
  );
  assert.deepEqual(
    endpoints.map((node) => node.props.accessibilityLabel),
    ['ORAMA', 'React Native', 'React Native']
  );
  endpoints[0].props.onPress();
  assert.equal(selected.at(-1), 'orama');
  const body = screen.render(() =>
    screen.module.AnalysisSentenceText({
      text,
      entityKey: 'orama',
      relatedEntityKey: 'react native',
      entities,
      onSelectEntity: (key) => selected.push(key),
      variant: 'body',
    })
  );
  assert.equal(body.props.accessibilityRole, undefined);
  assert.equal(readText(body), text);
  assert.deepEqual(
    elements(body)
      .filter((node) => node.props.accessibilityRole === 'link')
      .map((node) => node.props.accessibilityLabel),
    ['React Native', 'React Native']
  );
});

test('section links open the paragraph and parent heading, preserving slashes inside a heading', () => {
  const screen = ui('components/AnalysisSectionLink.tsx');
  const render = (section, sectionPath) =>
    screen.render(() =>
      screen.module.AnalysisSectionLink({
        noteTitle: 'Folder/One',
        section,
        sectionPath,
      })
    );
  render('Platform / Deploy / Infra', ['Platform', 'Deploy / Infra']).props.onPress();
  render('Storage').props.onPress();
  assert.deepEqual(screen.routes, [
    ['NotePage', { title: 'Folder/One', paragraph: 'Deploy / Infra', section: 'Platform' }],
    ['NotePage', { title: 'Folder/One', paragraph: 'Storage' }],
  ]);
  assert.deepEqual(screen.navigationMethods, ['push', 'push']);
  assert.equal(render('').type, 'Text');
  assert.equal(render('').props.onPress, undefined);
});

test('pattern deltas and four inference metrics stay inside a non-shrinking analysis card', () => {
  const layout = loadTs('styles.ts', {
    'react-native': { StyleSheet: { create: (value) => value } },
  });
  const screen = ui('screens/AnalysisProgressSection.tsx', { '../styles': layout });
  const analysis = {
    status: 'ready',
    prepareOnly: true,
    phase: 'validation',
    processed: 0,
    total: 10,
    savedBatch: 0,
    modelChecks: 0,
    reused: 0,
    failed: 0,
    elapsedMs: 0,
    patternChanges: { added: 2, removed: 1 },
  };
  const tree = screen.render(() =>
    screen.module.AnalysisProgressSection({
      analysis,
      noteCount: 5,
      ready: true,
      loading: false,
      refresh: () => {},
    })
  );
  assert.ok(tree.props.style.includes(layout.relationAnalysisStyles.progressPanel));
  assert.equal(layout.relationAnalysisStyles.progressPanel.flexShrink, 0);
  const nodes = elements(tree);
  const track = nodes.find((node) =>
    node.props.style?.includes?.(layout.relationAnalysisStyles.progressTrack)
  );
  assert.equal(
    layout.relationAnalysisStyles.progressTrack.height,
    8,
    'Paper web height 100% must resolve inside a fixed-height wrapper'
  );
  assert.ok(elements(track).some((node) => node.type === 'Progress'));
  assert.ok(
    nodes.some((node) => node.type === 'Text' && node.props.children.includes('(+2 / −1)'))
  );
  const metrics = nodes.find((node) => node.props.style === layout.relationAnalysisStyles.metrics);
  const cells = metrics.props.children.flat();
  assert.equal(cells.length, 4);
  assert.deepEqual(
    cells.map((cell) => elements(cell).find((node) => node.type === 'Text').props.children[0]),
    ['Source Notes', 'Keyword', 'Relationship patterns', 'Saved batches']
  );
  assert.equal(elements(metrics).filter((node) => node.type === 'Icon').length, 0);
  assert.ok(
    elements(cells[2]).some(
      (node) => node.type === 'Text' && node.props.children.includes('(+2 / −1)')
    )
  );
  assert.ok(
    !elements(cells[0]).some(
      (node) => node.type === 'Text' && node.props.children.includes('(+2 / −1)')
    )
  );
  analysis.patternChanges = { added: 0, removed: 0 };
  const updated = screen.render(() =>
    screen.module.AnalysisProgressSection({
      analysis,
      noteCount: 5,
      ready: true,
      loading: false,
      refresh: () => {},
    })
  );
  const updatedMetrics = elements(updated).find(
    (node) => node.props.style === layout.relationAnalysisStyles.metrics
  );
  assert.ok(
    elements(updatedMetrics.props.children.flat()[2]).some(
      (node) => node.type === 'Text' && node.props.children.includes('(+0 / −0)')
    )
  );
  const grid = nodes.find((node) =>
    node.props.style?.includes?.(layout.relationAnalysisStyles.statsGrid)
  );
  const labels = elements(grid)
    .filter((node) => node.type === 'Text')
    .map((node) => node.props.children[0]);
  assert.deepEqual(labels, [
    'Model calls',
    '0',
    'Reused inputs',
    '0',
    'Failed validations',
    '0',
    'Elapsed seconds',
    '0.0',
  ]);
});

test('evidence has its judgment badge before the linked title, without an entity subtitle, and retains expanded sources and scores', () => {
  const screen = ui('components/RelationEvidenceSection.tsx');
  const fixture = resultFixture();
  const { entities } = resultIndex.createRelationResultsIndex(
    fixture.entities.entities,
    fixture.result.candidates
  );
  const selected = [];
  const validation = {
    verdict: 'supported',
    noteTitle: 'Folder/Original',
    evidence: 'Original evidence',
    hypothesis: 'Hypothesis',
    hypothesisSource: {
      noteTitle: 'Folder/Pattern',
      section: 'Patterns / Predicate / uses',
      sectionPath: ['Patterns', 'Predicate / uses'],
    },
    scores: { entailment: 0.9, neutral: 0.08, contradiction: 0.02 },
  };
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.RelationEvidenceSection({
          template: '{{E2}} is used by {{E1}}; {{E1}} again.',
          validation,
          observation: {
            ...resultFixture().result.candidates[0].observations[0],
            evidence: validation.evidence,
            noteTitle: validation.noteTitle,
            section: 'Platform / Storage',
            sectionPath: ['Platform', 'Storage'],
          },
          entities,
          onSelectEntity: (key) => selected.push(key),
        })
      )
    );
  const toggle = () =>
    render().find(
      (node) => node.type === 'IconButton' && node.props.accessibilityLabel === 'Preview'
    );
  const nodes = render();
  const title = nodes.find((node) => node.type === 'SentenceText');
  assert.equal(title.props.linkCurrentEntity, true);
  assert.deepEqual([title.props.entityKey, title.props.relatedEntityKey], ['orama', 'indexeddb']);
  assert.equal(nodes.filter((node) => node.type === 'DetailField').length, 0);
  const verdict = nodes.find((node) => node.type === 'VerdictBadge');
  assert.equal(verdict.props.verdict, 'supported');
  assert.ok(nodes.indexOf(verdict) < nodes.indexOf(title));
  const badgeUI = ui('components/RelationEvidenceSection.tsx');
  const badge = badgeUI.render(() => badgeUI.module.AnalysisVerdictBadge(verdict.props));
  assert.equal(badge.props.accessibilityLabel, 'Judgment: Supported');
  assert.ok(badge.props.children.includes('Supported'));
  assert.equal(badge.props.icon, 'check-circle-outline');
  assert.equal(badge.props.onPress, undefined);
  assert.equal(
    nodes.filter((node) => node.type === 'NameLink').length,
    0,
    'entity names remain links in the title without a separate subtitle'
  );
  assert.equal(nodes.filter((node) => node.type === 'SectionLink').length, 0);
  title.props.onSelectEntity('orama');
  title.props.onSelectEntity('indexeddb');
  assert.deepEqual(selected, ['orama', 'indexeddb']);
  assert.equal(title.props.text, 'IndexedDB is used by ORAMA; ORAMA again.');
  assert.ok(!JSON.stringify(nodes).includes(validation.evidence));
  assert.ok(!JSON.stringify(nodes).includes(validation.hypothesis));
  assert.equal(toggle().props.accessibilityState.expanded, false);
  toggle().props.onPress();
  assert.equal(toggle().props.accessibilityState.expanded, true);
  const fields = render().filter((node) => node.type === 'DetailField');
  for (const label of ['Source text', 'Validation statement']) {
    const group = fields.find((node) => node.props.label === label);
    assert.deepEqual(
      elements(group.props.children)
        .filter((node) => node.type === 'DetailField')
        .map((node) => node.props.label),
      ['Note', 'Paragraph']
    );
  }
  const order = fields.find((node) => node.props.label === 'Entity order');
  assert.ok(
    elements(order).some(
      (node) =>
        node.type === 'Text' &&
        node.props.children.includes(
          'Entities follow the source text order; direction is not inferred.'
        )
    )
  );
  assert.deepEqual(render().find((node) => node.type === 'SectionLink').props.sectionPath, [
    'Platform',
    'Storage',
  ]);
  for (const label of [
    'Source text',
    'Note',
    'Validation statement',
    'Note',
    'Paragraph',
    'Judgment',
  ])
    assert.ok(render().some((node) => node.type === 'DetailField' && node.props.label === label));
  assert.ok(
    render().some(
      (node) =>
        node.type === 'SentenceText' &&
        node.props.variant === 'body' &&
        node.props.text === validation.evidence
    )
  );
  assert.ok(
    !render().some(
      (node) => node.type === 'DetailField' && node.props.label === 'Relationship name'
    )
  );
  assert.equal(render().find((node) => node.type === 'VerdictBadge').props.verdict, 'supported');
  render()
    .find((node) => node.type === 'NameLink' && node.props.name === validation.noteTitle)
    .props.onPress();
  assert.deepEqual(screen.routes, [['NotePage', { title: validation.noteTitle }]]);
  render()
    .find((node) => node.type === 'NameLink' && node.props.name === 'Folder/Pattern')
    .props.onPress();
  assert.deepEqual(screen.routes.at(-1), ['NotePage', { title: 'Folder/Pattern' }]);
  assert.equal(screen.navigationMethods.at(-1), 'push');
  const hypothesisSection = render().find(
    (node) => node.type === 'SectionLink' && node.props.noteTitle === 'Folder/Pattern'
  );
  assert.deepEqual(hypothesisSection.props.sectionPath, ['Patterns', 'Predicate / uses']);
  assert.ok(JSON.stringify(render()).includes(validation.hypothesis));
  assert.ok(
    render().some((node) => node.type === 'Text' && node.props.children.join('').includes('90.0%'))
  );
  toggle().props.onPress();
  assert.ok(!JSON.stringify(render()).includes(validation.hypothesis));
  assert.ok(!JSON.stringify(render()).includes(validation.evidence));
  assert.equal(
    render().find((node) => node.type === 'SentenceText').props.text,
    'IndexedDB is used by ORAMA; ORAMA again.'
  );
  assert.equal(render().filter((node) => node.type === 'DetailField').length, 0);
  assert.equal(render().find((node) => node.type === 'VerdictBadge').props.verdict, 'supported');
  assert.equal(render().filter((node) => node.type === 'SectionLink').length, 0);
  assert.equal(render().filter((node) => node.type === 'NameLink').length, 0);
});

test('pending evidence reveals its reason on expand without an empty validation statement', () => {
  const screen = ui('components/RelationEvidenceSection.tsx');
  const render = () =>
    elements(
      screen.render(() =>
        screen.module.RelationEvidenceSection({
          template: '{{E1}} uses {{E2}}.',
          observation: {
            ...resultFixture().result.candidates[0].observations[0],
            noteTitle: 'Pending note',
            evidence: 'Unvalidated source',
          },
          entities: new Map(),
          onSelectEntity: () => {},
          validation: {
            noteTitle: 'Pending note',
            evidence: 'Unvalidated source',
            hypothesis: '',
            verdict: 'unverified',
            skipReason: 'pending',
          },
        })
      )
    );
  assert.ok(!JSON.stringify(render()).includes('Unvalidated source'));
  assert.equal(
    render().find((node) => node.type === 'SentenceText').props.text,
    'ORAMA uses IndexedDB.'
  );
  const verdict = render().find((node) => node.type === 'VerdictBadge');
  assert.equal(verdict.props.verdict, 'unverified');
  assert.ok(!JSON.stringify(render()).includes('Waiting for validation'));
  render()
    .find((node) => node.props.accessibilityLabel === 'Preview')
    .props.onPress();
  assert.ok(JSON.stringify(render()).includes('Waiting for validation'));
  assert.ok(JSON.stringify(render()).includes('Unvalidated source'));
  assert.ok(
    !render().some(
      (node) => node.type === 'DetailField' && node.props.label === 'Validation statement'
    )
  );
});

test('icon controls retain accessible names, disabled state and usable targets without tooltips', () => {
  const layout = loadTs('styles.ts', {
    'react-native': { StyleSheet: { create: (value) => value } },
  });
  const action = ui('components/AnalysisAction.tsx', { '../styles': layout });
  let presses = 0;
  const button = action.render(() =>
    action.module.AnalysisAction({
      label: 'Next',
      icon: 'chevron-right',
      disabled: true,
      onPress: () => presses++,
      accessibilityState: { expanded: false },
    })
  );
  assert.equal(button.type, 'IconButton');
  assert.equal(button.props.accessibilityLabel, 'Next');
  assert.equal(button.props.disabled, true);
  assert.deepEqual(button.props.accessibilityState, { expanded: false });
  assert.ok(button.props.style.minWidth >= 44);
  assert.ok(button.props.style.minHeight >= 44);
  button.props.onPress();
  assert.equal(presses, 1);
  const fields = ui('components/AnalysisDetailField.tsx');
  const row = fields.render(() =>
    fields.module.AnalysisDetailField({ label: 'Note', children: 'Source' })
  );
  const counter = elements(row).find((node) => node.props.accessibilityLabel === 'Note');
  assert.equal(counter.props.accessible, true);
  assert.equal(
    elements(counter).find((node) => node.type === 'Icon').props.source,
    'file-document-outline'
  );
  assert.deepEqual(
    elements(counter).filter((node) => node.type === 'Text'),
    []
  );
});
