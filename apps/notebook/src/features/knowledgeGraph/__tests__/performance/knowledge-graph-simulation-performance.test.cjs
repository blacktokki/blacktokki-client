const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../../keywordRelation/__tests__/loadTs.cjs');
const {
  initForceSimulation,
  stepForceSimulation,
  advanceForceSimulation,
  setSimulationFocus,
  DEFAULT_LAYOUT_CONFIG,
} = load('../utils/forceLayout.ts');

const makeNode = (id, x, y, extra = {}) => ({
  id,
  name: id,
  role: 'INSTANCE',
  instanceKind: 'CARD',
  radius: 10,
  x,
  y,
  ...extra,
});
const assertPositions = (actual, expected, excluded = new Set()) => {
  for (let i = 0; i < actual.length; i++) {
    if (excluded.has(actual[i].id)) continue;
    for (const field of ['x', 'y', 'vx', 'vy']) {
      assert.ok(
        Math.abs(actual[i][field] - expected[i][field]) < 1e-8,
        `${actual[i].id}.${field}: ${actual[i][field]} vs ${expected[i][field]}`
      );
    }
  }
};

test('selection gathering is 2.5 times wider at both ranges while overview spacing stays intact', () => {
  const factor = DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const run = (multiplier, depth, selected) => {
    DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier = multiplier;
    const nodes = Array.from({ length: depth + 1 }, (_, i) =>
      makeNode(`node:${i}`, -1200 + i * 2400, 100)
    );
    const edges = nodes.slice(1).map((n, i) => ({
      source: `node:${i}`,
      target: n.id,
      type: 'REFERENCES',
    }));
    const context = initForceSimulation(nodes, edges, {
      width: 1400,
      height: 950,
      selectedNodeId: selected ? 'node:0' : null,
      focusDepth: depth,
      focusedNodeIds: selected ? new Set(nodes.map((n) => n.id)) : null,
    });
    for (let i = 0; i < 400; i++) stepForceSimulation(context, 0.55);
    return context;
  };
  try {
    for (const depth of [1, 2]) {
      const previous = run(1, depth, true);
      const wider = run(factor, depth, true);
      assert.equal(wider.precomputedFocusPulls.length, depth);
      for (let i = 0; i < depth; i++) {
        const oldGap = distance(previous.simNodes[i], previous.simNodes[i + 1]);
        const newGap = distance(wider.simNodes[i], wider.simNodes[i + 1]);
        assert.ok(Math.abs(newGap / oldGap - 2.5) < 0.03, `range ${depth}: ${newGap / oldGap}`);
      }
      assertPositions(run(factor, depth, false).simNodes, run(1, depth, false).simNodes);
    }
  } finally {
    DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier = factor;
  }
});

test('budgeted simulation yields without exposing partial positions and completes the same step', () => {
  const nodes = Array.from({ length: 800 }, (_, i) =>
    makeNode(`node:${i}`, ((i * 37) % 900) - 450, ((i * 53) % 900) - 450)
  );
  const options = { width: 1000, height: 700 };
  const expected = initForceSimulation(nodes, [], options);
  const sliced = initForceSimulation(nodes, [], options);
  const before = structuredClone(sliced.simNodes);
  const movement = stepForceSimulation(expected, 0.65);
  let yields = 0,
    result;
  do {
    result = advanceForceSimulation(sliced, yields === 0 ? 0.65 : 0.2, 0);
    if (result === null) {
      yields++;
      assert.deepEqual(sliced.simNodes, before);
    }
    assert.ok(yields < nodes.length);
  } while (result === null);
  assert.ok(yields > 1);
  assert.equal(result, movement);
  assert.deepEqual(sliced.simNodes, expected.simNodes);
  assert.equal(sliced.repulsionCursor, null);
});

test('focus changes discard an unfinished step and update collision priorities', () => {
  const nodes = Array.from({ length: 180 }, (_, i) =>
    makeNode(`node:${i}`, ((i * 37) % 900) - 450, ((i * 53) % 900) - 450)
  );
  nodes[0] = makeNode('board:a', 100, 100, { role: 'CLASS', classKind: 'BOARD_CARD' });
  nodes[1] = makeNode('board:b', 200, 100, { role: 'CLASS', classKind: 'BOARD_CARD' });
  const focused = new Set(['board:a', 'board:b']);
  const options = { width: 1000, height: 700 };
  const context = initForceSimulation(nodes, [], options);
  assert.equal(advanceForceSimulation(context, 1, 0), null);
  setSimulationFocus(context, [], 'board:a', 1, focused);
  const expected = initForceSimulation(nodes, [], {
    ...options,
    selectedNodeId: 'board:a',
    focusDepth: 1,
    focusedNodeIds: focused,
  });
  stepForceSimulation(context, 0.55);
  stepForceSimulation(expected, 0.55);
  assert.deepEqual(context.simNodes, expected.simNodes);
});

test('simulation buffers grow linearly for a 9500-node graph', () => {
  const nodes = Array.from({ length: 9500 }, (_, i) => makeNode(`node:${i}`, i * 1000 + 1, 100));
  const context = initForceSimulation(nodes, [], { width: 1200, height: 800 });
  const bytes = Object.values(context).reduce(
    (sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0),
    0
  );
  assert.ok(bytes <= nodes.length * 46 + 16, `${bytes} buffer bytes`);
  assert.equal(Object.hasOwn(context, 'pairMinDist'), false);
  stepForceSimulation(context, 0.5);
  assert.ok(context.simNodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.equal(
    advanceForceSimulation(initForceSimulation([], [], { width: 1200, height: 800 }), 1, 0),
    0
  );
});

const renderer = load('../utils/canvasRenderer.ts');
const createDrawingRecorder = () => {
  const arcs = [],
    labels = [],
    lines = [];
  let fills = 0,
    strokes = 0;
  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    closePath() {},
    quadraticCurveTo() {},
    setLineDash() {},
    setTransform() {},
    arc(x, y, radius) {
      arcs.push({ x, y, radius, alpha: this.globalAlpha });
    },
    lineTo(x, y) {
      lines.push({ x, y, alpha: this.globalAlpha, color: this.strokeStyle, width: this.lineWidth });
    },
    fillText(text) {
      labels.push(text);
    },
    fill() {
      fills++;
    },
    stroke() {
      strokes++;
    },
  };
  return { ctx, arcs, labels, lines, fills: () => fills, strokes: () => strokes };
};
const overviewOptions = {
  width: 1000,
  height: 800,
  dpr: 1,
  panX: 0,
  panY: 0,
  zoom: 0.1,
  selectedNodeId: null,
  hoveredNodeId: null,
  focusedNodeIds: null,
  violatingNodeIds: new Set(),
  isDark: false,
};

test('overview batches all visible circles while retaining focus, warning and selection details', () => {
  const nodes = Array.from({ length: 1500 }, (_, i) =>
    makeNode(`node:${i}`, i + 100, 100, {
      color: i % 2 ? '#123456' : '#654321',
      strokeColor: '#112233',
    })
  );
  nodes.at(-1).x = 20000;
  const options = {
    ...overviewOptions,
    selectedNodeId: 'node:0',
    hoveredNodeId: 'node:1',
    violatingNodeIds: new Set(['node:2']),
    focusedNodeIds: new Set(['node:0', 'node:1', 'node:2', 'node:4']),
  };
  const recorded = createDrawingRecorder();
  renderer.drawNodes(recorded.ctx, nodes, options);
  assert.equal(recorded.arcs.length, 1502);
  assert.deepEqual(recorded.labels, ['node:0', 'node:1', 'node:2']);
  assert.equal(recorded.arcs.find((arc) => arc.x === nodes[4].x).alpha, 1);
  assert.equal(recorded.arcs.find((arc) => arc.x === nodes[5].x).alpha, 0.12);
  assert.ok(recorded.strokes() < 30);
  assert.ok(recorded.fills() < 15);
  nodes[7].x = 3000;
  const updated = createDrawingRecorder();
  renderer.drawNodes(updated.ctx, nodes, { ...overviewOptions, isDark: true });
  assert.ok(updated.arcs.some((arc) => arc.x === 3000));
  assert.equal(updated.arcs.length, 1499);
  assert.equal(updated.labels.length, 0);
});

test('overview batches interleaved edge styles without losing any relationship', () => {
  const nodeMap = new Map(
    [makeNode('a', 100, 100), makeNode('b', 300, 100)].map((node) => [node.id, node])
  );
  const edges = Array.from({ length: 5000 }, (_, i) => ({
    id: `edge:${i}`,
    source: 'a',
    target: 'b',
    type: i % 2 ? 'REFERENCES' : 'PART_OF',
    dashed: i % 3 === 0,
  }));
  for (const isDark of [false, true]) {
    const recorded = createDrawingRecorder();
    renderer.drawEdges(recorded.ctx, edges, nodeMap, { ...overviewOptions, isDark });
    assert.equal(recorded.lines.length, edges.length);
    assert.ok(recorded.strokes() <= 4);
    assert.equal(recorded.fills(), 0);
    const references = recorded.lines.filter(
      (line) => line.color === (isDark ? '#5DADE2' : '#2874A6')
    );
    assert.equal(references.length, 2500);
    assert.ok(
      references.every((line) => line.width === 1.4 && line.alpha === (isDark ? 0.38 : 0.3))
    );
  }
});
