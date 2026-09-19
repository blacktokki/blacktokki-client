const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-paragraph-classification-'));
let findLinkedParagraphIds;
let findConnectedParagraphIds;
let buildParagraphPartOfAssignments;
let buildConnectedParagraphNotePartOfAssignments;
try {
  const source = readFileSync(
    path.join(__dirname, '../paragraphClassification.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'paragraphClassification.js');
  writeFileSync(outputFile, compiled.outputText);
  ({
    buildConnectedParagraphNotePartOfAssignments,
    buildParagraphPartOfAssignments,
    findConnectedParagraphIds,
    findLinkedParagraphIds,
  } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const paragraph = (id) => ({ id, role: 'INSTANCE', instanceKind: 'PARAGRAPH' });
const note = (id) => ({ id, role: 'INSTANCE', instanceKind: 'NOTE' });
const ontologyClass = (id, classKind = 'NOTE') => ({ id, role: 'CLASS', classKind });
const edge = (source, target, type) => ({ source, target, type });

test('does not classify a paragraph connected only through partOf', () => {
  const nodes = [paragraph('paragraph'), note('note')];
  const edges = [edge('paragraph', 'note', 'PART_OF')];
  assert.deepEqual(findLinkedParagraphIds(nodes, edges), []);
});

test('finds a referenced paragraph', () => {
  const nodes = [paragraph('paragraph'), note('note')];
  const edges = [edge('paragraph', 'note', 'PART_OF'), edge('note', 'paragraph', 'REFERENCES')];
  assert.deepEqual(findLinkedParagraphIds(nodes, edges), ['paragraph']);
  assert.deepEqual(findConnectedParagraphIds(nodes, edges), ['paragraph']);
});

test('finds a referenced paragraph even when it already belongs to another class', () => {
  const nodes = [paragraph('paragraph'), note('note'), ontologyClass('topic')];
  const edges = [
    edge('paragraph', 'note', 'PART_OF'),
    edge('note', 'paragraph', 'REFERENCES'),
    edge('paragraph', 'topic', 'INSTANCE_OF'),
  ];
  assert.deepEqual(findLinkedParagraphIds(nodes, edges), ['paragraph']);
  assert.deepEqual(findConnectedParagraphIds(nodes, edges), ['paragraph']);
});

test('title-keyword membership connects only the directly classified paragraph', () => {
  const nodes = [
    paragraph('grandparent'),
    paragraph('parent'),
    paragraph('child'),
    note('note'),
    ontologyClass('title-keyword', 'TITLE_KEYWORD'),
  ];
  const edges = [
    edge('grandparent', 'note', 'PART_OF'),
    edge('parent', 'grandparent', 'PART_OF'),
    edge('child', 'parent', 'PART_OF'),
    edge('child', 'title-keyword', 'INSTANCE_OF'),
  ];

  assert.deepEqual(findConnectedParagraphIds(nodes, edges), ['child']);
  assert.deepEqual(findLinkedParagraphIds(nodes, edges), []);
});

test('ordinary non-title class membership alone does not connect a paragraph', () => {
  const nodes = [paragraph('paragraph'), ontologyClass('ordinary-class')];
  const edges = [edge('paragraph', 'ordinary-class', 'INSTANCE_OF')];
  assert.deepEqual(findConnectedParagraphIds(nodes, edges), []);
  assert.deepEqual(findLinkedParagraphIds(nodes, edges), []);
});

test('assigns every paragraph to one nearest paragraph or containing note', () => {
  const candidates = [
    { nodeId: 'h1', documentId: 'note:a', path: 'a', containerNodeId: 'note:a' },
    { nodeId: 'h2', documentId: 'note:a', path: 'a,b', containerNodeId: 'note:a' },
    { nodeId: 'h3', documentId: 'note:a', path: 'a,b,c', containerNodeId: 'note:a' },
    { nodeId: 'other', documentId: 'note:b', path: 'a,b', containerNodeId: 'note:b' },
  ];
  const assignments = buildParagraphPartOfAssignments(candidates);
  assert.deepEqual(assignments, [
    { sourceNodeId: 'h1', targetNodeId: 'note:a' },
    { sourceNodeId: 'h2', targetNodeId: 'h1' },
    { sourceNodeId: 'h3', targetNodeId: 'h2' },
    { sourceNodeId: 'other', targetNodeId: 'note:b' },
  ]);
  assert.equal(new Set(assignments.map((assignment) => assignment.sourceNodeId)).size, 4);
  assert.equal(assignments.filter((assignment) => assignment.sourceNodeId === 'h2').length, 1);
  assert.equal(
    assignments.some(
      (assignment) => assignment.sourceNodeId === 'h2' && assignment.targetNodeId === 'note:a'
    ),
    false
  );

  assert.deepEqual(
    buildConnectedParagraphNotePartOfAssignments(candidates, assignments, ['h1', 'h2', 'h3']),
    [
      { sourceNodeId: 'h2', targetNodeId: 'note:a' },
      { sourceNodeId: 'h3', targetNodeId: 'note:a' },
    ]
  );
});
