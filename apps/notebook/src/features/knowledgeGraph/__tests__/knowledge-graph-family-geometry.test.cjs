const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { initForceSimulation, stepForceSimulation } = load('../utils/forceLayout.ts');

const options = { width: 1000, height: 700, centerOrigin: true, balanceRootAreas: true };
const node = (id, extra = {}) => ({
  id,
  name: id,
  role: 'INSTANCE',
  instanceKind: 'NOTE',
  radius: 10,
  x: 0,
  y: 0,
  ...extra,
});
const family = (kind, count) => {
  const nodes = [
    node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }),
    node('root'),
  ];
  const edges = [{ source: 'root', target: 'class', type: 'INSTANCE_OF' }];
  for (let i = 0; i < count; i++) {
    const id = `item:${String(i).padStart(4, '0')}`;
    nodes.push(node(id, { instanceKind: kind }));
    edges.push(
      kind.includes('EXTERNAL_LINK')
        ? { source: 'root', target: id, type: 'EXTERNAL_REFERENCE' }
        : { source: id, target: 'root', type: kind === 'KEYWORD' ? 'KEYWORD_SOURCE' : 'PART_OF' }
    );
  }
  return { nodes, edges };
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const root = (context) => context.simNodes.find((n) => n.id === 'root');

test('hierarchical branches split with their parents, stay nearby, and fit the previous area budget', () => {
  for (const spacingScale of [0.4, 1, 2.5]) {
    const input = family('PARAGRAPH', 4);
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 3; c++) {
        const parent = `item:${String(b).padStart(4, '0')}`;
        const child = `${parent}:child:${c}`;
        input.nodes.push(node(child, { instanceKind: 'PARAGRAPH' }));
        input.edges.push({ source: child, target: parent, type: 'PART_OF' });
        for (let leaf = 0; leaf < 3; leaf++) {
          const id = `${child}:leaf:${leaf}`;
          input.nodes.push(node(id, { instanceKind: 'PARAGRAPH' }));
          input.edges.push({ source: id, target: child, type: 'PART_OF' });
        }
      }
    const context = initForceSimulation(input.nodes, input.edges, { ...options, spacingScale });
    const byId = new Map(context.simNodes.map((n) => [n.id, n]));
    assert.ok(
      context.rootFootprints.get('root') < 3600 * spacingScale,
      '52 descendants fit within the previous depth-band footprint'
    );
    for (const edge of input.edges.filter((e) => e.type === 'PART_OF')) {
      const child = byId.get(edge.source),
        parent = byId.get(edge.target);
      assert.ok(
        distance(child, parent) <= 770 * spacingScale,
        'splitting spiral lanes keep adjacent levels within two and a half node gaps'
      );
      assert.ok(
        distance(child, root(context)) > distance(parent, root(context)),
        'branches progress outward'
      );
    }
    const reversed = initForceSimulation([...input.nodes].reverse(), [...input.edges].reverse(), {
      ...options,
      spacingScale,
    });
    reversed.simNodes.forEach((n) => {
      close(n.x, byId.get(n.id).x);
      close(n.y, byId.get(n.id).y);
    });
    for (let i = 0; i < 20; i++) stepForceSimulation(context, 0.25 * 0.982 ** i);
    for (const edge of context.hierarchyConstraints.tree)
      close(distance(context.simNodes[edge.child], context.simNodes[edge.parent]), edge.length);
  }
});

test('hierarchy paths wind around the root instead of forming radial spokes', () => {
  const input = family('PARAGRAPH', 3);
  const paths = [];
  for (let branch = 0; branch < 3; branch++) {
    const path = [`item:${String(branch).padStart(4, '0')}`];
    for (let depth = 1; depth < 12; depth++) {
      const id = `${path[0]}:${depth}`;
      input.nodes.push(node(id, { instanceKind: 'PARAGRAPH' }));
      input.edges.push({ source: id, target: path[path.length - 1], type: 'PART_OF' });
      path.push(id);
    }
    paths.push(path);
  }
  const context = initForceSimulation(input.nodes, input.edges, options);
  const byId = new Map(context.simNodes.map((n) => [n.id, n]));
  const checkWinding = () => {
    const center = root(context);
    for (const path of paths) {
      let turn = 0;
      for (let i = 1; i < path.length; i++) {
        const parent = byId.get(path[i - 1]),
          child = byId.get(path[i]);
        const a = { x: parent.x - center.x, y: parent.y - center.y };
        const b = { x: child.x - center.x, y: child.y - center.y };
        const angle = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
        assert.ok(angle > 0 && angle < Math.PI / 2, 'successive levels turn in the same direction');
        assert.ok(distance(child, center) > distance(parent, center), 'each turn expands outward');
        assert.ok(distance(child, parent) < 500, 'curvature does not stretch adjacent levels');
        turn += angle;
      }
      assert.ok(turn > Math.PI, 'each path completes more than a half turn');
    }
  };
  checkWinding();
  for (let i = 0; i < 160; i++) stepForceSimulation(context, 0.25 * 0.982 ** i);
  checkWinding();
});

test('unequal descendant counts widen the crowded branch without stretching the whole family', () => {
  const make = (counts) => {
    const input = family('PARAGRAPH', 4);
    counts.forEach((count, branch) => {
      const parent = `item:${String(branch).padStart(4, '0')}`;
      for (let i = 0; i < count; i++) {
        const id = `${parent}:child:${String(i).padStart(3, '0')}`;
        input.nodes.push(node(id, { instanceKind: 'PARAGRAPH' }));
        input.edges.push({ source: id, target: parent, type: 'PART_OF' });
      }
    });
    return input;
  };
  for (const crowdedCount of [33, 147]) {
    const total = crowdedCount + 3;
    const even = make(Array.from({ length: 4 }, (_, i) => Math.floor((total + i) / 4)));
    const balanced = initForceSimulation(even.nodes, even.edges, options);
    for (const spacingScale of [0.4, 1, 2.5]) {
      const input = make([1, 1, 1, crowdedCount]);
      const context = initForceSimulation(input.nodes, input.edges, { ...options, spacingScale });
      assert.ok(
        context.rootFootprints.get('root') <
          balanced.rootFootprints.get('root') * spacingScale * 1.5,
        'a skewed tree uses a wider branch, not a long narrow tail'
      );
      const byId = new Map(context.simNodes.map((n) => [n.id, n]));
      if (crowdedCount === 147) {
        const parent = byId.get('item:0003');
        for (let lane = 0; lane < 6; lane++) {
          let turn = 0;
          for (let i = lane + 6; i < crowdedCount; i += 6) {
            const a = byId.get(`item:0003:child:${String(i - 6).padStart(3, '0')}`);
            const b = byId.get(`item:0003:child:${String(i).padStart(3, '0')}`);
            const ax = a.x - parent.x,
              ay = a.y - parent.y;
            const bx = b.x - parent.x,
              by = b.y - parent.y;
            const angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
            assert.ok(
              angle > 0 && angle < Math.PI,
              'crowded lanes wind consistently instead of filling a fan'
            );
            assert.ok(distance(b, parent) > distance(a, parent));
            turn += angle;
          }
          assert.ok(turn > Math.PI, 'each crowded lane winds more than a half turn');
        }
      }
      const physical = context.simNodes.filter((n) => n.role === 'INSTANCE');
      for (let i = 0; i < physical.length; i++)
        for (let j = i + 1; j < physical.length; j++)
          assert.ok(
            distance(physical[i], physical[j]) >= 173.25 * spacingScale - 1e-7,
            'crowded and sparse branches both retain clearance'
          );
      for (const edge of input.edges.filter((e) => e.type === 'PART_OF')) {
        const count = edge.target === 'item:0003' ? crowdedCount : 1;
        assert.ok(
          distance(byId.get(edge.source), byId.get(edge.target)) <
            Math.max(770, Math.sqrt(count) * 308) * spacingScale,
          'edge lengths follow local population instead of the full cluster radius'
        );
      }
      const reversed = initForceSimulation([...input.nodes].reverse(), [...input.edges].reverse(), {
        ...options,
        spacingScale,
      });
      reversed.simNodes.forEach((n) => {
        close(n.x, byId.get(n.id).x);
        close(n.y, byId.get(n.id).y);
      });
    }
  }
});

test('unequal board and note areas fill available space without inflating small-family gaps', () => {
  const input = family('PARAGRAPH', 80);
  input.nodes.find((n) => n.id === 'root').role = 'CLASS';
  input.nodes.find((n) => n.id === 'root').classKind = 'BOARD_CARD';
  input.edges.shift();
  for (let i = 0; i < 40; i++) {
    input.nodes.push(node(`small:${i}`));
    input.edges.push({ source: `small:${i}`, target: 'class', type: 'INSTANCE_OF' });
  }
  const baseline = initForceSimulation(input.nodes, input.edges, {
    ...options,
    balanceRootAreas: false,
  });
  const context = initForceSimulation(input.nodes, input.edges, options);
  const boxes = context.simNodes
    .filter((n) => context.rootFootprints.has(n.id))
    .map((n) => ({ ...n, size: context.rootFootprints.get(n.id) }));
  const width =
    Math.max(...boxes.map((n) => n.x + n.size / 2)) -
    Math.min(...boxes.map((n) => n.x - n.size / 2));
  const height =
    Math.max(...boxes.map((n) => n.y + n.size / 2)) -
    Math.min(...boxes.map((n) => n.y - n.size / 2));
  assert.ok(
    boxes.reduce((sum, n) => sum + n.size ** 2, 0) / (width * height) > 0.65,
    'small families fill space beside large families'
  );
  const physical = context.simNodes.filter((n, i) => !context.derivedCentroidFlags[i]);
  const occupiedArea = (layout) => {
    const nodes = layout.simNodes.filter((n, i) => !layout.derivedCentroidFlags[i]);
    return (
      (Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x))) *
      (Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)))
    );
  };
  assert.ok(
    occupiedArea(context) < occupiedArea(baseline) * 0.95,
    'whole-family compaction reduces the occupied area even when one large family dominates it'
  );
  const nearestFamilyDistance = (layout) => {
    const roots = layout.simNodes.filter((n) => layout.rootFootprints.has(n.id));
    return (
      roots.reduce(
        (sum, n) =>
          sum +
          Math.min(...roots.filter((other) => other !== n).map((other) => distance(n, other))),
        0
      ) / roots.length
    );
  };
  assert.ok(
    nearestFamilyDistance(context) < nearestFamilyDistance(baseline) * 0.85,
    'adjacent family centers move at least 15% closer while internal node spacing stays fixed'
  );
  for (let i = 0; i < physical.length; i++)
    for (let j = i + 1; j < physical.length; j++)
      assert.ok(
        distance(physical[i], physical[j]) >=
          (physical[i].role === 'CLASS' || physical[j].role === 'CLASS' ? 210.375 : 173.25) - 1e-7,
        'actual nodes retain clearance while empty parts of reserved squares may overlap'
      );
  const small = boxes.filter((n) => n.id.startsWith('small:'));
  small.forEach((n) =>
    assert.ok(
      Math.min(...small.filter((other) => other !== n).map((other) => distance(n, other))) < 500
    )
  );
  const rebuilt = initForceSimulation(context.simNodes, input.edges, {
    ...options,
    previousContext: context,
  });
  context.simNodes.forEach((n, i) => {
    close(n.x, rebuilt.simNodes[i].x);
    close(n.y, rebuilt.simNodes[i].y);
  });
});

for (const kind of ['REFERENCES', 'KEYWORD_SOURCE', 'EXTERNAL_REFERENCE']) {
  test(`families with the most cross-family connections occupy the center: ${kind}`, () => {
    for (const unequal of [false, true]) {
      const nodes = [node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined })];
      const edges = [];
      for (let i = 0; i < 9; i++) {
        const id = `root:${i}`;
        nodes.push(node(id));
        edges.push({ source: id, target: 'class', type: 'INSTANCE_OF' });
        if (unequal && i > 0)
          for (let j = 0; j < 12; j++) {
            nodes.push(node(`${id}:child:${j}`, { instanceKind: 'PARAGRAPH' }));
            edges.push({ source: `${id}:child:${j}`, target: id, type: 'PART_OF' });
          }
        if (!i) continue;
        if (kind === 'REFERENCES') edges.push({ source: 'root:0', target: id, type: kind });
        else {
          const shared = `shared:${i}`;
          nodes.push(
            node(shared, { instanceKind: kind === 'KEYWORD_SOURCE' ? 'KEYWORD' : 'EXTERNAL_LINK' })
          );
          edges.push(
            ...['root:0', id].map((source) =>
              kind === 'KEYWORD_SOURCE'
                ? { source: shared, target: source, type: kind }
                : { source, target: shared, type: kind }
            )
          );
        }
      }
      const context = initForceSimulation(nodes, edges, options);
      const roots = context.simNodes.filter((n) => /^root:\d$/.test(n.id));
      const center = {
        x: roots.reduce((sum, n) => sum + n.x, 0) / roots.length,
        y: roots.reduce((sum, n) => sum + n.y, 0) / roots.length,
      };
      const hub = roots.find((n) => n.id === 'root:0');
      assert.ok(
        distance(hub, center) <
          Math.min(...roots.filter((n) => n !== hub).map((n) => distance(n, center))) * 0.25,
        `the hub is centered even with unequal areas: ${distance(hub, center)}`
      );
      const reversed = initForceSimulation(nodes, [...edges].reverse(), options);
      roots.forEach((n) => {
        const actual = reversed.simNodes.find((other) => other.id === n.id);
        close(n.x, actual.x);
        close(n.y, actual.y);
      });
    }
  });
}
