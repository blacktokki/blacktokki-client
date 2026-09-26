const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-nhop-'));
let getNhopDepthOptions;
let normalizeNhopDepth;
let supportsThreeHopRange;
try {
  const source = readFileSync(path.join(__dirname, '../utils/nhop.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'nhop.js');
  writeFileSync(outputFile, compiled.outputText);
  ({ getNhopDepthOptions, normalizeNhopDepth, supportsThreeHopRange } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const node = (id, overrides = {}) => ({
  id,
  name: id,
  role: 'CLASS',
  type: 'CLASS',
  noteTitle: id,
  properties: {},
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 10,
  color: '#000',
  ...overrides,
});

const edge = (source, target, type) => ({
  id: `${source}:${type}:${target}`,
  source,
  target,
  type,
});

test('does not offer 3-hop for board class nodes, topic classes, or any other nodes', () => {
  const topicRoot = node('topic:root', { classCategory: 'TOPIC', classKind: 'TITLE_KEYWORD' });
  const boardRoot = node('board:root', { classCategory: 'BOARD', classKind: 'BOARD_CARD' });

  assert.equal(supportsThreeHopRange(topicRoot, []), false);
  assert.equal(supportsThreeHopRange(boardRoot, []), false);
  assert.deepEqual(getNhopDepthOptions(topicRoot, []), [1, 2, 99]);
  assert.deepEqual(getNhopDepthOptions(boardRoot, []), [1, 2, 99]);
  assert.equal(normalizeNhopDepth(topicRoot, [], 3), 2);
  assert.equal(normalizeNhopDepth(boardRoot, [], 3), 2);
});

test('does not offer 3-hop for topic and board subclasses or other nodes', () => {
  const topicSubclass = node('topic:child', {
    classCategory: 'TOPIC',
    classKind: 'TITLE_KEYWORD',
  });
  const boardStatus = node('board:status', {
    classCategory: 'BOARD',
    classKind: 'BOARD_STATUS',
  });
  const noteInstance = node('note:instance', { role: 'INSTANCE', instanceKind: 'NOTE' });
  const edges = [
    edge(topicSubclass.id, 'topic:root', 'SUBCLASS_OF'),
    edge(boardStatus.id, 'board:root', 'SUBCLASS_OF'),
  ];

  assert.equal(supportsThreeHopRange(topicSubclass, edges), false);
  assert.equal(supportsThreeHopRange(boardStatus, edges), false);
  assert.equal(supportsThreeHopRange(noteInstance, edges), false);
  assert.deepEqual(getNhopDepthOptions(topicSubclass, edges), [1, 2, 99]);
  assert.deepEqual(getNhopDepthOptions(boardStatus, edges), [1, 2, 99]);
  assert.equal(normalizeNhopDepth(topicSubclass, edges, 3), 2);
  assert.equal(normalizeNhopDepth(boardStatus, edges, 3), 2);
  assert.equal(normalizeNhopDepth(boardStatus, edges, 99), 99);
});

test('treats an inferred parent relation as a subclass for the 3-hop option', () => {
  const topicSubclass = node('topic:inferred-child', {
    classCategory: 'TOPIC',
    classKind: 'TITLE_KEYWORD',
  });
  const edges = [edge(topicSubclass.id, 'topic:root', 'INFERRED_SUBCLASS_OF')];

  assert.equal(supportsThreeHopRange(topicSubclass, edges), false);
  assert.deepEqual(getNhopDepthOptions(topicSubclass, edges), [1, 2, 99]);
});
