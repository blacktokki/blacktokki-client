const assert = require('node:assert/strict');
const { test } = require('node:test');
const MarkdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const { fillNoteTemplate } = loadTs('template.ts');
const render = new MarkdownIt();

test('preview reflects partial edits and clearing fields without changing the template', () => {
  const markdown = '# {{title}}\n\nDate: {{Date}}\n\n{{Agenda}}';
  assert.equal(
    fillNoteTemplate(markdown, { Date: '2026-10-11', Agenda: '' }),
    '# {{title}}\n\nDate: 2026-10-11\n\n{{Agenda}}'
  );
  assert.match(
    render.render(fillNoteTemplate(markdown, { Agenda: 'Review release' }, 'Meetings/Weekly')),
    /<h1>Weekly<\/h1>[\s\S]*Review release/
  );
  assert.equal(fillNoteTemplate(markdown, { Date: '', Agenda: '' }, null), markdown);
});

test('resolved title uses only the literal note name and never substitutes twice', () => {
  const markdown = '# {{title}}\n\n{{Agenda}}';
  const html = render.render(
    fillNoteTemplate(markdown, { Agenda: '{{title}}', title: 'ignored' }, 'Team/[Java]_intro')
  );
  assert.match(html, /<h1>\[Java\]_intro<\/h1>/);
  assert.match(html, /<p>\{\{title\}\}<\/p>/);
  assert.doesNotMatch(html, /Team|ignored|<em>/);
});
