const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Compile only the pure graph modules; no React Native runtime or extra test dependency is needed.
const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-validation-'));
let evaluateKnowledgeGraphAxioms;
let summarizeKnowledgeGraphRelations;
try {
  for (const name of ['relations', 'axioms']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ evaluateKnowledgeGraphAxioms } = require(path.join(output, 'axioms.js')));
  ({ summarizeKnowledgeGraphRelations } = require(path.join(output, 'relations.js')));
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
const evaluate = (edges) =>
  evaluateKnowledgeGraphAxioms(
    [...new Set(edges.flatMap((e) => [e.source, e.target]))].map(node),
    edges
  );

test('validation does not create indirect relations', () => {
  const edges = [
    edge('card', 'child', 'INSTANCE_OF'),
    edge('child', 'parent', 'SUBCLASS_OF'),
    edge('parent', 'root', 'SUBCLASS_OF'),
  ];
  const result = evaluate(edges);

  assert.deepEqual(Object.keys(result).sort(), [
    'hasErrors',
    'hasWarnings',
    'isConsistent',
    'violations',
  ]);
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

test('an empty-parent warning focuses the existing child note', () => {
  const child = node('note:child', {
    name: '부모/자식',
    noteTitle: '부모/자식',
    instanceKind: 'NOTE',
  });
  const result = evaluateKnowledgeGraphAxioms(
    [child],
    [],
    [{ title: '부모/자식', subtitles: ['Empty parent note(부모)'] }]
  );

  assert.deepEqual(result.violations[0].affectedNodeIds, [child.id]);
  assert.match(result.violations[0].message, /부모\/자식/);
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

test('relation summaries keep detailed predicates and count each displayed relation', () => {
  const summaries = summarizeKnowledgeGraphRelations([
    { ...edge('card:a', 'class', 'INSTANCE_OF'), propertyLabel: 'instanceOf', dashed: true },
    { ...edge('card:b', 'class', 'INSTANCE_OF'), propertyLabel: 'instanceOf', dashed: true },
    { ...edge('class', 'root', 'SUBCLASS_OF'), propertyLabel: 'subClassOf' },
    {
      ...edge('class', 'note', 'REPRESENTED_BY_NOTE'),
      propertyLabel: 'representedByNote',
      dashed: true,
    },
    { ...edge('note:child', 'note:parent', 'PART_OF'), propertyLabel: 'notePartOf' },
    { ...edge('paragraph', 'parent', 'PART_OF'), propertyLabel: 'paragraphPartOf' },
    {
      ...edge('paragraph', 'note', 'PART_OF', 'connected-part'),
      propertyLabel: 'connectedPartOf',
      dashed: true,
    },
    { ...edge('note', 'target', 'REFERENCES'), propertyLabel: 'references' },
  ]);

  assert.deepEqual(
    summaries.map(({ label, count }) => ({ label, count })),
    [
      { label: 'instanceOf', count: 2 },
      { label: 'subClassOf', count: 1 },
      { label: 'representedByNote', count: 1 },
      { label: 'references', count: 1 },
      { label: 'notePartOf', count: 1 },
      { label: 'paragraphPartOf', count: 1 },
      { label: 'connectedPartOf', count: 1 },
    ]
  );
});
