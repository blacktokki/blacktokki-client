const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { initForceSimulation, stepForceSimulation } = load('../utils/forceLayout.ts');

const node = (id, extra = {}) => ({
  id,
  name: id,
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  x: 0,
  y: 0,
  radius: 10,
  ...extra,
});
const options = { width: 1000, height: 700, centerOrigin: true };
const graph = (count) => {
  const roots = Array.from({ length: count }, (_, i) => node(`note:${String(i).padStart(4, '0')}`));
  return {
    nodes: [node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }), ...roots],
    edges: roots.map(({ id }) => ({ source: id, target: 'class', type: 'INSTANCE_OF' })),
    roots: roots.map(({ id }) => id),
  };
};
const measure = (context, edges) => {
  const byId = new Map(context.simNodes.map((n) => [n.id, n]));
  const lengths = edges.map((e) => {
    const a = byId.get(e.source),
      b = byId.get(e.target);
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  return { total: lengths.reduce((sum, n) => sum + n, 0), max: Math.max(...lengths) };
};
const settle = (context, alpha = 1) => {
  for (let frame = 0; frame < 1000; frame++) {
    const movement = stepForceSimulation(context, alpha);
    alpha *= 0.982;
    if (context.spaceReservationPending) alpha = Math.max(alpha, 0.15);
    if (!context.spaceReservationPending && (alpha < 0.005 || movement < 0.08)) return;
  }
  assert.fail('layout did not finish reserving space');
};
const area = (context) => {
  const nodes = context.simNodes.filter((n) => n.role !== 'CLASS');
  return (
    (Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x))) *
    (Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)))
  );
};
const families = () => {
  const input = graph(8);
  for (let i = 0; i < input.roots.length; i++)
    for (let child = 0; child < 12; child++) {
      const id = `child:${i}:${child}`;
      input.nodes.push(node(id, { instanceKind: 'PARAGRAPH' }));
      input.edges.push({
        source: id,
        target: input.roots[i],
        type: 'PART_OF',
        propertyLabel: 'paragraphPartOf',
      });
    }
  return input;
};

// Leave explicit empty gaps: the default cold layout already starts with compact families.
const separateFamilies = (context) => {
  for (const { node, root } of context.precomputedRootPulls) {
    node.x += root.x;
    node.y += root.y;
  }
  for (const anchor of context.precomputedRootAnchors) {
    const { root } = anchor;
    root.x *= 2;
    root.y *= 2;
    anchor.x = root.x;
    anchor.y = root.y;
  }
};

test('references shorten settled family distances from an existing layout while fixed rings remain exact', () => {
  const input = families();
  const original = initForceSimulation(input.nodes, input.edges, options);
  separateFamilies(original);
  const references = input.nodes
    .filter((n) => n.id.startsWith('child:'))
    .map((n) => ({
      source: n.id,
      target: input.roots[(Number(n.id.split(':')[1]) + 4) % 8],
      type: 'REFERENCES',
    }));
  const context = initForceSimulation(original.simNodes, [...input.edges, ...references], {
    ...options,
    previousContext: original,
  });
  const before = measure(context, references);
  const originalArea = area(context);
  settle(context);
  const after = measure(context, references);
  assert.ok(after.total < before.total * 0.75, `${after.total}/${before.total}`);
  assert.ok(after.max < before.max * 0.8, `${after.max}/${before.max}`);
  assert.ok(area(context) < originalArea * 0.8);
  for (const edge of [
    ...context.hierarchyConstraints.tree,
    ...context.hierarchyConstraints.cyclic,
  ]) {
    const child = context.simNodes[edge.child],
      parent = context.simNodes[edge.parent];
    assert.ok(Math.abs(Math.hypot(child.x - parent.x, child.y - parent.y) - edge.length) < 0.01);
  }
});

test('keyword source connections bring source families closer and keep keyword spacing', () => {
  const input = graph(64);
  const keywords = Array.from({ length: 32 }, (_, i) =>
    node(`keyword:${i}`, { instanceKind: 'KEYWORD' })
  );
  const primary = keywords.map((n) => ({
    source: n.id,
    target: input.roots[0],
    type: 'KEYWORD_SOURCE',
  }));
  const additional = keywords.map((n, i) => ({
    source: n.id,
    target: input.roots[i + 32],
    type: 'KEYWORD_SOURCE',
  }));
  const nodes = [...input.nodes, ...keywords];
  const baseline = initForceSimulation(nodes, [...input.edges, ...primary], options);
  const optimized = initForceSimulation(
    nodes,
    [...input.edges, ...primary, ...additional],
    options
  );
  const before = measure(baseline, [...primary, ...additional]);
  const after = measure(optimized, [...primary, ...additional]);
  assert.ok(after.total < before.total * 0.8, `${after.total}/${before.total}`);
  assert.ok(after.max < before.max);
  assert.deepEqual(optimized.rootPopulations, baseline.rootPopulations);
  const positions = optimized.simNodes.filter((n) => n.instanceKind === 'KEYWORD');
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++) {
      assert.ok(
        Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 198 - 1e-6
      );
    }
});

test('reference planning handles thousands of families without recursive traversal or pairwise storage', () => {
  const input = graph(3000);
  const references = input.roots
    .slice(1)
    .map((target, i) => ({ source: input.roots[(i * 97) % 3000], target, type: 'REFERENCES' }));
  const started = performance.now();
  const context = initForceSimulation(input.nodes, [...input.edges, ...references], options);
  assert.ok(performance.now() - started < 2500);
  assert.equal(context.rootLayoutOrder.length, 3000);
  assert.equal(new Set(context.rootLayoutOrder).size, 3000);
  assert.ok(context.simNodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  const bytes = Object.values(context).reduce(
    (sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0),
    0
  );
  assert.ok(bytes <= context.nodeCount * 46 + 16);
});

for (const kind of ['REFERENCES', 'KEYWORD_SOURCE', 'disconnected']) {
  test(`widely separated warm families compact before drawing: ${kind}`, () => {
    for (const spacingScale of [0.4, 1, 2.5]) {
      const input = families();
      const settings = { ...options, spacingScale };
      const original = initForceSimulation(input.nodes, input.edges, settings);
      const originalArea = area(original);
      // Translate whole families to preserve local rings, as in a previously spread-out view.
      const warm = original.simNodes.map((n, index) => {
        const root = original.simNodes[original.rootIndices[index]];
        return root ? { ...n, x: n.x + root.x * 7, y: n.y + root.y * 7 } : { ...n };
      });
      const keywords =
        kind === 'KEYWORD_SOURCE'
          ? input.roots.map((_, i) =>
              node(`far-keyword:${i}`, {
                instanceKind: 'KEYWORD',
                x: 8000 * spacingScale,
                y: 8000 * spacingScale,
              })
            )
          : [];
      const connections =
        kind === 'REFERENCES'
          ? input.roots.map((_, i) => ({
              source: `child:${i}:0`,
              target: input.roots[(i + 4) % 8],
              type: kind,
            }))
          : keywords.flatMap((n, i) =>
              [i, (i + 4) % 8].map((j) => ({
                source: n.id,
                target: input.roots[j],
                type: kind,
              }))
            );
      const context = initForceSimulation(
        [...warm, ...keywords],
        [...input.edges, ...connections],
        {
          ...settings,
          previousContext: original,
          balanceRootAreas: true,
        }
      );
      assert.equal(
        context.restartAlpha,
        0.25,
        'large gaps are repaired before low-motion refinement'
      );
      assert.ok(
        area(context) < originalArea * 2,
        'initial placement already closes the empty gaps'
      );
      settle(context, context.restartAlpha);
      assert.equal(context.spaceReservationPending, false);
      assert.ok(area(context) < originalArea * 2, `${kind} leaves no large empty gaps`);
      if (connections.length) {
        const lengths = measure(context, connections);
        assert.ok(lengths.max < 2400 * spacingScale, `${kind} longest connection: ${lengths.max}`);
      }
      for (const edge of context.hierarchyConstraints.tree) {
        const child = context.simNodes[edge.child],
          parent = context.simNodes[edge.parent];
        assert.ok(
          Math.abs(Math.hypot(child.x - parent.x, child.y - parent.y) - edge.length) < 0.01
        );
      }
    }
  });
}
