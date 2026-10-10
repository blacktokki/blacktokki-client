const assert = require('node:assert/strict');
const { test } = require('node:test');
const markdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const {
  extractStructure,
  inferTemplate,
  commonBlockIds,
  toggleBlock,
  renderTemplate,
  suggestTemplateGroups,
} = loadTs('inference.ts');
const {
  templateVariables,
  fillTemplate,
  exportTemplate,
  importTemplate,
  validNoteTitle,
  templateScope,
} = loadTs('template.ts');
const note = (title, body) => ({
  title,
  description: `<h1>${title.split('/').at(-1)}</h1>${body}`,
});

test('infers headings, fields, lists and optional sections without copying source values', () => {
  const first = note(
    'Meetings/June',
    '<div class="yaml-frontmatter" data-yaml="SECRET"><h2>Private metadata</h2></div><ul><li>Date: 2026-06-01</li><li>Author: Alice</li></ul><h2>Agenda</h2><ul><li>Confidential launch</li></ul><h2>Actions</h2><ol><li>Buy equipment</li></ol>'
  );
  const second = note(
    'Meetings/July',
    '<ul><li>Date: 2026-07-01</li><li>Author: Bob</li></ul><h2>Agenda</h2><ul><li>Salary changes</li></ul><h2>Risks</h2><p>Secret risk</p><h2>Actions</h2><ol><li>Call supplier</li></ol>'
  );
  const draft = inferTemplate([first, second]);
  assert.equal(draft.blocks.find((block) => block.label === 'Agenda').sources.length, 2);
  const optional = draft.blocks.find((block) => block.label === 'Risks');
  assert.equal(optional.sources.length, 1);
  const ids = commonBlockIds(draft);
  assert.ok(!ids.includes(optional.id));
  let markdown = renderTemplate(draft, ids);
  assert.match(markdown, /- Date: \{\{Date\}\}/);
  assert.match(markdown, /1\. \{\{Items \(2\)\}\}/);
  assert.doesNotMatch(markdown, /Alice|Bob|Confidential|Salary|2026-|metadata|SECRET|Risks/);
  markdown = renderTemplate(draft, toggleBlock(draft, ids, optional.id));
  assert.ok(markdown.indexOf('## Agenda') < markdown.indexOf('## Risks'));
  assert.ok(markdown.indexOf('## Risks') < markdown.indexOf('## Actions'));
  assert.equal(new Set(templateVariables(markdown)).size, templateVariables(markdown).length);
});

test('keeps heading ancestry, disambiguates repeated labels and removes descendants together', () => {
  const body =
    '<h2>Project A</h2><h3>Details</h3><p>secret A</p><h2>Project B</h2><h3>Details</h3><p>secret B</p>';
  const draft = inferTemplate([note('one', body), note('two', body)]);
  const details = draft.blocks.filter((block) => block.label === 'Details');
  assert.equal(details.length, 2);
  assert.notEqual(details[0].id, details[1].id);
  const a = draft.blocks.find((block) => block.label === 'Project A');
  const ids = toggleBlock(draft, commonBlockIds(draft), a.id);
  const markdown = renderTemplate(draft, ids);
  assert.doesNotMatch(markdown, /Project A|secret/);
  assert.match(markdown, /## Project B\n\n\{\{Project B\}\}\n\n### Details/);
});

const tableBody = (value, extra = '') =>
  `<table><tbody><tr><th>Category</th><th>Content</th><th>Decision</th></tr><tr><td>Weekly work</td><td>${value}</td><td>Approved</td></tr><tr><td>Deployments</td><td><table><tbody><tr><th>This week</th><th>Next week</th></tr><tr><td>private issue</td><td>private release</td></tr></tbody></table></td><td>secret feedback</td></tr>${extra}</tbody></table>`;

test('infers Confluence-style tables, stable row labels and nested tables without historical cell values', () => {
  const draft = inferTemplate([
    note('one', tableBody('secret customer')),
    note(
      'two',
      tableBody('another secret', '<tr><td>Special topic</td><td>private</td><td>private</td></tr>')
    ),
  ]);
  const rows = draft.blocks.filter((block) => block.kind === 'row');
  assert.equal(rows.find((row) => row.label === 'Weekly work').sources.length, 2);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /\| Category \| Content \| Decision \|/);
  assert.match(markdown, /\| Weekly work \| \{\{Weekly work · Content\}\}/);
  assert.match(markdown, /\*\*Deployments\*\*\n\n\| This week \| Next week \|/);
  assert.doesNotMatch(
    markdown,
    /secret customer|another secret|Approved|private release|secret feedback|Special topic/
  );
  assert.equal(new markdownIt().render(markdown).match(/<table>/g).length, 2);
});

test('detects escaped raw HTML tables from the app Markdown importer while excluding code examples', () => {
  const renderer = new markdownIt();
  const content =
    '# note\n\n' +
    tableBody('private') +
    '\n\n```html\n<table><tr><th>Code</th><th>Example</th></tr></table>\n```';
  const structure = extractStructure({ title: 'note', description: renderer.render(content) });
  assert.ok(structure.some((block) => block.kind === 'table' && block.columns[0] === 'Category'));
  assert.ok(!structure.some((block) => block.label.includes('Code')));
});

test('fully emphasized td cells act as headers in imported tables without literal formatting markup', () => {
  const renderer = new markdownIt();
  const table = (value) =>
    '<table><tr><td><p><strong>Case</strong></p></td><td><span><b>Expected</b></span></td></tr>' +
    `<tr><td>${value}</td><td>Private outcome</td></tr></table>`;
  const sources = ['First', 'Second'].map((value) => ({
    title: value,
    description: renderer.render(table(value)),
  }));
  const structure = extractStructure(sources[0]);
  assert.deepEqual(structure.find((block) => block.kind === 'table').columns, ['Case', 'Expected']);
  const previous = extractStructure(sources[0], 'previous');
  assert.deepEqual(previous.find((block) => block.kind === 'table').columns, [
    'Column 1',
    'Column 2',
  ]);
  assert.ok(!structure.some((block) => /<\/?(?:strong|b|span)>/.test(block.label)));
  const draft = inferTemplate(sources);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /\| Case \| Expected \|/);
  assert.doesNotMatch(markdown, /Private outcome|First|Second/);
  const partial = extractStructure(
    note('Partial', '<table><tr><td><b>Prefix</b> value</td><td><b>Other</b></td></tr></table>')
  );
  assert.deepEqual(partial.find((block) => block.kind === 'table').columns, [
    'Column 1',
    'Column 2',
  ]);
});

test('table scopes retain common row labels and nested forms while excluding unrelated document sections', () => {
  const draft = inferTemplate(
    [
      note('One', '<h2>Plan</h2>' + tableBody('Secret one')),
      note('Two', '<h2>Review</h2>' + tableBody('Secret two')),
    ],
    ['Category', 'Content', 'Decision']
  );
  assert.ok(!draft.blocks.some((block) => block.kind === 'heading'));
  assert.equal(draft.blocks.filter((block) => block.kind === 'table').length, 2);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /\| Weekly work \|/);
  assert.match(markdown, /\*\*Deployments\*\*\n\n\| This week \| Next week \|/);
  assert.doesNotMatch(markdown, /Plan|Review|Secret one|Secret two/);
  assert.equal(new markdownIt().render(markdown).match(/<table>/g).length, 2);
});

test('keeps changing standalone dates between repeated scrum tables as separate ordered placeholders', () => {
  const table =
    '<table><tr><th>Name</th><th>Work</th></tr><tr><td>Work item</td><td>private task</td></tr></table>';
  const body = (first, second) =>
    `<p><strong>${first}</strong></p>${table}<p><strong>${second}</strong></p>${table}`;
  const draft = inferTemplate([
    note('Scrum/Week 1', body('05-25 월', '05-26 화')),
    note('Scrum/Week 2', body('06-01 월', '06-02 화')),
  ]);
  const dates = draft.blocks.filter((block) => block.kind === 'date');
  assert.equal(dates.length, 2);
  assert.ok(dates.every((block) => block.sources.length === 2 && block.label === 'Date'));
  const markdown = renderTemplate(draft, commonBlockIds(draft), '날짜');
  assert.match(markdown, /\*\*\{\{ 날짜 \}\}\*\*/);
  assert.match(markdown, /\*\*\{\{ 날짜 \(2\) \}\}\*\*/);
  assert.doesNotMatch(markdown, /05-25|05-26|06-01|06-02|private task/);
  const roundTrip = extractStructure({
    title: '{{title}}',
    description: new markdownIt().render(markdown),
  });
  assert.deepEqual(
    roundTrip.filter((block) => ['date', 'table'].includes(block.kind)).map((block) => block.kind),
    ['date', 'table', 'date', 'table']
  );
  assert.equal(new markdownIt().render(markdown).match(/<table>/g).length, 2);
});

test('date headings retain section ancestry while historical dates become placeholders', () => {
  const body = (first, second) =>
    `<h2>${first}</h2><h3>Tasks</h3><ul><li>private first</li></ul><h2>${second}</h2><h3>Tasks</h3><ul><li>private second</li></ul>`;
  const draft = inferTemplate([
    note('One', body('2026-05-25 (Mon)', '2026년 5월 26일 화요일')),
    note('Two', body('2026-06-01 (Monday)', '2026년 6월 2일 화요일')),
  ]);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /## \{\{ Date \}\}\n\n### Tasks/);
  assert.match(markdown, /## \{\{ Date \(2\) \}\}\n\n### Tasks/);
  assert.doesNotMatch(markdown, /2026|private/);
  const dates = draft.blocks.filter((block) => block.kind === 'date');
  assert.equal(dates.length, 2);
  assert.ok(dates.every((block) => block.sources.length === 2));
  assert.deepEqual(
    draft.blocks.filter((block) => block.kind === 'heading').map((block) => block.parentId),
    dates.map((block) => block.id)
  );
});

test('date detection validates calendar labels and excludes prose, code and table cell values', () => {
  const structure = extractStructure(
    note(
      'Example',
      '<p>02-29 목</p><p>2024/02/29 Thursday</p><p>6월 2일 화</p>' +
        '<p>2026-02-29</p><p>02-30</p><p>13-25</p><p>Version 1.2</p><p>Release on 05-25 Monday</p>' +
        '<pre><code>2026-05-25</code></pre><p><code>2026-05-25</code></p>' +
        '<table><tr><th>Name</th><th>Date</th></tr><tr><td>Entry</td><td>2026-05-25</td></tr></table>'
    )
  );
  assert.equal(structure.filter((block) => block.kind === 'date').length, 3);
  assert.ok(
    structure.filter((block) => block.kind === 'date').every((block) => block.label === 'Date')
  );
});

test('all supported groups remain available beyond the former twelve-group cutoff', () => {
  const sources = Array.from({ length: 15 }, (_, index) => [
    note(`Category ${index}/One`, `<h2>Topic ${index}</h2><h2>Action ${index}</h2>`),
    note(`Category ${index}/Two`, `<h2>Topic ${index}</h2><h2>Action ${index}</h2>`),
  ]).flat();
  const groups = suggestTemplateGroups(sources);
  assert.equal(groups.length, 15);
  assert.equal(new Set(groups.flatMap((group) => group.notes.map((note) => note.title))).size, 30);
});

test('decodes structural entities, normalizes Korean and numbered headings, ignores executable content', () => {
  const draft = inferTemplate([
    note(
      'a',
      '<script><h2>Fake</h2></script><h2>1. 상태&nbsp;&amp;&nbsp;검토</h2><p><strong>작성자</strong>: secret</p>'
    ),
    note('b', '<h2>2. 상태 &amp; 검토</h2><p>작성자: secret2</p>'),
  ]);
  assert.equal(draft.blocks.find((block) => block.kind === 'heading').sources.length, 2);
  assert.match(renderTemplate(draft, commonBlockIds(draft)), /작성자/);
  assert.ok(!draft.blocks.some((block) => block.label === 'Fake'));
});

test('deduplicates source notes by normalized title and requires two distinct examples', () => {
  assert.throws(
    () =>
      inferTemplate([
        note('한글', '<h2>Summary</h2>'),
        note('한글'.normalize('NFD'), '<h2>Summary</h2>'),
      ]),
    /at least two/
  );
  assert.throws(() => inferTemplate([]), /at least two/);
});

test('handles unstructured prose honestly without inventing structural items', () => {
  const draft = inferTemplate([
    note('a', '<p>Long text with no structure</p>'),
    note('b', '<p>Another piece of prose</p>'),
  ]);
  assert.equal(draft.blocks.length, 0);
  assert.deepEqual(
    suggestTemplateGroups([note('a', '<p>text</p>'), note('b', '<p>other</p>')]),
    []
  );
});

test('groups by structure across arbitrary paths and document domains, tolerating optional sections', () => {
  const body = '<h2>Hypothesis</h2><p>secret</p><h2>Method</h2><p>secret</p><h2>Result</h2>';
  const notes = [
    note('Science/First', body),
    note('Archive/Second', body + '<h2>Appendix</h2>'),
    note('Other/Work', '<h2>Agenda</h2><h2>Actions</h2>'),
    note('Other/Work2', '<h2>Agenda</h2><h2>Actions</h2>'),
  ];
  const groups = suggestTemplateGroups(notes);
  assert.equal(groups.length, 2);
  assert.ok(
    groups.some(
      (group) => group.notes.map((item) => item.title).join(',') === 'Science/First,Archive/Second'
    )
  );
  assert.ok(
    suggestTemplateGroups([note('a', tableBody('one')), note('b', tableBody('two'))]).length
  );
});

test('review and rendering stay valid when examples reorder sections', () => {
  const draft = inferTemplate([
    note('a', '<h2>First</h2><h2>Second</h2>'),
    note('b', '<h2>Second</h2><h3>Extra</h3><h2>First</h2>'),
  ]);
  const second = draft.blocks.find((block) => block.label === 'Second');
  const extra = draft.blocks.find((block) => block.label === 'Extra');
  const all = draft.blocks.map((block) => block.id);
  const ids = toggleBlock(draft, all, second.id);
  assert.ok(!ids.includes(extra.id));
  assert.doesNotMatch(renderTemplate(draft, ids), /Second|Extra/);
});

test('portable templates omit provenance and bind repeated variables in one pass', () => {
  const template = {
    id: 'id',
    name: 'Meeting',
    markdown: '# {{title}}\n{{ name }} / {{name}} / {{empty}}',
    sourceTitles: ['Private/Example'],
    updatedAt: 'now',
  };
  const json = exportTemplate(template);
  assert.doesNotMatch(json, /Private|sourceTitles|updatedAt|"id"/);
  assert.deepEqual(importTemplate(json), { name: template.name, markdown: template.markdown });
  assert.equal(
    fillTemplate(template.markdown, { title: 'New', name: '{{title}}', empty: '' }),
    '# New\n{{title}} / {{title}} / {{empty}}'
  );
  assert.equal(
    fillTemplate('{{constructor}} / {{__proto__}}', {}),
    '{{constructor}} / {{__proto__}}'
  );
  assert.throws(() => importTemplate('{"version":2,"name":"n","markdown":"m"}'), /Invalid/);
  assert.throws(() => importTemplate('{"version":1,"name":{},"markdown":"m"}'), /Invalid/);
  assert.throws(() => importTemplate('{"version":1,"name":"n","markdown":""}'), /Invalid/);
});

test('validates portable paths and scopes local, online, notebooks and privacy independently', () => {
  for (const title of ['Notes/Weekly meeting', '독서/책 이름', 'Meeting'])
    assert.equal(validNoteTitle(title), true, title);
  for (const title of [
    '',
    '../outside',
    'a/../b',
    '/absolute',
    'a//b',
    'a\\b',
    'a/.',
    'CON',
    'a/NUL.md',
    'trailing.',
    ' leading',
    'a\nname',
  ])
    assert.equal(validNoteTitle(title), false, title);
  assert.equal(
    new Set([
      templateScope(true, undefined, 1, false),
      templateScope(true, undefined, 2, false),
      templateScope(true, undefined, 1, true),
      templateScope(false, 1, 1, false),
      templateScope(false, 2, 1, false),
    ]).size,
    5
  );
});
