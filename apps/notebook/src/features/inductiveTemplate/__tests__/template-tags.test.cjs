const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');
const { templateTagName, templatesForNote } = loadTs('templateTags.ts');
const template = (name, sourceTitles) => ({
  name,
  sourceTitles,
  markdown: '## Agenda\n\n{{Agenda}}',
});

test('tag names omit generated folder prefixes while preserving headings and duplicate numbers', () => {
  assert.equal(
    templateTagName({ name: '회의록 · 안건 · 세부 / 결과 (2)', folderName: '회의록' }),
    '안건 · 세부 / 결과 (2)'
  );
  assert.equal(
    templateTagName({ name: '팀 · 회의록 · 안건 / 결과', folderName: '팀 · 회의록' }),
    '안건 / 결과'
  );
  assert.equal(templateTagName({ name: '회의록 · 안건' }), '회의록 · 안건');
});

test('missing notes receive templates from their immediate source folder only', () => {
  const meeting = template('Meetings', ['Teams/Meetings/One', 'Teams/Meetings/Two']);
  const actions = template('Actions', ['Teams/Meetings/Three', 'Archive/Other']);
  const nested = template('Nested', ['Teams/Meetings/Archive/One', 'Teams/Meetings/Archive/Two']);
  const prefix = template('Prefix', ['Teams/Meetings-old/One', 'Teams/Meetings-old/Two']);
  const templates = [meeting, actions, nested, prefix];
  assert.deepEqual(templatesForNote(templates, 'Teams/Meetings/New', false), [meeting, actions]);
  assert.deepEqual(templatesForNote(templates, 'Teams/Other/New', false), []);
  assert.deepEqual(templatesForNote(templates, 'Teams/New', false), []);
  assert.deepEqual(templatesForNote(templates, 'New', false), []);
});

test('existing and loading notes never receive folder suggestions instead of actual membership', () => {
  const meeting = template('Meetings', ['Meetings/One', 'Meetings/Two']);
  for (const noteExists of [true, undefined]) {
    assert.deepEqual(templatesForNote([meeting], 'Meetings/New', noteExists), []);
    assert.deepEqual(templatesForNote([meeting], 'Meetings/One', noteExists), [meeting]);
  }
  assert.deepEqual(templatesForNote([meeting], '', false), []);
});

test('folder suggestions use the same Unicode and notebook-root normalization as source groups', () => {
  const meeting = template('회의록', ['노트북/팀/회의록/첫째', '팀/회의록/둘째']);
  const roots = ['노트북'.normalize('NFD'), 'Local notebook'];
  assert.deepEqual(
    templatesForNote([meeting], 'Local notebook/팀/회의록/새 문서'.normalize('NFD'), false, roots),
    [meeting]
  );
  assert.deepEqual(templatesForNote([meeting], '팀/회의록/첫째', true, roots), []);
  assert.deepEqual(
    templatesForNote([meeting], '노트북/팀/회의록/첫째'.normalize('NFD'), true, roots),
    [meeting]
  );
  const rootNotes = template('Root', ['노트북/One', '노트북/Two']);
  assert.deepEqual(templatesForNote([rootNotes], '노트북/New', false, roots), []);
});
