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
    'Shapes/June',
    '<div class="yaml-frontmatter" data-yaml="SECRET"><h2>Private metadata</h2></div><ul><li>Date: 2026-06-01</li><li>Author: Alice</li></ul><h2>Vertices</h2><ul><li>Confidential launch</li></ul><h2>Edges</h2><ol><li>Buy equipment</li></ol>'
  );
  const second = note(
    'Shapes/July',
    '<ul><li>Date: 2026-07-01</li><li>Author: Bob</li></ul><h2>Vertices</h2><ul><li>Salary changes</li></ul><h2>Symmetry</h2><p>Secret risk</p><h2>Edges</h2><ol><li>Call supplier</li></ol>'
  );
  const draft = inferTemplate([first, second]);
  assert.equal(draft.blocks.find((block) => block.label === 'Vertices').sources.length, 2);
  const optional = draft.blocks.find((block) => block.label === 'Symmetry');
  assert.equal(optional.sources.length, 1);
  const ids = commonBlockIds(draft);
  assert.ok(!ids.includes(optional.id));
  let markdown = renderTemplate(draft, ids);
  assert.match(markdown, /- Date: \{\{Date\}\}/);
  assert.match(markdown, /1\. \{\{Items \(2\)\}\}/);
  assert.doesNotMatch(markdown, /Alice|Bob|Confidential|Salary|2026-|metadata|SECRET|Symmetry/);
  markdown = renderTemplate(draft, toggleBlock(draft, ids, optional.id));
  assert.ok(markdown.indexOf('## Vertices') < markdown.indexOf('## Symmetry'));
  assert.ok(markdown.indexOf('## Symmetry') < markdown.indexOf('## Edges'));
  assert.equal(new Set(templateVariables(markdown)).size, templateVariables(markdown).length);
});

test('extracts each hard-break field while excluding values, URLs, code and diagram lines', () => {
  const body = (person, state) =>
    '<p><strong>Owner:</strong> ' +
    person +
    '<br>State：' +
    state +
    '<br>https://private.example/secret</p>' +
    '<ul><li>Due: private date<br>Reviewer: secret reviewer</li></ul>' +
    '<pre><code>Code: secret<br>Ignored: secret</code></pre>' +
    '<p>sequenceDiagram<br>A-&gt;&gt;B: private message<br>Note over B: confidential</p>';
  const sources = [note('One', body('Alice', 'Done')), note('Two', body('Bob', 'Open'))];
  const fields = extractStructure(sources[0]).filter((block) => block.kind === 'field');
  assert.deepEqual(
    fields.map((field) => field.label),
    ['Owner', 'State', 'Due', 'Reviewer']
  );
  const draft = inferTemplate(sources);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /- Owner: \{\{Owner\}\}[\s\S]*- State: \{\{State\}\}/);
  assert.match(markdown, /- Due: \{\{Due\}\}[\s\S]*- Reviewer: \{\{Reviewer\}\}/);
  assert.doesNotMatch(markdown, /Alice|Bob|Done|Open|private|secret|confidential|Ignored|diagram/);
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

test('section numbering and Korean spacing variants share structure', () => {
  const sources = [
    {
      title: 'Docs/도형 조합',
      description:
        '<h1>도형 조합</h1><h2>1.모양 정의</h2><p>표본일: Secret date</p><h2>2. 색상 구성</h2><p>상태: private result</p>',
    },
    note(
      'Docs/다른 문서',
      '<h2>모양정의</h2><p>표본일: another date</p><h2>색상구성</h2><p>상태: other result</p>'
    ),
  ];
  const draft = inferTemplate(sources);
  assert.equal(draft.titleHeading.sources.length, 2);
  assert.ok(
    draft.blocks
      .filter((block) => ['heading', 'field'].includes(block.kind))
      .every((block) => block.sources.length === 2)
  );
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /^# \{\{title\}\}/);
  assert.match(markdown, /1\.모양 정의/);
  assert.doesNotMatch(markdown, /도형 조합|Secret|private|another date|other result/);
});

test('fullwidth characters and emoji differences keep distinct structures', () => {
  const draft = inferTemplate([
    note('one', '<h2>ＡＢＣ</h2><h2>❗️ 기능</h2><h2>🚀 상태</h2>'),
    note('two', '<h2>ABC</h2><h2>기능</h2><h2>🌟 상태</h2>'),
  ]);
  const headings = draft.blocks.filter((block) => block.kind === 'heading');
  assert.equal(headings.length, 6);
  assert.ok(headings.every((block) => block.sources.length === 1));
  const fullwidth = extractStructure({
    title: 'Docs/도형／조합',
    description: '<h1>도형/조합</h1><h2>２０２６년</h2>',
  });
  assert.deepEqual(
    fullwidth.map((block) => block.label),
    ['도형/조합', '２０２６년']
  );
  assert.ok(fullwidth.every((block) => block.kind === 'heading'));
});

test('decoration-only and numeric version headings keep their distinct identities', () => {
  const blocks = extractStructure({
    title: '🌟',
    description: '<h1>🚀</h1><h2>1.24.1</h2><h2>1.24.2</h2>',
  });
  assert.deepEqual(
    blocks.map((block) => block.label),
    ['🚀', '1.24.1', '1.24.2']
  );
  assert.equal(new Set(blocks.map((block) => block.id)).size, 3);
});

test('year and month sections become editable dates and reject invalid calendar periods', () => {
  const sources = [
    note('Annual one', '<h2>2025년</h2><h3>계획</h3><p><strong>2025-04</strong></p>'),
    note('Annual two', '<h2>2026년</h2><h3>계획</h3><p><strong>2026년 5월</strong></p>'),
  ];
  const draft = inferTemplate(sources);
  assert.equal(
    draft.blocks.filter((block) => block.kind === 'date' && block.sources.length === 2).length,
    2
  );
  const markdown = renderTemplate(draft, commonBlockIds(draft), '날짜');
  assert.match(markdown, /## \{\{ 날짜 \}\}/);
  assert.match(markdown, /\*\*\{\{ 날짜 \(2\) \}\}\*\*/);
  assert.doesNotMatch(markdown, /2025|2026|２０２６/);
  const invalid = extractStructure(
    note('Other', '<p>2026-13</p><p>2026년 0월</p><p>0000년</p><p>v2026.04</p>')
  );
  assert.ok(!invalid.some((block) => block.kind === 'date'));
});

const tableBody = (value, extra = '') =>
  `<table><tbody><tr><th>Category</th><th>Content</th><th>Faces</th></tr><tr><td>Weekly work</td><td>${value}</td><td>Approved</td></tr><tr><td>Geometrys</td><td><table><tbody><tr><th>This week</th><th>Next week</th></tr><tr><td>private issue</td><td>private release</td></tr></tbody></table></td><td>secret feedback</td></tr>${extra}</tbody></table>`;

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
  assert.match(markdown, /\| Category \| Content \| Faces \|/);
  assert.match(markdown, /\| Weekly work \| \{\{Weekly work · Content\}\}/);
  assert.match(markdown, /\*\*Geometrys\*\*\n\n\| This week \| Next week \|/);
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

test('table column names require th cells even when td content is emphasized', () => {
  const structure = extractStructure(
    note('One', '<table><tr><td><strong>Case</strong></td><td><b>Expected</b></td></tr></table>')
  );
  assert.deepEqual(structure.find((block) => block.kind === 'table').columns, [
    'Column 1',
    'Column 2',
  ]);
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
      '<script><h2>Fake</h2></script><h2>1. 상태&nbsp;&amp;&nbsp;검토</h2><p><strong>표본명</strong>: secret</p>'
    ),
    note('b', '<h2>2. 상태 &amp; 검토</h2><p>표본명: secret2</p>'),
  ]);
  assert.equal(draft.blocks.find((block) => block.kind === 'heading').sources.length, 2);
  assert.match(renderTemplate(draft, commonBlockIds(draft)), /표본명/);
  assert.ok(!draft.blocks.some((block) => block.label === 'Fake'));
});

test('deduplicates source notes by normalized title and requires two distinct examples', () => {
  assert.throws(
    () =>
      inferTemplate([
        note('한글', '<h2>Shape</h2>'),
        note('한글'.normalize('NFD'), '<h2>Shape</h2>'),
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
    note('Other/Work', '<h2>Vertices</h2><h2>Edges</h2>'),
    note('Other/Work2', '<h2>Vertices</h2><h2>Edges</h2>'),
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

test('consistent heading hierarchies group notes despite unrelated field and table layouts', () => {
  const sources = [
    note(
      'Plans/One',
      '<h2>Plan</h2><h3>Steps</h3><p>Owner: Alice</p><p>Deadline: tomorrow</p><table><tr><th>Task</th><th>Result</th></tr></table>'
    ),
    note(
      'Plans/Two',
      '<h2>Plan</h2><h3>Steps</h3><p>Cost: secret</p><p>Scope: secret</p><table><tr><th>Milestone</th><th>Status</th></tr></table>'
    ),
  ];
  const [group] = suggestTemplateGroups(sources);
  assert.deepEqual(
    group.notes.map((note) => note.title),
    ['Plans/One', 'Plans/Two']
  );
  const draft = inferTemplate(group.notes);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.match(markdown, /## Plan[\s\S]*### Steps/);
  assert.doesNotMatch(markdown, /Owner|Deadline|Cost|Scope|Alice|secret|Task|Milestone/);
});

test('repeated copies of one heading retain distinct slots without inventing support from a single note', () => {
  const sources = [
    note('One', '<h2>Entry</h2><p>Owner: Alice</p><h2>Entry</h2><p>Due: tomorrow</p>'),
    note('Two', '<h2>Entry</h2><p>Cost: secret</p><h2>Entry</h2><p>Scope: secret</p>'),
  ];
  const [group] = suggestTemplateGroups(sources);
  assert.equal(group.notes.length, 2);
  const draft = inferTemplate(group.notes);
  const markdown = renderTemplate(draft, commonBlockIds(draft));
  assert.equal(markdown.match(/## Entry/g).length, 2);
  assert.match(markdown, /\{\{Entry\}\}/);
  assert.match(markdown, /\{\{Entry \(2\)\}\}/);
  assert.deepEqual(suggestTemplateGroups(sources.slice(0, 1)), []);
});

test('heading matching requires two shared occurrences, respects ancestry and rejects weak chains', () => {
  const fields = (index) => `<p>Field ${index}: secret</p><p>Other ${index}: secret</p>`;
  assert.deepEqual(
    suggestTemplateGroups([
      note('One', '<h2>Attachments</h2>' + fields(1)),
      note('Two', '<h2>Attachments</h2>' + fields(2)),
    ]),
    []
  );
  assert.deepEqual(
    suggestTemplateGroups([
      note('One', '<h2>A</h2><h3>B</h3><h2>C</h2>' + fields(1)),
      note('Two', '<h2>A</h2><h2>B</h2><h3>C</h3>' + fields(2)),
    ]),
    []
  );
  const sources = [
    note('A', '<h2>First</h2><h2>Second</h2>' + fields(1)),
    note('B', '<h2>First</h2><h2>Second</h2><h2>Third</h2>' + fields(2)),
    note('C', '<h2>Second</h2><h2>Third</h2>' + fields(3)),
  ];
  const groups = suggestTemplateGroups(sources);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].notes.map((note) => note.title),
    ['A', 'B']
  );
});

test('portable templates omit provenance and bind repeated variables in one pass', () => {
  const template = {
    id: 'id',
    name: 'Shape',
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
  for (const title of ['Notes/Shape sample', '독서/책 이름', 'Shape'])
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
