const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { createLayoutRunner } = require('./layoutTestHelper.cjs');

// Compile only the pure layout module; no React Native runtime is needed.
const output = mkdtempSync(path.join(tmpdir(), 'topic-layout-'));
let computeForceLayout;
let buildClassClusterIndex;
try {
  const source = readFileSync(
    path.join(__dirname, '../../knowledgeGraph/utils/forceLayout.ts'),
    'utf8'
  );
  writeFileSync(
    path.join(output, 'forceLayout.js'),
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
  );
  const layoutModule = require(path.join(output, 'forceLayout.js'));
  ({ buildClassClusterIndex } = layoutModule);
  computeForceLayout = createLayoutRunner(
    layoutModule.initForceSimulation,
    layoutModule.stepForceSimulation
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}

const edge = (source, target, type, id = `${source}:${type}:${target}`) => ({
  id,
  source,
  target,
  type,
});
const node = (id, overrides = {}) => ({
  id,
  name: id,
  noteTitle: id,
  role: 'INSTANCE',
  type: 'INSTANCE',
  properties: {},
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 8,
  color: '#000000',
  ...overrides,
});
test('indexes topic descendants and instances under their top-level topic class', () => {
  const nodes = [
    node('topic-root', { role: 'CLASS', type: 'CLASS', classCategory: 'TOPIC' }),
    node('topic-child', { role: 'CLASS', type: 'CLASS', classCategory: 'TOPIC' }),
    node('topic-leaf', { role: 'CLASS', type: 'CLASS', classCategory: 'TOPIC' }),
    node('topic-instance'),
    node('board-root', { role: 'CLASS', type: 'CLASS', classCategory: 'BOARD' }),
    node('board-instance'),
  ];
  const index = buildClassClusterIndex(
    nodes,
    [
      edge('topic-child', 'topic-root', 'SUBCLASS_OF'),
      edge('topic-leaf', 'topic-child', 'SUBCLASS_OF'),
      edge('topic-instance', 'topic-leaf', 'INSTANCE_OF'),
      edge('board-instance', 'board-root', 'INSTANCE_OF'),
    ],
    new Set(['topic-root', 'topic-child', 'topic-leaf'])
  );

  assert.deepEqual([...index.rootIds], ['topic-root']);
  assert.deepEqual([...index.rootsByNodeId.get('topic-child')], ['topic-root']);
  assert.deepEqual([...index.rootsByNodeId.get('topic-leaf')], ['topic-root']);
  assert.deepEqual([...index.rootsByNodeId.get('topic-instance')], ['topic-root']);
  assert.equal(index.rootsByNodeId.has('board-root'), false);
  assert.equal(index.rootsByNodeId.has('board-instance'), false);
});

test('packs a topic hierarchy closer to its root without changing the global spacing option', () => {
  const positionedNode = (id, x, y, overrides = {}) => node(id, { x, y, ...overrides });
  const makeNodes = (classCategory) => [
    positionedNode('root', 100, 100, { role: 'CLASS', type: 'CLASS', classCategory }),
    positionedNode('child', 500, 130, { role: 'CLASS', type: 'CLASS', classCategory }),
    positionedNode('instance', 900, 160),
    positionedNode('unrelated', 300, 700),
  ];
  const edges = [edge('child', 'root', 'SUBCLASS_OF'), edge('instance', 'child', 'INSTANCE_OF')];
  const options = { width: 900, height: 700, spacingScale: 1 };
  const ordinaryLayout = computeForceLayout(makeNodes('BUILT_IN'), edges, options);
  const topicLayout = computeForceLayout(makeNodes('TOPIC'), edges, options);
  const rootDistance = (layout, nodeId) => {
    const root = layout.find((item) => item.id === 'root');
    const item = layout.find((candidate) => candidate.id === nodeId);
    return Math.hypot(root.x - item.x, root.y - item.y);
  };

  assert.ok(rootDistance(topicLayout, 'child') < rootDistance(ordinaryLayout, 'child'));
  assert.ok(rootDistance(topicLayout, 'instance') < rootDistance(ordinaryLayout, 'instance'));
});
