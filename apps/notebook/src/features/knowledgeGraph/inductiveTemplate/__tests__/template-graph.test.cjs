const assert = require('node:assert/strict');
const { test } = require('node:test');
const markdownIt = require('markdown-it');
const loadTs = require('../../../inductiveTemplate/__tests__/loadTs.cjs');
const { addTemplateGraph, isTemplateGraphNode, templateGraphNeighbors } = loadTs(
  '../knowledgeGraph/inductiveTemplate/graph.ts'
);
const { nextTemplateGraphMode } = loadTs('../knowledgeGraph/inductiveTemplate/types.ts');
const { getKnowledgeGraphPalette } = loadTs('../knowledgeGraph/inductiveTemplate/palette.ts', {
  '../utils/palette': loadTs('../knowledgeGraph/utils/palette.ts'),
});
const relations = loadTs('../knowledgeGraph/utils/relations.ts');
const inference = loadTs('inference.ts');
const { discoverTemplates } = loadTs('discovery.ts', {
  './inference': inference,
  './titleGrouping': loadTs('titleGrouping.ts'),
});
const { groupSimilarTemplates } = loadTs('templateSimilarity.ts', { './inference': inference });
const renderer = new markdownIt();
const toHtml = (markdown) => renderer.render(markdown);
const palette = getKnowledgeGraphPalette(false);
const node = (id, title, overrides = {}) => ({
  id,
  name: title,
  noteTitle: title,
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  properties: {},
  x: 12,
  y: 24,
  vx: 0,
  vy: 0,
  radius: 9,
  color: palette.note.fill,
  ...overrides,
});
const candidate = (name, sourceTitles, markdown = '## Agenda\n\n{{ Agenda }}') => ({
  name,
  sourceTitles,
  markdown,
});
const emptyAxioms = { isConsistent: true, hasErrors: false, hasWarnings: false, violations: [] };

test('the template toggle switches whole-note templates on and off', () => {
  let mode = 'off';
  mode = nextTemplateGraphMode(mode);
  assert.equal(mode, 'on');
  mode = nextTemplateGraphMode(mode);
  assert.equal(mode, 'off');
});

test('both template kinds retain the built-in category size through simulation and rendering', () => {
  const { initForceSimulation } = loadTs('../knowledgeGraph/utils/forceLayout.ts');
  const { drawNodes } = loadTs('../knowledgeGraph/utils/canvasRenderer.ts');
  for (const radius of [17, 22]) {
    const category = node('class:note', 'Notes', {
      role: 'CLASS',
      instanceKind: undefined,
      classKind: 'NOTE',
      classCategory: 'BUILT_IN',
      radius,
    });
    const augmented = addTemplateGraph(
      { nodes: [category, node('one', 'One'), node('two', 'Two')], edges: [] },
      [{ templates: [candidate('A', ['One']), candidate('B', ['Two'])], similarity: 1 }],
      palette,
      'Template group'
    );
    const { simNodes } = initForceSimulation(augmented.nodes, augmented.edges, {
      width: 800,
      height: 600,
    });
    const expected = simNodes.filter((n) => n.id === category.id || isTemplateGraphNode(n));
    assert.equal(expected.length, 4);
    for (const n of expected) {
      const circles = [];
      const ctx = new Proxy(
        { arc: (_x, _y, radius) => circles.push(radius), measureText: () => ({ width: 20 }) },
        { get: (target, key) => target[key] ?? (() => {}) }
      );
      drawNodes(ctx, [{ ...n, x: 100, y: 100 }], {
        width: 800,
        height: 600,
        dpr: 1,
        zoom: 1,
        panX: 0,
        panY: 0,
        selectedNodeId: null,
        hoveredNodeId: null,
        focusedNodeIds: null,
        violatingNodeIds: new Set(),
        isDark: false,
      });
      assert.deepEqual(circles, [radius], n.id);
    }
  }
});

test('templates match reference arrows and groups retain the former template colors in both themes', () => {
  const luminance = (hex) => {
    const rgb = [1, 3, 5].map((index) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const dark of [false, true]) {
    const colors = getKnowledgeGraphPalette(dark);
    const sourceColors = Object.entries(colors)
      .filter(([kind]) => kind !== 'template' && kind !== 'templateGroup')
      .map(([, color]) => color.fill);
    assert.ok(!sourceColors.includes(colors.template.fill));
    assert.ok(!sourceColors.includes(colors.templateGroup.fill));
    assert.deepEqual(colors.templateGroup, {
      fill: dark ? '#E4E4E4' : '#FFFFFF',
      stroke: '#0065A4',
    });
    const [red, green, blue] = [1, 3, 5].map((index) =>
      parseInt(colors.template.fill.slice(index, index + 2), 16)
    );
    assert.ok(blue > green && green > red);
    assert.equal(colors.template.fill, dark ? '#5DADE2' : '#2874A6');
    assert.notEqual(colors.template.fill, colors.templateGroup.fill);
    const background = luminance(dark ? '#121212' : '#F5F5F5');
    for (const color of [colors.template, colors.templateGroup]) {
      const border = luminance(color.stroke);
      assert.ok((Math.max(border, background) + 0.05) / (Math.min(border, background) + 0.05) >= 3);
    }
    assert.notEqual(colors.template.stroke, colors.template.fill);
    assert.notEqual(colors.templateGroup.stroke, colors.templateGroup.fill);
  }
});

test('templates and multi-member groups link to existing sources without changing the base graph', () => {
  const base = {
    nodes: [node('one', 'Team/One'), node('two', 'Team/Two'), node('three', 'Other/Three')],
    edges: [],
    axioms: emptyAxioms,
  };
  const before = JSON.stringify(base);
  const first = candidate('First', ['Team/One', 'Team/Two', 'Missing']);
  const second = candidate('Second', ['Team/Two']);
  const singleton = candidate('Single', ['Other/Three'], '## Result\n{{ Result }}');
  const groups = [
    { templates: [first, second], similarity: 1 },
    { templates: [singleton], similarity: null },
  ];
  const augmented = addTemplateGraph(base, groups, palette, 'Template group');
  const templates = augmented.nodes.filter((n) => n.instanceKind === 'TEMPLATE');
  const templateGroups = augmented.nodes.filter((n) => n.classKind === 'TEMPLATE_GROUP');
  assert.equal(templates.length, 3);
  assert.equal(templateGroups.length, 1);
  assert.equal(augmented.edges.filter((e) => e.type === 'INSTANCE_OF').length, 2);
  assert.equal(augmented.edges.filter((e) => e.type === 'DERIVED_FROM').length, 4);
  const ids = new Set(augmented.nodes.map((n) => n.id));
  assert.ok(augmented.edges.every((e) => ids.has(e.source) && ids.has(e.target)));
  assert.equal(new Set(augmented.edges.map((e) => e.id)).size, augmented.edges.length);
  assert.equal(JSON.stringify(base), before);
  assert.equal(augmented.nodes[0], base.nodes[0]);
  assert.ok(
    templates.every((n) => n.template && n.noteTitle === '' && !Object.keys(n.properties).length)
  );
  assert.equal(templateGroups[0].classCategory, 'DERIVED');
  assert.equal(addTemplateGraph(base, [], palette, 'Template group'), base);
  const neighbors = templateGraphNeighbors(augmented.edges);
  assert.equal(neighbors(templateGroups[0].id, 1).size, 3);
  assert.ok(neighbors(templateGroups[0].id, 2).has('one'));
  assert.ok(!neighbors(templateGroups[0].id, 2).has('three'));
  assert.ok(neighbors('one', 99).has('two'));
  assert.ok(!neighbors('one', 99).has('three'));
  assert.equal(base.axioms, emptyAxioms);
});

test('template IDs remain stable across source order, translated names and theme changes', () => {
  const base = { nodes: [node('one', '한글'), node('two', 'Second')], edges: [] };
  const groups = [{ templates: [candidate('English name', ['한글', 'Second'])], similarity: null }];
  const first = addTemplateGraph(base, groups, palette, 'Template group');
  const changed = [
    {
      templates: [candidate('한국어 이름', ['Second', '한글'.normalize('NFD')])],
      similarity: null,
    },
  ];
  const second = addTemplateGraph(base, changed, getKnowledgeGraphPalette(true), '템플릿 그룹');
  assert.equal(first.nodes.at(-1).id, second.nodes.at(-1).id);
  assert.deepEqual(first.edges.map((e) => e.id).sort(), second.edges.map((e) => e.id).sort());
  assert.notEqual(first.nodes.at(-1).color, second.nodes.at(-1).color);
});

test('board documents and column cards can represent template sources while full notes take priority', () => {
  const base = {
    nodes: [
      node('note', 'Board'),
      node('board', 'Board', { role: 'CLASS', instanceKind: undefined, classKind: 'BOARD_CARD' }),
      node('card', 'Board/Column', { instanceKind: 'CARD' }),
      node('paragraph', 'Shared', {
        instanceKind: 'BOARD_PARAGRAPH',
        paragraphOccurrences: [{ origin: 'Board/Other', title: 'Shared' }],
      }),
    ],
    edges: [],
  };
  const groups = [
    { templates: [candidate('Form', ['Board', 'Board/Column', 'Board/Other'])], similarity: null },
  ];
  const augmented = addTemplateGraph(base, groups, palette, 'Template group');
  assert.deepEqual(
    new Set(augmented.edges.map((e) => e.target)),
    new Set(['note', 'card', 'paragraph'])
  );
  const withoutNote = addTemplateGraph(
    { ...base, nodes: base.nodes.slice(1) },
    groups,
    palette,
    'Template group'
  );
  assert.ok(withoutNote.edges.some((e) => e.target === 'board'));
});

test('graph discovery uses the same whole-note templates as the catalog without extra table forms', () => {
  const table = (value) =>
    `<table><tr><th>Case</th><th>Expected</th></tr><tr><td>Private ${value}</td><td>Secret</td></tr></table>`;
  const sources = [
    { title: 'Notes/One', description: '<h2>Agenda</h2><h2>Actions</h2>' },
    { title: 'Notes/Two', description: '<h2>Agenda</h2><h2>Actions</h2>' },
    {
      title: 'Tests/One',
      description: '<h2>Plan</h2><h3>Scope</h3>' + table('One') + '<h3>Schedule</h3>',
    },
    {
      title: 'Tests/Two',
      description: '<h2>Review</h2><h3>Results</h3>' + table('Two') + '<h3>Risks</h3>',
    },
  ];
  const base = {
    nodes: sources.map((source, index) => node(String(index), source.title)),
    edges: [],
  };
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  const augmented = addTemplateGraph(
    base,
    groupSimilarTemplates(templates, toHtml),
    palette,
    'Template group'
  );
  assert.equal(augmented.nodes.filter(isTemplateGraphNode).length, 1);
  assert.equal(augmented.edges.length, 2);
  assert.doesNotMatch(
    JSON.stringify(augmented.nodes.filter(isTemplateGraphNode)),
    /Private|Secret/
  );
});

test('legend and relation labels distinguish template nodes, groups and sources', () => {
  assert.equal(
    relations.getKnowledgeGraphNodeKind(node('template', '', { instanceKind: 'TEMPLATE' })),
    'template'
  );
  assert.equal(
    relations.getKnowledgeGraphNodeKind(
      node('group', '', { role: 'CLASS', classKind: 'TEMPLATE_GROUP' })
    ),
    'templateGroup'
  );
  assert.equal(
    relations.getKnowledgeGraphNodeKindLabel('template', (key) => key),
    'Template'
  );
  assert.equal(
    relations.getKnowledgeGraphRelationDisplayLabel(
      { type: 'INSTANCE_OF', propertyLabel: 'templateGroup' },
      (key) => key
    ),
    'Template group'
  );
  assert.equal(
    relations.getKnowledgeGraphRelationDisplayLabel({ type: 'DERIVED_FROM' }, (key) => key),
    'Template source'
  );
  assert.equal(
    relations.summarizeKnowledgeGraphRelations([
      { id: 'source', type: 'DERIVED_FROM', source: 't', target: 'n' },
    ])[0].count,
    1
  );
});
