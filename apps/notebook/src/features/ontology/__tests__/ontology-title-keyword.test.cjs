const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-title-keyword-'));
let buildTitleKeywordGroups;
let buildCardTypeGroups;
let buildGenericTitleKeywordGroups;
let assignGenericTitleKeywordGroup;
let findNearestParentHeader;
let isNumericOnlyKeyword;
let noteTitleForKeywordComparison;
try {
  const source = readFileSync(path.join(__dirname, '../titleKeywordClasses.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'titleKeywordClasses.js');
  writeFileSync(outputFile, compiled.outputText);
  ({
    assignGenericTitleKeywordGroup,
    buildCardTypeGroups,
    buildGenericTitleKeywordGroups,
    buildTitleKeywordGroups,
    findNearestParentHeader,
    isNumericOnlyKeyword,
    noteTitleForKeywordComparison,
  } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

test('groups note instances by keywords shared in their titles', () => {
  const groups = buildTitleKeywordGroups([
    { nodeId: 'note:a', title: 'API 설계', scope: 'NOTE' },
    { nodeId: 'note:b', title: 'API 구현', scope: 'NOTE' },
    { nodeId: 'note:c', title: 'API 점검', scope: 'NOTE' },
    { nodeId: 'note:d', title: '디자인 시스템', scope: 'NOTE' },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: 'api',
      scope: 'NOTE',
      level: undefined,
      memberNodeIds: ['note:a', 'note:b', 'note:c'],
    },
  ]);
});

test('compares note titles without their ancestor note paths', () => {
  const candidates = [
    { nodeId: 'note:a', title: '제품 A/API 설계', scope: 'NOTE' },
    { nodeId: 'note:b', title: '제품 B/API 구현', scope: 'NOTE' },
    { nodeId: 'note:c', title: '제품 C/API 점검', scope: 'NOTE' },
  ].map((candidate) => ({
    ...candidate,
    title: noteTitleForKeywordComparison(candidate.title),
  }));
  assert.deepEqual(buildTitleKeywordGroups(candidates), [
    {
      keyword: 'api',
      scope: 'NOTE',
      level: undefined,
      memberNodeIds: ['note:a', 'note:b', 'note:c'],
    },
  ]);
  assert.equal(noteTitleForKeywordComparison('상위/중간/하위 노트'), '하위 노트');
});

test('groups headers only when their keyword and heading level both match', () => {
  const groups = buildTitleKeywordGroups([
    { nodeId: 'h2:a', title: '배포 계획', scope: 'HEADER', level: 2, noteId: 'note:a' },
    { nodeId: 'h2:b', title: '배포 결과', scope: 'HEADER', level: 2, noteId: 'note:b' },
    { nodeId: 'h2:c', title: '배포 점검', scope: 'HEADER', level: 2, noteId: 'note:c' },
    { nodeId: 'h3:a', title: '배포 점검', scope: 'HEADER', level: 3, noteId: 'note:d' },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: '배포',
      scope: 'HEADER',
      level: 2,
      memberNodeIds: ['h2:a', 'h2:b', 'h2:c'],
    },
  ]);
});

test('uses a contained title as a keyword even without a word boundary', () => {
  const groups = buildTitleKeywordGroups([
    { nodeId: 'h:a', title: '백엔드', scope: 'HEADER', level: 2, noteId: 'note:a' },
    { nodeId: 'h:b', title: '백엔드개발', scope: 'HEADER', level: 2, noteId: 'note:b' },
    { nodeId: 'h:c', title: '백엔드서버', scope: 'HEADER', level: 2, noteId: 'note:c' },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: '백엔드',
      scope: 'HEADER',
      level: 2,
      memberNodeIds: ['h:a', 'h:b', 'h:c'],
    },
  ]);
});

test('uses one exact-title class instead of duplicate token classes for the same members', () => {
  const groups = buildTitleKeywordGroups([
    { nodeId: 'h:a', title: '릴리스 계획', scope: 'HEADER', level: 2, noteId: 'note:a' },
    { nodeId: 'h:b', title: '릴리스 계획', scope: 'HEADER', level: 2, noteId: 'note:b' },
    { nodeId: 'h:c', title: '릴리스 계획', scope: 'HEADER', level: 2, noteId: 'note:c' },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: '릴리스 계획',
      scope: 'HEADER',
      level: 2,
      memberNodeIds: ['h:a', 'h:b', 'h:c'],
    },
  ]);
});

test('does not derive a keyword from a partial overlap inside different compound words', () => {
  const groups = buildTitleKeywordGroups([
    {
      nodeId: 'h:a',
      title: '백엔드개발 계획',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:a',
    },
    {
      nodeId: 'h:b',
      title: '백엔드설계 결과',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:b',
    },
  ]);
  assert.deepEqual(groups, []);
});

test('preserves distinct shared tokens even when they currently have the same members', () => {
  const groups = buildTitleKeywordGroups([
    {
      nodeId: 'h:a',
      title: 'API Gateway 설계',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:a',
    },
    {
      nodeId: 'h:b',
      title: 'API Gateway 구현',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:b',
    },
    {
      nodeId: 'h:c',
      title: 'API Gateway 점검',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:c',
    },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: 'api',
      scope: 'HEADER',
      level: 2,
      memberNodeIds: ['h:a', 'h:b', 'h:c'],
    },
    {
      keyword: 'gateway',
      scope: 'HEADER',
      level: 2,
      memberNodeIds: ['h:a', 'h:b', 'h:c'],
    },
  ]);
});

test('adds cards to classes inherited from matching child header occurrences', () => {
  const groups = buildTitleKeywordGroups([
    {
      nodeId: 'header:a',
      occurrenceId: 'occurrence:a',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:a',
    },
    {
      nodeId: 'card:a',
      occurrenceId: 'occurrence:a',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:a',
    },
    {
      nodeId: 'header:b',
      occurrenceId: 'occurrence:b',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:b',
    },
    {
      nodeId: 'card:b',
      occurrenceId: 'occurrence:b',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:b',
    },
    {
      nodeId: 'header:c',
      occurrenceId: 'occurrence:c',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:c',
    },
    {
      nodeId: 'card:c',
      occurrenceId: 'occurrence:c',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:c',
    },
  ]);
  assert.deepEqual(groups, [
    {
      keyword: '백엔드',
      scope: 'HEADER',
      level: 4,
      memberNodeIds: ['card:a', 'card:b', 'card:c', 'header:a', 'header:b', 'header:c'],
    },
  ]);
});

test('does not create a class from one header occurrence inherited by its card', () => {
  const groups = buildTitleKeywordGroups([
    {
      nodeId: 'header:a',
      occurrenceId: 'occurrence:a',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:a',
    },
    {
      nodeId: 'card:a',
      occurrenceId: 'occurrence:a',
      title: '백엔드',
      scope: 'HEADER',
      level: 4,
      noteId: 'note:a',
    },
  ]);
  assert.deepEqual(groups, []);
});

test('does not create a heading title class from instances in less than three notes', () => {
  const groups = buildTitleKeywordGroups([
    {
      nodeId: 'header:a',
      title: 'API 설계',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:a',
    },
    {
      nodeId: 'header:b',
      title: 'API 구현',
      scope: 'HEADER',
      level: 2,
      noteId: 'note:b',
    },
  ]);
  assert.deepEqual(groups, []);
});

test('does not create a note title class when instances are less than three', () => {
  const groups = buildTitleKeywordGroups([
    { nodeId: 'note:a', title: 'API 설계', scope: 'NOTE' },
    { nodeId: 'note:b', title: 'API 구현', scope: 'NOTE' },
  ]);
  assert.deepEqual(groups, []);
});

test('groups title keywords across note-title, card-type and heading distinctions', () => {
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

test('rejects numeric-only keywords from specialized, generic and card-type classes', () => {
  assert.equal(isNumericOnlyKeyword('２０２６-09'), true);
  assert.equal(isNumericOnlyKeyword('2026 계획'), false);
  assert.deepEqual(
    buildTitleKeywordGroups([
      { nodeId: 'note:a', title: '2026 계획', scope: 'NOTE' },
      { nodeId: 'note:b', title: '2026 결과', scope: 'NOTE' },
    ]),
    []
  );
  assert.deepEqual(
    buildGenericTitleKeywordGroups([
      { nodeId: 'note:a', title: '2026 계획', noteId: 'note:a' },
      { nodeId: 'note:b', title: '2026 결과', noteId: 'note:b' },
    ]),
    []
  );
  assert.deepEqual(
    buildCardTypeGroups([
      { nodeId: 'card:a', parentTitle: '2026' },
      { nodeId: 'card:b', parentTitle: '２０２６' },
    ]),
    []
  );
});

test('uses a same-keyword specialized class instead of duplicate generic memberships', () => {
  const assignment = assignGenericTitleKeywordGroup(
    { keyword: 'api', memberNodeIds: ['header:c', 'note:a', 'note:b'] },
    [
      {
        classId: 'class:note-title:api',
        keyword: 'api',
        memberNodeIds: ['note:a', 'note:b'],
      },
      {
        classId: 'class:unrelated',
        keyword: 'release',
        memberNodeIds: ['header:c'],
      },
    ]
  );
  assert.deepEqual(assignment, {
    subclassIds: ['class:note-title:api'],
    directMemberNodeIds: ['header:c'],
  });
});

test('groups cards directly under a card-type class for their nearest parent title', () => {
  const groups = buildCardTypeGroups([
    { nodeId: 'card:a', parentTitle: '백엔드' },
    { nodeId: 'card:b', parentTitle: ' 백엔드 ' },
    { nodeId: 'card:c', parentTitle: '프론트엔드' },
  ]);
  assert.deepEqual(groups, [
    {
      normalizedTitle: '백엔드',
      title: '백엔드',
      memberNodeIds: ['card:a', 'card:b'],
    },
    {
      normalizedTitle: '프론트엔드',
      title: '프론트엔드',
      memberNodeIds: ['card:c'],
    },
  ]);
});

test('selects only the closest ancestor as a card parent header', () => {
  const root = { path: 'root', title: '제품', level: 1 };
  const parent = { path: 'root,parent', title: '백엔드', level: 2 };
  const sibling = { path: 'other', title: '프론트엔드', level: 2 };
  const card = { path: 'root,parent,card', title: 'API 구현', level: 3 };
  assert.equal(findNearestParentHeader([root, parent, sibling], card), parent);
});
