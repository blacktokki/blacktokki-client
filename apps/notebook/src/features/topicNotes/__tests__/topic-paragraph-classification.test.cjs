const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-paragraph-classification-'));
let findConnectedParagraphIds;
let buildParagraphPartOfAssignments;
let buildConnectedParagraphNotePartOfAssignments;
let getBoardParagraphSourceNotes;
try {
  const source = readFileSync(
    path.join(__dirname, '../../knowledgeGraph/utils/paragraphClassification.ts'),
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
    getBoardParagraphSourceNotes,
  } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const paragraph = (id) => ({ id, role: 'INSTANCE', instanceKind: 'PARAGRAPH' });
const note = (id) => ({ id, role: 'INSTANCE', instanceKind: 'NOTE' });
const knowledgeGraphClass = (id, classKind = 'NOTE') => ({ id, role: 'CLASS', classKind });
const edge = (source, target, type) => ({ source, target, type });

test('title-keyword membership connects only the directly classified paragraph', () => {
  const nodes = [
    paragraph('grandparent'),
    paragraph('parent'),
    paragraph('child'),
    note('note'),
    knowledgeGraphClass('title-keyword', 'TITLE_KEYWORD'),
  ];
  const edges = [
    edge('grandparent', 'note', 'PART_OF'),
    edge('parent', 'grandparent', 'PART_OF'),
    edge('child', 'parent', 'PART_OF'),
    edge('child', 'title-keyword', 'INSTANCE_OF'),
  ];

  assert.deepEqual(findConnectedParagraphIds(nodes, edges, new Set(['title-keyword'])), ['child']);
});
