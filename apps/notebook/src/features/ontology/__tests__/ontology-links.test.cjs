const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-links-'));
let findOntologyLinkSourceNodeId;
let findOntologyLinkTargetNodeId;
try {
  const source = readFileSync(path.join(__dirname, '../links.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'links.js');
  writeFileSync(outputFile, compiled.outputText);
  ({ findOntologyLinkSourceNodeId, findOntologyLinkTargetNodeId } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

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

test('uses the paragraph containing a link before the containing note', () => {
  assert.equal(findOntologyLinkSourceNodeId(nodes, '대상 노트', paragraph, 'note'), 'paragraph');
});

test('resolves a linked paragraph before its note', () => {
  assert.equal(
    findOntologyLinkTargetNodeId(nodes, new Map([['대상 노트', 'note']]), {
      title: '대상 노트',
      paragraph: '문단',
    }),
    'paragraph'
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
    findOntologyLinkTargetNodeId(duplicateNodes, titleMap, {
      title: '대상 노트',
      paragraph: '중복 문단',
      section: '두 번째',
    }),
    'paragraph:second'
  );
  assert.equal(
    findOntologyLinkTargetNodeId(duplicateNodes, titleMap, {
      title: '대상 노트',
      paragraph: '중복 문단',
      section: '없는 구역',
    }),
    undefined
  );
});
