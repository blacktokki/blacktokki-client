const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { hookHarness, elements } = require('../keywordRelation/__tests__/hookHarness.cjs');

const note = (id, name, overrides = {}) => ({
  id,
  name,
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  noteTitle: name,
  ...overrides,
});
const native = {
  Platform: { OS: 'web' },
  View: 'View',
  TextInput: 'Input',
  FlatList: 'List',
  Pressable: 'Pressable',
  TouchableOpacity: 'Touchable',
  ScrollView: 'Scroll',
  StyleSheet: { create: (value) => value },
};
const theme = { commonStyles: { text: {}, smallText: {}, container: {} }, colorScheme: 'light' };
const core = { Text: 'Text', useLangContext: () => ({ lang: (key) => key }) };

test('node search matches only names, retains paragraph context, ranks exact names first and selects the original node', () => {
  const harness = hookHarness();
  const selected = [];
  const nodes = [
    note('prefix', 'Alpha API'),
    note('exact', 'Alpha', { noteTitle: 'Docs/Alpha' }),
    note('paragraph', 'Alpha', { instanceKind: 'PARAGRAPH', noteTitle: 'Elsewhere/Reference' }),
    note('external', 'Alpha', {
      instanceKind: 'EXTERNAL_LINK',
      description: 'https://example.test/reference',
    }),
    note('keyword', 'Sprint 1', { instanceKind: 'KEYWORD' }),
    note('template', 'Document template', { instanceKind: 'TEMPLATE' }),
    note('hangul', '한글'),
    note('connected', 'Connection', {
      instanceKind: 'CONNECTED_PARAGRAPH',
      noteTitle: 'Linked/Owner',
      boardTitle: 'NotebookMetadata',
      paragraph: { autoSection: 'ParentMetadata' },
      paragraphOccurrences: [{ origin: 'SharedMetadata' }],
    }),
  ];
  const { KnowledgeGraphSearch } = load('../components/KnowledgeGraphSearch.tsx', {
    react: harness.react,
    '@blacktokki/core': core,
    'react-native': native,
    'react-native-vector-icons/FontAwesome': 'Icon',
    '../../../hooks/useNotebookTheme': { useNotebookTheme: () => theme },
    '../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTEBOOK' }) },
  });
  const render = () =>
    elements(
      harness.render(() =>
        KnowledgeGraphSearch({ nodes, maxHeight: 240, onSelectNode: (node) => selected.push(node) })
      )
    );
  const input = () => render().find((node) => node.type === 'Input');
  const query = (value) => {
    input().props.onChangeText(value);
    return render().find((node) => node.type === 'List');
  };
  assert.equal(query('  ALPHA ').props.data.length, 4);
  assert.equal(query('alpha').props.data.at(-1).node.id, 'prefix');
  for (const metadata of [
    'elsewhere',
    'docs/alpha',
    'linked/owner',
    'example.test',
    'NotebookMetadata',
    'ParentMetadata',
    'SharedMetadata',
    'connected paragraph',
    'alpha elsewhere',
  ])
    assert.deepEqual(query(metadata).props.data, [], metadata);
  assert.deepEqual(
    query('api alpha').props.data.map((item) => item.node.id),
    ['prefix']
  );
  const matches = query('alpha');
  const paragraphRow = matches.props.renderItem({
    item: matches.props.data.find((item) => item.node.id === 'paragraph'),
  });
  assert.equal(paragraphRow.props.accessibilityLabel, 'Alpha · Paragraph · Elsewhere/Reference');
  assert.ok(
    elements(paragraphRow).some(
      (item) =>
        item.type === 'Text' && item.props.children.includes('Paragraph · Elsewhere/Reference')
    )
  );
  const connected = query('connection');
  const connectedRow = connected.props.renderItem({ item: connected.props.data[0] });
  assert.equal(
    connectedRow.props.accessibilityLabel,
    'Connection · Connected paragraph · Linked/Owner'
  );
  const noteRow = matches.props.renderItem({
    item: matches.props.data.find((item) => item.node.id === 'exact'),
  });
  assert.equal(noteRow.props.accessibilityLabel, 'Alpha · Note');
  const link = matches.props.data.find((item) => item.node.id === 'external');
  assert.equal(matches.props.keyExtractor(link), 'external');
  const row = matches.props.renderItem({ item: link });
  assert.equal(row.props.accessibilityLabel, 'Alpha · External link');
  assert.ok(!JSON.stringify(row.props.children).includes('https://example.test/reference'));
  row.props.onPress();
  assert.equal(selected[0], nodes[3]);
  assert.ok(!render().some((node) => node.type === 'List'));
  assert.equal(input().props.value, 'Alpha');
  query('connection');
  input().props.onSubmitEditing();
  assert.equal(selected.at(-1), nodes[7]);
  assert.equal(query('sprint').props.data[0].node, nodes[4]);
  assert.equal(query('template').props.data[0].node, nodes[5]);
  assert.equal(query('한글'.normalize('NFD')).props.data[0].node, nodes[6]);
  assert.deepEqual(query('absent').props.data, []);
  input().props.onKeyPress({ nativeEvent: { key: 'Escape' } });
  assert.ok(!render().some((node) => node.type === 'List'));
  render()
    .find((node) => node.props.accessibilityLabel === 'Clear')
    .props.onPress();
  assert.equal(input().props.value, '');
});

test('graph controls reveal hidden search targets and hide all controls and badges without resetting settings', () => {
  const harness = hookHarness();
  const selected = [];
  const paragraph = note('paragraph', 'Section', { instanceKind: 'PARAGRAPH' });
  const external = note('external', 'Link', { instanceKind: 'EXTERNAL_LINK' });
  const { KnowledgeGraphView } = load('../components/KnowledgeGraphView.tsx', {
    react: harness.react,
    '@blacktokki/core': core,
    'react-native': native,
    'react-native-vector-icons/FontAwesome': 'Icon',
    '../../../hooks/useNotebookTheme': { useNotebookTheme: () => theme },
    '../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    './KnowledgeGraphCanvasView': { KnowledgeGraphCanvasView: 'Canvas' },
    './KnowledgeGraphSearch': { KnowledgeGraphSearch: 'NodeSearch' },
  });
  const props = {
    nodes: [note('note', 'Document'), paragraph, external],
    edges: [],
    axioms: { violations: [{ affectedNodeIds: [] }], hasErrors: false, hasWarnings: true },
    selectedNode: null,
    selectionTrigger: 0,
    reservedBottomHeight: 0,
    focusedNodeIds: null,
    focusDepth: 1,
    onSelectNode: (node) => selected.push(node),
    extraToolbar: harness.react.createElement('KeywordToggle'),
  };
  const render = () => elements(harness.render(() => KnowledgeGraphView(props)));
  const find = (type) => render().find((node) => node.type === type);
  const toggle = () => render().find((node) => node.props.accessibilityLabel === 'Graph controls');
  assert.equal(find('Canvas').props.nodes.length, 1);
  assert.equal(find('NodeSearch').props.nodes.length, 3);
  find('NodeSearch').props.onSelectNode(paragraph);
  assert.equal(selected.at(-1), paragraph);
  assert.ok(find('Canvas').props.nodes.includes(paragraph));
  find('NodeSearch').props.onSelectNode(external);
  assert.equal(selected.at(-1), external);
  assert.ok(find('Canvas').props.nodes.includes(external));
  render()
    .find((node) => node.props.label === 'Highlight Edges')
    .props.onToggle();
  render()
    .find((node) => node.props.label === 'Increase node spacing')
    .props.onPress();
  render()
    .find((node) => node.props.label === 'Zoom in')
    .props.onPress();
  const zoom = find('Canvas').props.zoomAction;
  toggle().props.onPress();
  assert.equal(toggle().props.accessibilityState.expanded, false);
  const hidden = render().find((node) => node.props.accessibilityElementsHidden === true);
  assert.equal(Object.assign({}, ...hidden.props.style.filter(Boolean)).display, 'none');
  assert.equal(hidden.props.importantForAccessibility, 'no-hide-descendants');
  const contents = elements(hidden);
  assert.ok(contents.some((node) => node.type === 'NodeSearch'));
  assert.ok(contents.some((node) => node.props.label === 'Increase node spacing'));
  assert.ok(contents.some((node) => node.props.label === 'Zoom in'));
  assert.ok(contents.some((node) => node.props.children?.includes('Validation Warning (1)')));
  assert.ok(contents.some((node) => node.props.label === 'Highlight Edges'));
  assert.ok(contents.some((node) => node.props.label === 'Paragraphs (1)'));
  assert.ok(contents.some((node) => node.props.label === 'External Links (1)'));
  assert.ok(contents.some((node) => node.type === 'KeywordToggle'));
  assert.ok(!contents.some((node) => node.props.accessibilityLabel === 'Graph controls'));
  toggle().props.onPress();
  assert.equal(toggle().props.accessibilityState.expanded, true);
  assert.equal(
    render().find((node) => node.props.label === 'Reset node spacing').props.value,
    '1.1x'
  );
  assert.equal(find('Canvas').props.zoomAction, zoom);
  assert.equal(find('Canvas').props.animateEdges, false);
  assert.ok(find('Canvas').props.nodes.includes(paragraph));
  assert.ok(find('Canvas').props.nodes.includes(external));
});
