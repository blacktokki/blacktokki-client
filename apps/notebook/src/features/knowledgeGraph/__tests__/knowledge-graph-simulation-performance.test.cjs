const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../utils/forceLayout.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleFixture = { exports: {} };
compileFunction(compiled, ['exports', 'module'])(moduleFixture.exports, moduleFixture);
const { initForceSimulation, stepForceSimulation, advanceForceSimulation, setSimulationFocus } =
  moduleFixture.exports;

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
const isolateRepulsion = (context) => {
  context.precomputedEdges = [];
  context.precomputedRootPulls = [];
  context.precomputedRootAnchors = [];
  context.precomputedFocusPulls = [];
  context.kGravity = 0;
};

// Independent all-pairs oracle for the physical rules, including the finite cutoff.
const expectedRepulsion = (context, alpha, minDistance) => {
  const nodes = context.simNodes.map((node) => ({ ...node }));
  const excluded = new Set([context.noteClassNode?.id, context.externalClassNode?.id]);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      if (excluded.has(a.id) || excluded.has(b.id)) continue;
      let dx = a.x - b.x,
        dy = a.y - b.y;
      const squared = dx * dx + dy * dy;
      if (squared > context.maxRepulseDistSq) continue;
      let distance = Math.sqrt(squared);
      if (squared < 1) {
        const angle = ((i * 31 + j * 17) % 628) / 100;
        dx = Math.cos(angle) * 2;
        dy = Math.sin(angle) * 2;
        distance = Math.sqrt(dx * dx + dy * dy + 1);
      }
      const overlap = Math.max(0, minDistance(a, b) - distance);
      const force =
        context.kRepulse * (distance < 25 ? 0.04 : 1 / distance) +
        overlap * (context.collisionForce + 0.3);
      const fx = (dx / distance) * force,
        fy = (dy / distance) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }
  for (const node of nodes) {
    if (excluded.has(node.id)) continue;
    const speed = Math.hypot(node.vx, node.vy);
    const limit = Math.min(1, context.maxVelocity / (speed || 1));
    node.vx *= limit;
    node.vy *= limit;
    node.x += node.vx * alpha;
    node.y += node.vy * alpha;
    node.vx *= 0.72;
    node.vy *= 0.72;
  }
  return nodes;
};
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

test('spatial forces match all-pairs forces at negative cell boundaries, cutoff and coincident points', () => {
  for (const distance of [0, 0.1, 24, 119, 170, 549.99, 550, 550.01]) {
    const nodes = Array.from({ length: 150 }, (_, i) => makeNode(`far:${i}`, 10000 * (i + 1), 100));
    nodes[0] = makeNode('left', -550.05, -550.05);
    nodes[1] = makeNode('right', -550.05 + distance, -550.05);
    nodes[2] = makeNode('class', -560, -555, { role: 'CLASS' });
    const context = initForceSimulation(nodes, [], { width: 1000, height: 700 });
    isolateRepulsion(context);
    for (let frame = 0; frame < 4; frame++) {
      const expected = expectedRepulsion(context, 0.65, (a, b) =>
        a.role === 'CLASS' || b.role === 'CLASS' ? 170 : 120
      );
      stepForceSimulation(context, 0.65);
      assertPositions(context.simNodes, expected);
    }
  }
});

test('nearby root, class and focus collision distances match the full pair rules', () => {
  const roots = new Set(['note:a', 'note:b', 'board:a', 'board:b']);
  const assignedRoot = new Map([...roots].map((id) => [id, id]));
  const nodes = [
    makeNode('note:class', -100, 100, { role: 'CLASS', classKind: 'NOTE' }),
    makeNode('external:class', -100, 100, { role: 'CLASS', classKind: 'EXTERNAL_LINK' }),
    ...[...roots].map((id, i) =>
      makeNode(
        id,
        100 + i * 65,
        -100,
        id.startsWith('board:')
          ? { role: 'CLASS', classKind: 'BOARD_CARD' }
          : { instanceKind: 'NOTE' }
      )
    ),
  ];
  const edges = [
    { source: 'note:a', target: 'note:class', type: 'INSTANCE_OF' },
    { source: 'note:b', target: 'note:class', type: 'INSTANCE_OF' },
  ];
  for (let i = 0; i < 180; i++) {
    const root = [...roots][i % roots.size];
    const id = `child:${i}`;
    nodes.push(makeNode(id, ((i * 37) % 1200) - 600, ((i * 71) % 1200) - 600));
    assignedRoot.set(id, root);
    edges.push({ source: id, target: root, type: 'PART_OF' });
  }
  nodes.push(makeNode('external', 100, 100, { instanceKind: 'EXTERNAL_LINK' }));
  for (const spacingScale of [0.7, 1, 1.37, 2]) {
    for (const focused of [new Set(), new Set(['note:a', 'child:3', 'board:b'])]) {
      const context = initForceSimulation(nodes, edges, {
        width: 1000,
        height: 700,
        spacingScale,
        focusedNodeIds: focused,
      });
      isolateRepulsion(context);
      const expected = expectedRepulsion(context, 0.55, (a, b) => {
        let distance = a.role === 'CLASS' || b.role === 'CLASS' ? 170 : 120;
        if (!focused.has(a.id) && !focused.has(b.id)) {
          if (roots.has(a.id) && roots.has(b.id)) distance = 500;
          else if (
            (roots.has(a.id) && assignedRoot.has(b.id) && assignedRoot.get(b.id) !== a.id) ||
            (roots.has(b.id) && assignedRoot.has(a.id) && assignedRoot.get(a.id) !== b.id)
          )
            distance = 280;
        }
        return Math.fround(distance * spacingScale);
      });
      stepForceSimulation(context, 0.55);
      assertPositions(context.simNodes, expected, new Set(['note:class', 'external:class']));
    }
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

for (const nodeCount of [2, 9557]) {
  test(`canvas keeps zoom responsive for ${nodeCount} nodes and defers large-graph highlights until settled`, () => {
    const effects = [],
      frames = new Map(),
      renders = [],
      alphas = [],
      viewports = [];
    let frameId = 0,
      wheel;
    let traversalAdvances = 0;
    let traversalStarts = 0;
    let now = 0;
    const react = {
      useRef: (current) => ({ current }),
      useCallback: (fn) => fn,
      useEffect: (effect) => effects.push(effect),
      useState: () => [{ width: 1200, height: 800 }, () => {}],
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    };
    const nodes = Array.from({ length: nodeCount }, (_, i) =>
      makeNode(`node:${i}`, i * 10 + 100, i * 5 + 100)
    );
    const modules = {
      react: { ...react, default: react, __esModule: true },
      '../topicDashoard': {
        useTopicBoardDisabled: () => ({ consumeIsTopicBoardDisabled: () => false }),
      },
      '../utils/forceLayout': {
        initForceSimulation: () => ({
          simNodes: nodes,
          precomputedRootAnchors: [],
          precomputedFocusPulls: [],
        }),
        stepForceSimulation: (context) => {
          context.simNodes.forEach((node) => {
            node.x += 10;
          });
          return 1;
        },
        advanceForceSimulation: (_, alpha, budget) => {
          alphas.push(alpha);
          assert.equal(budget, nodeCount >= 6000 ? 12 : 6);
          return alphas.length <= 2 ? null : alphas.length === 3 ? 1 : 0;
        },
      },
      '../utils/canvasRenderer': {
        advanceGraphPresentation: (...args) => renderer.advanceGraphPresentation(...args),
        renderKnowledgeGraphCanvas: (_, displayed, ___, ____, options) =>
          renders.push({ ...options, firstNodeX: displayed[0].x }),
        drawGraphTraversal: () => false,
        advanceSelectionCamera: (viewport) => ({
          panX: viewport.panX,
          panY: viewport.panY,
          animation: null,
        }),
      },
      '../utils/graphTraversal': {
        buildGraphTraversalPlan: () => ({ levels: [[{}]] }),
        createGraphTraversalAnimation: (plan) => {
          traversalStarts++;
          return { plan, pauseUntilMs: null };
        },
        advanceGraphTraversal: () => {
          traversalAdvances++;
        },
      },
    };
    const canvasSource = readFileSync(
      path.join(__dirname, '../components/KnowledgeGraphCanvasView.tsx'),
      'utf8'
    );
    const canvasCode = ts.transpileModule(canvasSource, {
      fileName: 'KnowledgeGraphCanvasView.tsx',
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    const exports = {};
    compileFunction(canvasCode, ['require', 'exports', 'performance'])(
      (name) => modules[name],
      exports,
      { now: () => now }
    );
    const original = {
      window: global.window,
      requestAnimationFrame: global.requestAnimationFrame,
      cancelAnimationFrame: global.cancelAnimationFrame,
    };
    const cleanups = [];
    try {
      global.window = { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} };
      global.requestAnimationFrame = (callback) => {
        frames.set(++frameId, callback);
        return frameId;
      };
      global.cancelAnimationFrame = (id) => frames.delete(id);
      const tree = exports.KnowledgeGraphCanvasView({
        nodes,
        edges: [],
        selectedNodeId: null,
        selectionTrigger: 0,
        reservedBottomHeight: 0,
        isDark: false,
        animateEdges: nodeCount > 6000,
        enableTopicBoards: true,
        onViewportChange: (viewport) => viewports.push(viewport),
      });
      const rect = { width: 1200, height: 800, left: 0, top: 0 };
      tree.props.ref.current = { getBoundingClientRect: () => rect };
      for (const element of tree.props.children) {
        element.props.ref.current = {
          style: {},
          getBoundingClientRect: () => rect,
          getContext: () => ({
            save() {},
            restore() {},
            scale() {},
            translate() {},
            clearRect() {},
          }),
          addEventListener: (name, fn) => {
            if (name === 'wheel') wheel = fn;
          },
          removeEventListener() {},
        };
      }
      effects.forEach((effect) => {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      });
      const tick = (time) => {
        now = time;
        const [id, callback] = [...frames][0];
        frames.delete(id);
        callback(time);
      };
      tick(8);
      const previousZoom = renders.at(-1).zoom;
      const previousX = renders.at(-1).firstNodeX;
      const previousRenders = renders.length;
      wheel({ preventDefault() {}, deltaY: -1, clientX: 100, clientY: 100 });
      tick(16);
      assert.equal(renders.length, previousRenders + 1);
      assert.ok(renders.at(-1).zoom > previousZoom);
      assert.equal(renders.at(-1).zoom, viewports.at(-1).zoom);
      assert.equal(renders.at(-1).moving, nodeCount >= 6000);
      assert.equal(renders.at(-1).dpr, nodeCount >= 6000 ? 0.675 : 2);
      if (nodeCount >= 6000) {
        assert.ok(renders.at(-1).firstNodeX > previousX);
        assert.ok(renders.at(-1).firstNodeX < nodes[0].x);
      }
      tick(24);
      assert.equal(traversalAdvances, 0);
      tick(28);
      if (nodeCount >= 6000) {
        assert.equal(renders.at(-1).moving, true);
        assert.equal(renders.at(-1).dpr, 0.675);
        assert.equal(traversalAdvances, 0);
        const settledX = renders.at(-1).firstNodeX;
        // Restore detail on a stationary frame, including inside the 40 ms highlight interval.
        tick(32);
        assert.equal(renders.at(-1).firstNodeX, settledX);
      }
      assert.equal(renders.at(-1).moving, false);
      assert.equal(renders.at(-1).dpr, 2);
      if (nodeCount > 6000) {
        assert.equal(traversalAdvances, 1);
        assert.equal(traversalStarts, 2);
      }
      const initialAlpha = nodeCount >= 6000 ? 0.982 : 1;
      assert.deepEqual(alphas, [initialAlpha, initialAlpha, initialAlpha, initialAlpha * 0.982]);
      assert.equal(frames.size, 0);
    } finally {
      cleanups.forEach((cleanup) => cleanup());
      Object.assign(global, original);
    }
  });
}

const rendererSource = readFileSync(path.join(__dirname, '../utils/canvasRenderer.ts'), 'utf8');
const rendererCode = ts.transpileModule(rendererSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const renderer = {};
compileFunction(rendererCode, ['exports'])(renderer);

test('presentation keeps moving between model steps and restores exact final coordinates', () => {
  const targets = [makeNode('a', 12.3456789, -43.21), makeNode('b', -0.123, 99.999)];
  const displayed = targets.map((node) => ({ ...node, x: 0, y: 0 }));
  const untouched = structuredClone(targets);
  assert.equal(renderer.advanceGraphPresentation(displayed, targets, 0, false), false);
  for (const elapsed of [8, 17, 31, 16, 45]) {
    const previous = displayed.map((node) => ({ x: node.x, y: node.y }));
    assert.equal(renderer.advanceGraphPresentation(displayed, targets, elapsed, false), true);
    displayed.forEach((node, i) => {
      assert.ok(Math.abs(node.x - targets[i].x) < Math.abs(previous[i].x - targets[i].x));
      assert.ok(Math.abs(node.y - targets[i].y) < Math.abs(previous[i].y - targets[i].y));
    });
  }
  assert.deepEqual(targets, untouched);
  renderer.advanceGraphPresentation(displayed, targets, 1, true);
  assert.deepEqual(displayed, targets);
});
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

test('moving frames retain every visible node and reuse sprites while updating coordinates', () => {
  const nodes = Array.from({ length: 1500 }, (_, i) =>
    makeNode(`node:${i}`, i + 100, 100, {
      color: i % 2 ? '#123456' : '#654321',
      strokeColor: '#112233',
      radius: 10 + (i % 3),
    })
  );
  nodes.at(-1).x = 20000;
  const options = {
    ...overviewOptions,
    moving: true,
    selectedNodeId: 'node:0',
    hoveredNodeId: 'node:1',
    violatingNodeIds: new Set(['node:2']),
    focusedNodeIds: new Set(['node:0', 'node:1', 'node:2', 'node:4']),
  };
  const recorded = createDrawingRecorder();
  const images = [];
  let created = 0;
  recorded.ctx.canvas = {
    ownerDocument: {
      createElement() {
        created++;
        const sprite = createDrawingRecorder().ctx;
        sprite.translate = () => {};
        sprite.scale = () => {};
        return { getContext: () => sprite };
      },
    },
  };
  recorded.ctx.drawImage = function (sprite, x, y) {
    images.push({
      sprite,
      x,
      y,
      width: sprite.width,
      height: sprite.height,
      alpha: this.globalAlpha,
    });
  };
  renderer.drawNodes(recorded.ctx, nodes, options);
  assert.equal(images.length, 1496);
  assert.equal(created, 6);
  assert.deepEqual(recorded.labels, ['node:0', 'node:1', 'node:2']);
  const center = (image) => image.x + image.width / 2;
  assert.equal(images.filter((image) => image.alpha === 1).length, 1);
  assert.equal(images.filter((image) => image.alpha === 0.12).length, 1495);
  images.length = 0;
  nodes[7].x = 3000;
  renderer.drawNodes(recorded.ctx, nodes, options);
  assert.equal(images.length, 1496);
  assert.equal(created, 6);
  assert.ok(images.some((image) => center(image) === 300));
  renderer.drawNodes(recorded.ctx, nodes, { ...options, zoom: 0.12 });
  assert.equal(created, 12);
  renderer.drawNodes(recorded.ctx, nodes, { ...options, isDark: true });
  assert.equal(created, 18);
  const detailed = createDrawingRecorder();
  renderer.drawNodes(detailed.ctx, nodes, { ...options, moving: false, zoom: 0.25 });
  assert.ok(detailed.labels.length > 1000);
});

test('moving frames bound edge paths and restore dashed relationships after settling', () => {
  const nodes = new Map([makeNode('a', 100, 100), makeNode('b', 300, 100)].map((n) => [n.id, n]));
  const edges = Array.from({ length: 5000 }, (_, i) => ({
    id: String(i),
    source: 'a',
    target: 'b',
    type: 'PART_OF',
    dashed: true,
  }));
  const recorded = createDrawingRecorder();
  let pathSegments = 0;
  const pathSizes = [],
    dashes = [];
  recorded.ctx.beginPath = () => {
    pathSegments = 0;
  };
  const lineTo = recorded.ctx.lineTo;
  recorded.ctx.lineTo = function (...args) {
    pathSegments++;
    lineTo.apply(this, args);
  };
  recorded.ctx.stroke = () => pathSizes.push(pathSegments);
  recorded.ctx.setLineDash = (dash) => dashes.push(dash);
  renderer.drawEdges(recorded.ctx, edges, nodes, { ...overviewOptions, moving: true });
  assert.equal(recorded.lines.length, 5000);
  assert.ok(pathSizes.length >= 20);
  assert.ok(pathSizes.every((size) => size > 0 && size <= 256));
  assert.ok(dashes.every((dash) => dash.length === 0));
  renderer.drawEdges(recorded.ctx, edges, nodes, { ...overviewOptions, moving: false });
  assert.equal(recorded.lines.length, 10000);
  assert.ok(dashes.some((dash) => dash.length === 2 && dash[0] === 4));
  const focused = createDrawingRecorder();
  renderer.drawEdges(focused.ctx, edges, nodes, {
    ...overviewOptions,
    zoom: 0.6,
    moving: true,
    selectedNodeId: 'a',
  });
  assert.equal(focused.lines.length, 5000);
  assert.equal(focused.fills(), 0);
  assert.equal(focused.labels.length, 0);
});

test('moving subpixel nodes retain every point without creating sprites', () => {
  const nodes = Array.from({ length: 9557 }, (_, i) =>
    makeNode(String(i), 100 + i, 100, { color: '#123456' })
  );
  const recorded = createDrawingRecorder();
  const dots = [];
  recorded.ctx.canvas = {
    ownerDocument: {
      createElement() {
        throw new Error('Subpixel dots do not need sprites');
      },
    },
  };
  recorded.ctx.drawImage = () => {
    throw new Error('Subpixel dots use pixel drawing');
  };
  recorded.ctx.fillRect = function (x, y, width, height) {
    dots.push({ x, y, width, height, alpha: this.globalAlpha });
  };
  renderer.drawNodes(recorded.ctx, nodes, { ...overviewOptions, moving: true, zoom: 0.01 });
  assert.equal(dots.length, 9557);
  assert.ok(
    dots.every((dot) => dot.width === 1 && dot.height === 1 && dot.alpha > 0 && dot.alpha <= 1)
  );
  assert.equal(recorded.arcs.length, 0);
  assert.equal(recorded.labels.length, 0);
});
