const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Compile only the pure graph modules; no React Native runtime or extra test dependency is needed.
const output = mkdtempSync(path.join(tmpdir(), 'ontology-inference-'));
let evaluateOntologyAxioms;
let getRelationType;
let isInferredRelationType;
let summarizeOntologyRelations;
let computeForceLayout;
let buildTopicClusterIndex;
try {
  for (const name of ['relations', 'titleKeywordClasses', 'axioms', 'forceLayout']) {
    const source = readFileSync(path.join(__dirname, '..', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ evaluateOntologyAxioms } = require(path.join(output, 'axioms.js')));
  ({ getRelationType, isInferredRelationType, summarizeOntologyRelations } = require(path.join(
    output,
    'relations.js'
  )));
  ({ buildTopicClusterIndex, computeForceLayout } = require(path.join(output, 'forceLayout.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const edge = (source, target, type, id = `${source}:${type}:${target}`) => ({
  id,
  source,
  target,
  type,
});
const node = (id, overrides = {}) => ({
  id,
  name: id,
  noteTitle: id,
  role: 'INSTANCE',
  type: 'INSTANCE',
  properties: {},
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 8,
  color: '#000000',
  ...overrides,
});
const evaluate = (edges) =>
  evaluateOntologyAxioms([...new Set(edges.flatMap((e) => [e.source, e.target]))].map(node), edges);
const find = (result, source, target, type) =>
  result.inferredEdges.find((e) => e.source === source && e.target === target && e.type === type);

test('inheritance distinguishes instance membership from subclass transitivity', () => {
  const edges = [
    edge('card', 'child', 'INSTANCE_OF'),
    edge('child', 'parent', 'SUBCLASS_OF'),
    edge('parent', 'root', 'SUBCLASS_OF'),
  ];
  const result = evaluate(edges);
  assert.ok(find(result, 'card', 'parent', 'INFERRED_INSTANCE_OF'));
  assert.deepEqual(find(result, 'card', 'root', 'INFERRED_INSTANCE_OF').inferences, [
    { rule: 'INSTANCE_INHERITANCE', premiseEdgeIds: edges.map((e) => e.id) },
  ]);
  assert.deepEqual(find(result, 'child', 'root', 'INFERRED_SUBCLASS_OF').inferences, [
    { rule: 'SUBCLASS_TRANSITIVITY', premiseEdgeIds: edges.slice(1).map((e) => e.id) },
  ]);
});

test('title-keyword matches do not create relations outside class membership', () => {
  const membership = edge('paragraph', 'topic-class', 'INSTANCE_OF');
  const nodes = [
    node('paragraph', { instanceKind: 'PARAGRAPH' }),
    node('topic-class', {
      name: 'Backend',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'TITLE_KEYWORD',
      matchLabel: 'Backend',
    }),
    node('backend-note', { name: '제품/API/Backend', instanceKind: 'NOTE' }),
  ];
  const result = evaluateOntologyAxioms(nodes, [membership]);
  assert.equal(
    result.inferredEdges.some((item) => item.type === 'INFERRED_INSTANCE_OF'),
    false
  );
  assert.equal(result.inferredEdges.length, 0);
  assert.equal(
    result.inferredEdges.some((item) => item.type === 'INFERRED_SUBCLASS_OF'),
    false
  );
  assert.equal('recommendedEdges' in result, false);
});

test('status classes and ordinary references do not create ontology inferences', () => {
  const nodes = [
    node('card', { instanceKind: 'CARD' }),
    node('status-class', {
      name: 'Done',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'BOARD_STATUS',
    }),
    node('done-note', { name: 'Done', instanceKind: 'NOTE' }),
  ];
  const result = evaluateOntologyAxioms(nodes, [
    edge('card', 'status-class', 'INSTANCE_OF'),
    edge('card', 'done-note', 'REFERENCES'),
    edge('done-note', 'card', 'REFERENCES'),
  ]);
  assert.equal(result.inferredEdges.length, 0);
  assert.equal(result.violations.length, 0);
});

test('compatibility aliases still normalize document hierarchy relations', () => {
  assert.equal(getRelationType('PARENT_CHILD'), 'PART_OF');
});

test('cyclic subclass input terminates without inferred self-relations', () => {
  const result = evaluate([
    edge('C', 'D', 'SUBCLASS_OF'),
    edge('D', 'C', 'SUBCLASS_OF'),
    edge('card', 'C', 'INSTANCE_OF'),
  ]);
  assert.ok(result.inferredEdges.every((e) => e.source !== e.target));
  assert.ok(find(result, 'card', 'D', 'INFERRED_INSTANCE_OF'));
});

test('warnings are reported separately from consistency errors', () => {
  const result = evaluateOntologyAxioms(
    [node('A')],
    [],
    [{ title: 'A', subtitles: ['Isolated note'] }]
  );
  assert.equal(result.isConsistent, true);
  assert.equal(result.hasErrors, false);
  assert.equal(result.hasWarnings, true);
});

test('an empty-parent warning focuses the existing child note', () => {
  const child = node('note:child', {
    name: '부모/자식',
    noteTitle: '부모/자식',
    instanceKind: 'NOTE',
  });
  const result = evaluateOntologyAxioms(
    [child],
    [],
    [{ title: '부모/자식', subtitles: ['Empty parent note(부모)'] }]
  );

  assert.deepEqual(result.violations[0].affectedNodeIds, [child.id]);
  assert.match(result.violations[0].message, /부모\/자식/);
});

test('ontology validation accepts a resolved reference to an existing empty note skeleton', () => {
  const source = node('note:source', {
    name: '출처',
    noteTitle: '출처',
    instanceKind: 'NOTE',
  });
  const emptyTarget = node('note:empty-target', {
    name: '빈 대상',
    noteTitle: '빈 대상',
    instanceKind: 'NOTE',
  });
  const result = evaluateOntologyAxioms(
    [source, emptyTarget],
    [edge(source.id, emptyTarget.id, 'REFERENCES')],
    [{ title: source.noteTitle, subtitles: ['Unknown note link(빈 대상)'] }]
  );

  assert.equal(result.violations.length, 0);
});

test('ontology validation keeps an explicit paragraph link to an empty note invalid', () => {
  const source = node('note:source', {
    name: '출처',
    noteTitle: '출처',
    instanceKind: 'NOTE',
  });
  const emptyTarget = node('note:empty-target', {
    name: '빈 대상',
    noteTitle: '빈 대상',
    instanceKind: 'NOTE',
  });
  const result = evaluateOntologyAxioms(
    [source, emptyTarget],
    [],
    [{ title: source.noteTitle, subtitles: ['Unknown note link(빈 대상 ▶ 없는 문단)'] }]
  );

  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0].message, /Unknown paragraph link/);
});

test('all inferred predicates are recognizable and have finite force-layout coordinates', () => {
  const nodes = ['A', 'B'].map(node);
  for (const relation of ['INSTANCE_OF', 'SUBCLASS_OF', 'PART_OF']) {
    const type = `INFERRED_${relation}`;
    assert.equal(isInferredRelationType(type), true);
    assert.equal(getRelationType(type), relation);
    const layout = computeForceLayout(nodes, [edge('A', 'B', type)], { width: 600, height: 600 });
    assert.ok(layout.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  }
  assert.equal(isInferredRelationType('INFERRED_DEPENDS'), false);
  assert.ok(nodes.every((n) => n.x === 0 && n.y === 0));
});

test('indexes topic descendants and instances under their top-level topic class', () => {
  const nodes = [
    node('topic-root', { role: 'CLASS', type: 'CLASS', classCategory: 'TOPIC' }),
    node('topic-child', { role: 'CLASS', type: 'CLASS', classCategory: 'TOPIC' }),
    node('topic-leaf', { role: 'CLASS', type: 'CLASS', classCategory: 'TOPIC' }),
    node('topic-instance'),
    node('board-root', { role: 'CLASS', type: 'CLASS', classCategory: 'BOARD' }),
    node('board-instance'),
  ];
  const index = buildTopicClusterIndex(nodes, [
    edge('topic-child', 'topic-root', 'SUBCLASS_OF'),
    edge('topic-leaf', 'topic-child', 'SUBCLASS_OF'),
    edge('topic-instance', 'topic-leaf', 'INSTANCE_OF'),
    edge('board-instance', 'board-root', 'INSTANCE_OF'),
  ]);

  assert.deepEqual([...index.rootIds], ['topic-root']);
  assert.deepEqual([...index.rootsByNodeId.get('topic-child')], ['topic-root']);
  assert.deepEqual([...index.rootsByNodeId.get('topic-leaf')], ['topic-root']);
  assert.deepEqual([...index.rootsByNodeId.get('topic-instance')], ['topic-root']);
  assert.equal(index.rootsByNodeId.has('board-root'), false);
  assert.equal(index.rootsByNodeId.has('board-instance'), false);
});

test('packs a topic hierarchy closer to its root without changing the global spacing option', () => {
  const positionedNode = (id, x, y, overrides = {}) => node(id, { x, y, ...overrides });
  const makeNodes = (classCategory) => [
    positionedNode('root', 100, 100, { role: 'CLASS', type: 'CLASS', classCategory }),
    positionedNode('child', 500, 130, { role: 'CLASS', type: 'CLASS', classCategory }),
    positionedNode('instance', 900, 160),
    positionedNode('unrelated', 300, 700),
  ];
  const edges = [edge('child', 'root', 'SUBCLASS_OF'), edge('instance', 'child', 'INSTANCE_OF')];
  const options = { width: 900, height: 700, spacingScale: 1 };
  const ordinaryLayout = computeForceLayout(makeNodes('BUILT_IN'), edges, options);
  const topicLayout = computeForceLayout(makeNodes('TOPIC'), edges, options);
  const rootDistance = (layout, nodeId) => {
    const root = layout.find((item) => item.id === 'root');
    const item = layout.find((candidate) => candidate.id === nodeId);
    return Math.hypot(root.x - item.x, root.y - item.y);
  };

  assert.ok(rootDistance(topicLayout, 'child') < rootDistance(ordinaryLayout, 'child'));
  assert.ok(rootDistance(topicLayout, 'instance') < rootDistance(ordinaryLayout, 'instance'));
});

test('relation summaries keep detailed predicates and count each displayed relation', () => {
  const summaries = summarizeOntologyRelations([
    { ...edge('card:a', 'class', 'INSTANCE_OF'), propertyLabel: 'instanceOf', dashed: true },
    { ...edge('card:b', 'class', 'INSTANCE_OF'), propertyLabel: 'instanceOf', dashed: true },
    { ...edge('class', 'root', 'SUBCLASS_OF'), propertyLabel: 'subClassOf' },
    { ...edge('note:child', 'note:parent', 'PART_OF'), propertyLabel: 'notePartOf' },
    { ...edge('paragraph', 'parent', 'PART_OF'), propertyLabel: 'paragraphPartOf' },
    {
      ...edge('paragraph', 'note', 'PART_OF', 'connected-part'),
      propertyLabel: 'connectedPartOf',
      dashed: true,
    },
    { ...edge('note', 'target', 'REFERENCES'), propertyLabel: 'references' },
    { ...edge('note', 'date', 'DATATYPE_PROPERTY'), propertyLabel: 'hasSchedule' },
    {
      ...edge('card', 'root', 'INFERRED_INSTANCE_OF'),
      propertyLabel: 'inferred instanceOf',
      dashed: true,
    },
  ]);

  assert.deepEqual(
    summaries.map(({ label, count }) => ({ label, count })),
    [
      { label: 'instanceOf', count: 2 },
      { label: 'subClassOf', count: 1 },
      { label: 'references', count: 1 },
      { label: 'notePartOf', count: 1 },
      { label: 'paragraphPartOf', count: 1 },
      { label: 'connectedPartOf', count: 1 },
      { label: 'hasSchedule', count: 1 },
      { label: 'inferred instanceOf', count: 1 },
    ]
  );
});
