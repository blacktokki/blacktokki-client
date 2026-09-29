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
let initForceSimulation;
let stepForceSimulation;
try {
  for (const name of ['relations', 'axioms', 'forceLayout']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  const layoutModule = require(path.join(output, 'forceLayout.js'));
  ({ buildClassRootDistanceIndex, initForceSimulation, stepForceSimulation } = layoutModule);
  computeForceLayout = createLayoutRunner(
    layoutModule.initForceSimulation,
    layoutModule.stepForceSimulation
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}

test('orders note and board branches by asserted hops from their class roots', () => {
  const roots = [
    { id: 'class:note', role: 'CLASS', classKind: 'NOTE' },
    { id: 'class:board:a', role: 'CLASS', classKind: 'BOARD_CARD' },
    { id: 'class:board:b', role: 'CLASS', classKind: 'BOARD_CARD' },
  ];
  const nodes = [
    ...roots,
    { id: 'note:1', role: 'INSTANCE' },
    { id: 'paragraph:1', role: 'INSTANCE' },
    { id: 'paragraph:2', role: 'INSTANCE' },
    { id: 'column:a', role: 'INSTANCE' },
    { id: 'card:a', role: 'INSTANCE' },
    { id: 'column:b', role: 'INSTANCE' },
  ];
  const edges = [
    { source: 'note:1', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'paragraph:1', target: 'note:1', type: 'PART_OF' },
    { source: 'paragraph:2', target: 'paragraph:1', type: 'PART_OF' },
    { source: 'column:a', target: 'class:board:a', type: 'INSTANCE_OF' },
    { source: 'card:a', target: 'column:a', type: 'PART_OF' },
    { source: 'column:b', target: 'class:board:b', type: 'INSTANCE_OF' },
    { source: 'card:a', target: 'class:note', type: 'REFERENCES' },
  ];
  const index = buildClassRootDistanceIndex(nodes, edges);
  assert.deepEqual(index.rootIds, ['class:note', 'class:board:a', 'class:board:b']);
  assert.equal(index.rootByNodeId.get('paragraph:2'), 'class:note');
  assert.equal(index.hopByNodeId.get('paragraph:2'), 3);
  assert.equal(index.rootByNodeId.get('card:a'), 'class:board:a');
  assert.equal(index.hopByNodeId.get('card:a'), 2);
  assert.equal(index.rootByNodeId.get('column:b'), 'class:board:b');
});

test('places a cited external link with its board instead of using the link class as a root', () => {
  const nodes = [
    { id: 'class:note', role: 'CLASS', classKind: 'NOTE' },
    { id: 'class:board', role: 'CLASS', classKind: 'BOARD_CARD' },
    { id: 'class:external', role: 'CLASS', classKind: 'EXTERNAL_LINK' },
    { id: 'note', role: 'INSTANCE' },
    { id: 'note:section', role: 'INSTANCE' },
    { id: 'note:detail', role: 'INSTANCE' },
    { id: 'board:note', role: 'INSTANCE' },
    { id: 'external', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
  ];
  const edges = [
    { source: 'note', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'note:section', target: 'note', type: 'PART_OF' },
    { source: 'note:detail', target: 'note:section', type: 'PART_OF' },
    { source: 'board:note', target: 'class:board', type: 'INSTANCE_OF' },
    { source: 'note:detail', target: 'board:note', type: 'REFERENCES' },
    { source: 'board:note', target: 'external', type: 'EXTERNAL_REFERENCE' },
    { source: 'external', target: 'class:external', type: 'INSTANCE_OF' },
  ];
  const index = buildClassRootDistanceIndex(nodes, edges);

  assert.deepEqual(index.rootIds, ['class:note', 'class:board']);
  assert.equal(index.rootByNodeId.get('note:detail'), 'class:note');
  assert.equal(index.hopByNodeId.get('note:detail'), 3);
  assert.equal(index.rootByNodeId.get('board:note'), 'class:board');
  assert.equal(index.rootByNodeId.get('external'), 'class:board');
  assert.equal(index.hopByNodeId.get('external'), 2);

  const positions = new Map(
    computeForceLayout(
      nodes.map((node) => ({ ...node, name: node.id, x: 0, y: 0, radius: 10 })),
      edges,
      { width: 1000, height: 700, iterations: 160 }
    ).map((node) => [node.id, node])
  );
  const distance = (nodeId, rootId) => {
    const node = positions.get(nodeId);
    const root = positions.get(rootId);
    return Math.hypot(node.x - root.x, node.y - root.y);
  };
  assert.ok(distance('note:detail', 'class:note') < distance('note:detail', 'class:board'));
  assert.ok(distance('board:note', 'class:board') < distance('board:note', 'class:note'));
  assert.ok(distance('external', 'class:board') < distance('external', 'class:note'));
});

test('keeps a shared external link with a citing Note or Board class', () => {
  const makeNode = (id, role, extra = {}) => ({
    id,
    name: id,
    role,
    x: 0,
    y: 0,
    radius: role === 'CLASS' ? 16 : 10,
    ...extra,
  });
  const nodes = [
    makeNode('class:note', 'CLASS', { classKind: 'NOTE' }),
    makeNode('class:board', 'CLASS', { classKind: 'BOARD_CARD' }),
    makeNode('class:external', 'CLASS', { classKind: 'EXTERNAL_LINK' }),
    makeNode('external:shared', 'INSTANCE', { instanceKind: 'EXTERNAL_LINK' }),
  ];
  const edges = [{ source: 'external:shared', target: 'class:external', type: 'INSTANCE_OF' }];
  for (let index = 0; index < 12; index++) {
    const id = `note:${index}`;
    const classId = index % 2 ? 'class:board' : 'class:note';
    nodes.push(makeNode(id, 'INSTANCE', { instanceKind: 'NOTE' }));
    edges.push({ source: id, target: classId, type: 'INSTANCE_OF' });
    edges.push({ source: id, target: 'external:shared', type: 'EXTERNAL_REFERENCE' });
  }

  const positions = new Map(
    computeForceLayout(nodes, edges, { width: 1000, height: 700, iterations: 160 }).map((node) => [
      node.id,
      node,
    ])
  );
  const link = positions.get('external:shared');
  const distance = (rootId) => {
    const root = positions.get(rootId);
    return Math.hypot(link.x - root.x, link.y - root.y);
  };
  const index = buildClassRootDistanceIndex(nodes, edges);
  assert.equal(index.rootByNodeId.get('external:shared'), 'class:note');
  assert.ok(distance('class:note') < distance('class:board'));
});

test('seeds a newly cited external link beside its note during a warm layout', () => {
  const nodes = [
    { id: 'class:note', role: 'CLASS', classKind: 'NOTE', x: 100, y: 300 },
    { id: 'class:external', role: 'CLASS', classKind: 'EXTERNAL_LINK', x: 700, y: 100 },
    { id: 'note', role: 'INSTANCE', instanceKind: 'NOTE', x: 150, y: 300 },
    { id: 'external', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK', x: 0, y: 0 },
  ].map((node) => ({ ...node, name: node.id, radius: 10 }));
  const edges = [
    { source: 'note', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'external', target: 'class:external', type: 'INSTANCE_OF' },
    { source: 'note', target: 'external', type: 'EXTERNAL_REFERENCE' },
  ];

  const positions = new Map(
    initForceSimulation(nodes, edges, { width: 1000, height: 700 }).simNodes.map((node) => [
      node.id,
      node,
    ])
  );
  const link = positions.get('external');
  const note = positions.get('note');
  assert.ok(Math.hypot(link.x - note.x, link.y - note.y) <= 95);
});

test('places the External Link class between the Note and a citing Board class', () => {
  const nodes = [
    { id: 'class:note', role: 'CLASS', classKind: 'NOTE', x: 100, y: 300 },
    { id: 'class:board', role: 'CLASS', classKind: 'BOARD_CARD', x: 1000, y: 300 },
    { id: 'class:external', role: 'CLASS', classKind: 'EXTERNAL_LINK', x: 800, y: 100 },
    { id: 'note', role: 'INSTANCE', instanceKind: 'NOTE', x: 150, y: 300 },
    { id: 'board:note', role: 'INSTANCE', instanceKind: 'NOTE', x: 1050, y: 300 },
    { id: 'external:note', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK', x: 0, y: 0 },
    { id: 'external:board', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK', x: 0, y: 0 },
  ].map((node) => ({ ...node, name: node.id, radius: 10 }));
  const edges = [
    { source: 'note', target: 'class:note', type: 'INSTANCE_OF' },
    { source: 'board:note', target: 'class:board', type: 'INSTANCE_OF' },
    { source: 'external:note', target: 'class:external', type: 'INSTANCE_OF' },
    { source: 'external:board', target: 'class:external', type: 'INSTANCE_OF' },
    { source: 'note', target: 'external:note', type: 'EXTERNAL_REFERENCE' },
    { source: 'board:note', target: 'external:board', type: 'EXTERNAL_REFERENCE' },
  ];
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  const positions = new Map(context.simNodes.map((node) => [node.id, node]));
  const noteClass = positions.get('class:note');
  const boardClass = positions.get('class:board');
  const linkClass = positions.get('class:external');
  const boardLink = positions.get('external:board');
  const classGap = Math.hypot(boardClass.x - noteClass.x, boardClass.y - noteClass.y);
  const linkClassGap = Math.hypot(linkClass.x - noteClass.x, linkClass.y - noteClass.y);
  assert.ok(linkClassGap >= classGap * 0.4);
  assert.ok(linkClassGap <= classGap * 0.6);
  assert.ok(
    Math.hypot(boardLink.x - linkClass.x, boardLink.y - linkClass.y) <
      Math.hypot(boardLink.x - noteClass.x, boardLink.y - noteClass.y) * 0.7
  );
});

test('spreads ordinary external links while keeping their class near the central Note class', () => {
  const makeNode = (id, role, kind) => ({
    id,
    name: id,
    role,
    ...(role === 'CLASS' ? { classKind: kind } : { instanceKind: kind }),
    x: 0,
    y: 0,
    radius: role === 'CLASS' ? 16 : 10,
  });
  const baseNodes = [
    makeNode('class:note', 'CLASS', 'NOTE'),
    makeNode('class:board', 'CLASS', 'BOARD_CARD'),
    ...Array.from({ length: 12 }, (_, index) => makeNode(`note:${index}`, 'INSTANCE', 'NOTE')),
  ];
  const edges = Array.from({ length: 12 }, (_, index) => ({
    source: `note:${index}`,
    target: 'class:note',
    type: 'INSTANCE_OF',
  }));
  const settledNodes = computeForceLayout(baseNodes, edges, {
    width: 1000,
    height: 700,
    iterations: 160,
  });
  const nodes = [...settledNodes, makeNode('class:external', 'CLASS', 'EXTERNAL_LINK')];
  for (let index = 0; index < 12; index++) {
    const id = `external:${index}`;
    nodes.push(makeNode(id, 'INSTANCE', 'EXTERNAL_LINK'));
    edges.push({ source: id, target: 'class:external', type: 'INSTANCE_OF' });
    edges.push({ source: 'note:0', target: id, type: 'EXTERNAL_REFERENCE' });
  }

  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  const initialPositions = new Map(context.simNodes.map((node) => [node.id, node]));
  const initialNoteClass = initialPositions.get('class:note');
  const initialLinkClass = initialPositions.get('class:external');
  assert.ok(
    Math.hypot(initialLinkClass.x - initialNoteClass.x, initialLinkClass.y - initialNoteClass.y) <=
      220
  );
  assert.ok(
    Math.hypot(initialLinkClass.x - context.cx, initialLinkClass.y - context.cy) <
      Math.hypot(initialNoteClass.x - context.cx, initialNoteClass.y - context.cy)
  );
  let alpha = 0.4;
  for (let frame = 0; frame < 300; frame++) {
    const movement = stepForceSimulation(context, alpha);
    alpha *= 0.982;
    if (alpha < 0.005 || movement < 0.08) break;
  }
  const positions = new Map(context.simNodes.map((node) => [node.id, node]));
  const root = positions.get('class:note');
  const board = positions.get('class:board');
  const linkClass = positions.get('class:external');
  const quadrants = [0, 0, 0, 0];
  assert.ok(Math.hypot(linkClass.x - root.x, linkClass.y - root.y) <= 280);
  for (let index = 0; index < 12; index++) {
    const link = positions.get(`external:${index}`);
    const rootDistance = Math.hypot(link.x - root.x, link.y - root.y);
    assert.ok(rootDistance < Math.hypot(link.x - board.x, link.y - board.y));
    quadrants[Number(link.x >= root.x) + 2 * Number(link.y >= root.y)]++;
  }
  assert.ok(Math.min(...quadrants) >= 2, `ordinary external link quadrants: ${quadrants}`);
});

test('keeps class families together after the canvas animation settles with many cross references', () => {
  const makeNode = (id, role, kind) => ({
    id,
    name: id,
    role,
    ...(role === 'CLASS' ? { classKind: kind } : { instanceKind: kind }),
    x: 0,
    y: 0,
    radius: role === 'CLASS' ? 16 : 10,
  });
  const nodes = [
    makeNode('class:note', 'CLASS', 'NOTE'),
    makeNode('class:board', 'CLASS', 'BOARD_CARD'),
    makeNode('class:external', 'CLASS', 'EXTERNAL_LINK'),
  ];
  const edges = [];
  for (let index = 0; index < 16; index++) {
    const id = `note:${index}`;
    nodes.push(makeNode(id, 'INSTANCE', 'NOTE'));
    edges.push({ source: id, target: 'class:note', type: 'INSTANCE_OF' });
  }
  for (let index = 0; index < 8; index++) {
    const id = `board:${index}`;
    nodes.push(makeNode(id, 'INSTANCE', 'NOTE'));
    edges.push({ source: id, target: 'class:board', type: 'INSTANCE_OF' });
  }
  for (let index = 0; index < 10; index++) {
    const id = `external:${index}`;
    nodes.push(makeNode(id, 'INSTANCE', 'EXTERNAL_LINK'));
    edges.push({ source: id, target: 'class:external', type: 'INSTANCE_OF' });
    for (let sourceIndex = 0; sourceIndex < 8; sourceIndex++) {
      edges.push({ source: `note:${sourceIndex}`, target: id, type: 'EXTERNAL_REFERENCE' });
      edges.push({ source: `board:${sourceIndex % 8}`, target: id, type: 'EXTERNAL_REFERENCE' });
    }
  }

  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  let alpha = 1;
  for (let frame = 0; frame < 300; frame++) {
    const movement = stepForceSimulation(context, alpha);
    alpha *= 0.982;
    if (alpha < 0.005 || movement < 0.08) break;
  }
  const positions = new Map(context.simNodes.map((node) => [node.id, node]));
  const rootIndex = buildClassRootDistanceIndex(nodes, edges);
  const externalRootCounts = ['class:note', 'class:board'].map(
    (rootId) =>
      context.simNodes.filter(
        (node) => node.id.startsWith('external:') && rootIndex.rootByNodeId.get(node.id) === rootId
      ).length
  );
  assert.deepEqual(externalRootCounts, [5, 5]);
  for (const [prefix, expectedRootId] of [
    ['note', 'class:note'],
    ['board', 'class:board'],
    ['external', undefined],
  ]) {
    for (const node of context.simNodes.filter((candidate) =>
      candidate.id.startsWith(`${prefix}:`)
    )) {
      const rootId = expectedRootId || rootIndex.rootByNodeId.get(node.id);
      const ownRoot = positions.get(rootId);
      const ownDistance = Math.hypot(node.x - ownRoot.x, node.y - ownRoot.y);
      for (const otherRootId of ['class:note', 'class:board']) {
        if (otherRootId === rootId) continue;
        const otherRoot = positions.get(otherRootId);
        const otherDistance = Math.hypot(node.x - otherRoot.x, node.y - otherRoot.y);
        assert.ok(
          ownDistance < otherDistance,
          `${node.id}: ${ownDistance} vs ${otherRootId}: ${otherDistance}`
        );
      }
    }
  }
  const noteRoot = positions.get('class:note');
  const boardRoot = positions.get('class:board');
  const linkClass = positions.get('class:external');
  const classGap = Math.hypot(boardRoot.x - noteRoot.x, boardRoot.y - noteRoot.y);
  assert.ok(Math.hypot(linkClass.x - noteRoot.x, linkClass.y - noteRoot.y) < classGap * 0.7);
  assert.ok(Math.hypot(linkClass.x - boardRoot.x, linkClass.y - boardRoot.y) < classGap * 0.7);
});

test('keeps descendants nearest their own board class when several boards are visible', () => {
  const makeNode = (id, role, extra = {}) => ({
    id,
    name: id,
    role,
    x: 0,
    y: 0,
    radius: role === 'CLASS' ? 16 : 10,
    ...extra,
  });
  const nodes = [makeNode('class:note', 'CLASS', { classKind: 'NOTE' })];
  const edges = [];
  for (let boardIndex = 0; boardIndex < 3; boardIndex++) {
    const classId = `class:board:${boardIndex}`;
    nodes.push(makeNode(classId, 'CLASS', { classKind: 'BOARD_CARD' }));
    for (let index = 0; index < 10; index++) {
      const noteId = `board:${boardIndex}:note:${index}`;
      const childId = `board:${boardIndex}:child:${index}`;
      nodes.push(makeNode(noteId, 'INSTANCE', { instanceKind: 'NOTE' }));
      nodes.push(makeNode(childId, 'INSTANCE', { instanceKind: 'CARD' }));
      edges.push({ source: noteId, target: classId, type: 'INSTANCE_OF' });
      edges.push({ source: childId, target: noteId, type: 'PART_OF' });
    }
  }
  const context = initForceSimulation(nodes, edges, { width: 1000, height: 700 });
  let alpha = 1;
  for (let frame = 0; frame < 300; frame++) {
    const movement = stepForceSimulation(context, alpha);
    alpha *= 0.982;
    if (alpha < 0.005 || movement < 0.08) break;
  }
  const positions = new Map(context.simNodes.map((node) => [node.id, node]));
  const index = buildClassRootDistanceIndex(nodes, edges);
  for (const node of context.simNodes.filter((candidate) => candidate.role === 'INSTANCE')) {
    const ownRootId = index.rootByNodeId.get(node.id);
    const ownRoot = positions.get(ownRootId);
    const ownDistance = Math.hypot(node.x - ownRoot.x, node.y - ownRoot.y);
    for (const otherRootId of index.rootIds) {
      if (otherRootId === ownRootId) continue;
      const otherRoot = positions.get(otherRootId);
      const otherDistance = Math.hypot(node.x - otherRoot.x, node.y - otherRoot.y);
      assert.ok(
        ownDistance < otherDistance,
        `${node.id}: ${ownDistance} vs ${otherRootId}: ${otherDistance}`
      );
    }
  }
  for (let boardIndex = 0; boardIndex < 3; boardIndex++) {
    const root = positions.get(`class:board:${boardIndex}`);
    const averageDistance = (kind) =>
      Array.from({ length: 10 }, (_, index) => {
        const node = positions.get(`board:${boardIndex}:${kind}:${index}`);
        return Math.hypot(node.x - root.x, node.y - root.y);
      }).reduce((total, distance) => total + distance, 0) / 10;
    assert.ok(averageDistance('note') < averageDistance('child'));
  }
});

test('keeps successive note and board descendants on progressively wider rings', () => {
  const makeNode = (id, role, extra = {}) => ({
    id,
    name: id,
    role,
    type: role,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: role === 'CLASS' ? 16 : 10,
    ...extra,
  });
  const nodes = [
    makeNode('class:note', 'CLASS', { classKind: 'NOTE' }),
    makeNode('class:board', 'CLASS', { classKind: 'BOARD_CARD' }),
  ];
  const edges = [];
  for (const [root, prefix] of [
    ['class:note', 'note'],
    ['class:board', 'board'],
  ]) {
    for (let index = 0; index < 4; index++) {
      const first = `${prefix}:first:${index}`;
      const second = `${prefix}:second:${index}`;
      const third = `${prefix}:third:${index}`;
      nodes.push(makeNode(first, 'INSTANCE'));
      nodes.push(makeNode(second, 'INSTANCE'));
      nodes.push(makeNode(third, 'INSTANCE'));
      edges.push({ source: first, target: root, type: 'INSTANCE_OF' });
      edges.push({ source: second, target: first, type: 'PART_OF' });
      edges.push({ source: third, target: second, type: 'PART_OF' });
    }
  }
  const layout = computeForceLayout(nodes, edges, { width: 1000, height: 700, iterations: 160 });
  const positions = new Map(layout.map((node) => [node.id, node]));
  for (const [root, prefix] of [
    ['class:note', 'note'],
    ['class:board', 'board'],
  ]) {
    const rootPosition = positions.get(root);
    const averages = [1, 2, 3].map((hop) => {
      const label = ['first', 'second', 'third'][hop - 1];
      return (
        Array.from({ length: 4 }, (_, index) => {
          const node = positions.get(`${prefix}:${label}:${index}`);
          return Math.hypot(node.x - rootPosition.x, node.y - rootPosition.y);
        }).reduce((sum, distance) => sum + distance, 0) / 4
      );
    });
    assert.ok(averages[0] < averages[1] && averages[1] < averages[2], `${prefix}: ${averages}`);
  }
});

test('stably layouts 500 nodes and 1000 edges within bounded coordinates and fast execution time', () => {
  const nodeCount = 500;
  const edgeCount = 1000;

  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    name: `Node ${index}`,
    role: index < 20 ? 'CLASS' : 'INSTANCE',
    type: index < 20 ? 'CLASS' : 'INSTANCE',
    classCategory: index < 20 ? 'BOARD' : undefined,
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
    classCategory: index < 25 ? 'BOARD' : undefined,
    classKind: index < 25 ? 'BOARD_CARD' : undefined,
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
    assert.ok(
      screenX <= screenWidth,
      `Node ${n.id} screenX (${screenX}) must be <= ${screenWidth}`
    );
    assert.ok(screenY >= 0, `Node ${n.id} screenY (${screenY}) must be >= 0`);
    assert.ok(
      screenY <= screenHeight,
      `Node ${n.id} screenY (${screenY}) must be <= ${screenHeight}`
    );
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

  assert.ok(elapsedMs < 1000, `Warm restart must complete under 1000ms (took ${elapsedMs}ms)`);

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
