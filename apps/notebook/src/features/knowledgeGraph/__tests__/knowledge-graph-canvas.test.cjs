const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { createLayoutRunner } = require('./layoutTestHelper.cjs');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-canvas-test-'));
let initForceSimulation;
let stepForceSimulation;
let computeForceLayout;
let screenToWorld;
let centeredViewportForNode;
let advanceSelectionCamera;
let findNodeAtScreenCoord;
let drawEdges;
let drawNodes;

try {
  for (const name of ['relations', 'axioms', 'forceLayout', 'canvasRenderer']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ initForceSimulation, stepForceSimulation } = require(path.join(output, 'forceLayout.js')));
  computeForceLayout = createLayoutRunner(initForceSimulation, stepForceSimulation);
  ({
    screenToWorld,
    centeredViewportForNode,
    advanceSelectionCamera,
    findNodeAtScreenCoord,
    drawEdges,
    drawNodes,
  } = require(path.join(output, 'canvasRenderer.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const worldToScreen = (x, y, panX, panY, zoom) => ({
  x: x * zoom + panX,
  y: y * zoom + panY,
});

test('renders the entire notebook name on the Note class node', () => {
  const name = '노트: 아주 긴 노트북 이름도 지식 그래프 노드에서 온전히 표시';
  const labels = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fillText(text) {
      labels.push(text);
    },
  };
  drawNodes(
    ctx,
    [
      {
        id: 'class:note',
        name,
        role: 'CLASS',
        classKind: 'NOTE',
        x: 100,
        y: 100,
        radius: 17,
        color: '#123456',
      },
    ],
    {
      width: 800,
      height: 600,
      dpr: 1,
      panX: 0,
      panY: 0,
      zoom: 1,
      selectedNodeId: null,
      hoveredNodeId: null,
      focusedNodeIds: null,
      violatingNodeIds: new Set(),
      isDark: false,
    }
  );
  assert.deepEqual(labels, [name]);
});

test('screenToWorld and worldToScreen maintain mathematical invertibility', () => {
  const panX = 150;
  const panY = -80;
  const zoom = 1.4;

  const testWorldPoints = [
    { x: 0, y: 0 },
    { x: 250, y: 400 },
    { x: -500, y: 1200 },
  ];

  for (const wp of testWorldPoints) {
    const screen = worldToScreen(wp.x, wp.y, panX, panY, zoom);
    const restored = screenToWorld(screen.x, screen.y, panX, panY, zoom);

    assert.ok(
      Math.abs(restored.x - wp.x) < 1e-5,
      `World X inverted accurately: ${restored.x} vs ${wp.x}`
    );
    assert.ok(
      Math.abs(restored.y - wp.y) < 1e-5,
      `World Y inverted accurately: ${restored.y} vs ${wp.y}`
    );
  }
});

test('centers a selected node above the preview sheet without changing zoom', () => {
  const node = { x: 720, y: 430 };
  const zoom = 0.65;
  const viewport = centeredViewportForNode(node, 1000, 700, zoom, 250);
  const screen = worldToScreen(node.x, node.y, viewport.panX, viewport.panY, zoom);
  assert.equal(screen.x, 500);
  assert.equal(screen.y, 253);
  assert.ok(screen.y < 700 - 250);
  assert.deepEqual(screenToWorld(screen.x, screen.y, viewport.panX, viewport.panY, zoom), node);
});

test('keeps a moving selected node centered after the camera transition and respects manual control', () => {
  const size = { width: 1000, height: 700, reservedBottomHeight: 250 };
  const node = { x: 100, y: 100 };
  const zoom = 0.65;
  const initialTarget = centeredViewportForNode(
    node,
    size.width,
    size.height,
    zoom,
    size.reservedBottomHeight
  );
  const animation = {
    startX: 0,
    startY: 0,
    endX: initialTarget.panX,
    endY: initialTarget.panY,
    startTime: 0,
  };
  node.x = 300;
  node.y = 250;
  const middle = advanceSelectionCamera(
    { panX: 0, panY: 0, zoom },
    animation,
    node,
    size,
    120,
    true
  );
  assert.notEqual(middle.animation.endX, initialTarget.panX);

  node.x = 720;
  node.y = 430;
  const finished = advanceSelectionCamera(
    { ...middle, zoom },
    middle.animation,
    node,
    size,
    240,
    true
  );
  assert.equal(finished.animation, null);
  assert.deepEqual(worldToScreen(node.x, node.y, finished.panX, finished.panY, zoom), {
    x: 500,
    y: 253,
  });

  node.x = 800;
  node.y = 500;
  const followed = advanceSelectionCamera({ ...finished, zoom }, null, node, size, 256, true);
  assert.deepEqual(worldToScreen(node.x, node.y, followed.panX, followed.panY, zoom), {
    x: 500,
    y: 253,
  });
  node.x += 100;
  node.y += 100;
  const manual = advanceSelectionCamera({ ...followed, zoom }, null, node, size, 272, false);
  assert.deepEqual(manual, followed);
});

test('findNodeAtScreenCoord precisely hits circular nodes', () => {
  const nodes = [
    {
      id: 'node:class',
      name: 'Class Node',
      role: 'CLASS',
      type: 'CLASS',
      x: 100,
      y: 100,
      radius: 15,
    },
    {
      id: 'node:note',
      name: 'Note Node',
      role: 'INSTANCE',
      type: 'INSTANCE',
      instanceKind: 'NOTE',
      x: 300,
      y: 300,
      radius: 10,
    },
  ];

  const panX = 0;
  const panY = 0;
  const zoom = 1.0;

  // 1. Direct center hits
  assert.equal(findNodeAtScreenCoord(nodes, 100, 100, panX, panY, zoom)?.id, 'node:class');
  assert.equal(findNodeAtScreenCoord(nodes, 300, 300, panX, panY, zoom)?.id, 'node:note');

  // 2. Boundary hits with touch padding
  assert.equal(findNodeAtScreenCoord(nodes, 100 + 15 + 4, 100, panX, panY, zoom)?.id, 'node:class');
  assert.equal(findNodeAtScreenCoord(nodes, 300 + 10 + 4, 300, panX, panY, zoom)?.id, 'node:note');

  // 3. Clear misses
  assert.equal(findNodeAtScreenCoord(nodes, 100 + 35, 100, panX, panY, zoom), null);
  assert.equal(findNodeAtScreenCoord(nodes, 0, 0, panX, panY, zoom), null);
  assert.equal(findNodeAtScreenCoord(nodes, 300 + 30, 300, panX, panY, zoom), null);
});

test('findNodeAtScreenCoord performs sub-millisecond hit-testing on 500 nodes', () => {
  const nodeCount = 500;
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `node:${i}`,
    name: `Node ${i}`,
    role: i < 20 ? 'CLASS' : 'INSTANCE',
    type: i < 20 ? 'CLASS' : 'INSTANCE',
    x: (i % 25) * 50,
    y: Math.floor(i / 25) * 50,
    radius: 12,
  }));

  const start = performance.now();
  const iterations = 1000;
  for (let iter = 0; iter < iterations; iter++) {
    const testX = (iter % 30) * 45;
    const testY = (iter % 20) * 45;
    findNodeAtScreenCoord(nodes, testX, testY, 0, 0, 1.0);
  }
  const duration = performance.now() - start;
  const perCheckMs = duration / iterations;

  assert.ok(
    perCheckMs < 0.1,
    `Hit testing is sub-millisecond: ${perCheckMs.toFixed(4)}ms per check`
  );
});

test('stepForceSimulation incrementally settles 500 nodes and 1000 edges smoothly', () => {
  const nodeCount = 500;
  const edgeCount = 1000;

  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    name: `Node ${index}`,
    role: index < 20 ? 'CLASS' : 'INSTANCE',
    type: index < 20 ? 'CLASS' : 'INSTANCE',
    classCategory: index < 10 ? 'BOARD' : undefined,
    instanceKind: index >= 20 && index < 80 ? 'NOTE' : 'CARD',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: index < 20 ? 15 : 9,
  }));

  const edges = [];
  for (let i = 20; i < nodeCount; i++) {
    edges.push({
      id: `edge:inst:${i}`,
      source: `node:${i}`,
      target: `node:${i % 20}`,
      type: 'INSTANCE_OF',
    });
  }
  for (let i = edges.length; i < edgeCount; i++) {
    edges.push({
      id: `edge:ref:${i}`,
      source: `node:${(i * 7) % nodeCount}`,
      target: `node:${(i * 13 + 1) % nodeCount}`,
      type: 'REFERENCES',
    });
  }

  const context = initForceSimulation(nodes, edges, {
    width: 800,
    height: 600,
    spacingScale: 1.0,
  });

  assert.equal(context.simNodes.length, nodeCount);

  // Run incremental steps simulating 60fps frames
  let alpha = 1.0;
  const movements = [];
  for (let frame = 0; frame < 90; frame++) {
    const move = stepForceSimulation(context, alpha);
    movements.push(move);
    alpha *= 0.98;
  }

  // Verify that movement steadily cools down without exploding
  const earlyMovement = (movements[0] + movements[1] + movements[2]) / 3;
  const lateMovement = (movements[87] + movements[88] + movements[89]) / 3;

  assert.ok(
    lateMovement < earlyMovement * 0.25,
    `Simulation settled smoothly: early=${earlyMovement.toFixed(2)}, late=${lateMovement.toFixed(
      2
    )}`
  );

  // Check no NaN or infinite coordinates
  for (const node of context.simNodes) {
    assert.ok(Number.isFinite(node.x), `Node ${node.id} has finite x`);
    assert.ok(Number.isFinite(node.y), `Node ${node.id} has finite y`);
  }
});

test('seeds new node close to existing connected neighbor', () => {
  const existingNodes = [
    {
      id: 'node:existing',
      name: 'Existing Node',
      role: 'CLASS',
      type: 'CLASS',
      x: 1000,
      y: 1000,
      radius: 15,
    },
    {
      id: 'node:new_child',
      name: 'New Child Node',
      role: 'INSTANCE',
      type: 'INSTANCE',
      x: 0,
      y: 0,
      radius: 9,
    },
  ];

  const edges = [
    {
      id: 'edge:1',
      source: 'node:new_child',
      target: 'node:existing',
      type: 'INSTANCE_OF',
    },
  ];

  const context = initForceSimulation(existingNodes, edges, {
    width: 800,
    height: 600,
  });

  const existingNode = context.simNodes.find((n) => n.id === 'node:existing');
  const newNode = context.simNodes.find((n) => n.id === 'node:new_child');

  const dist = Math.hypot(newNode.x - existingNode.x, newNode.y - existingNode.y);

  // Neighbor seeding should place the new child near the existing node (around 100~180px), not 1500px away at canvas origin
  assert.ok(
    dist < 250,
    `New child node seeded near parent neighbor: distance=${dist.toFixed(2)}px (expected < 250px)`
  );
});

test('drawEdges highlights both 1-hop and N-hop (2-hop/all) edges when focusedNodeIds are present', () => {
  const nodes = [
    { id: 'node:1', x: 100, y: 100, radius: 15 },
    { id: 'node:2', x: 200, y: 100, radius: 15 },
    { id: 'node:3', x: 300, y: 100, radius: 15 },
    { id: 'node:otherA', x: 100, y: 400, radius: 15 },
    { id: 'node:otherB', x: 200, y: 400, radius: 15 },
  ];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = [
    { id: 'edge:1-2', source: 'node:1', target: 'node:2', type: 'REFERENCES' },
    { id: 'edge:2-3', source: 'node:2', target: 'node:3', type: 'REFERENCES' },
    { id: 'edge:other', source: 'node:otherA', target: 'node:otherB', type: 'REFERENCES' },
  ];

  const edgeStyles = new Map();
  let currentAlpha = 1;
  let currentWidth = 1;
  let arrowFills = 0;

  const mockCtx = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {
      arrowFills++;
    },
    closePath: () => {},
    setLineDash: () => {},
    set globalAlpha(val) {
      currentAlpha = val;
    },
    get globalAlpha() {
      return currentAlpha;
    },
    set lineWidth(val) {
      currentWidth = val;
    },
    get lineWidth() {
      return currentWidth;
    },
    strokeText: () => {},
    fillText: () => {},
  };

  let edgeIndex = 0;
  mockCtx.stroke = () => {
    if (edgeIndex < edges.length) {
      edgeStyles.set(edges[edgeIndex].id, {
        opacity: currentAlpha,
        width: currentWidth,
      });
      edgeIndex++;
    }
  };

  const options = {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    width: 800,
    height: 600,
    isDark: false,
    selectedNodeId: 'node:1',
    focusedNodeIds: new Set(['node:1', 'node:2', 'node:3']), // 2-hop or All range
  };

  drawEdges(mockCtx, edges, nodeMap, options);

  const directEdge = edgeStyles.get('edge:1-2');
  const twoHopEdge = edgeStyles.get('edge:2-3');
  const externalEdge = edgeStyles.get('edge:other');

  assert.ok(directEdge, 'Direct 1-hop edge was styled');
  assert.ok(twoHopEdge, '2-hop edge was styled');
  assert.ok(externalEdge, 'External edge was styled');

  // Direct 1-hop: strong highlight (opacity >= 0.9, width >= 2.0)
  assert.ok(directEdge.opacity >= 0.9, `Direct edge has high opacity: ${directEdge.opacity}`);
  assert.ok(directEdge.width >= 2.0, `Direct edge has thick stroke: ${directEdge.width}`);

  // 2-hop / All: line highlight (opacity >= 0.75, width >= 1.7)
  assert.ok(twoHopEdge.opacity >= 0.75, `2-hop edge is highlighted: ${twoHopEdge.opacity}`);
  assert.ok(twoHopEdge.width >= 1.7, `2-hop edge has emphasized stroke: ${twoHopEdge.width}`);

  // External: dimmed (opacity <= 0.05, width <= 0.8)
  assert.ok(externalEdge.opacity <= 0.05, `External edge is dimmed: ${externalEdge.opacity}`);
  assert.ok(arrowFills > 0, 'Straight edges render arrowheads');
});

test('drawEdges separates labels for every relationship between the same two nodes', () => {
  const nodes = [
    { id: 'node:a', x: 100, y: 100, radius: 15 },
    { id: 'node:b', x: 300, y: 100, radius: 15 },
    { id: 'node:c', x: 100, y: 300, radius: 15 },
    { id: 'node:d', x: 300, y: 300, radius: 15 },
  ];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = [
    {
      id: 'edge:2',
      source: 'node:a',
      target: 'node:b',
      type: 'REFERENCES',
      propertyLabel: 'references',
    },
    {
      id: 'edge:3',
      source: 'node:b',
      target: 'node:a',
      type: 'PART_OF',
      propertyLabel: 'part of',
    },
    {
      id: 'edge:1',
      source: 'node:a',
      target: 'node:b',
      type: 'INSTANCE_OF',
      propertyLabel: 'instance of',
    },
    {
      id: 'edge:4',
      source: 'node:a',
      target: 'node:c',
      type: 'REFERENCES',
      propertyLabel: 'vertical reference',
    },
    {
      id: 'edge:5',
      source: 'node:c',
      target: 'node:a',
      type: 'PART_OF',
      propertyLabel: 'vertical parent',
    },
    {
      id: 'edge:6',
      source: 'node:a',
      target: 'node:d',
      type: 'REFERENCES',
      propertyLabel: 'single relation',
    },
  ];
  const labels = new Map();
  const mockCtx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    setLineDash() {},
    measureText(text) {
      return { width: text.length * 7 };
    },
    fillText(text, x, y) {
      labels.set(text, { x, y });
    },
  };

  drawEdges(mockCtx, edges, nodeMap, {
    zoom: 1,
    panX: 0,
    panY: 0,
    width: 800,
    height: 600,
    isDark: false,
    selectedNodeId: 'node:a',
    hoveredNodeId: null,
    focusedNodeIds: null,
  });

  const horizontal = ['instance of', 'references', 'part of'].map((label) => labels.get(label));
  const vertical = ['vertical reference', 'vertical parent'].map((label) => labels.get(label));
  assert.deepEqual(
    horizontal.map((label) => label.x),
    [200, 200, 200]
  );
  assert.deepEqual(
    horizontal.map((label) => label.y),
    [82.5, 100.5, 118.5]
  );
  assert.deepEqual(
    vertical.map((label) => label.x),
    [100, 100]
  );
  assert.ok(Math.abs(vertical[0].y - vertical[1].y) >= 18);
  assert.deepEqual(labels.get('single relation'), { x: 200, y: 200.5 });
});
