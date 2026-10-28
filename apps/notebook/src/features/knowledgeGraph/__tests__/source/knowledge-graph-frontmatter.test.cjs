const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Frontmatter graph structure', () => {
  const load = require('../../keywordRelation/__tests__/loadTs.cjs');
  const { extractYamlFrontmatter } = load('../frontmatter.ts');

  test('extractYamlFrontmatter parses markdown frontmatter blocks', () => {
    const md = `---
title: Test Note
author: Alice
schedule: 2026-09-21
count: 42
isPublished: true
tags:
  - knowledgeGraph
  - zettelkasten
---
# Actual Note Content
Some paragraph text.`;

    const props = extractYamlFrontmatter(md);
    assert.equal(props.title, 'Test Note');
    assert.equal(props.author, 'Alice');
    assert.equal(props.schedule, '2026-09-21');
    assert.equal(props.count, 42);
    assert.equal(props.isPublished, true);
    assert.deepEqual(props.tags, ['knowledgeGraph', 'zettelkasten']);
  });

  test('extractYamlFrontmatter parses editor HTML frontmatter divs', () => {
    const rawYaml = 'category: science\nschedule: 2032-01-02\nstatus: active';
    const html = `<div class="yaml-frontmatter" data-yaml="${encodeURIComponent(
      rawYaml
    )}" style="display: none;"><br></div><h1>Note Header</h1><p>Body</p>`;

    const props = extractYamlFrontmatter(html);
    assert.equal(props.category, 'science');
    assert.equal(props.schedule, '2032-01-02');
    assert.equal(props.status, 'active');
  });

  test('extractYamlFrontmatter safely returns empty object on invalid or absent frontmatter', () => {
    assert.deepEqual(extractYamlFrontmatter(''), {});
    assert.deepEqual(extractYamlFrontmatter(undefined), {});
    assert.deepEqual(extractYamlFrontmatter('Plain content with no frontmatter'), {});
    assert.deepEqual(extractYamlFrontmatter('---\ninvalid: [yaml\n---'), {});
    assert.deepEqual(extractYamlFrontmatter('---\n- list item only\n---'), {});
  });
});

describe('Paragraph classification', () => {
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const ts = require('typescript');

  const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-paragraph-classification-'));
  let findConnectedParagraphIds;
  let buildParagraphPartOfAssignments;
  let buildConnectedParagraphNotePartOfAssignments;
  let getBoardParagraphSourceNotes;
  try {
    const source = readFileSync(path.join(__dirname, '../../paragraphClassification.ts'), 'utf8');
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

  test('lists every distinct source note of a board paragraph, including a single note', () => {
    const first = { title: '묶음', path: 'first', origin: '프로젝트/진행' };
    const second = { title: '묶음', path: 'second', origin: '프로젝트/완료' };
    const boardParagraph = {
      instanceKind: 'BOARD_PARAGRAPH',
      noteTitle: '프로젝트/진행',
      paragraph: first,
      paragraphOccurrences: [first, second, { ...first, path: 'third' }],
    };

    assert.deepEqual(getBoardParagraphSourceNotes(boardParagraph), [
      { noteTitle: '프로젝트/완료', paragraph: second },
      { noteTitle: '프로젝트/진행', paragraph: first },
    ]);
    assert.deepEqual(
      getBoardParagraphSourceNotes({ ...boardParagraph, paragraphOccurrences: [first] }),
      [{ noteTitle: '프로젝트/진행', paragraph: first }]
    );
  });

  test('does not classify a paragraph connected only through partOf', () => {
    const nodes = [paragraph('paragraph'), note('note')];
    const edges = [edge('paragraph', 'note', 'PART_OF')];
    assert.deepEqual(findConnectedParagraphIds(nodes, edges), []);
  });

  test('finds a referenced paragraph', () => {
    const nodes = [paragraph('paragraph'), note('note')];
    const edges = [edge('paragraph', 'note', 'PART_OF'), edge('note', 'paragraph', 'REFERENCES')];
    assert.deepEqual(findConnectedParagraphIds(nodes, edges), ['paragraph']);
  });

  test('finds a referenced paragraph even when it already belongs to another class', () => {
    const nodes = [paragraph('paragraph'), note('note'), knowledgeGraphClass('class')];
    const edges = [
      edge('paragraph', 'note', 'PART_OF'),
      edge('note', 'paragraph', 'REFERENCES'),
      edge('paragraph', 'class', 'INSTANCE_OF'),
    ];
    assert.deepEqual(findConnectedParagraphIds(nodes, edges), ['paragraph']);
  });

  test('class membership alone does not connect a paragraph', () => {
    const nodes = [paragraph('paragraph'), knowledgeGraphClass('ordinary-class')];
    const edges = [edge('paragraph', 'ordinary-class', 'INSTANCE_OF')];
    assert.deepEqual(findConnectedParagraphIds(nodes, edges), []);
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
});

describe('Instance class membership', () => {
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const ts = require('typescript');

  const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-class-membership-'));
  let findInstanceClassIds;
  try {
    const source = readFileSync(path.join(__dirname, '../../utils/classMembership.ts'), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const outputFile = path.join(output, 'classMembership.js');
    writeFileSync(outputFile, compiled.outputText);
    ({ findInstanceClassIds } = require(outputFile));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }

  const edge = (source, target, type) => ({ source, target, type });

  test('lists only asserted classes directly assigned to an instance', () => {
    const edges = [
      edge('instance', 'class:status', 'INSTANCE_OF'),
      edge('instance', 'class:status', 'INSTANCE_OF'),
      edge('instance', 'class:other', 'REFERENCES'),
      edge('class:status', 'class:board', 'SUBCLASS_OF'),
      edge('other', 'class:item', 'INSTANCE_OF'),
    ];

    assert.deepEqual(findInstanceClassIds('instance', edges), ['class:status']);
  });
});
