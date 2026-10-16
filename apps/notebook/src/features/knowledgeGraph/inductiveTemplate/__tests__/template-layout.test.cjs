const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('../../../inductiveTemplate/__tests__/loadTs.cjs');
const { initForceSimulation, stepForceSimulation, advanceForceSimulation, setSimulationFocus } =
  loadTs('../knowledgeGraph/utils/forceLayout.ts');

const node = (id, x, y, extra = {}) => ({
  id,
  name: id,
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  noteTitle: id,
  properties: {},
  radius: 17,
  color: 'gray',
  x,
  y,
  vx: 0,
  vy: 0,
  ...extra,
});
const sourceEdge = (source, target) => ({ source, target, type: 'DERIVED_FROM' });
const groupEdge = (source) => ({ source, target: 'group', type: 'INSTANCE_OF' });
const fixture = (extraNotes = 0) => ({
  nodes: [
    // Put the group first to catch updates that incorrectly depend on input order.
    node('group', -500, -300, {
      role: 'CLASS',
      instanceKind: undefined,
      classKind: 'TEMPLATE_GROUP',
    }),
    node('template:a', -200, 50, { instanceKind: 'TEMPLATE' }),
    node('template:b', 100, -300, { instanceKind: 'TEMPLATE' }),
    node('one', 120, 90),
    node('two', 660, 150),
    node('three', 900, 570),
    ...Array.from({ length: extraNotes }, (_, index) =>
      node(`unrelated:${index}`, 1100 + (index % 10) * 100, 900 + Math.floor(index / 10) * 100)
    ),
  ],
  edges: [
    groupEdge('template:b'),
    sourceEdge('template:a', 'one'),
    sourceEdge('template:a', 'one'),
    sourceEdge('template:a', 'two'),
    sourceEdge('template:a', 'missing'),
    sourceEdge('template:b', 'three'),
    groupEdge('template:a'),
    groupEdge('template:a'),
  ],
});
const assertCenters = (context) => {
  const byId = new Map(context.simNodes.map((item) => [item.id, item]));
  for (const [id, memberIds] of [
    ['template:a', ['one', 'two']],
    ['template:b', ['three']],
    ['group', ['template:a', 'template:b']],
  ]) {
    const actual = byId.get(id);
    for (const axis of ['x', 'y']) {
      const expected =
        memberIds.reduce((sum, memberId) => sum + byId.get(memberId)[axis], 0) / memberIds.length;
      assert.ok(Math.abs(actual[axis] - expected) < 1e-8, `${id}.${axis} follows its members`);
    }
    assert.equal(actual.vx, 0);
    assert.equal(actual.vy, 0);
  }
};

test('templates and groups start at distinct-member centroids and follow moving sources', () => {
  for (const extraNotes of [0, 140]) {
    const graph = fixture(extraNotes);
    for (const spacingScale of [0.4, 1, 2.5]) {
      const context = initForceSimulation(graph.nodes, graph.edges, {
        width: 800,
        height: 600,
        spacingScale,
      });
      assertCenters(context);
      for (let index = 0; index < 15; index++) {
        stepForceSimulation(context, 0.5);
        assertCenters(context);
      }
      const focused = new Set(context.simNodes.map((item) => item.id));
      setSimulationFocus(context, graph.edges, 'group', 2, focused);
      for (let index = 0; index < 10; index++) {
        stepForceSimulation(context, 0.3);
        assertCenters(context);
      }
      // A warm restart after a visibility or spacing change must reapply both levels.
      const restarted = initForceSimulation(context.simNodes, graph.edges, {
        width: 800,
        height: 600,
      });
      assertCenters(restarted);
    }
  }
});

test('template centroids do not exert spring or repulsion forces on source notes', () => {
  for (const extraNotes of [0, 140]) {
    const graph = fixture(extraNotes);
    const notes = graph.nodes.filter((item) => item.instanceKind === 'NOTE');
    const options = { width: 800, height: 600, centerOrigin: true };
    const baseline = initForceSimulation(notes, [], options);
    const augmented = initForceSimulation(graph.nodes, graph.edges, options);
    for (let index = 0; index < 12; index++) {
      stepForceSimulation(baseline, 0.4);
      stepForceSimulation(augmented, 0.4);
    }
    const byId = new Map(augmented.simNodes.map((item) => [item.id, item]));
    for (const expected of baseline.simNodes) {
      const actual = byId.get(expected.id);
      for (const field of ['x', 'y', 'vx', 'vy']) {
        assert.ok(Math.abs(actual[field] - expected[field]) < 1e-8, `${expected.id}.${field}`);
      }
    }
    assertCenters(augmented);
  }
});

test('yielded simulation steps preserve centers and missing sources remain finite', () => {
  const graph = fixture(140);
  graph.nodes.push(node('orphan', -600, 400, { instanceKind: 'TEMPLATE' }));
  graph.edges.push(sourceEdge('orphan', 'missing'));
  const context = initForceSimulation(graph.nodes, graph.edges, { width: 800, height: 600 });
  let completed = null;
  let attempts = 0;
  while (completed === null && attempts++ < 1000) {
    completed = advanceForceSimulation(context, 0.5, 0);
    assertCenters(context);
  }
  assert.notEqual(completed, null);
  assert.ok(context.simNodes.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)));
});
