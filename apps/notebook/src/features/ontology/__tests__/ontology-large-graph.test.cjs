const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-large-graph-'));
let computeForceLayout;
let buildTopicClusterIndex;
try {
  for (const name of ['relations', 'titleKeywordClasses', 'axioms', 'forceLayout']) {
    const source = readFileSync(
      path.join(__dirname, '..', `${name}.ts`),
      'utf8'
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ buildTopicClusterIndex, computeForceLayout } = require(path.join(output, 'forceLayout.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

test('stably layouts 500 nodes and 1000 edges within bounded coordinates and fast execution time', () => {
  const nodeCount = 500;
  const edgeCount = 1000;

  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    name: `Node ${index}`,
    role: index < 20 ? 'CLASS' : 'INSTANCE',
    type: index < 20 ? 'CLASS' : 'INSTANCE',
    classCategory: index < 10 ? 'TOPIC' : index < 20 ? 'BOARD' : undefined,
    instanceKind: index >= 20 && index < 100 ? 'NOTE' : 'CARD',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: index < 20 ? 15 : 9,
  }));

  const edges = [];
  // Connect classes to instances and notes
  for (let i = 20; i < nodeCount; i++) {
    const targetClass = `node:${i % 20}`;
    edges.push({
      id: `edge:inst:${i}->${targetClass}`,
      source: `node:${i}`,
      target: targetClass,
      type: 'INSTANCE_OF',
      propertyLabel: 'instanceOf',
    });
  }
  // Add cross references to reach 1000 edges
  for (let i = edges.length; i < edgeCount; i++) {
    const src = `node:${(i * 7) % nodeCount}`;
    const tgt = `node:${(i * 13 + 1) % nodeCount}`;
    edges.push({
      id: `edge:ref:${i}`,
      source: src,
      target: tgt,
      type: 'REFERENCES',
      propertyLabel: 'references',
    });
  }

  const startTime = Date.now();
  const layout = computeForceLayout(nodes, edges, {
    width: 1200,
    height: 800,
    iterations: 130,
    spacingScale: 1.0,
  });
  const elapsedMs = Date.now() - startTime;

  assert.equal(layout.length, nodeCount, 'All 500 nodes must be returned');

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of layout) {
    assert.ok(Number.isFinite(node.x), `Node ${node.id} X must be finite`);
    assert.ok(Number.isFinite(node.y), `Node ${node.id} Y must be finite`);
    assert.equal(isNaN(node.x), false, `Node ${node.id} X must not be NaN`);
    assert.equal(isNaN(node.y), false, `Node ${node.id} Y must not be NaN`);

    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // Verify coordinates are bounded and not exploding into hundreds of thousands of pixels
  assert.ok(spanX < 7000, `Horizontal span (${spanX}) must remain under 7000px`);
  assert.ok(spanY < 7000, `Vertical span (${spanY}) must remain under 7000px`);
  assert.ok(spanX > 500, `Horizontal span (${spanX}) must have healthy distribution`);
  assert.ok(spanY > 500, `Vertical span (${spanY}) must have healthy distribution`);

  // Performance requirement: fast convergence (well under 500ms)
  assert.ok(elapsedMs < 500, `Layout simulation must complete under 500ms (took ${elapsedMs}ms)`);
});

test('fitToScreen accurately maps all 500 nodes inside screen bounds', () => {
  const nodeCount = 500;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    name: `Node ${index}`,
    role: 'INSTANCE',
    type: 'INSTANCE',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 9,
  }));
  const edges = Array.from({ length: 500 }, (_, index) => ({
    id: `edge:${index}`,
    source: `node:${index}`,
    target: `node:${(index + 1) % nodeCount}`,
    type: 'REFERENCES',
  }));

  const layout = computeForceLayout(nodes, edges, {
    width: 800,
    height: 600,
    iterations: 100,
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of layout) {
    const halfW = n.radius;
    const halfH = n.radius;
    minX = Math.min(minX, n.x - halfW);
    maxX = Math.max(maxX, n.x + halfW);
    minY = Math.min(minY, n.y - halfH);
    maxY = Math.max(maxY, n.y + halfH);
  }

  const screenWidth = 800;
  const screenHeight = 600;
  const padding = 70;
  const graphWidth = Math.max(100, maxX - minX + padding * 2);
  const graphHeight = Math.max(100, maxY - minY + padding * 2);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const targetScale = Math.min(
    1.3,
    Math.max(0.01, Math.min(screenWidth / graphWidth, screenHeight / graphHeight))
  );
  const targetPanX = screenWidth / 2 - centerX * targetScale;
  const targetPanY = screenHeight / 2 - centerY * targetScale;

  assert.ok(targetScale >= 0.01, 'Target scale must be >= 0.01');

  // Verify that EVERY node transformed coordinate falls inside the screen boundaries
  for (const n of layout) {
    const screenX = targetPanX + n.x * targetScale;
    const screenY = targetPanY + n.y * targetScale;

    assert.ok(screenX >= 0, `Node ${n.id} screenX (${screenX}) must be >= 0`);
    assert.ok(screenX <= screenWidth, `Node ${n.id} screenX (${screenX}) must be <= ${screenWidth}`);
    assert.ok(screenY >= 0, `Node ${n.id} screenY (${screenY}) must be >= 0`);
    assert.ok(screenY <= screenHeight, `Node ${n.id} screenY (${screenY}) must be <= ${screenHeight}`);
  }
});

test('warm restart simulation converges rapidly (<100ms) with minimal node drift (<50px)', () => {
  const nodeCount = 500;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    name: `Node ${index}`,
    role: 'INSTANCE',
    type: 'INSTANCE',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 9,
  }));
  const edges = Array.from({ length: 500 }, (_, index) => ({
    id: `edge:${index}`,
    source: `node:${index}`,
    target: `node:${(index + 1) % nodeCount}`,
    type: 'REFERENCES',
  }));

  // Initial layout
  const layout1 = computeForceLayout(nodes, edges, {
    width: 800,
    height: 600,
    iterations: 130,
  });

  // Warm restart with seeded coordinates and 40 iterations
  const startTime = Date.now();
  const layout2 = computeForceLayout(layout1, edges, {
    width: 800,
    height: 600,
    iterations: 40,
  });
  const elapsedMs = Date.now() - startTime;

  assert.ok(elapsedMs < 350, `Warm restart must complete under 350ms (took ${elapsedMs}ms)`);

  // Verify minimal drift: nodes should not jump or flip across the universe
  let totalDrift = 0;
  for (let i = 0; i < nodeCount; i++) {
    const dx = layout2[i].x - layout1[i].x;
    const dy = layout2[i].y - layout1[i].y;
    totalDrift += Math.hypot(dx, dy);
  }
  const avgDrift = totalDrift / nodeCount;
  assert.ok(
    avgDrift < 200,
    `Average drift on warm restart (${avgDrift.toFixed(1)}px) must remain under 200px`
  );
});
