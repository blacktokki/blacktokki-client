const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('./loadTs.cjs');
const { hookHarness, elements } = require('./hookHarness.cjs');

const { addKeywordRelationGraph } = load('graph.ts');
const { getKnowledgeGraphPalette, getKeywordRelationColors } = load('../utils/palette.ts');
const palette = getKnowledgeGraphPalette(false);
const relationColors = getKeywordRelationColors(false);
const translate = (key) => key;
const note = (id, noteTitle) => ({
  id,
  noteTitle,
  name: noteTitle,
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  properties: {},
  x: 20,
  y: 30,
  vx: 0,
  vy: 0,
  radius: 9,
  color: 'blue',
});
function fixture() {
  const source = {
    noteTitle: 'Folder/One',
    section: 'Inner / Name',
    sectionPath: ['Root', 'Inner / Name'],
  };
  const extraction = {
    entities: ['Task 1', 'Task 2', 'Beta', 'Isolated'].map((text) => ({
      text,
      type: text.startsWith('Task') ? 'Task {{NUM}}' : null,
      noteCount: 3,
      mentionCount: 4,
    })),
    details: { 'task 1': { sources: [source, source], sentences: [] } },
  };
  const candidate = {
    id: 'same-label-different-pairs',
    label: 'uses',
    observations: [
      ['Task 1', 'Beta'],
      ['TASK 1', 'Beta'],
      ['Task 2', 'Beta'],
    ].map(([from, target]) => ({ ...source, source: from, target })),
    validations: [{ verdict: 'supported' }, { verdict: 'supported' }, { verdict: 'contradicted' }],
  };
  const graph = { nodes: [note('source', 'Folder/One')], edges: [], axioms: { violations: [] } };
  return { source, extraction, candidate, graph };
}

test('keyword projection preserves original names and source nodes and aggregates each pair independently', () => {
  const { graph, extraction, candidate } = fixture();
  const original = structuredClone({ graph, extraction, candidate });
  const result = addKeywordRelationGraph(graph, extraction, [candidate], palette, relationColors);
  assert.deepEqual({ graph, extraction, candidate }, original);
  assert.equal(result.nodes[0], graph.nodes[0]);
  const keywords = result.nodes.filter((node) => node.instanceKind === 'KEYWORD');
  assert.equal(keywords.length, 4);
  assert.equal(new Set(keywords.map((node) => node.id)).size, 4);
  assert.ok(
    keywords.every((node) => node.noteTitle === '' && Object.keys(node.properties).length === 0)
  );
  const task1 = keywords.find((node) => node.name === 'Task 1');
  assert.equal(task1.keyword.sources.length, 1);
  const relations = result.edges.filter((edge) => edge.type === 'KEYWORD_RELATION');
  assert.equal(relations.length, 2);
  const supported = relations.find((edge) => edge.source === task1.id);
  assert.equal(supported.keywordRelation.verdict, 'supported');
  assert.equal(supported.keywordRelation.observations, 2);
  assert.equal(supported.dashed, false);
  assert.equal(supported.directed, false);
  assert.equal(supported.label, 'uses');
  assert.equal(supported.propertyLabel, undefined);
  assert.equal(supported.color, relationColors.supported);
  assert.equal(
    relations.find((edge) => edge !== supported).keywordRelation.verdict,
    'contradicted'
  );
  const contradicted = relations.find((edge) => edge !== supported);
  assert.ok(contradicted.dashed);
  assert.equal(contradicted.color, relationColors.contradicted);
  assert.notEqual(contradicted.color, supported.color);
  assert.equal(
    result.edges.filter((edge) => edge.type === 'KEYWORD_SOURCE' && edge.source === task1.id)
      .length,
    1
  );
});

test('only support and contradiction survive, keeping both judgments for one pair without dangling edges', () => {
  const { graph, extraction, candidate } = fixture();
  candidate.validations[1].verdict = 'contradicted';
  candidate.validations.length = 2;
  candidate.observations.push({ ...candidate.observations[0], target: 'Missing' });
  candidate.observations.push({ ...candidate.observations[0], target: 'Task 1' });
  for (const verdict of ['neutral', 'uncertain', 'unverified']) {
    candidate.observations.push({ ...candidate.observations[0], source: 'Task 2' });
    candidate.validations[candidate.observations.length - 1] = { verdict };
  }
  candidate.validations[3] = candidate.validations[4] = { verdict: 'supported' };
  const result = addKeywordRelationGraph(graph, extraction, [candidate], palette, relationColors);
  const relations = result.edges.filter((edge) => edge.type === 'KEYWORD_RELATION');
  assert.equal(relations.length, 2);
  assert.deepEqual(
    new Set(relations.map((edge) => edge.keywordRelation.verdict)),
    new Set(['supported', 'contradicted'])
  );
  const ids = new Set(result.nodes.map((node) => node.id));
  assert.ok(
    result.edges.every(
      (edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target
    )
  );
  assert.equal(addKeywordRelationGraph(graph, undefined, [], palette, relationColors), graph);
  const reordered = addKeywordRelationGraph(
    graph,
    { ...extraction, entities: [...extraction.entities].reverse() },
    [candidate],
    palette,
    relationColors
  );
  assert.deepEqual(
    new Set(result.nodes.map((node) => node.id)),
    new Set(reordered.nodes.map((node) => node.id))
  );
});

test('keyword visibility shares the session, composes with templates, updates results and resets on access changes', () => {
  const harness = hookHarness();
  const { graph, extraction, candidate } = fixture();
  const template = { ...note('template:one', ''), instanceKind: 'TEMPLATE', template: {} };
  const base = { ...graph, nodes: [...graph.nodes, template] };
  const session = {
    data: { scope: 'local:1:normal', available: true },
    analysis: {
      status: 'running',
      phase: 'validation',
      prepareOnly: false,
      processed: 2,
      total: 8,
      start: () => assert.fail('The graph must not start inference.'),
    },
  };
  const { useKeywordRelationGraph } = load('useKeywordRelationGraph.ts', {
    react: harness.react,
    '@blacktokki/core': { useLangContext: () => ({ lang: translate }) },
    '../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ colorScheme: 'light' }) },
    './useRelationAnalysisSession': { useRelationAnalysisSession: () => session },
    '../../../components/SearchBar': { urlToNoteLink: () => undefined },
  });
  const render = () => harness.render(() => useKeywordRelationGraph(base));
  let state = render();
  assert.equal(state.enabled, false);
  assert.equal(state.nodes, base.nodes);
  state.toggle();
  state = render();
  assert.equal(state.enabled, false);
  assert.equal(state.disabled, true);
  assert.equal(state.progress, 0.25);
  assert.equal(state.working, true);
  session.analysis.entities = extraction;
  state = render();
  assert.equal(state.count, 0);
  assert.equal(state.disabled, true);
  assert.ok(state.nodes.includes(template));
  assert.equal(state.edges.filter((edge) => edge.type === 'KEYWORD_RELATION').length, 0);
  session.analysis.result = { candidates: [candidate] };
  state = render();
  assert.equal(state.disabled, true);
  session.analysis.status = 'completed';
  state = render();
  assert.equal(state.disabled, false);
  assert.equal(state.progress, undefined);
  state.toggle();
  state = render();
  assert.equal(state.count, 4);
  const task = state.nodes.find((node) => node.name === 'Task 1');
  assert.ok(state.getNeighbors(task.id).has('source'));
  assert.ok(state.getNeighbors(task.id).has('keyword:beta'));
  session.analysis.status = 'running';
  assert.equal(render().nodes, base.nodes);
  session.analysis.status = 'completed';
  state = render();
  assert.equal(state.enabled, false);
  state.toggle();
  render();
  state = render();
  state.toggle();
  assert.equal(render().nodes, base.nodes);
  state = render();
  state.toggle();
  render();
  session.data.scope = 'local:2:private';
  assert.equal(render().enabled, false);
  state = render();
  state.toggle();
  render();
  session.data.available = false;
  assert.equal(render().nodes, base.nodes);
  session.data.available = true;
  assert.equal(render().enabled, false);
});

test('compact keyword sections deduplicate destinations, preserve source navigation and select related keywords', () => {
  const harness = hookHarness();
  const previewHarness = hookHarness();
  const { graph, extraction, candidate } = fixture();
  const result = addKeywordRelationGraph(graph, extraction, [candidate], palette, relationColors);
  const selected = [],
    routes = [];
  const node = result.nodes.find((node) => node.name === 'Task 1');
  node.keyword.sources.push({ ...node.keyword.sources[0], kind: 'bold' });
  node.keyword.sources.push({ noteTitle: 'Folder/One', section: '', sectionPath: [] });
  const native = {
    Platform: { OS: 'web' },
    Text: 'Text',
    View: 'View',
    ScrollView: 'Scroll',
    TouchableOpacity: 'Touchable',
    StyleSheet: { create: (value) => value },
  };
  const theme = { commonStyles: { text: { color: 'black' } }, colorScheme: 'light' };
  const core = { Text: 'Text', useLangContext: () => ({ lang: translate }) };
  const { KnowledgeGraphPreviewSheet } = load('../components/KnowledgeGraphPreviewSheet.tsx', {
    react: previewHarness.react,
    '@blacktokki/core': core,
    'react-native': native,
    'react-native-vector-icons/FontAwesome': 'Icon',
    '../../../components/HeaderSelectBar': { parseHtmlToParagraphs: () => [] },
    '../../../hooks/useNotebookTheme': { useNotebookTheme: () => theme },
    '../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTEBOOK' }) },
    '../inductiveTemplate/TemplateGraphDetails': { TemplateGraphDetails: 'TemplateDetails' },
    '../keywordRelation/components/KeywordGraphDetails': { KeywordGraphDetails: 'KeywordDetails' },
  });
  const preview = elements(
    previewHarness.render(() =>
      KnowledgeGraphPreviewSheet({
        node,
        allNodes: result.nodes,
        edges: result.edges,
        nhopDepth: 1,
        onChangeNhopDepth: () => {},
        onClose: () => {},
        onSelectNode: () => {},
        onOpenNode: () => {},
        onHeightChange: () => {},
      })
    )
  );
  const renderSection = preview.find((item) => item.type === 'KeywordDetails').props.renderSection;
  const { KeywordGraphDetails } = load('components/KeywordGraphDetails.tsx', {
    react: harness.react,
    '@blacktokki/core': core,
    '@blacktokki/navigation': { push: (...args) => routes.push(args) },
    '../../../../hooks/useNotebookTheme': { useNotebookTheme: () => theme },
    'react-native': native,
  });
  const tree = elements(
    harness.render(() =>
      KeywordGraphDetails({
        node,
        nodes: result.nodes,
        edges: result.edges,
        onSelectNode: (node) => selected.push(node.id),
        renderSection,
      })
    )
  );
  const lists = tree.filter((item) => item.type === 'Scroll');
  assert.equal(lists.length, 2);
  assert.ok(lists.every((item) => item.props.horizontal));
  const chips = tree.filter((item) => item.props.compact);
  assert.equal(chips.length, 3, 'different source types with the same destination share a chip');
  chips.find((item) => item.props.label === 'One').props.onPress();
  assert.deepEqual(routes[0], ['NotePage', { title: 'Folder/One' }]);
  chips.find((item) => item.props.label === 'One · Inner / Name').props.onPress();
  assert.deepEqual(routes[1], [
    'NotePage',
    { title: 'Folder/One', paragraph: 'Inner / Name', section: 'Root' },
  ]);
  const related = chips.find((item) => item.props.label === 'Beta · uses');
  related.props.onPress();
  assert.deepEqual(selected, ['keyword:beta']);
  assert.equal(related.props.textColor, relationColors.supported);
  assert.equal(related.props.accessibilityLabel, 'Beta · uses · Supported');
  assert.ok(chips.every((item) => !/Supported|Contradicted/.test(item.props.label)));
});

test('the graph screen composes both overlays and places the keyword control before the template control', () => {
  const harness = hookHarness();
  const { graph } = fixture();
  const inputs = [];
  const templates = {
    ...graph,
    available: true,
    mode: 'off',
    count: 0,
    working: false,
    error: false,
    toggle: () => {},
  };
  const keywords = {
    ...graph,
    enabled: false,
    count: 0,
    working: false,
    toggle: () => {},
    getNeighbors: (id) => new Set([id]),
  };
  const { KnowledgeGraphScreen } = load('../KnowledgeGraphScreen.tsx', {
    react: harness.react,
    '@react-navigation/native': {
      useNavigation: () => ({ push: () => {} }),
      useRoute: () => ({ params: undefined }),
    },
    'react-native': { View: 'View', Linking: {}, StyleSheet: { create: (value) => value } },
    '../../components/LoadingView': 'Loading',
    '../../components/SearchBar': { ResponsiveSearchBar: 'Search' },
    '../../hooks/useExtension': { useEffectExtensionScreen: () => {} },
    '../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: { container: {} } }),
    },
    '../../hooks/useUsageMode': {
      useUsageMode: () => ({ usageMode: 'NOTEBOOK', notebook: { id: 1 } }),
    },
    './useKnowledgeGraphData': { useKnowledgeGraphData: () => graph },
    './components/KnowledgeGraphNavToolbar': { KnowledgeGraphNavToolbar: 'Nav' },
    './components/KnowledgeGraphView': { KnowledgeGraphView: 'Graph' },
    './components/KnowledgeGraphPreviewSheet': { KnowledgeGraphPreviewSheet: 'Preview' },
    './inductiveTemplate/TemplateGraphToggle': { TemplateGraphToggle: 'TemplateToggle' },
    './keywordRelation/components/KeywordGraphToggle': { KeywordGraphToggle: 'KeywordToggle' },
    './inductiveTemplate/useTemplateGraph': {
      useTemplateGraph: (base) => {
        inputs.push(base);
        return templates;
      },
    },
    './keywordRelation/useKeywordRelationGraph': {
      useKeywordRelationGraph: (base) => {
        inputs.push(base);
        return keywords;
      },
    },
  });
  const tree = elements(harness.render(KnowledgeGraphScreen));
  assert.deepEqual(inputs, [graph, templates]);
  const canvas = tree.find((node) => node.type === 'Graph');
  assert.deepEqual(
    elements(canvas.props.extraToolbar)
      .filter((node) => typeof node.type === 'string')
      .map((node) => node.type),
    ['KeywordToggle', 'TemplateToggle']
  );
  assert.equal(canvas.props.nodes, keywords.nodes);
});

test('source-order keyword connections retain their labels while omitting semantic arrowheads', () => {
  const { drawEdges } = load('../utils/canvasRenderer.ts');
  const nodes = new Map([
    ['one', { ...note('one', 'One'), x: 100, y: 100 }],
    ['two', { ...note('two', 'Two'), x: 300, y: 100 }],
  ]);
  const draw = (directed) => {
    const labels = [];
    let fills = 0;
    const ctx = new Proxy(
      {
        fill: () => fills++,
        fillText: (label) => labels.push(label),
        measureText: () => ({ width: 30 }),
      },
      { get: (target, name) => target[name] ?? (() => {}) }
    );
    drawEdges(
      ctx,
      [
        {
          id: 'pair',
          source: 'one',
          target: 'two',
          type: 'KEYWORD_RELATION',
          propertyLabel: 'uses',
          directed,
        },
      ],
      nodes,
      {
        width: 800,
        height: 600,
        panX: 0,
        panY: 0,
        zoom: 1,
        selectedNodeId: 'one',
        isDark: false,
      }
    );
    return { labels, fills };
  };
  const unordered = draw(false),
    ordered = draw(true);
  assert.deepEqual(unordered.labels, ['uses']);
  assert.deepEqual(unordered.labels, ordered.labels);
  assert.equal(ordered.fills, unordered.fills + 1);
});

test('the disabled toggle fills its background, shows a percentage and blocks activation', () => {
  const harness = hookHarness();
  let activated = 0;
  const { KnowledgeGraphToggle } = load('../components/KnowledgeGraphToggle.tsx', {
    react: harness.react,
    '@blacktokki/core': { Text: 'Text' },
    '../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
    'react-native': {
      Platform: { OS: 'web' },
      TouchableOpacity: 'Touchable',
      View: 'View',
      StyleSheet: { create: (value) => value },
    },
    'react-native-vector-icons/FontAwesome': 'Icon',
  });
  const props = {
    active: false,
    label: 'Keywords and Relationships',
    icon: 'tags',
    isDark: false,
    activeBackgroundColor: palette.keyword.fill,
    inactiveTextColor: 'black',
    disabled: true,
    progress: 0.25,
    working: true,
    onToggle: () => activated++,
  };
  const render = () => harness.render(() => KnowledgeGraphToggle(props));
  const disabled = render();
  assert.equal(disabled.props.disabled, true);
  assert.equal(disabled.props.accessibilityState.disabled, true);
  assert.equal(disabled.props.onPress, undefined);
  disabled.props.onClick({ stopPropagation() {} });
  assert.equal(activated, 0);
  assert.equal(disabled.props.accessibilityValue.now, 25);
  const nodes = elements(disabled);
  const fill = nodes.find((node) => node.type === 'View');
  const style = Object.assign({}, ...fill.props.style);
  assert.equal(style.width, '25%');
  assert.equal(style.top, 0);
  assert.equal(style.bottom, 0);
  assert.equal(style.backgroundColor, palette.keyword.fill);
  assert.equal(fill.props.pointerEvents, 'none');
  assert.equal(
    nodes.find((node) => node.type === 'Text').props.children[0],
    'Keywords and Relationships (25%)'
  );
  props.disabled = false;
  props.progress = undefined;
  render().props.onPress();
  assert.equal(activated, 1);
  assert.ok(!elements(render()).some((node) => node.type === 'View'));
  assert.equal(
    elements(render()).find((node) => node.type === 'Text').props.children[0],
    'Keywords and Relationships'
  );
});

test('the legend aggregates all keyword predicates into support and contradiction while retaining individual graph labels', () => {
  const { graph, extraction, candidate } = fixture();
  const { summarizeKnowledgeGraphRelations, getKnowledgeGraphRelationDisplayLabel } =
    load('../utils/relations.ts');
  const candidates = Array.from({ length: 100 }, (_, index) => ({
    ...candidate,
    id: `pattern:${index}`,
    label: `Original relationship ${index}`,
  }));
  const result = addKeywordRelationGraph(graph, extraction, candidates, palette, relationColors);
  const summaries = summarizeKnowledgeGraphRelations(result.edges);
  assert.deepEqual(
    summaries
      .filter((summary) => summary.type === 'KEYWORD_RELATION')
      .map(({ label, count, dashed, directed }) => ({ label, count, dashed, directed })),
    [
      { label: 'Contradicted', count: 100, dashed: true, directed: false },
      { label: 'Supported', count: 100, dashed: false, directed: false },
    ]
  );
  assert.ok(summaries.some((summary) => summary.type === 'KEYWORD_SOURCE'));
  const relations = result.edges.filter((edge) => edge.type === 'KEYWORD_RELATION');
  assert.equal(new Set(relations.map((edge) => edge.label)).size, 100);
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(relations[0], translate),
    'Original relationship 0'
  );
  for (const summary of summaries.filter((item) => item.type === 'KEYWORD_RELATION')) {
    const verdict = summary.label === 'Supported' ? 'supported' : 'contradicted';
    assert.equal(summary.color, relationColors[verdict]);
  }
});

const heading = (id, noteTitle, path, kind = 'PARAGRAPH') => ({
  ...note(id, noteTitle),
  name: path.at(-1),
  instanceKind: kind,
  paragraph: {
    origin: noteTitle,
    title: path.at(-1),
    path: path.map((part) => Buffer.from(part).toString('base64')).join(','),
    level: path.length,
    header: '',
    description: '',
    autoSection: path.at(-2),
  },
});

test('keyword sources resolve exact paragraph paths, cards and shared-board occurrences without changing base visibility', () => {
  const { graph, extraction } = fixture();
  const exact = heading('exact', 'Folder/One', ['Root', 'Inner / Name']);
  const wrong = heading('wrong', 'Folder/One', ['Root', 'Inner', 'Name']);
  const other = heading('other', 'Folder/One', ['Other', 'Inner / Name']);
  const card = heading('card', 'Folder/One', ['Root', 'Card'], 'CARD');
  const shared = heading('shared', 'Original', ['Board', 'Shared'], 'BOARD_PARAGRAPH');
  shared.paragraphOccurrences = [{ ...shared.paragraph, origin: 'Column/Two' }];
  graph.nodes.push(exact, wrong, other, card, shared);
  extraction.details['task 1'].sources = [
    { noteTitle: 'Folder/One', kind: 'title', section: '', sectionPath: [] },
    {
      noteTitle: 'Folder/One',
      kind: 'bold',
      section: 'Root / Inner / Name',
      sectionPath: ['Root', 'Inner / Name'],
    },
    {
      noteTitle: 'Folder/One',
      kind: 'heading',
      section: 'Other / Inner / Name',
      sectionPath: ['Other', 'Inner / Name'],
    },
    {
      noteTitle: 'Folder/One',
      kind: 'table-cell',
      section: 'Root / Card',
      sectionPath: ['Root', 'Card'],
    },
    {
      noteTitle: 'Column/Two',
      kind: 'heading',
      section: 'Board / Shared',
      sectionPath: ['Board', 'Shared'],
    },
    { noteTitle: 'Folder/One', kind: 'bold', section: 'Deleted', sectionPath: ['Deleted'] },
  ];
  const original = structuredClone(graph);
  const result = addKeywordRelationGraph(graph, extraction, [], palette, relationColors);
  const sources = result.edges.filter((edge) => edge.type === 'KEYWORD_SOURCE');
  assert.deepEqual(
    new Set(sources.map((edge) => edge.target)),
    new Set(['source', 'exact', 'other', 'card', 'shared'])
  );
  assert.equal(
    result.nodes.find((node) => node.id === 'exact').instanceKind,
    'CONNECTED_PARAGRAPH'
  );
  assert.equal(result.nodes.find((node) => node.id === 'wrong').instanceKind, 'PARAGRAPH');
  assert.deepEqual(graph, original);
});

test('link sources retain destinations, distinguish equal labels and connect external or exact internal targets', async () => {
  const { extractRelationEntities } = load('relationDiscovery.ts', {
    '@blacktokki/editor': { toMarkdown: (html) => html },
  });
  const body =
    '# Root\n## Links\n[Shared link](https://example.com/one) [Shared link](https://example.com/two) [Internal alias](Target.md#Details)';
  const extraction = await extractRelationEntities(
    [0, 1, 2].map((index) => ({ title: `Folder/Note${index}`, description: body }))
  );
  const shared = extraction.details['shared link'].sources;
  assert.deepEqual(
    new Set(shared.map((source) => source.href)),
    new Set(['https://example.com/one', 'https://example.com/two'])
  );
  assert.ok(
    shared.every(
      (source) => source.kind === 'link' && source.sectionPath.join('/') === 'Root/Links'
    )
  );
  const sourceNote = note('source', 'Folder/Note0');
  const paragraph = heading('links', sourceNote.noteTitle, ['Root', 'Links']);
  const external = (id, url) => ({
    ...note(id, 'Shared link'),
    instanceKind: 'EXTERNAL_LINK',
    description: url,
  });
  const target = heading('internal-section', 'Folder/Target', ['Root', 'Details']);
  const graph = {
    nodes: [
      sourceNote,
      paragraph,
      external('one', 'https://example.com/one'),
      external('two', 'https://example.com/two'),
      note('internal-note', 'Folder/Target'),
      target,
    ],
    edges: [],
  };
  const resolve = (href) =>
    href === 'Target.md#Details'
      ? { title: 'Folder/Target', paragraph: 'Details', section: 'Root' }
      : undefined;
  const result = addKeywordRelationGraph(graph, extraction, [], palette, relationColors, resolve);
  const targets = (keyword) =>
    result.edges
      .filter((edge) => edge.source === `keyword:${encodeURIComponent(keyword)}`)
      .map((edge) => edge.target);
  assert.deepEqual(new Set(targets('shared link')), new Set(['one', 'two']));
  assert.deepEqual(targets('internal alias'), ['internal-section']);
  assert.equal(
    result.nodes.find((node) => node.id === 'one').instanceKind,
    'CONNECTED_EXTERNAL_LINK'
  );
  assert.equal(
    result.nodes.find((node) => node.id === 'internal-section').instanceKind,
    'CONNECTED_PARAGRAPH'
  );
  assert.equal(graph.nodes.find((node) => node.id === 'one').instanceKind, 'EXTERNAL_LINK');
});
