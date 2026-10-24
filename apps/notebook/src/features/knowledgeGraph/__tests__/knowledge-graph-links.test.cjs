const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Note and reference links', () => {
  const load = require('../keywordRelation/__tests__/loadTs.cjs');
  const { findKnowledgeGraphLinkSourceNodeId, findKnowledgeGraphLinkTargetNodeId } =
    load('../utils/links.ts');

  const paragraph = {
    path: 'parent,paragraph',
    title: '문단',
    level: 2,
    header: '<h2>문단</h2>',
    description: '',
  };
  const nodes = [
    {
      id: 'note',
      name: '대상 노트',
      noteTitle: '대상 노트',
      role: 'INSTANCE',
      instanceKind: 'NOTE',
    },
    {
      id: 'paragraph',
      name: '문단',
      noteTitle: '대상 노트',
      role: 'INSTANCE',
      instanceKind: 'PARAGRAPH',
      paragraph: { ...paragraph, origin: '대상 노트' },
    },
  ];

  test('resolves a board paragraph before its board note', () => {
    const boardNodes = [
      { ...nodes[0], id: 'board-note', name: '프로젝트/진행', noteTitle: '프로젝트/진행' },
      {
        ...nodes[1],
        id: 'board-paragraph',
        name: '작업 묶음',
        noteTitle: '프로젝트/진행',
        boardTitle: '프로젝트',
        instanceKind: 'BOARD_PARAGRAPH',
      },
    ];
    assert.equal(
      findKnowledgeGraphLinkTargetNodeId(boardNodes, new Map([['프로젝트/진행', 'board-note']]), {
        title: '프로젝트/진행',
        paragraph: '작업 묶음',
      }),
      'board-paragraph'
    );
  });

  test('finds every source and destination of a shared board paragraph', () => {
    const shared = {
      id: 'board-paragraph',
      name: '작업 묶음',
      role: 'INSTANCE',
      instanceKind: 'BOARD_PARAGRAPH',
      boardTitle: '프로젝트',
      noteTitle: '프로젝트/진행',
      paragraphOccurrences: [
        { ...paragraph, origin: '프로젝트/진행', path: 'first', autoSection: '첫 번째' },
        { ...paragraph, origin: '프로젝트/완료', path: 'second', autoSection: '두 번째' },
      ],
    };
    const second = { ...paragraph, path: 'second', autoSection: '두 번째' };
    assert.equal(findKnowledgeGraphLinkSourceNodeId([shared], '프로젝트/완료', second), shared.id);
    assert.equal(
      findKnowledgeGraphLinkTargetNodeId([shared], new Map(), {
        title: '프로젝트/완료',
        paragraph: '작업 묶음',
        section: '두 번째',
      }),
      shared.id
    );
    assert.equal(
      findKnowledgeGraphLinkTargetNodeId([shared], new Map(), {
        title: '프로젝트/완료',
        paragraph: '작업 묶음',
        section: '첫 번째',
      }),
      undefined
    );
  });

  test('uses the target section to disambiguate duplicate paragraph titles', () => {
    const duplicateNodes = [
      ...nodes,
      {
        id: 'paragraph:first',
        name: '중복 문단',
        noteTitle: '대상 노트',
        role: 'INSTANCE',
        instanceKind: 'PARAGRAPH',
        paragraph: { ...paragraph, title: '중복 문단', autoSection: '첫 번째' },
      },
      {
        id: 'paragraph:second',
        name: '중복 문단',
        noteTitle: '대상 노트',
        role: 'INSTANCE',
        instanceKind: 'PARAGRAPH',
        paragraph: { ...paragraph, title: '중복 문단', autoSection: '두 번째' },
      },
    ];
    const titleMap = new Map([['대상 노트', 'note']]);

    assert.equal(
      findKnowledgeGraphLinkTargetNodeId(duplicateNodes, titleMap, {
        title: '대상 노트',
        paragraph: '중복 문단',
        section: '두 번째',
      }),
      'paragraph:second'
    );
    assert.equal(
      findKnowledgeGraphLinkTargetNodeId(duplicateNodes, titleMap, {
        title: '대상 노트',
        paragraph: '중복 문단',
        section: '없는 구역',
      }),
      undefined
    );
  });
});

describe('External link classification', () => {
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const ts = require('typescript');

  const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-external-links-'));
  let findConnectedExternalLinkIds;
  try {
    const source = readFileSync(
      path.join(__dirname, '../utils/externalLinkClassification.ts'),
      'utf8'
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const outputFile = path.join(output, 'externalLinkClassification.js');
    writeFileSync(outputFile, compiled.outputText);
    ({ findConnectedExternalLinkIds } = require(outputFile));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }

  const nodes = [
    { id: 'link:shared', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
    { id: 'link:ordinary', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
    { id: 'note:one', role: 'INSTANCE', instanceKind: 'NOTE' },
    { id: 'note:two', role: 'INSTANCE', instanceKind: 'NOTE' },
  ];
  const edge = (source, target, type) => ({ source, target, type });

  test('source count alone leaves external links ordinary', () => {
    const edges = [
      edge('note:one', 'link:shared', 'EXTERNAL_REFERENCE'),
      edge('note:two', 'link:shared', 'EXTERNAL_REFERENCE'),
    ];
    assert.deepEqual(findConnectedExternalLinkIds(nodes, edges), []);
  });

  test('an additional relation marks only its external-link endpoint connected', () => {
    const edges = [
      edge('note:one', 'link:shared', 'EXTERNAL_REFERENCE'),
      edge('link:shared', 'note:one', 'REFERENCES'),
      edge('note:two', 'link:ordinary', 'EXTERNAL_REFERENCE'),
    ];
    assert.deepEqual(findConnectedExternalLinkIds(nodes, edges), ['link:shared']);
    assert.deepEqual(
      findConnectedExternalLinkIds(nodes, [
        ...edges,
        edge('note:two', 'link:ordinary', 'REFERENCES'),
      ]),
      ['link:ordinary', 'link:shared']
    );
  });
});
