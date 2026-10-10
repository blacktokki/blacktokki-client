const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTs = require('./loadTs.cjs');
const { groupNoteTitles, groupNotePaths, filterTitleTree } = loadTs('titleGrouping.ts');
const note = (title) => ({ title, description: '<p>original ' + title + '</p>' });
const patterns = (tree) => [
  ...tree.groups.map((group) => group.pattern),
  ...tree.folders.flatMap(patterns),
];
const leaves = (tree) => [
  ...tree.groups.flatMap((group) => group.notes),
  ...tree.folders.flatMap(leaves),
];

test('note browsing retains hierarchy and individual names without similarity groups', () => {
  const notes = [note('Teams/A/Meeting 1'), note('Teams/A/Meeting 2'), note('Teams/A')];
  const tree = groupNotePaths(notes);
  const team = tree.folders[0];
  assert.equal(tree.count, 3);
  assert.deepEqual(
    team.folders[0].groups.map((group) => group.pattern),
    ['Meeting 1', 'Meeting 2']
  );
  assert.ok(team.folders[0].groups.every((group) => group.notes.length === 1));
  assert.equal(team.groups[0].notes[0].title, 'Teams/A');
  const filtered = filterTitleTree(tree, ['Teams/A/Meeting 2']);
  assert.equal(filtered.folders[0].folders[0].path, 'Teams/A');
  assert.deepEqual(patterns(filtered), ['Meeting 2']);
});

test('groups by exact title hierarchy before comparing sibling names', () => {
  const notes = [
    note('Teams/A/2026-10-07 Weekly meeting'),
    note('Teams/A/2026-09-29 Weekly meeting'),
    note('Teams/B/2026-10-07 Weekly meeting'),
    note('Teams/B/2026-09-29 Weekly meeting'),
    note('Teams/A'),
    note('Root note'),
  ];
  const tree = groupNoteTitles(notes);
  assert.equal(tree.count, 6);
  const teams = tree.folders[0];
  assert.equal(teams.path, 'Teams');
  assert.deepEqual(
    teams.folders.map((folder) => folder.name),
    ['A', 'B']
  );
  for (const folder of teams.folders) {
    assert.equal(folder.groups.length, 1);
    assert.equal(folder.groups[0].pattern, '{{ Date }} Weekly meeting');
    assert.equal(folder.groups[0].notes.length, 2);
    assert.ok(folder.groups[0].notes.every((item) => item.title.startsWith(folder.path + '/')));
  }
  assert.equal(teams.groups[0].notes[0].title, 'Teams/A');
  assert.ok(tree.groups.some((group) => group.notes[0].title === 'Root note'));
  assert.equal(new Set(leaves(tree).map((item) => item.title)).size, notes.length);
});

test('notebook root names are excluded from groups while original source paths remain intact', () => {
  const sources = [
    note('그룹웨어1팀wiki/팀 회의/주간/첫째'),
    note('그룹웨어1팀wiki/팀 회의/둘째'),
    note('그룹웨어1팀wiki/개별 노트'),
    note('팀 회의/그룹웨어1팀wiki/셋째'),
  ];
  const tree = groupNotePaths(sources, ['그룹웨어1팀wiki'.normalize('NFD')]);
  assert.equal(tree.count, 4);
  assert.deepEqual(
    tree.folders.map((folder) => folder.name),
    ['팀 회의']
  );
  assert.equal(tree.folders[0].count, 3);
  assert.ok(tree.folders[0].folders.some((folder) => folder.name === '그룹웨어1팀wiki'));
  assert.deepEqual(
    new Set(leaves(tree).map((note) => note.title)),
    new Set(sources.map((note) => note.title))
  );
  assert.equal(tree.groups[0].notes[0].title, '그룹웨어1팀wiki/개별 노트');
});

test('full dates become named placeholders rather than partial shared year fragments', () => {
  const source = [
    note('팀 회의록/2026-10-07 팀 주간 회의'),
    note('팀 회의록/2026-09-29 팀 주간 회의'),
    note('팀 회의록/2025-12-31 팀 주간 회의'),
  ];
  const tree = groupNoteTitles(source, { date: '날짜', number: '번호', keyword: '키워드' });
  const group = tree.folders[0].groups[0];
  assert.equal(group.pattern, '{{ 날짜 }} 팀 주간 회의');
  assert.deepEqual(group.notes, source);
  assert.strictEqual(group.notes[0], source[0]);
  assert.equal(tree.folders[0].groups.length, 1);
});

test('retains common name parts and labels changing words and numbers separately', () => {
  const tree = groupNoteTitles(
    [note('Reports/보고서 고객A 버전1'), note('Reports/보고서 고객B 버전2')],
    { date: '날짜', number: '번호', keyword: '키워드' }
  );
  assert.deepEqual(patterns(tree), ['보고서 고객{{ 키워드 }} 버전{{ 번호 }}']);
  const keywordTree = groupNoteTitles([note('작업 알파 결과'), note('작업 베타 결과')]);
  assert.deepEqual(patterns(keywordTree), ['작업 {{ Keyword }} 결과']);
});

test('disambiguates multiple placeholders of the same kind and never displays anonymous braces', () => {
  const tree = groupNoteTitles([note('Test/버전1 - 항목10'), note('Test/버전2 - 항목20')]);
  assert.deepEqual(patterns(tree), ['버전{{ Number }} - 항목{{ Number 2 }}']);
  assert.doesNotMatch(patterns(tree)[0], /(?<!\{)\{\}(?!\})/);
});

test('unrelated sibling titles stay separate, while numeric-only dates can share a pattern', () => {
  const tree = groupNoteTitles([note('회의'), note('설계'), note('인수인계')]);
  assert.equal(tree.groups.length, 3);
  assert.ok(tree.groups.every((group) => group.notes.length === 1));
  assert.deepEqual(
    patterns(groupNoteTitles([note('Dates/2026-01-01'), note('Dates/2026-02-02')])),
    ['{{ Date }}']
  );
});

test('title patterns are stable across query order, normalize duplicates and preserve Unicode', () => {
  const notes = [note('독서/📘 리뷰1'), note('독서/📘 리뷰2')];
  const tree = groupNoteTitles(notes);
  assert.deepEqual(patterns(tree), ['📘 리뷰{{ Number }}']);
  assert.deepEqual(patterns(groupNoteTitles([...notes].reverse())), patterns(tree));
  const duplicates = groupNoteTitles([note('독서/한글'), note('독서/한글'.normalize('NFD'))]);
  assert.equal(duplicates.count, 1);
});

test('search retains hierarchy and the full-group pattern while narrowing leaves', () => {
  const source = [
    note('Team/Archive/Meeting 1'),
    note('Team/Archive/Meeting 2'),
    note('Other/Design'),
  ];
  const tree = groupNoteTitles(source);
  const before = JSON.stringify(tree);
  const filtered = filterTitleTree(tree, ['Team/Archive/Meeting 2']);
  assert.equal(filtered.count, 1);
  assert.equal(filtered.folders.length, 1);
  assert.equal(filtered.folders[0].folders[0].path, 'Team/Archive');
  assert.deepEqual(patterns(filtered), ['Meeting {{ Number }}']);
  assert.deepEqual(leaves(filtered), [source[1]]);
  assert.equal(JSON.stringify(tree), before);
  assert.equal(filterTitleTree(tree, []).count, 0);
});
