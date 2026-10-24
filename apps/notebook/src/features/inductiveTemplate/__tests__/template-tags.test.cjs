const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');
const { templateTagName, templatesForNote } = loadTs('templateTags.ts');
const template = (name, sourceTitles) => ({
  name,
  sourceTitles,
  markdown: '## Vertices\n\n{{Vertices}}',
});

test('tag names omit generated folder prefixes while preserving headings and duplicate numbers', () => {
  assert.equal(
    templateTagName({ name: '표본집 · 형태 · 세부 / 결과 (2)', folderName: '표본집' }),
    '형태 · 세부 / 결과 (2)'
  );
  assert.equal(
    templateTagName({ name: '팀 · 표본집 · 형태 / 결과', folderName: '팀 · 표본집' }),
    '형태 / 결과'
  );
  assert.equal(templateTagName({ name: '표본집 · 형태' }), '표본집 · 형태');
});

test('missing notes receive templates from their immediate source folder only', () => {
  const meeting = template('Shapes', ['Samples/Shapes/One', 'Samples/Shapes/Two']);
  const actions = template('Edges', ['Samples/Shapes/Three', 'Archive/Other']);
  const nested = template('Nested', ['Samples/Shapes/Archive/One', 'Samples/Shapes/Archive/Two']);
  const prefix = template('Prefix', ['Samples/Shapes-old/One', 'Samples/Shapes-old/Two']);
  const templates = [meeting, actions, nested, prefix];
  assert.deepEqual(templatesForNote(templates, 'Samples/Shapes/New', false), [meeting, actions]);
  assert.deepEqual(templatesForNote(templates, 'Samples/Other/New', false), []);
  assert.deepEqual(templatesForNote(templates, 'Samples/New', false), []);
  assert.deepEqual(templatesForNote(templates, 'New', false), []);
});

test('existing and loading notes never receive folder suggestions instead of actual membership', () => {
  const meeting = template('Shapes', ['Shapes/One', 'Shapes/Two']);
  for (const noteExists of [true, undefined]) {
    assert.deepEqual(templatesForNote([meeting], 'Shapes/New', noteExists), []);
    assert.deepEqual(templatesForNote([meeting], 'Shapes/One', noteExists), [meeting]);
  }
  assert.deepEqual(templatesForNote([meeting], '', false), []);
});

test('folder suggestions use the same Unicode and notebook-root normalization as source groups', () => {
  const meeting = template('표본집', ['노트북/팀/표본집/첫째', '팀/표본집/둘째']);
  const roots = ['노트북'.normalize('NFD'), 'Local notebook'];
  assert.deepEqual(
    templatesForNote([meeting], 'Local notebook/팀/표본집/새 문서'.normalize('NFD'), false, roots),
    [meeting]
  );
  assert.deepEqual(templatesForNote([meeting], '팀/표본집/첫째', true, roots), []);
  assert.deepEqual(
    templatesForNote([meeting], '노트북/팀/표본집/첫째'.normalize('NFD'), true, roots),
    [meeting]
  );
  const rootNotes = template('Root', ['노트북/One', '노트북/Two']);
  assert.deepEqual(templatesForNote([rootNotes], '노트북/New', false, roots), []);
});
