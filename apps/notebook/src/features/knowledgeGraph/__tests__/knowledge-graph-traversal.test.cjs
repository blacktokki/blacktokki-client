const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { buildGraphTraversalPlan, createGraphTraversalAnimation, advanceGraphTraversal } = load(
  '../utils/graphTraversal.ts'
);

const nodes = [
  { id: 'class:note', role: 'CLASS', classKind: 'NOTE', x: 0, y: 0, radius: 10 },
  { id: 'class:board', role: 'CLASS', classKind: 'BOARD_CARD', x: 0, y: 100, radius: 10 },
  { id: 'class:external', role: 'CLASS', classKind: 'EXTERNAL_LINK', x: 300, y: 0, radius: 10 },
  { id: 'note', role: 'INSTANCE', x: 100, y: 0, radius: 10 },
  { id: 'board', role: 'INSTANCE', x: 100, y: 100, radius: 10 },
  { id: 'paragraph', role: 'INSTANCE', x: 200, y: 0, radius: 10 },
  { id: 'external', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK', x: 250, y: 0, radius: 10 },
  { id: 'isolated:a', role: 'INSTANCE', x: 400, y: 100, radius: 10 },
  { id: 'isolated:b', role: 'INSTANCE', x: 500, y: 100, radius: 10 },
];
const edges = [
  { id: 'a-note-type', source: 'note', target: 'class:note', type: 'INSTANCE_OF' },
  { id: 'b-board-type', source: 'board', target: 'class:board', type: 'INSTANCE_OF' },
  { id: 'c-note-paragraph', source: 'note', target: 'paragraph', type: 'PART_OF' },
  { id: 'd-board-paragraph', source: 'board', target: 'paragraph', type: 'REFERENCES' },
  { id: 'e-paragraph-link', source: 'paragraph', target: 'external', type: 'EXTERNAL_REFERENCE' },
  { id: 'f-link-type', source: 'external', target: 'class:external', type: 'INSTANCE_OF' },
  { id: 'g-note-paragraph', source: 'note', target: 'paragraph', type: 'REFERENCES' },
  { id: 'h-isolated', source: 'isolated:a', target: 'isolated:b', type: 'REFERENCES' },
];

const createOverlappingTraversal = () => {
  const routeNodes = [
    nodes[0],
    { ...nodes[1], x: 1000, y: 0 },
    nodes[3],
    { ...nodes[4], x: 900, y: 0 },
    ...nodes.slice(7),
  ];
  const plan = buildGraphTraversalPlan(routeNodes, [
    ...edges.slice(0, 2),
    { ...edges[0], id: 'z-classes', source: 'class:note', target: 'class:board' },
    edges[7],
  ]);
  return {
    plan,
    animation: createGraphTraversalAnimation(plan),
    nodeMap: new Map(routeNodes.map((node) => [node.id, node])),
  };
};

test('BFS traverses from Note and Board classes once per edge, stopping at external links', () => {
  const plan = buildGraphTraversalPlan(nodes, edges);
  assert.deepEqual(
    plan.levels.map((level) => level.map((step) => [step.edgeId, step.fromId, step.toId])),
    [
      [
        ['a-note-type', 'class:note', 'note'],
        ['b-board-type', 'class:board', 'board'],
      ],
      [
        ['c-note-paragraph', 'note', 'paragraph'],
        ['g-note-paragraph', 'note', 'paragraph'],
        ['d-board-paragraph', 'board', 'paragraph'],
      ],
      [['e-paragraph-link', 'paragraph', 'external']],
    ]
  );
  assert.equal(plan.initialSpeedPxPerSecond, 600);
  assert.equal(plan.reachableNodeCount, 6);
  assert.deepEqual(
    plan.levels.map((level) => level[0].speedPxPerSecond),
    [600, 540, 480]
  );
  assert.deepEqual(buildGraphTraversalPlan(nodes.slice(2), edges).levels, []);
});

test('merged and cyclic paths activate successors once at the earliest actual arrival', () => {
  const routeNodes = [
    nodes[0],
    { ...nodes[3], id: 'short', x: 100 },
    { ...nodes[3], id: 'long', x: 400 },
    { ...nodes[3], id: 'merge', x: 200 },
    { ...nodes[3], id: 'tail', x: 300 },
    { ...nodes[3], id: 'end', x: 400 },
  ];
  const routeEdges = [
    { ...edges[0], id: 'a-long', source: 'class:note', target: 'long' },
    { ...edges[0], id: 'b-short', source: 'class:note', target: 'short' },
    { ...edges[0], id: 'c-long-merge', source: 'long', target: 'merge' },
    { ...edges[0], id: 'd-short-merge', source: 'short', target: 'merge' },
    { ...edges[0], id: 'd2-short-merge', source: 'short', target: 'merge' },
    { ...edges[0], id: 'e-merge-tail', source: 'merge', target: 'tail' },
    { ...edges[0], id: 'f-root-merge', source: 'class:note', target: 'merge' },
    { ...edges[0], id: 'g-tail-end', source: 'tail', target: 'end' },
  ];
  const plan = buildGraphTraversalPlan(routeNodes, routeEdges);
  assert.equal(plan.levels.flat().length, routeEdges.length);
  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  const animation = createGraphTraversalAnimation(plan);
  const cycle = animation.cycle;
  const mergeArrival = 80 + (48 / 540) * 1000;
  const tailArrival = mergeArrival + (48 / 540) * 1000;
  const cycleEnd = 580 + (148 / 540) * 1000;
  advanceGraphTraversal(animation, 250, nodeMap);
  assert.equal(cycle.activatedAtMs.get('merge'), mergeArrival);
  assert.deepEqual(animation.steps.map((step) => step.edgeId).sort(), ['a-long', 'e-merge-tail']);
  const successor = animation.steps.find((step) => step.edgeId === 'e-merge-tail');
  assert.equal(successor.startedAtMs, mergeArrival);
  assert.equal(successor.depth, 1);
  assert.equal(successor.speedPxPerSecond, 540);
  advanceGraphTraversal(animation, cycleEnd, nodeMap);
  assert.deepEqual(Object.fromEntries(cycle.activatedAtMs), {
    'class:note': 0,
    short: 80,
    merge: mergeArrival,
    tail: tailArrival,
    end: tailArrival + 100,
    long: 580,
  });
  assert.equal(cycle.allNodesReachedAtMs, 580);
  assert.equal(animation.cycle.startedAtMs, 580);
  assert.equal(animation.pauseUntilMs, null);
  assert.ok(animation.steps.length > 0);
  assert.ok(animation.steps.every((step) => step.cycle !== cycle));

  const skippedFrames = createGraphTraversalAnimation(plan);
  const skippedCycle = skippedFrames.cycle;
  advanceGraphTraversal(skippedFrames, cycleEnd, nodeMap);
  assert.deepEqual(skippedCycle.activatedAtMs, cycle.activatedAtMs);
  assert.deepEqual(skippedFrames.cycle, animation.cycle);
  assert.deepEqual(skippedFrames.steps, animation.steps);
  assert.equal(skippedFrames.pauseUntilMs, animation.pauseUntilMs);
});

test('overlapping nodes skip zero-length edges and paused cycles resume without replaying history', () => {
  const overlapping = nodes.slice(0, 2);
  overlapping.push({ ...nodes[3], x: 0 });
  const nodeMap = new Map(overlapping.map((node) => [node.id, node]));
  const animation = createGraphTraversalAnimation(buildGraphTraversalPlan(overlapping, [edges[0]]));
  advanceGraphTraversal(animation, 0, nodeMap);
  assert.equal(animation.pauseUntilMs, 300);
  advanceGraphTraversal(animation, 24 * 60 * 60 * 1000, nodeMap);
  assert.equal(animation.pauseUntilMs, 24 * 60 * 60 * 1000 + 300);
  assert.deepEqual(animation.steps, []);
});

test('node coverage starts overlapping cycles without restarting or cancelling older glints', () => {
  const { plan, animation, nodeMap } = createOverlappingTraversal();
  assert.equal(plan.reachableNodeCount, 4);
  const firstCycle = animation.cycle;
  advanceGraphTraversal(animation, 79, nodeMap);
  assert.equal(animation.cycle, firstCycle);
  assert.equal(firstCycle.allNodesReachedAtMs, null);
  const originalGlint = animation.steps.find((step) => step.edgeId === 'z-classes');

  advanceGraphTraversal(animation, 80, nodeMap);
  assert.equal(firstCycle.allNodesReachedAtMs, 80);
  assert.equal(firstCycle.activatedAtMs.size, 4);
  const secondCycle = animation.cycle;
  assert.notEqual(secondCycle, firstCycle);
  assert.equal(secondCycle.startedAtMs, 80);
  assert.equal(secondCycle.activatedAtMs.size, 2);
  assert.equal(animation.steps.length, 4);
  assert.ok(animation.steps.includes(originalGlint));
  const originalPosition = originalGlint.along;
  const secondGlint = animation.steps.find(
    (step) => step.edgeId === 'z-classes' && step.cycle === secondCycle
  );
  assert.equal(secondGlint.startedAtMs, 80);
  advanceGraphTraversal(animation, 100, nodeMap);
  assert.equal(originalGlint.along - originalPosition, 12);
  assert.equal(secondGlint.along, 38);
  assert.ok(originalGlint.along > secondGlint.along);

  advanceGraphTraversal(animation, 160, nodeMap);
  assert.equal(secondCycle.allNodesReachedAtMs, 160);
  assert.equal(animation.cycle.startedAtMs, 160);
  assert.equal(new Set(animation.steps.map((step) => step.cycle)).size, 3);
  assert.equal(animation.steps.length, 5);
  assert.equal(firstCycle.activatedAtMs.size, 4);

  advanceGraphTraversal(animation, 1580, nodeMap);
  assert.equal(animation.steps.includes(originalGlint), false);
  assert.equal(animation.cycle.startedAtMs, 1520);
  assert.equal(animation.cycle.allNodesReachedAtMs, null);
  assert.equal(animation.pauseUntilMs, null);
});
