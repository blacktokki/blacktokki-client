const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { centeredViewportForNode, advanceSelectionCamera, findNodeAtScreenCoord, drawEdges } = load(
  '../utils/canvasRenderer.ts'
);

const worldToScreen = (x, y, panX, panY, zoom) => ({
  x: x * zoom + panX,
  y: y * zoom + panY,
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

  for (const isDark of [false, true]) {
    edgeIndex = 0;
    edgeStyles.clear();
    arrowFills = 0;
    drawEdges(mockCtx, edges, nodeMap, { ...options, isDark });

    const directEdge = edgeStyles.get('edge:1-2');
    const twoHopEdge = edgeStyles.get('edge:2-3');
    const externalEdge = edgeStyles.get('edge:other');

    assert.ok(directEdge, 'Direct 1-hop edge was styled');
    assert.ok(twoHopEdge, '2-hop edge was styled');
    assert.ok(externalEdge, 'External edge was styled');
    assert.ok(
      directEdge.opacity >= 0.45 && directEdge.opacity <= 0.65 && directEdge.width <= 1.4,
      'Direct connections remain visible with moderate opacity and thin strokes'
    );
    assert.ok(
      twoHopEdge.opacity >= 0.25 && twoHopEdge.opacity <= 0.4 && twoHopEdge.width <= 1.2,
      'Other related connections use a softer emphasis'
    );
    assert.ok(directEdge.opacity > twoHopEdge.opacity && directEdge.width > twoHopEdge.width);
    assert.ok(twoHopEdge.opacity > externalEdge.opacity);
    assert.ok(externalEdge.opacity <= 0.05, `External edge is dimmed: ${externalEdge.opacity}`);
    assert.ok(arrowFills > 0, 'Straight edges render arrowheads');
  }
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
