const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-traversal-'));
let buildGraphTraversalPlan;
let createGraphTraversalAnimation;
let advanceGraphTraversal;
let drawGraphTraversal;
try {
  for (const name of ['graphTraversal', 'canvasRenderer']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({
    buildGraphTraversalPlan,
    createGraphTraversalAnimation,
    advanceGraphTraversal,
  } = require(path.join(output, 'graphTraversal.js')));
  ({ drawGraphTraversal } = require(path.join(output, 'canvasRenderer.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

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

const createTraversalContext = () => {
  const images = [];
  const gradients = [];
  const draws = [];
  const stack = [];
  let transform = [1, 0, 0, 1, 0, 0];
  const ctx = {
    globalAlpha: 1,
    shadowBlur: 0,
    canvas: {
      ownerDocument: {
        createElement() {
          const spriteCtx = {
            createLinearGradient(...coordinates) {
              const gradient = {
                coordinates,
                stops: [],
                addColorStop(offset, color) {
                  this.stops.push([offset, color]);
                },
              };
              gradients.push(gradient);
              return gradient;
            },
            fillRect() {},
          };
          const canvas = { getContext: () => spriteCtx };
          images.push(canvas);
          return canvas;
        },
      },
    },
    save() {
      stack.push({ transform, alpha: this.globalAlpha, blur: this.shadowBlur });
    },
    restore() {
      const state = stack.pop();
      transform = state.transform;
      this.globalAlpha = state.alpha;
      this.shadowBlur = state.blur;
    },
    transform(...matrix) {
      transform = matrix;
    },
    drawImage(image, left, top, length, height) {
      draws.push({
        image,
        x: transform[4],
        y: transform[5],
        direction: transform.slice(0, 2),
        left,
        length,
        height,
        alpha: this.globalAlpha,
        blur: this.shadowBlur,
      });
    },
  };
  return { ctx, images, gradients, draws };
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

for (const instanceKind of ['EXTERNAL_LINK', 'CONNECTED_EXTERNAL_LINK']) {
  test(`${instanceKind} receives incoming glints without propagating or blocking later cycles`, () => {
    const routeNodes = [
      nodes[0],
      nodes[3],
      { ...nodes[6], x: 200, instanceKind },
      { ...nodes[3], id: 'other', x: 300 },
      { ...nodes[2], x: 400 },
    ];
    const plan = buildGraphTraversalPlan(routeNodes, [
      edges[0],
      { ...edges[4], id: 'b-link', source: 'note' },
      { ...edges[4], id: 'c-shared-link', source: 'other' },
      edges[5],
      { ...edges[0], id: 'z-other', source: 'other' },
    ]);
    assert.equal(plan.reachableNodeCount, 4);
    assert.equal(plan.outgoingSteps.has('external'), false);
    assert.deepEqual(
      plan.levels.flat().map((step) => [step.fromId, step.toId]),
      [
        ['class:note', 'note'],
        ['class:note', 'other'],
        ['note', 'external'],
        ['other', 'external'],
      ]
    );
    const animation = createGraphTraversalAnimation(plan);
    const cycle = animation.cycle;
    const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
    const externalArrival = 80 + (48 / 540) * 1000;
    advanceGraphTraversal(animation, externalArrival - 1, nodeMap);
    assert.ok(animation.steps.some((step) => step.edgeId === 'b-link'));
    advanceGraphTraversal(animation, externalArrival, nodeMap);
    assert.equal(cycle.activatedAtMs.get('external'), externalArrival);
    assert.equal(cycle.activatedAtMs.has('class:external'), false);
    assert.equal(animation.cycle, cycle);
    assert.ok(animation.steps.every((step) => step.fromId !== 'external'));

    const otherArrival = (248 / 600) * 1000;
    advanceGraphTraversal(animation, otherArrival, nodeMap);
    assert.equal(cycle.allNodesReachedAtMs, otherArrival);
    assert.equal(animation.cycle.startedAtMs, otherArrival);
    assert.ok(
      animation.steps.some((step) => step.edgeId === 'c-shared-link' && step.cycle === cycle)
    );
    advanceGraphTraversal(animation, otherArrival + (48 / 540) * 1000, nodeMap);
    assert.equal(cycle.activatedAtMs.get('external'), externalArrival);
    assert.equal(animation.cycle.startedAtMs, otherArrival);
    assert.ok(animation.steps.every((step) => step.fromId !== 'external'));
    assert.equal(animation.pauseUntilMs, null);
  });
}

test('each BFS depth moves at a constant speed, reducing by 60 px/s down to 300 px/s', () => {
  const routeNodes = [
    nodes[0],
    ...Array.from({ length: 10 }, (_, depth) => ({
      ...nodes[3],
      id: `depth:${depth}`,
      x: (depth + 1) * 178,
    })),
  ];
  const routeEdges = routeNodes.slice(1).map((node, depth) => ({
    ...edges[0],
    id: `edge:${depth}`,
    source: routeNodes[depth].id,
    target: node.id,
  }));
  const plan = buildGraphTraversalPlan(routeNodes, routeEdges);
  const speeds = [600, 540, 480, 420, 360, 300, 300, 300, 300, 300];
  assert.deepEqual(
    plan.levels.map((level) => level[0].speedPxPerSecond),
    speeds
  );
  const animation = createGraphTraversalAnimation(plan);
  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  let startedAt = 0;
  for (let depth = 0; depth < speeds.length; depth++) {
    advanceGraphTraversal(animation, startedAt + 25, nodeMap);
    assert.equal(animation.steps[0].edgeId, `edge:${depth}`);
    assert.equal(animation.steps[0].depth, depth);
    const first = animation.steps[0].along;
    advanceGraphTraversal(animation, startedAt + 50, nodeMap);
    const second = animation.steps[0].along;
    advanceGraphTraversal(animation, startedAt + 75, nodeMap);
    const third = animation.steps[0].along;
    assert.ok(Math.abs((second - first) * 40 - speeds[depth]) < 1e-6);
    assert.ok(Math.abs((third - second) * 40 - speeds[depth]) < 1e-6);
    startedAt += (126 / speeds[depth]) * 1000;
  }
});

test('glints continue from each arrival independently and repeat immediately once all nodes arrive', () => {
  const plan = buildGraphTraversalPlan(nodes, edges);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const options = { zoom: 1, panX: 20, panY: 20, width: 600, height: 300, isDark: false };
  const glintsAt = (elapsedMs, viewport = options) => {
    const { ctx, draws } = createTraversalContext();
    const animation = createGraphTraversalAnimation(plan);
    advanceGraphTraversal(animation, elapsedMs, nodeMap);
    const visible = drawGraphTraversal(ctx, animation, viewport);
    return {
      visible,
      glints: draws.map(({ x, y, direction, length, height, alpha, blur }, index) => ({
        x,
        y,
        direction,
        length,
        height,
        alpha,
        blur,
        edgeId: animation.steps[index].edgeId,
        cycleStartedAtMs: animation.steps[index].cycle.startedAtMs,
      })),
    };
  };

  const paragraphArrival = 80 + (48 / 540) * 1000;
  const externalArrival = paragraphArrival + (18 / 480) * 1000;
  const activeDuration = externalArrival;
  const earlyTime = 20;
  const early = glintsAt(earlyTime);
  const late = glintsAt(40);
  assert.equal(early.glints.length, 2);
  assert.equal(late.glints.length, 2);
  assert.ok(early.glints[0].x < late.glints[0].x);
  assert.equal(early.glints[0].y, 0);
  assert.equal(early.glints[1].y, 100);
  assert.equal(early.glints[0].blur, 0);
  assert.equal(early.glints[0].length, 32);
  assert.equal(early.glints[0].height, 4);
  assert.ok(early.glints[0].alpha <= 0.32);
  const firstSuccessors = glintsAt(80);
  assert.equal(firstSuccessors.glints.length, 3);
  assert.ok(firstSuccessors.glints.every((glint) => glint.alpha === early.glints[0].alpha));
  const afterShortEdges = glintsAt(paragraphArrival);
  assert.equal(afterShortEdges.glints.length, 2);
  assert.ok(afterShortEdges.glints.some((glint) => glint.y > 0));
  assert.ok(afterShortEdges.glints.some((glint) => glint.x === 216 && glint.y === 0));
  const nextLink = glintsAt(externalArrival);
  assert.equal(nextLink.glints.length, 3);
  assert.ok(nextLink.glints.every((glint) => glint.edgeId !== 'f-link-type'));
  assert.equal(glintsAt(activeDuration - 1).glints.length, 2);
  assert.equal(glintsAt(activeDuration).glints.length, 3);
  const repeated = glintsAt(activeDuration + earlyTime);
  assert.equal(repeated.visible, early.visible);
  const repeatedCycle = repeated.glints.filter(
    (glint) => glint.cycleStartedAtMs === activeDuration
  );
  assert.equal(repeatedCycle.length, early.glints.length);
  repeatedCycle.forEach((glint, index) => {
    assert.ok(Math.abs(glint.x - early.glints[index].x) < 1e-6);
    assert.ok(Math.abs(glint.y - early.glints[index].y) < 1e-6);
  });
});

test('a short branch starts its successors on arrival while a longer branch is still travelling', () => {
  const routeNodes = [
    nodes[0],
    { ...nodes[3], id: 'short', x: 100 },
    { ...nodes[3], id: 'short-child', x: 200 },
    { ...nodes[3], id: 'long', x: 500 },
    { ...nodes[3], id: 'long-child', x: 600 },
  ];
  const routeEdges = [
    { ...edges[0], id: 'a-long', source: 'class:note', target: 'long' },
    { ...edges[0], id: 'b-short', source: 'class:note', target: 'short' },
    { ...edges[0], id: 'c-long-child', source: 'long', target: 'long-child' },
    { ...edges[0], id: 'd-short-child', source: 'short', target: 'short-child' },
  ];
  const animation = createGraphTraversalAnimation(buildGraphTraversalPlan(routeNodes, routeEdges));
  const cycle = animation.cycle;
  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  const shortArrival = 80;
  const longArrival = (448 / 600) * 1000;
  const successorDuration = (48 / 540) * 1000;
  advanceGraphTraversal(animation, shortArrival - 1, nodeMap);
  assert.deepEqual(animation.steps.map((step) => step.edgeId).sort(), ['a-long', 'b-short']);
  advanceGraphTraversal(animation, shortArrival, nodeMap);
  assert.deepEqual(animation.steps.map((step) => step.edgeId).sort(), ['a-long', 'd-short-child']);
  const successor = animation.steps.find((step) => step.edgeId === 'd-short-child');
  assert.equal(successor.startedAtMs, shortArrival);
  assert.equal(successor.along, 26);
  advanceGraphTraversal(animation, shortArrival + successorDuration, nodeMap);
  assert.equal(cycle.activatedAtMs.get('short-child'), shortArrival + successorDuration);
  assert.equal(cycle.activatedAtMs.has('long'), false);
  assert.equal(animation.pauseUntilMs, null);
  advanceGraphTraversal(animation, longArrival, nodeMap);
  assert.equal(animation.steps[0].edgeId, 'c-long-child');
  assert.equal(animation.steps[0].startedAtMs, longArrival);
  advanceGraphTraversal(animation, longArrival + successorDuration, nodeMap);
  assert.equal(cycle.allNodesReachedAtMs, longArrival + successorDuration);
  assert.equal(animation.cycle.startedAtMs, longArrival + successorDuration);
  assert.equal(animation.pauseUntilMs, null);
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

test('glints move at equal constant speeds and twice the travel distance takes twice as long', () => {
  const routeNodes = [
    nodes[0],
    { ...nodes[3], id: 'short', x: 232 },
    { ...nodes[3], id: 'long', x: 412 },
  ];
  const plan = buildGraphTraversalPlan(
    routeNodes,
    ['short', 'long'].map((id) => ({ ...edges[0], id, source: id }))
  );
  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  const options = { zoom: 1, panX: 20, panY: 20, width: 600, height: 300, isDark: false };
  const glintsAt = (elapsedMs) => {
    const { ctx, draws } = createTraversalContext();
    const animation = createGraphTraversalAnimation(plan);
    const cycle = animation.cycle;
    advanceGraphTraversal(animation, elapsedMs, nodeMap);
    drawGraphTraversal(ctx, animation, options);
    return { animation, cycle, draws };
  };
  const positions = [0, 50, 100, 150, 200].map((elapsedMs) => {
    const { draws } = glintsAt(elapsedMs);
    assert.equal(draws.length, 2);
    assert.equal(draws[0].x, draws[1].x);
    return draws[0].x;
  });
  const distances = positions.slice(1).map((position, index) => position - positions[index]);
  assert.ok(distances.every((distance) => Math.abs(distance - 30) < 1e-6));
  const halfFinished = glintsAt(300);
  assert.equal(halfFinished.draws.length, 1);
  assert.equal(halfFinished.animation.pauseUntilMs, null);
  assert.equal(halfFinished.cycle.activatedAtMs.get('short'), 300);
  const finished = glintsAt(600);
  assert.equal(finished.draws.length, 2);
  assert.equal(finished.cycle.allNodesReachedAtMs, 600);
  assert.equal(finished.animation.cycle.startedAtMs, 600);
  assert.equal(finished.animation.pauseUntilMs, null);

  const arrival = glintsAt(600 - 1e-6).draws[0];
  const front = arrival.x + arrival.left + arrival.length;
  const destinationBoundary = routeNodes[2].x - routeNodes[2].radius;
  assert.ok(Math.abs(front - destinationBoundary) < 1e-6);
});

test('screen speed follows zoom while graph progress and arrival times remain unchanged', () => {
  const routeNodes = [nodes[0], { ...nodes[3], x: 1000 }];
  const plan = buildGraphTraversalPlan(routeNodes, [edges[0]]);
  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  const glintAt = (animation, elapsedMs, zoom) => {
    advanceGraphTraversal(animation, elapsedMs, nodeMap);
    const { ctx, draws } = createTraversalContext();
    drawGraphTraversal(ctx, animation, {
      zoom,
      panX: 20,
      panY: 20,
      width: 1200,
      height: 300,
      isDark: false,
    });
    assert.equal(draws.length, 1);
    return draws[0];
  };
  for (const zoom of [0.02, 0.5, 1, 2, 3.5]) {
    const animation = createGraphTraversalAnimation(plan);
    const cycle = animation.cycle;
    const first = glintAt(animation, 100, zoom);
    const second = glintAt(animation, 200, zoom);
    const screenSpeed = ((second.x - first.x) * zoom * 1000) / 100;
    assert.ok(Math.abs(screenSpeed - 600 * zoom) < 1e-6);
    advanceGraphTraversal(animation, 1580 - 1, nodeMap);
    assert.equal(animation.pauseUntilMs, null);
    advanceGraphTraversal(animation, 1580, nodeMap);
    assert.equal(cycle.activatedAtMs.get('note'), 1580);
    assert.equal(animation.cycle.startedAtMs, 1580);
    assert.equal(animation.pauseUntilMs, null);
  }

  const changingZoom = createGraphTraversalAnimation(plan);
  const first = glintAt(changingZoom, 100, 1);
  const second = glintAt(changingZoom, 200, 2);
  const third = glintAt(changingZoom, 300, 0.5);
  assert.equal(second.x - first.x, 60);
  assert.equal(third.x - second.x, 60);
  assert.equal(first.length, second.length);
  assert.equal(third.length * 0.5, 16);
  assert.equal(third.height * 0.5, 2);

  routeNodes[1].x = 208;
  const animation = createGraphTraversalAnimation(plan);
  const cycle = animation.cycle;
  advanceGraphTraversal(animation, 225, nodeMap);
  routeNodes[1].x = 408;
  advanceGraphTraversal(animation, 300, nodeMap);
  assert.equal(animation.pauseUntilMs, null);
  const liveArrival = (356 / 600) * 1000;
  advanceGraphTraversal(animation, liveArrival, nodeMap);
  assert.equal(cycle.allNodesReachedAtMs, liveArrival);
  assert.equal(animation.cycle.startedAtMs, liveArrival);
  assert.equal(animation.pauseUntilMs, null);
  assert.equal(animation.steps[0].along, 26);
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

test('long inactive periods skip finished history while retaining every still-active overlapping cycle', () => {
  const reference = createOverlappingTraversal();
  const referenceTime = 4020;
  for (let time = 0; time <= referenceTime; time += 20) {
    advanceGraphTraversal(reference.animation, time, reference.nodeMap);
  }
  const resumed = createOverlappingTraversal();
  advanceGraphTraversal(resumed.animation, 0, resumed.nodeMap);
  const resumedTime = 24 * 60 * 60 * 1000 + 20;
  advanceGraphTraversal(resumed.animation, resumedTime, resumed.nodeMap);
  assert.equal(resumed.animation.cycle.startedAtMs, resumedTime - 20);
  assert.equal(resumed.animation.steps.length, 22);
  const phase = (animation, time) =>
    animation.steps
      .map((step) => ({
        edgeId: step.edgeId,
        cycleAge: time - step.cycle.startedAtMs,
        age: time - step.startedAtMs,
        along: step.along,
      }))
      .sort(
        (left, right) => left.cycleAge - right.cycleAge || left.edgeId.localeCompare(right.edgeId)
      );
  assert.deepEqual(
    phase(resumed.animation, resumedTime),
    phase(reference.animation, referenceTime)
  );
});

test('layout changes cannot start a new cycle before another node already visited in that cycle', () => {
  const routeNodes = [
    nodes[0],
    { ...nodes[3], id: 'first', x: 172 },
    { ...nodes[3], id: 'moving', x: 352 },
  ];
  const plan = buildGraphTraversalPlan(
    routeNodes,
    routeNodes.slice(1).map((node) => ({
      ...edges[0],
      id: node.id,
      source: node.id,
    }))
  );
  const animation = createGraphTraversalAnimation(plan);
  const cycle = animation.cycle;
  const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
  advanceGraphTraversal(animation, 200, nodeMap);
  assert.equal(cycle.activatedAtMs.get('first'), 200);
  routeNodes[2].x = 72;
  advanceGraphTraversal(animation, 240, nodeMap);
  assert.ok(cycle.activatedAtMs.get('moving') < 200);
  assert.equal(cycle.allNodesReachedAtMs, 200);
  assert.equal(animation.cycle.startedAtMs, 200);
});

test('500 edges reuse one gradient sprite across animation frames', () => {
  const root = { id: 'class:note', role: 'CLASS', classKind: 'NOTE', x: 0, y: 0, radius: 10 };
  const leaves = Array.from({ length: 500 }, (_, index) => ({
    id: `note:${index}`,
    role: 'INSTANCE',
    x: 100 + (index % 20) * 10,
    y: Math.floor(index / 20) * 10,
    radius: 5,
  }));
  const plan = buildGraphTraversalPlan(
    [root, ...leaves],
    leaves.map((leaf) => ({
      id: `type:${leaf.id}`,
      source: leaf.id,
      target: root.id,
      type: 'INSTANCE_OF',
    }))
  );
  const { ctx, images, gradients, draws } = createTraversalContext();
  const nodeMap = new Map([root, ...leaves].map((node) => [node.id, node]));
  const options = { zoom: 1, panX: 20, panY: 20, width: 600, height: 400, isDark: false };
  const animation = createGraphTraversalAnimation(plan);
  const steps = animation.steps;
  for (const time of [30, 60]) {
    advanceGraphTraversal(animation, time, nodeMap);
    assert.equal(drawGraphTraversal(ctx, animation, options), true);
    assert.equal(animation.steps, steps);
  }
  assert.equal(draws.length, 1000);
  assert.equal(images.length, 1);
  assert.equal(gradients.length, 2);
  assert.ok(draws.every((draw) => draw.image === images[0]));
  const [tail, thickness] = gradients;
  assert.equal(tail.stops[0][0], 0);
  assert.match(tail.stops[0][1], /, 0\)$/);
  const tailOpacity = tail.stops.map(([offset, color]) => [
    offset,
    Number(color.match(/, ([\d.]+)\)$/)[1]),
  ]);
  assert.ok(tailOpacity.at(-2)[0] >= 0.85);
  assert.equal(tailOpacity.at(-2)[1], 1);
  assert.deepEqual(tail.stops.at(-1), [1, tail.stops.at(-2)[1]]);
  for (let index = 1; index < tailOpacity.length; index++) {
    assert.ok(tailOpacity[index][1] >= tailOpacity[index - 1][1]);
  }
  assert.ok(tailOpacity.slice(1, -2).every(([, opacity]) => opacity > 0 && opacity < 1));
  assert.equal(thickness.stops[0][0], 0);
  assert.match(thickness.stops[0][1], /, 0\)$/);
  assert.deepEqual(thickness.stops[2], [0.5, 'rgba(255, 255, 255, 1)']);
  assert.equal(thickness.stops.at(-1)[0], 1);
  assert.match(thickness.stops.at(-1)[1], /, 0\)$/);
});

test('zoomed-out glints retain a visible screen size without changing their movement position', () => {
  for (const distance of [30, 10000]) {
    const routeNodes = [nodes[0], { ...nodes[3], x: distance }];
    const plan = buildGraphTraversalPlan(routeNodes, [edges[0]]);
    const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
    const expectedLength = distance === 30 ? 4 : 32;
    const expectedHeight = distance === 30 ? 2 : 4;
    for (const zoom of [0.02, 0.5, 1, 2, 3.5]) {
      const { ctx, draws } = createTraversalContext();
      const animation = createGraphTraversalAnimation(plan);
      advanceGraphTraversal(animation, distance === 30 ? 1 : 500, nodeMap);
      drawGraphTraversal(ctx, animation, {
        zoom,
        panX: 20,
        panY: 20,
        width: 600,
        height: 400,
        isDark: false,
      });
      assert.equal(draws.length, 1);
      assert.ok(Math.abs(draws[0].length * zoom - Math.max(expectedLength * zoom, 8)) < 1e-6);
      assert.ok(Math.abs(draws[0].height * zoom - Math.max(expectedHeight * zoom, 1)) < 1e-6);
      assert.equal(draws[0].x, animation.steps[0].along);
      assert.ok(
        Math.abs(
          draws[0].x +
            draws[0].left +
            draws[0].length -
            (animation.steps[0].along + expectedLength / 2)
        ) < 1e-6
      );
      assert.equal(animation.steps[0].glintLength, expectedLength);
      assert.ok(draws[0].x > routeNodes[0].radius);
      assert.ok(draws[0].x < routeNodes[1].x - routeNodes[1].radius);
      assert.ok(draws[0].alpha >= 0.32 && draws[0].alpha <= 0.48);
      if (zoom < 1) assert.ok(draws[0].alpha > 0.32);
      else assert.equal(draws[0].alpha, 0.32);
    }
  }
});

test('the opaque head leads the fading tail in every direction and stays fixed when zooming out', () => {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const routeNodes = [nodes[0], { ...nodes[3], x: dx * 1000, y: dy * 1000 }];
    const plan = buildGraphTraversalPlan(routeNodes, [edges[0]]);
    const nodeMap = new Map(routeNodes.map((node) => [node.id, node]));
    for (const zoom of [0.02, 1]) {
      for (const isDark of [false, true]) {
        const animation = createGraphTraversalAnimation(plan);
        advanceGraphTraversal(animation, 1, nodeMap);
        const { ctx, draws, gradients } = createTraversalContext();
        drawGraphTraversal(ctx, animation, {
          zoom,
          isDark,
          panX: 20,
          panY: 20,
          width: 600,
          height: 400,
        });
        assert.equal(draws.length, 1);
        const [glint] = draws;
        assert.deepEqual(glint.direction, [dx, dy]);
        assert.ok(Math.abs(glint.x + dx * (glint.left + glint.length) - dx * 42.6) < 1e-6);
        assert.ok(Math.abs(glint.y + dy * (glint.left + glint.length) - dy * 42.6) < 1e-6);
        assert.match(gradients[0].stops[0][1], /, 0\)$/);
        assert.ok(gradients[0].stops.at(-2)[0] >= 0.85);
        assert.match(gradients[0].stops.at(-2)[1], /, 1\)$/);
        assert.deepEqual(gradients[0].stops.at(-1), [1, gradients[0].stops.at(-2)[1]]);
      }
    }
  }
});
