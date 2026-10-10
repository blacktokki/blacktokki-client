const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const ts = require('typescript');

const load = (name) => {
  const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const fixture = { exports: {} };
  compileFunction(compiled, ['exports', 'module'])(fixture.exports, fixture);
  return fixture.exports;
};
const {
  initForceSimulation,
  stepForceSimulation,
  advanceForceSimulation,
  setSimulationFocus,
  applyHierarchyConstraints,
} = load('forceLayout');
const { advanceGraphPresentation } = load('canvasRenderer');
const node = (id, instanceKind, x, y) => ({
  id,
  name: id,
  role: 'INSTANCE',
  instanceKind,
  x,
  y,
  radius: 9,
});
const part = (source, target, propertyLabel) => ({
  id: `${source}->${target}`,
  source,
  target,
  type: 'PART_OF',
  propertyLabel,
});
const assertLengths = (nodes, edges, scale, tolerance = 1e-6) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(Math.abs(length - 160 * scale) < tolerance, `${edge.id}: ${length}`);
  }
};

test('keeps note and paragraph containment uniform from initialization through cooling and focus changes', () => {
  const nodes = [
    node('root', 'NOTE', 100, 100),
    node('child', 'NOTE', 950, 120),
    node('sibling', 'NOTE', 140, 800),
    node('grandchild', 'NOTE', 1500, 900),
    node('paragraph', 'PARAGRAPH', 400, 420),
    node('subparagraph', 'PARAGRAPH', 1100, 1600),
    node('boardParagraph', 'BOARD_PARAGRAPH', 80, 800),
  ];
  // Deliberately list deeper edges first, as data order must not affect enforcement.
  const edges = [
    part('subparagraph', 'paragraph', 'paragraphPartOf'),
    part('grandchild', 'child', 'notePartOf'),
    part('paragraph', 'child', 'paragraphPartOf'),
    part('boardParagraph', 'root', 'paragraphPartOf'),
    part('child', 'root', 'notePartOf'),
    part('sibling', 'root', 'notePartOf'),
  ];
  for (const spacingScale of [0.4, 1, 2.5]) {
    const context = initForceSimulation(nodes, edges, {
      width: 1000,
      height: 700,
      spacingScale,
    });
    assertLengths(context.simNodes, edges, spacingScale);
    for (const depth of [1, 2, 99]) {
      setSimulationFocus(context, edges, 'grandchild', depth, new Set(nodes.map((n) => n.id)));
      for (const alpha of [1, 0.45, 0.05, 0.005]) {
        stepForceSimulation(context, alpha);
        assertLengths(context.simNodes, edges, spacingScale);
      }
    }
    const rebuilt = initForceSimulation(context.simNodes, edges.slice(0, -1), {
      width: 1000,
      height: 700,
      spacingScale,
    });
    assertLengths(rebuilt.simNodes, edges.slice(0, -1), spacingScale);
  }
});

test('enforces all parents of a shared board paragraph, including containment cycles', () => {
  const nodes = [
    node('root', 'NOTE', 100, 200),
    node('left', 'NOTE', 800, 300),
    node('right', 'NOTE', 200, 950),
    node('shared', 'BOARD_PARAGRAPH', 1300, 1100),
  ];
  const edges = [
    part('left', 'root', 'notePartOf'),
    part('right', 'root', 'notePartOf'),
    part('shared', 'left', 'paragraphPartOf'),
    part('shared', 'right', 'paragraphPartOf'),
  ];
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  assertLengths(context.simNodes, edges, 1, 0.02);
  for (let i = 0; i < 100; i++) {
    stepForceSimulation(context, 0.8 * 0.96 ** i);
    assertLengths(context.simNodes, edges, 1, 0.02);
  }
  const sharedTree = initForceSimulation(nodes, edges.slice(1), { width: 1000, height: 700 });
  assertLengths(sharedTree.simNodes, edges.slice(1), 1);
});

test('opens collinear shared-paragraph cycles to satisfy every containment edge', () => {
  const nodes = [
    node('parent', 'NOTE', 100, 100),
    node('child', 'NOTE', 400, 100),
    node('shared', 'BOARD_PARAGRAPH', 700, 100),
  ];
  const edges = [
    part('child', 'parent', 'notePartOf'),
    part('shared', 'parent', 'paragraphPartOf'),
    part('shared', 'child', 'paragraphPartOf'),
  ];
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  assertLengths(context.simNodes, edges, 1, 0.02);
});

test('separates coincident hierarchy nodes and leaves other relation lengths unconstrained', () => {
  const nodes = [
    node('parent', 'NOTE', 100, 100),
    node('child', 'NOTE', 100, 100),
    node('paragraph', 'PARAGRAPH', 100, 100),
    node('card', 'CARD', 1500, 1800),
    node('connected', 'CONNECTED_PARAGRAPH', 2000, 1200),
  ];
  const hierarchy = [part('child', 'parent'), part('paragraph', 'child')];
  const edges = [
    ...hierarchy,
    part('card', 'paragraph', 'cardPartOf'),
    part('connected', 'parent', 'connectedPartOf'),
    { ...part('card', 'parent', 'notePartOf'), type: 'REFERENCES' },
    part('missing', 'parent', 'notePartOf'),
  ];
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  assertLengths(context.simNodes, hierarchy, 1);
  for (const id of ['card', 'connected']) {
    const actual = context.simNodes.find((n) => n.id === id);
    const original = nodes.find((n) => n.id === id);
    assert.equal(actual.x, original.x);
    assert.equal(actual.y, original.y);
  }
});

test('processes deep containment trees once without recursion or edge-order dependence', () => {
  const nodes = Array.from({ length: 9500 }, (_, i) => node(`note:${i}`, 'NOTE', 100, 100));
  const edges = nodes
    .slice(1)
    .map((n, i) => part(n.id, nodes[i].id, 'notePartOf'))
    .reverse();
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  assertLengths(context.simNodes, edges, 1);
  assert.equal(context.hierarchyConstraints.tree.length, edges.length);
  assert.equal(context.hierarchyConstraints.cyclic.length, 0);
});

test('applies containment projection only when a sliced physics step completes', () => {
  const nodes = Array.from({ length: 150 }, (_, i) => node(`note:${i}`, 'NOTE', 100 + i * 10, 100));
  const edges = nodes.slice(1).map((n) => part(n.id, nodes[0].id, 'notePartOf'));
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  const full = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  const before = context.simNodes.map((n) => ({ ...n }));
  assert.equal(advanceForceSimulation(context, 0.8, 0), null);
  assert.deepEqual(context.simNodes, before);
  let calls = 1;
  while (advanceForceSimulation(context, 0.8, 0) === null) {
    assert.deepEqual(context.simNodes, before);
    assert.ok(++calls < 150);
  }
  stepForceSimulation(full, 0.8);
  assert.deepEqual(context.simNodes, full.simNodes);
  assertLengths(context.simNodes, edges, 1);
});

test('preserves lengths in displayed coordinates between large-graph physics steps', () => {
  const edges = [part('paragraph', 'note', 'paragraphPartOf')];
  const context = initForceSimulation(
    [node('note', 'NOTE', 100, 100), node('paragraph', 'PARAGRAPH', 260, 100)],
    edges,
    { width: 1000, height: 700 }
  );
  const displayed = context.simNodes.map((n) => ({ ...n }));
  const target = context.simNodes[1];
  target.x = 100;
  target.y = 260;
  const model = context.simNodes.map((n) => ({ ...n }));
  for (let frame = 0; frame < 8; frame++) {
    advanceGraphPresentation(displayed, context.simNodes, 16, false);
    applyHierarchyConstraints(context.hierarchyConstraints, displayed);
    assertLengths(displayed, edges, 1);
  }
  assert.deepEqual(context.simNodes, model);
  advanceGraphPresentation(displayed, context.simNodes, 16, true);
  applyHierarchyConstraints(context.hierarchyConstraints, displayed);
  assert.deepEqual(displayed, context.simNodes);
});
