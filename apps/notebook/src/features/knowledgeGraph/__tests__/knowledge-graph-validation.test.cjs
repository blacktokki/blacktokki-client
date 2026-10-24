const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { evaluateKnowledgeGraphAxioms } = load('../utils/axioms.ts');

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

test('warnings are reported separately from consistency errors', () => {
  const result = evaluateKnowledgeGraphAxioms(
    [node('A')],
    [],
    [{ title: 'A', subtitles: ['Isolated note'] }]
  );
  assert.equal(result.isConsistent, true);
  assert.equal(result.hasErrors, false);
  assert.equal(result.hasWarnings, true);
});

test('knowledgeGraph validation accepts a resolved reference to an existing empty note skeleton', () => {
  const source = node('note:source', {
    name: '출처',
    noteTitle: '출처',
    instanceKind: 'NOTE',
  });
  const emptyTarget = node('note:empty-target', {
    name: '빈 대상',
    noteTitle: '빈 대상',
    instanceKind: 'NOTE',
  });
  const result = evaluateKnowledgeGraphAxioms(
    [source, emptyTarget],
    [edge(source.id, emptyTarget.id, 'REFERENCES')],
    [{ title: source.noteTitle, subtitles: ['Unknown note link(빈 대상)'] }]
  );

  assert.equal(result.violations.length, 0);
});

test('knowledgeGraph validation keeps an explicit paragraph link to an empty note invalid', () => {
  const source = node('note:source', {
    name: '출처',
    noteTitle: '출처',
    instanceKind: 'NOTE',
  });
  const emptyTarget = node('note:empty-target', {
    name: '빈 대상',
    noteTitle: '빈 대상',
    instanceKind: 'NOTE',
  });
  const result = evaluateKnowledgeGraphAxioms(
    [source, emptyTarget],
    [],
    [{ title: source.noteTitle, subtitles: ['Unknown note link(빈 대상 ▶ 없는 문단)'] }]
  );

  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0].message, /Unknown paragraph link/);
});
