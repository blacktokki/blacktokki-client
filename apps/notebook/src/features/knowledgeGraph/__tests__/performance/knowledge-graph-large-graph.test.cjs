const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../keywordRelation/__tests__/loadTs.cjs');
const {
  buildClassRootDistanceIndex,
  initForceSimulation,
  setSimulationFocus,
  stepForceSimulation,
} = load('../utils/forceLayout.ts');

test('orders note branches from top-level notes and board branches from their classes', () => {
  const roots = [
    { id: 'class:note', role: 'CLASS', classKind: 'NOTE' },
    { id: 'class:board:a', role: 'CLASS', classKind: 'BOARD_CARD' },
    { id: 'class:board:b', role: 'CLASS', classKind: 'BOARD_CARD' },
  ];
  const nodes = [
    ...roots,
    { id: 'note:1', role: 'INSTANCE' },
    { id: 'paragraph:1', role: 'INSTANCE' },
    { id: 'paragraph:2', role: 'INSTANCE' },
    { id: 'column:a', role: 'INSTANCE', instanceKind: 'NOTE' },
    { id: 'card:a', role: 'INSTANCE' },
    { id: 'column:b', role: 'INSTANCE' },
    { id: 'note:underBoard', role: 'INSTANCE', instanceKind: 'NOTE' },
  ];
  const edges = [
    { source: 'note:1', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'paragraph:1', target: 'note:1', type: 'PART_OF' },
    { source: 'paragraph:2', target: 'paragraph:1', type: 'PART_OF' },
    { source: 'column:a', target: 'class:board:a', type: 'INSTANCE_OF' },
    { source: 'card:a', target: 'column:a', type: 'PART_OF' },
    { source: 'column:b', target: 'class:board:b', type: 'INSTANCE_OF' },
    { source: 'note:underBoard', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'note:underBoard', target: 'column:a', type: 'PART_OF' },
    { source: 'card:a', target: 'class:note', type: 'REFERENCES' },
  ];
  const index = buildClassRootDistanceIndex(nodes, edges);
  assert.deepEqual(index.rootIds, ['note:1', 'class:board:a', 'class:board:b']);
  assert.equal(index.rootByNodeId.get('paragraph:2'), 'note:1');
  assert.equal(index.hopByNodeId.get('paragraph:2'), 2);
  assert.equal(index.rootByNodeId.get('card:a'), 'class:board:a');
  assert.equal(index.hopByNodeId.get('card:a'), 2);
  assert.equal(index.rootByNodeId.get('column:b'), 'class:board:b');
  assert.equal(index.rootByNodeId.get('note:underBoard'), 'class:board:a');
});

test('pulls selected 1-hop and 2-hop nodes closer only in those focus ranges', () => {
  const nodes = [
    { id: 'class:note', role: 'CLASS', classKind: 'NOTE', x: 100, y: 300 },
    { id: 'note:a', role: 'INSTANCE', instanceKind: 'NOTE', x: 300, y: 300 },
    { id: 'note:b', role: 'INSTANCE', instanceKind: 'NOTE', x: 1000, y: 300 },
    { id: 'note:c', role: 'INSTANCE', instanceKind: 'NOTE', x: 1600, y: 300 },
  ].map((node) => ({ ...node, name: node.id, radius: 10 }));
  const edges = [
    { source: 'note:a', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'note:b', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'note:c', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'note:a', target: 'note:b', type: 'REFERENCES' },
    { source: 'note:b', target: 'note:c', type: 'REFERENCES' },
  ];
  const positionsForDepth = (depth, focusedNodeIds) => {
    const context = initForceSimulation(nodes, edges, {
      width: 1000,
      height: 700,
      selectedNodeId: 'note:a',
      focusDepth: depth,
      focusedNodeIds,
    });
    let alpha = 0.45;
    for (let frame = 0; frame < 180; frame++) {
      stepForceSimulation(context, alpha);
      alpha *= 0.982;
    }
    return context;
  };
  const allNodes = new Set(['note:a', 'note:b', 'note:c']);
  const oneHop = positionsForDepth(1, new Set(['note:a', 'note:b']));
  const twoHop = positionsForDepth(2, allNodes);
  const all = positionsForDepth(99, allNodes);
  const distance = (context, nodeId) => {
    const selected = context.simNodes.find((node) => node.id === 'note:a');
    const node = context.simNodes.find((candidate) => candidate.id === nodeId);
    return Math.hypot(node.x - selected.x, node.y - selected.y);
  };
  assert.deepEqual(
    oneHop.precomputedFocusPulls.map(({ node }) => node.id),
    ['note:b']
  );
  assert.deepEqual(
    twoHop.precomputedFocusPulls.map(({ node }) => node.id),
    ['note:b', 'note:c']
  );
  assert.equal(all.precomputedFocusPulls.length, 0);
  assert.ok(distance(oneHop, 'note:b') < 700 * 0.7, 'one-hop gathering closes the initial gap');
  assert.ok(
    distance(twoHop, 'note:c') < distance(oneHop, 'note:c') * 0.7,
    'two-hop gathering brings the newly included node into the wider selection area'
  );
  assert.ok(distance(twoHop, 'note:b') < distance(twoHop, 'note:c'));

  const rootAnchorPositions = new Map(
    twoHop.precomputedRootAnchors.map(({ root, x, y }) => [root.id, { x, y }])
  );
  const rebuilt = initForceSimulation(twoHop.simNodes, edges, {
    width: 1000,
    height: 700,
    rootAnchorPositions,
  });
  let rebuiltAlpha = 0.55;
  for (let frame = 0; frame < 180; frame++) {
    stepForceSimulation(rebuilt, rebuiltAlpha);
    rebuiltAlpha *= 0.982;
  }
  assert.equal(rebuilt.precomputedFocusPulls.length, 0);
  assert.ok(distance(rebuilt, 'note:c') >= distance(all, 'note:c') * 0.9);
  assert.ok(distance(rebuilt, 'note:c') <= distance(all, 'note:c') * 1.1);

  setSimulationFocus(twoHop, edges, 'note:a', 99, allNodes);
  let alpha = 0.55;
  for (let frame = 0; frame < 180; frame++) {
    stepForceSimulation(twoHop, alpha);
    alpha *= 0.982;
  }
  assert.equal(twoHop.precomputedFocusPulls.length, 0);
  assert.equal(twoHop.focusedNodeIds.size, 0);
  assert.ok(distance(twoHop, 'note:c') >= distance(all, 'note:c') * 0.9);
  assert.ok(distance(twoHop, 'note:c') <= distance(all, 'note:c') * 1.1);
});
