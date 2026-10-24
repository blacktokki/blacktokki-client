const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Crowded hierarchy layout', () => {
  const load = require('../keywordRelation/__tests__/loadTs.cjs');
  const { initForceSimulation, stepForceSimulation } = load('../utils/forceLayout.ts');

  const options = { width: 1400, height: 950, centerOrigin: true, balanceRootAreas: true };
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
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  test('crowded external and keyword fans stay inside their source area with full clearance', () => {
    // Generate a mixed hierarchy independently of notebook data and exported topology.
    const tree = [[0, -1]];
    const append = (kind, parent) => tree.push([kind, parent]) - 1;
    for (let branch = 0; branch < 5; branch++) {
      const note = append(0, 0);
      for (let section = 0; section < 4; section++) {
        const heading = append(0, note);
        for (let paragraph = 0; paragraph < 5; paragraph++) {
          const child = append(1, heading);
          append(2, child);
          append(3, child);
        }
      }
    }
    const kinds = ['NOTE', 'CONNECTED_PARAGRAPH', 'PARAGRAPH', 'EXTERNAL_LINK'];
    const nodes = tree.map(([kind], i) => node(`node:${i}`, { instanceKind: kinds[kind] }));
    const edges = tree.flatMap(([kind, parent], i) =>
      parent < 0
        ? []
        : kind === 3
        ? [{ source: `node:${parent}`, target: `node:${i}`, type: 'EXTERNAL_REFERENCE' }]
        : [{ source: `node:${i}`, target: `node:${parent}`, type: 'PART_OF' }]
    );
    nodes.push(node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }));
    edges.push({ source: 'node:0', target: 'class', type: 'INSTANCE_OF' });
    const sources = tree
      .flatMap(([kind], i) => (kind === 1 ? [`node:${i}`] : []))
      .filter((_, i) => i % 3 === 0);
    for (const kind of ['EXTERNAL_LINK', 'KEYWORD'])
      for (let i = 0; i < 12; i++) {
        const id = `shared:${kind}:${i}`;
        nodes.push(node(id, { instanceKind: kind }));
        for (const source of sources)
          edges.push(
            kind === 'KEYWORD'
              ? { source: id, target: source, type: 'KEYWORD_SOURCE' }
              : { source, target: id, type: 'EXTERNAL_REFERENCE' }
          );
      }
    const context = initForceSimulation(nodes, edges, options);
    const byId = new Map(context.simNodes.map((n) => [n.id, n]));
    const origins = sources.map((id) => byId.get(id));
    const center = {
      x: origins.reduce((sum, n) => sum + n.x, 0) / origins.length,
      y: origins.reduce((sum, n) => sum + n.y, 0) / origins.length,
    };
    const spread = Math.sqrt(
      origins.reduce((sum, n) => sum + distance(n, center) ** 2, 0) / origins.length
    );
    const gap = (n) =>
      n.instanceKind === 'KEYWORD' ? 280 : n.instanceKind === 'EXTERNAL_LINK' ? 180 : 157.5;
    for (const kind of ['EXTERNAL_LINK', 'KEYWORD']) {
      const targets = context.simNodes.filter((n) => n.id.startsWith(`shared:${kind}`));
      const meanLength =
        targets.reduce(
          (sum, n) => sum + origins.reduce((total, source) => total + distance(source, n), 0),
          0
        ) /
        targets.length /
        origins.length;
      assert.ok(meanLength < 3600, `${kind} avoids a long fan: ${meanLength}`);
      assert.ok(
        targets.reduce((sum, n) => sum + distance(n, center), 0) / targets.length < spread,
        `${kind} targets stay in the source area instead of being expelled to its perimeter`
      );
      for (const target of targets)
        for (const other of context.simNodes.filter((n) => n.role === 'INSTANCE' && n !== target))
          assert.ok(distance(target, other) >= Math.max(gap(target), gap(other)) - 1e-7);
    }
    tree.forEach(([, parent], i) => {
      if (parent < 0) return;
      assert.ok(
        distance(byId.get(`node:${i}`), byId.get('node:0')) >
          distance(byId.get(`node:${parent}`), byId.get('node:0')),
        'filling inner vacancies preserves outward hierarchy depth'
      );
    });
    const initial = context.simNodes.map((n) => ({ ...n }));
    for (let i = 0; i < 8; i++) stepForceSimulation(context, 0.4);
    context.simNodes.forEach((n, i) => assert.ok(distance(n, initial[i]) < 1e-7));
    const warm = initForceSimulation(context.simNodes, [...edges].reverse(), {
      ...options,
      previousContext: context,
    });
    warm.simNodes.forEach((n, i) => assert.ok(distance(n, initial[i]) < 1e-7));
  });

  for (const kind of ['EXTERNAL_LINK', 'KEYWORD']) {
    test(`${kind}: count bias is visible across three source families and survives duplicates, motion and rebuilding`, () => {
      const nodes = [
        node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }),
        node('left', { x: -4000, y: 100 }),
        node('middle', { x: 100, y: 100 }),
        node('right', { x: 8000, y: 100 }),
        node('a', { instanceKind: 'PARAGRAPH', x: -4000, y: -500 }),
        node('b', { instanceKind: 'PARAGRAPH', x: -4000, y: 700 }),
        node('shared', { instanceKind: kind }),
      ];
      const base = [
        ...['left', 'middle', 'right'].map((source) => ({
          source,
          target: 'class',
          type: 'INSTANCE_OF',
        })),
        ...['a', 'b'].map((source) => ({ source, target: 'left', type: 'PART_OF' })),
      ];
      const sources = ['a', 'b', 'middle', 'right'].map((source) =>
        kind === 'KEYWORD'
          ? { source: 'shared', target: source, type: 'KEYWORD_SOURCE' }
          : { source, target: 'shared', type: 'EXTERNAL_REFERENCE' }
      );
      let expected;
      for (const edges of [
        [...base, ...sources],
        [...base, ...sources].reverse(),
        [...base, ...sources, sources[0], sources[0]],
      ]) {
        const settings = { ...options, balanceRootAreas: false };
        const context = initForceSimulation(nodes, edges, settings);
        const check = (c) => {
          const byId = new Map(c.simNodes.map((n) => [n.id, n]));
          const shared = byId.get('shared');
          const center = {
            x: (byId.get('a').x + byId.get('b').x) / 2,
            y: (byId.get('a').y + byId.get('b').y) / 2,
          };
          for (const id of ['middle', 'right'])
            assert.ok(
              distance(shared, center) < distance(shared, byId.get(id)) * 0.7,
              'a 2/1/1 split must produce a clear majority-side position'
            );
          for (const other of c.simNodes.filter((n) => n.role === 'INSTANCE' && n !== shared))
            assert.ok(distance(shared, other) >= (kind === 'KEYWORD' ? 280 : 157.5) - 1e-7);
          return shared;
        };
        const shared = check(context);
        if (expected)
          assert.ok(
            distance(shared, expected) < 1e-7,
            'edge order and duplicate edges cannot change the weight'
          );
        else expected = { ...shared };
        for (let i = 0; i < 60; i++) stepForceSimulation(context, 0.25 * 0.982 ** i);
        check(context);
        const warm = initForceSimulation(context.simNodes, edges, {
          ...settings,
          previousContext: context,
        });
        assert.ok(distance(check(warm), shared) < 1e-7, 'warm layout retains its source position');
      }
    });
  }

  for (const kind of ['EXTERNAL_LINK', 'KEYWORD']) {
    test(`${kind}: a blocked cached vacancy is repaired nearby without jumping across a crowded family`, () => {
      const nodes = [
        node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }),
        node('left', { x: -5000, y: 100 }),
        node('right', { x: 5000, y: 100 }),
        node('shared', { instanceKind: kind }),
      ];
      for (let x = -20; x <= 20; x++)
        for (let y = -20; y <= 20; y++)
          nodes.push(
            node(`block:${x}:${y}`, { instanceKind: 'CARD', x: x * 180 + 53, y: y * 180 - 139 })
          );
      for (let i = 0; i < 21; i++)
        nodes.push(node(`wall:${i}`, { instanceKind: 'CARD', x: 20000, y: 2000 + i * 180 }));
      const edges = ['left', 'right'].flatMap((source) => [
        { source, target: 'class', type: 'INSTANCE_OF' },
        kind === 'KEYWORD'
          ? { source: 'shared', target: source, type: 'KEYWORD_SOURCE' }
          : { source, target: 'shared', type: 'EXTERNAL_REFERENCE' },
      ]);
      const context = initForceSimulation(nodes, edges, { ...options, balanceRootAreas: false });
      const shared = context.simNodes.find((n) => n.id === 'shared'),
        before = { ...shared };
      const blockers = context.simNodes.filter((n) => n.id.startsWith('wall:'));
      blockers.forEach((n, i) => {
        n.x = shared.x;
        n.y = shared.y + (i - 10) * 180;
      });
      stepForceSimulation(context, 0);
      assert.ok(
        distance(shared, before) < 600,
        'collision repair stays within a few node gaps of the existing slot'
      );
      for (const blocker of blockers)
        assert.ok(distance(shared, blocker) >= (kind === 'KEYWORD' ? 280 : 157.5));
    });
  }
});

describe('Initial density and movement', () => {
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
  const graph = (kind, count) => {
    const root = node('note', { x: 100, y: 100 });
    return {
      nodes: [
        node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }),
        ...(kind === 'NOTE' ? [] : [root]),
        ...Array.from({ length: count }, (_, i) => node(`item:${i}`, { instanceKind: kind })),
      ],
      edges: [
        ...(kind === 'NOTE' ? [] : [{ source: 'note', target: 'class', type: 'INSTANCE_OF' }]),
        ...Array.from({ length: count }, (_, i) =>
          kind === 'NOTE'
            ? { source: `item:${i}`, target: 'class', type: 'INSTANCE_OF' }
            : kind === 'KEYWORD'
            ? { source: `item:${i}`, target: 'note', type: 'KEYWORD_SOURCE' }
            : { source: 'note', target: `item:${i}`, type: 'EXTERNAL_REFERENCE' }
        ),
      ],
    };
  };
  const assertSpacing = (nodes, minimum) => {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        assert.ok(distance >= minimum - 1e-8, `${nodes[i].id}/${nodes[j].id}: ${distance}`);
      }
  };

  test('new keywords use vacant space while warm positions and type centroids stay intact', () => {
    const input = graph('KEYWORD', 100);
    const first = initForceSimulation(input.nodes, input.edges, options);
    const added = Array.from({ length: 100 }, (_, i) =>
      node(`new:${i}`, { instanceKind: 'KEYWORD' })
    );
    const type = node('type', {
      role: 'CLASS',
      instanceKind: undefined,
      classKind: 'KEYWORD_TYPE',
    });
    const keywords = [
      ...first.simNodes.filter((item) => item.instanceKind === 'KEYWORD'),
      ...added,
    ];
    const restarted = initForceSimulation(
      [...first.simNodes, type, ...added],
      [
        ...input.edges,
        ...added.map((item) => ({ source: item.id, target: 'note', type: 'KEYWORD_SOURCE' })),
        ...keywords.map((item) => ({ source: item.id, target: 'type', type: 'INSTANCE_OF' })),
      ],
      options
    );
    const byId = new Map(restarted.simNodes.map((item) => [item.id, item]));
    for (const original of first.simNodes.filter((item) => item.role !== 'CLASS')) {
      assert.ok(Math.abs(byId.get(original.id).x - original.x) < 1e-9);
      assert.ok(Math.abs(byId.get(original.id).y - original.y) < 1e-9);
    }
    const positioned = keywords.map((item) => byId.get(item.id));
    assertSpacing(positioned, 264);
    for (const axis of ['x', 'y']) {
      assert.ok(
        Math.abs(
          byId.get('type')[axis] -
            positioned.reduce((sum, item) => sum + item[axis], 0) / positioned.length
        ) < 1e-8
      );
    }
  });

  const settle = (context, alpha = 0.4) => {
    for (let frame = 0; frame < 1000; frame++) {
      const movement = stepForceSimulation(context, alpha);
      alpha *= 0.982;
      if (context.spaceReservationPending) alpha = Math.max(0.15, alpha);
      if (alpha < 0.005 || movement < 0.08) {
        assert.equal(
          context.spaceReservationPending,
          false,
          'space reservation finishes before cooling'
        );
        return;
      }
    }
    assert.fail('simulation did not finish reserving space');
  };
  const rebuild = (previousContext, nodes, edges) =>
    initForceSimulation(nodes, edges, {
      ...options,
      previousContext,
      rootAnchorPositions: new Map(
        previousContext.precomputedRootAnchors.map(({ root, x, y }) => [root.id, { x, y }])
      ),
    });

  test('every content toggle reserves sparse space and releases it without cumulative expansion', () => {
    for (const kind of ['KEYWORD', 'EXTERNAL_LINK', 'PARAGRAPH', 'CONNECTED_PARAGRAPH']) {
      const baseNodes = [
        node('class', { role: 'CLASS', classKind: 'NOTE', instanceKind: undefined }),
        node('a'),
        node('b'),
      ];
      const baseEdges = ['a', 'b'].map((source) => ({
        source,
        target: 'class',
        type: 'INSTANCE_OF',
      }));
      let context = initForceSimulation(baseNodes, baseEdges, options);
      settle(context, 1);
      const anchors = context.precomputedRootAnchors.map(({ x, y }) => [x, y]);
      const members = Array.from({ length: 48 }, (_, i) =>
        node(`added:${i}`, { instanceKind: kind })
      );
      const extraEdges = members.map((member, i) =>
        kind === 'EXTERNAL_LINK'
          ? { source: i < 24 ? 'a' : 'b', target: member.id, type: 'EXTERNAL_REFERENCE' }
          : {
              source: member.id,
              target: i < 24 ? 'a' : 'b',
              type: kind === 'KEYWORD' ? 'KEYWORD_SOURCE' : 'PART_OF',
              propertyLabel: kind === 'PARAGRAPH' ? 'paragraphPartOf' : 'connectedPartOf',
            }
      );
      for (let cycle = 0; cycle < 2; cycle++) {
        const on = rebuild(
          context,
          [...context.simNodes, ...members],
          [...baseEdges, ...extraEdges]
        );
        for (const root of context.simNodes.filter((n) => n.instanceKind === 'NOTE')) {
          const actual = on.simNodes.find((n) => n.id === root.id);
          assert.equal(actual.x, root.x, 'existing roots keep their warm positions');
          assert.equal(actual.y, root.y);
        }
        assert.equal(on.cx, context.cx);
        assert.equal(on.cy, context.cy);
        settle(on);
        const physical = on.simNodes.filter((n) => n.id.startsWith('added:'));
        // Single-source links use soft springs; allow 1% around the collision equilibrium.
        assertSpacing(
          physical,
          kind === 'EXTERNAL_LINK' ? 180 * 0.99 : kind === 'KEYWORD' ? 200 : 150
        );
        if (kind === 'PARAGRAPH' || kind === 'CONNECTED_PARAGRAPH') {
          const expected = new Map(
            [...on.hierarchyConstraints.tree, ...on.hierarchyConstraints.cyclic].map((e) => [
              `${e.child}:${e.parent}`,
              e.length,
            ])
          );
          assert.ok(new Set(expected.values()).size > 1, 'crowded fixed groups use several rings');
          for (const [key, length] of expected) {
            const [child, parent] = key.split(':').map(Number);
            const a = on.simNodes[child],
              b = on.simNodes[parent];
            assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - length) < 1e-6);
          }
        } else {
          assert.equal(
            on.hierarchyConstraints.tree.length,
            0,
            'external links and keywords stay soft'
          );
          if (kind === 'KEYWORD')
            assert.equal(on.keywordPositionConstraints.length, members.length);
          else assert.equal(new Set(on.precomputedEdges.map((e) => e.targetLen)).size, 1);
        }
        context = rebuild(
          on,
          on.simNodes.filter((n) => !n.id.startsWith('added:')),
          baseEdges
        );
        settle(context);
        context.precomputedRootAnchors.forEach(({ x, y }, index) => {
          assert.ok(
            Math.hypot(x - anchors[index][0], y - anchors[index][1]) < 1e-6,
            'turning off restores the original area plan'
          );
        });
      }
    }
  });
});
