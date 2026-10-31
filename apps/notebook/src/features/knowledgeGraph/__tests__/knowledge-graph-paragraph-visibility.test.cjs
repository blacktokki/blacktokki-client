const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('../../inductiveTemplate/__tests__/loadTs.cjs');
const { visibleKnowledgeGraphEdges, summarizeKnowledgeGraphRelations } = loadTs(
  '../knowledgeGraph/utils/relations.ts'
);

test('paragraph toggle switches displayed containment relations without changing source edges', () => {
  const slots = [];
  let stateIndex = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useCallback: (callback) => callback,
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
  };
  const translations = {
    'Paragraph containment': '문단 계층 소속',
    'Connected paragraph note containment': '연결 문단 노트 소속',
  };
  const { KnowledgeGraphView } = loadTs('../knowledgeGraph/components/KnowledgeGraphView.tsx', {
    react,
    '@blacktokki/core': {
      Text: 'Text',
      useLangContext: () => ({ lang: (key) => translations[key] || key }),
    },
    'react-native': {
      Platform: { OS: 'web' },
      StyleSheet: { create: (styles) => styles, absoluteFill: {} },
      View: 'View',
      ScrollView: 'ScrollView',
      TouchableOpacity: 'TouchableOpacity',
    },
    'react-native-vector-icons/FontAwesome': 'Icon',
    './KnowledgeGraphCanvasView': 'Canvas',
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({
        colorScheme: 'light',
        commonStyles: { text: {}, smallText: {}, card: {} },
      }),
    },
    '../../../hooks/useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTE' }) },
    '../inductiveTemplate/palette': loadTs('../knowledgeGraph/inductiveTemplate/palette.ts', {
      '../utils/palette': loadTs('../knowledgeGraph/utils/palette.ts'),
    }),
    '../utils/relations': loadTs('../knowledgeGraph/utils/relations.ts'),
  });
  const nodes = ['NOTE', 'PARAGRAPH', 'CONNECTED_PARAGRAPH'].map((instanceKind, i) => ({
    id: ['note', 'parent', 'nested'][i],
    name: instanceKind,
    noteTitle: 'Document',
    role: 'INSTANCE',
    instanceKind,
    properties: {},
    x: 100,
    y: 100,
    radius: 9,
  }));
  const edges = [
    {
      id: 'parent',
      source: 'parent',
      target: 'note',
      type: 'PART_OF',
      propertyLabel: 'paragraphPartOf',
    },
    {
      id: 'nested',
      source: 'nested',
      target: 'parent',
      type: 'PART_OF',
      propertyLabel: 'paragraphPartOf',
    },
    {
      id: 'direct',
      source: 'nested',
      target: 'note',
      type: 'PART_OF',
      propertyLabel: 'connectedPartOf',
    },
  ];
  const find = (element, predicate) => {
    if (!element) return;
    if (Array.isArray(element)) return element.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(element)) return element;
    return find(element.props?.children, predicate);
  };
  for (const showParagraphs of [false, true, false]) {
    stateIndex = 0;
    const tree = KnowledgeGraphView({
      nodes,
      edges,
      axioms: { violations: [] },
      selectedNode: null,
      focusedNodeIds: null,
      focusDepth: 1,
    });
    const canvas = find(tree, (element) => element.type === 'Canvas').props;
    assert.equal(canvas.edges.length, showParagraphs ? 2 : 1);
    for (const edge of canvas.edges) {
      assert.equal(edge.propertyLabel, showParagraphs ? '문단 계층 소속' : '연결 문단 노트 소속');
    }
    find(tree, (element) => element.props?.label === 'Paragraphs (1)').props.onToggle();
  }
  assert.deepEqual(
    edges.map((edge) => edge.propertyLabel),
    ['paragraphPartOf', 'paragraphPartOf', 'connectedPartOf']
  );
});

test('paragraph visibility swaps direct note containment for hierarchy without losing sources or other relations', () => {
  const nodes = [
    { id: 'note', instanceKind: 'NOTE', noteTitle: 'Document' },
    { id: 'other-note', instanceKind: 'NOTE', noteTitle: 'Other' },
    { id: 'parent', instanceKind: 'PARAGRAPH', noteTitle: 'Document' },
    { id: 'nested', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    { id: 'top', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    { id: 'keyword-source', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    {
      id: 'shared',
      instanceKind: 'BOARD_PARAGRAPH',
      noteTitle: 'Document',
      paragraphOccurrences: [{ origin: 'Document' }, { origin: 'Other' }],
    },
    { id: 'card', instanceKind: 'CARD', noteTitle: 'Document' },
  ];
  const part = (id, source, target, propertyLabel = 'paragraphPartOf') => ({
    id,
    source,
    target,
    type: 'PART_OF',
    propertyLabel,
    color: '#B7950B',
  });
  const edges = [
    part('parent-hierarchy', 'parent', 'note'),
    part('nested-hierarchy', 'nested', 'parent'),
    part('nested-note', 'nested', 'note', 'connectedPartOf'),
    part('top-hierarchy', 'top', 'note'),
    part('keyword-hierarchy', 'keyword-source', 'parent'),
    part('shared-first', 'shared', 'note'),
    part('shared-other', 'shared', 'other-note'),
    part('card-parent', 'card', 'shared', 'cardPartOf'),
    { id: 'reference', source: 'note', target: 'nested', type: 'REFERENCES' },
  ];
  const before = structuredClone({ nodes, edges });
  const collapsed = visibleKnowledgeGraphEdges(
    nodes.filter((node) => node.id !== 'parent'),
    edges,
    false
  );
  assert.ok(collapsed.every((edge) => edge.source !== 'parent' && edge.target !== 'parent'));
  assert.ok(!collapsed.some((edge) => edge.propertyLabel === 'paragraphPartOf'));
  const direct = collapsed.filter((edge) => edge.propertyLabel === 'connectedPartOf');
  assert.deepEqual(
    new Set(direct.map((edge) => `${edge.source}:${edge.target}`)),
    new Set(['nested:note', 'top:note', 'keyword-source:note', 'shared:note', 'shared:other-note'])
  );
  assert.equal(direct.length, 5, 'an existing direct edge must not be duplicated');
  assert.ok(direct.every((edge) => edge.color === '#B7950B'));
  const expanded = visibleKnowledgeGraphEdges(nodes, edges, true);
  assert.ok(!expanded.some((edge) => edge.propertyLabel === 'connectedPartOf'));
  assert.equal(expanded.filter((edge) => edge.propertyLabel === 'paragraphPartOf').length, 6);
  assert.deepEqual(
    summarizeKnowledgeGraphRelations(collapsed)
      .filter((summary) => ['connectedPartOf', 'paragraphPartOf'].includes(summary.label))
      .map((summary) => summary.label),
    ['connectedPartOf']
  );
  assert.deepEqual(
    summarizeKnowledgeGraphRelations(expanded)
      .filter((summary) => ['connectedPartOf', 'paragraphPartOf'].includes(summary.label))
      .map((summary) => summary.label),
    ['paragraphPartOf']
  );
  for (const result of [collapsed, expanded]) {
    assert.ok(result.some((edge) => edge.id === 'card-parent'));
    assert.ok(result.some((edge) => edge.id === 'reference'));
  }
  assert.deepEqual({ nodes, edges }, before);
});
