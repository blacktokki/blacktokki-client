const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-title-keyword-'));
let buildGenericTitleKeywordGroups;
let extractUrlDomainKeyword;
let findNearestParentHeader;
let isNumericOnlyKeyword;
let noteTitleForKeywordComparison;
try {
  const source = readFileSync(path.join(__dirname, '../utils/titleKeywordClasses.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'titleKeywordClasses.js');
  writeFileSync(outputFile, compiled.outputText);
  ({
    buildGenericTitleKeywordGroups,
    extractUrlDomainKeyword,
    findNearestParentHeader,
    isNumericOnlyKeyword,
    noteTitleForKeywordComparison,
  } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

test('compares note titles without their ancestor note paths', () => {
  assert.equal(noteTitleForKeywordComparison('상위/중간/하위 노트'), '하위 노트');
});

test('groups title keywords across note-title, card and heading instances', () => {
  const groups = buildGenericTitleKeywordGroups([
    { nodeId: 'note:a', title: 'API 설계', noteId: 'note:a' },
    { nodeId: 'card:b', title: 'API 구현', noteId: 'note:b' },
    { nodeId: 'header:c', title: 'API 점검', noteId: 'note:c' },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: 'api',
      memberNodeIds: ['card:b', 'header:c', 'note:a'],
    },
  ]);
});

test('preserves coextensional generic keywords as separate concepts', () => {
  const groups = buildGenericTitleKeywordGroups([
    { nodeId: 'note:a', title: 'machine learning a', noteId: 'note:a' },
    { nodeId: 'note:b', title: 'machine learning b', noteId: 'note:b' },
    { nodeId: 'note:c', title: 'machine learning c', noteId: 'note:c' },
  ]);

  assert.deepEqual(
    groups.map((group) => group.keyword),
    ['learning', 'machine']
  );
});

test('generic title keywords also require instances from two distinct notes', () => {
  const groups = buildGenericTitleKeywordGroups([
    { nodeId: 'header:a', title: 'API 설계', noteId: 'note:a' },
    { nodeId: 'header:b', title: 'API 구현', noteId: 'note:a' },
  ]);
  assert.deepEqual(groups, []);
});

test('rejects numeric-only topic keywords', () => {
  assert.equal(isNumericOnlyKeyword('２０２６-09'), true);
  assert.equal(isNumericOnlyKeyword('2026 계획'), false);
  assert.deepEqual(
    buildGenericTitleKeywordGroups([
      { nodeId: 'note:a', title: '2026 계획', noteId: 'note:a' },
      { nodeId: 'note:b', title: '2026 결과', noteId: 'note:b' },
      { nodeId: 'note:c', title: '2026 점검', noteId: 'note:c' },
    ]),
    []
  );
});

test('uses the complete URL hostname as one topic keyword', () => {
  assert.equal(
    extractUrlDomainKeyword('https://Docs.Example.co.kr:8443/guide?q=api'),
    'docs.example.co.kr'
  );
  assert.equal(extractUrlDomainKeyword('//docs.example.co.kr/reference'), 'docs.example.co.kr');
  assert.equal(extractUrlDomainKeyword('docs.example.co.kr/tutorial'), 'docs.example.co.kr');
  assert.equal(extractUrlDomainKeyword('API 문서'), undefined);

  const genericGroups = buildGenericTitleKeywordGroups(
    ['a', 'b', 'c'].map((suffix, index) => ({
      nodeId: `note:url-${suffix}`,
      noteId: `노트 ${index + 1}`,
      title: 'docs.example.co.kr',
      evidenceKind: 'LINK',
      singleKeyword: true,
    }))
  );
  assert.deepEqual(
    genericGroups.map((group) => group.keyword),
    ['docs.example.co.kr']
  );
});

test('groups thousands of link candidates without a quadratic containment scan', () => {
  const candidates = Array.from({ length: 6000 }, (_, index) => ({
    nodeId: `node:${index}`,
    noteId: `note:${index}`,
    linkName: `service-${index} documentation`,
  }));
  const startedAt = performance.now();
  const genericGroups = buildGenericTitleKeywordGroups(
    candidates.map((candidate, index) => ({
      nodeId: candidate.nodeId,
      noteId: candidate.noteId,
      occurrenceId: `link:${index}`,
      title: candidate.linkName,
      evidenceKind: 'LINK',
    }))
  );
  const elapsedMs = performance.now() - startedAt;

  assert.ok(genericGroups.some((group) => group.keyword === 'documentation'));
  assert.ok(elapsedMs < 2000, `large keyword grouping took ${elapsedMs.toFixed(1)}ms`);
});

test('selects only the closest ancestor as a card parent header', () => {
  const root = { path: 'root', title: '제품', level: 1 };
  const parent = { path: 'root,parent', title: '백엔드', level: 2 };
  const sibling = { path: 'other', title: '프론트엔드', level: 2 };
  const card = { path: 'root,parent,card', title: 'API 구현', level: 3 };
  assert.equal(findNearestParentHeader([root, parent, sibling], card), parent);
});
