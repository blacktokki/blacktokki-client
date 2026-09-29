const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { createLayoutRunner } = require('./layoutTestHelper.cjs');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-large-graph-'));
let computeForceLayout;
let buildClassRootDistanceIndex;
try {
  for (const name of ['relations', 'axioms', 'forceLayout']) {
    const file =
      name === 'relations'
        ? path.join(__dirname, '../../knowledgeGraph/utils/relations.ts')
        : path.join(__dirname, '../../knowledgeGraph/utils', `${name}.ts`);
    const source = readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  const layoutModule = require(path.join(output, 'forceLayout.js'));
  ({ buildClassRootDistanceIndex } = layoutModule);
  computeForceLayout = createLayoutRunner(
    layoutModule.initForceSimulation,
    layoutModule.stepForceSimulation
  );
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

  // Performance requirement: fast convergence (under 1500ms across CI/dev machines)
  assert.ok(elapsedMs < 1500, `Layout simulation must complete under 1500ms (took ${elapsedMs}ms)`);
});

test('stably layouts 600 nodes and 1500 edges within bounded coordinates and fast execution time', () => {
  const nodeCount = 600;
  const edgeCount = 1500;

  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    name: `Node ${index}`,
    role: index < 25 ? 'CLASS' : 'INSTANCE',
    type: index < 25 ? 'CLASS' : 'INSTANCE',
    classCategory: index < 15 ? 'TOPIC' : index < 25 ? 'BOARD' : undefined,
    classKind: index < 15 ? 'TITLE_KEYWORD' : index < 25 ? 'BOARD_CARD' : undefined,
    instanceKind: index >= 25 && index < 120 ? 'NOTE' : 'CARD',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: index < 25 ? 15 : 9,
  }));

  const edges = [];
  for (let i = 25; i < nodeCount; i++) {
    const targetClass = `node:${i % 25}`;
    edges.push({
      id: `edge:inst:${i}->${targetClass}`,
      source: `node:${i}`,
      target: targetClass,
      type: 'INSTANCE_OF',
      propertyLabel: 'instanceOf',
    });
  }
  for (let i = 1; i < 15; i++) {
    edges.push({
      id: `edge:sub:${i}->node:0`,
      source: `node:${i}`,
      target: 'node:0',
      type: 'SUBCLASS_OF',
      propertyLabel: 'subClassOf',
    });
  }
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

  assert.equal(layout.length, nodeCount, 'All 600 nodes must be returned');

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

  assert.ok(spanX < 8000, `Horizontal span (${spanX}) must remain under 8000px`);
  assert.ok(spanY < 8000, `Vertical span (${spanY}) must remain under 8000px`);
  assert.ok(spanX > 500, `Horizontal span (${spanX}) must have healthy distribution`);
  assert.ok(spanY > 500, `Vertical span (${spanY}) must have healthy distribution`);

  // Performance requirement: fast convergence (under 5000ms across CI/dev machines)
  assert.ok(
    elapsedMs < 5000,
    `Layout simulation of 600 nodes/1500 edges must complete under 5000ms (took ${elapsedMs}ms)`
  );
});
