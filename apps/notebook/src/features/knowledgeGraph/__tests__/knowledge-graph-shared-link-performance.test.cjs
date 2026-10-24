const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(
  readFileSync(path.join(__dirname, '../utils/forceLayout.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;

for (const spacingScale of [0.4, 1, 2.5]) {
  test(`crowded shared links preserve clearance without exhaustive distance searches: ${spacingScale}`, () => {
    // Count geometric work instead of depending on the speed of the test machine.
    let distances = 0;
    const measuredMath = Object.create(Math);
    for (const name of ['hypot', 'sqrt']) {
      measuredMath[name] = (...args) => {
        assert.ok(++distances < 500000, 'vacancy search must skip fully occupied regions');
        return Math[name](...args);
      };
    }
    const fixture = { exports: {} };
    compileFunction(compiled, ['exports', 'module', 'Math'])(
      fixture.exports,
      fixture,
      measuredMath
    );
    const { initForceSimulation, stepForceSimulation } = fixture.exports;
    const nodes = [],
      edges = [];
    const node = (id, x, y, extra = {}) => ({
      id,
      name: id,
      role: 'INSTANCE',
      instanceKind: 'CARD',
      radius: 10,
      x: x * spacingScale,
      y: y * spacingScale,
      ...extra,
    });
    for (let x = -20; x <= 20; x++)
      for (let y = -20; y <= 20; y++)
        nodes.push(node(`obstacle:${x}:${y}`, x * 180 + 53.31, y * 180 - 139.73));
    for (let i = 0; i < 128; i++) {
      const id = `link:${i}`;
      nodes.push(node(id, 0, 0, { instanceKind: 'EXTERNAL_LINK' }));
      for (const side of [-1, 1]) {
        const source = `source:${i}:${side}`;
        nodes.push(node(source, side * (4000 + i * 10) + 53.31, -139.73));
        edges.push({ source, target: id, type: 'EXTERNAL_REFERENCE' });
      }
    }
    const options = { width: 1000, height: 700, spacingScale, balanceRootAreas: false };
    const context = initForceSimulation(nodes, edges, options);
    const links = context.simNodes.filter((n) => n.instanceKind === 'EXTERNAL_LINK');
    assert.equal(links.length, 128);
    const assertSpacing = () => {
      for (const link of links)
        for (const other of context.simNodes) {
          if (link === other) continue;
          const gap = (other.instanceKind === 'EXTERNAL_LINK' ? 180 : 157.5) * spacingScale;
          assert.ok(Math.hypot(link.x - other.x, link.y - other.y) >= gap - 1e-7);
        }
    };
    assertSpacing();
    // Moving obstacles onto previously placed links exercises collision repair on later frames.
    for (let i = 0; i < links.length; i++) {
      context.simNodes[i].x = links[i].x;
      context.simNodes[i].y = links[i].y;
    }
    const fixed = context.simNodes.filter((n) => n.instanceKind !== 'EXTERNAL_LINK');
    const before = fixed.map(({ x, y }) => ({ x, y }));
    distances = 0;
    stepForceSimulation(context, 0);
    assertSpacing();
    assert.deepEqual(
      fixed.map(({ x, y }) => ({ x, y })),
      before
    );
    const rebuilt = initForceSimulation(context.simNodes, edges, {
      ...options,
      previousContext: context,
    });
    for (const link of links) {
      const next = rebuilt.simNodes.find((n) => n.id === link.id);
      assert.ok(Math.abs(next.x - link.x) < 1e-7);
      assert.ok(Math.abs(next.y - link.y) < 1e-7);
    }
  });
}
