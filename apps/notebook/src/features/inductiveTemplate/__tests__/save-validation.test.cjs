const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const loadTs = require('./loadTs.cjs');
const template = loadTs('template.ts');
const { titleFieldIssues, titleFromTemplate } = loadTs('titleTemplates.ts', {
  './template': template,
  './titleGrouping': loadTs('titleGrouping.ts'),
});
const ko = require('../../../lang/ko.json');

test('every blocked note path has a translated, specific explanation consistent with saving', () => {
  const cases = [
    ['', 'Enter a note title'],
    ['Samples/' + 'N'.repeat(240), '240 characters'],
    ['Samples/Bad?Name', 'unsupported characters'],
    ['Samples//New', 'empty folder'],
    [' Samples/New', 'spaces'],
    ['Samples/../New', '. or ..'],
    ['Samples/New.', 'end with a period'],
    ['Samples/CON.md', 'reserved'],
  ];
  for (const [title, detail] of cases) {
    const message = template.noteTitleIssue(title);
    assert.ok(message.includes(detail), title + ': ' + message);
    assert.equal(template.validNoteTitle(title), false);
    assert.ok(ko[message], 'Missing Korean translation: ' + message);
  }
  for (const title of ['Samples/새 노트', '.NET/Notes', 'Samples/Name (2)', 'N'.repeat(240)]) {
    assert.equal(template.noteTitleIssue(title), undefined);
    assert.equal(template.validNoteTitle(title), true);
  }
});

test('required title fields identify missing and invalid inputs without rejecting valid embedded name fragments', () => {
  const title = {
    id: 'title',
    path: 'Samples',
    pattern: 'Samples/ShapeSet {{Date}}-{{Number}} draft',
    variables: ['Date', 'Number'],
    sourceTitles: [],
  };
  assert.deepEqual(titleFieldIssues(title, { Date: ' ' }), {
    missing: ['Date', 'Number'],
    invalid: [],
  });
  for (const value of ['../Other', 'A?B', '{{Missing}}']) {
    assert.deepEqual(titleFieldIssues(title, { Date: '2026-10-17', Number: value }), {
      missing: [],
      invalid: ['Number'],
    });
    assert.equal(titleFromTemplate(title, { Date: '2026-10-17', Number: value }), null);
  }
  assert.deepEqual(titleFieldIssues(title, Object.create({ Date: '2026-10-17', Number: '2' })), {
    missing: ['Date', 'Number'],
    invalid: [],
  });
  assert.equal(
    titleFromTemplate(title, { Date: '2026-10-17', Number: 'CON.' }),
    'Samples/ShapeSet 2026-10-17-CON. draft'
  );
});

test('literal UI messages, dynamic tab labels and filename validation messages have Korean translations', () => {
  const keys = new Set(['Content template', 'Content preview']);
  function scan(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      if (item.isDirectory() && item.name !== '__tests__') scan(filename);
      else if (/\.tsx?$/.test(filename)) {
        const source = ts.createSourceFile(
          filename,
          readFileSync(filename, 'utf8'),
          ts.ScriptTarget.Latest,
          true
        );
        function visit(node) {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'lang' &&
            node.arguments[0] &&
            ts.isStringLiteralLike(node.arguments[0])
          )
            keys.add(node.arguments[0].text);
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  scan(path.resolve(__dirname, '..'));
  for (const key of keys) assert.ok(ko[key], 'Missing Korean translation: ' + key);
});
