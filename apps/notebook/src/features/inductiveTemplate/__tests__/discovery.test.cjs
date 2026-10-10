const assert = require('node:assert/strict');
const { test } = require('node:test');
const markdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const inference = loadTs('inference.ts');
const titleGrouping = loadTs('titleGrouping.ts');
const discoveryDependencies = { './inference': inference, './titleGrouping': titleGrouping };
const { discoverTemplates, templateNotes } = loadTs('discovery.ts', discoveryDependencies);
const { fillTemplate } = loadTs('template.ts');
const note = (title, body) => ({
  title,
  description: '<h1>' + title.split('/').at(-1) + '</h1>' + body,
});

test('similar-note discovery produces usable templates directly across folders and domains', () => {
  const sources = [
    note(
      'Meetings/One',
      '<p>Date: 2026-01-01</p><h2>Agenda</h2><p>Secret budget</p><h2>Actions</h2><p>Call Alice</p>'
    ),
    note(
      'Archive/Two',
      '<p>Date: 2026-02-02</p><h2>Agenda</h2><p>Private launch</p><h2>Actions</h2><p>Call Bob</p>'
    ),
    note(
      'Science/One',
      '<h2>Hypothesis</h2><p>Secret theory</p><h2>Result</h2><p>Private finding</p>'
    ),
    note(
      'Research/Two',
      '<h2>Hypothesis</h2><p>Other theory</p><h2>Result</h2><p>Other finding</p>'
    ),
  ];
  const snapshot = JSON.stringify(sources);
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 2);
  const meeting = templates.find((template) => template.name === 'Agenda');
  assert.deepEqual(meeting.sourceTitles, ['Meetings/One', 'Archive/Two']);
  assert.doesNotMatch(meeting.markdown, /2026-|Secret|Private|Alice|Bob/);
  const renderer = new markdownIt();
  const preview = renderer.render(meeting.markdown);
  assert.match(preview, /<h2>Agenda<\/h2>/);
  assert.match(preview, /\{\{Agenda\}\}/);
  const newNote = renderer.render(
    fillTemplate(meeting.markdown, {
      title: 'New meeting',
      Date: '2026-10-10',
      Agenda: 'Plan the release',
      Actions: 'Review results',
    })
  );
  assert.match(newNote, /<h1>New meeting<\/h1>/);
  assert.match(newNote, /Plan the release/);
  assert.doesNotMatch(newNote, /\{\{/);
  assert.equal(JSON.stringify(sources), snapshot);
});

test('supported top-level groups split together and use the original structural name', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = [
    note('Teams/Weekly/Meeting 1', body),
    note('Archive/Meeting 1', body),
    note('Teams/Monthly/Meeting 2', body),
    note('Archive/Meeting 2', body),
    note('Root meeting', body),
    note('Other root meeting', body),
  ];
  const before = JSON.stringify(sources);
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 3);
  for (const template of templates)
    assert.ok(titleGrouping.groupNotePaths(templateNotes(template, sources)).folders.length <= 1);
  assert.deepEqual(
    templates.find((template) => template.sourceTitles[0].startsWith('Teams/')).sourceTitles,
    ['Teams/Weekly/Meeting 1', 'Teams/Monthly/Meeting 2']
  );
  assert.deepEqual(
    templates.find((template) => template.sourceTitles[0].startsWith('Archive/')).sourceTitles,
    ['Archive/Meeting 1', 'Archive/Meeting 2']
  );
  assert.deepEqual(
    templates.find((template) => template.sourceTitles[0] === 'Root meeting').sourceTitles,
    ['Root meeting', 'Other root meeting']
  );
  assert.deepEqual(
    new Set(templates.map((template) => template.name)),
    new Set(['Agenda', 'Agenda (2)', 'Agenda (3)'])
  );
  assert.equal(new Set(templates.map((template) => template.markdown)).size, 1);
  const titles = templates.flatMap((template) => template.sourceTitles);
  assert.equal(titles.length, sources.length);
  assert.deepEqual(new Set(titles), new Set(sources.map((source) => source.title)));
  assert.equal(JSON.stringify(sources), before);
});

test('a single-note top-level group keeps the entire original template together', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = [note('Teams/One', body), note('Teams/Two', body), note('Archive/One', body)];
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Agenda');
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((source) => source.title)
  );
  assert.equal(
    titleGrouping.groupNotePaths(templateNotes(templates[0], sources)).folders.length,
    2
  );
});

test('splitting cannot leave a single loose note behind as its own template', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = ['Teams', 'Archive'].flatMap((folder) =>
    [1, 2].map((index) => note(`${folder}/Meeting ${index}`, body))
  );
  sources.push(note('Loose note', body));
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Agenda');
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((source) => source.title)
  );
});

test('one top-level folder names the template and retains loose sources without splitting', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = [
    note('팀 회의/주간/첫째', body),
    note('팀 회의/월간/둘째', body),
    note('회의', body),
  ];
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, '팀 회의 · Agenda');
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((source) => source.title)
  );
});

test('templates without top-level folders retain their previous names and source sets', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = [note('One', body), note('Two', body)];
  const [template] = discoverTemplates(sources);
  assert.equal(template.name, 'Agenda');
  assert.deepEqual(template.sourceTitles, ['One', 'Two']);
  assert.equal(titleGrouping.groupNotePaths(templateNotes(template, sources)).folders.length, 0);
});

test('notebook containers do not count as top-level groups for naming or splitting', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = ['Teams', 'Archive'].flatMap((folder) =>
    [1, 2].map((index) => note(`Notebook/${folder}/Meeting ${index}`, body))
  );
  const templates = discoverTemplates(sources, 'Date', ['Notebook']);
  assert.equal(templates.length, 2);
  assert.deepEqual(
    new Set(templates.map((template) => template.name)),
    new Set(['Agenda', 'Agenda (2)'])
  );
  for (const template of templates) {
    assert.ok(template.sourceTitles.every((title) => title.startsWith('Notebook/')));
    assert.equal(
      titleGrouping.groupNotePaths(templateNotes(template, sources), ['Notebook']).folders.length,
      1
    );
  }
  const [single] = discoverTemplates(sources.slice(0, 2), 'Date', ['Notebook']);
  assert.equal(single.name, 'Teams · Agenda');
});

test('common table forms produce templates when their surrounding document structures differ', () => {
  const table = (value) =>
    '<table><tr><th>Priority</th><th>Case</th><th>Expected</th></tr>' +
    `<tr><td>${value}</td><td>Confidential case</td><td>Secret outcome</td></tr></table>`;
  const sources = [
    note('Tests/One', '<h2>Project plan</h2><h3>Scope</h3>' + table('High') + '<h3>Schedule</h3>'),
    note(
      'Tests/Two',
      '<h2>Release review</h2><h3>Acceptance</h3>' + table('Medium') + '<h3>Risks</h3>'
    ),
  ];
  const before = JSON.stringify(sources);
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Tests · Priority / Case / Expected');
  assert.deepEqual(discoverTemplates(sources, 'Date', [], 'previous'), []);
  assert.deepEqual(discoverTemplates(sources, 'Date', [], 'current'), templates);
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((note) => note.title)
  );
  assert.match(templates[0].markdown, /\| Priority \| Case \| Expected \|/);
  assert.doesNotMatch(
    templates[0].markdown,
    /Project plan|Release review|Scope|Acceptance|Risks|High|Medium|Confidential|Secret/
  );
  assert.equal(JSON.stringify(sources), before);
  assert.match(templateNotes(templates[0], sources)[0].description, /Project plan/);
  const filled = fillTemplate(templates[0].markdown, {
    title: 'New case',
    Priority: 'Low',
    Case: 'Login',
    Expected: 'Success',
  });
  assert.match(new markdownIt().render(filled), /<td>Login<\/td>/);
});

test('both extraction modes retain dates, notebook-root exclusion and minimum split group sizes', () => {
  const body = (date) => `<p><strong>${date}</strong></p><h2>Agenda</h2><h2>Actions</h2>`;
  const sources = [
    note('Notebook/Teams/One', body('05-25 월')),
    note('Notebook/Teams/Two', body('06-01 월')),
    note('Notebook/Archive/One', body('06-08 월')),
  ];
  const before = JSON.stringify(sources);
  const current = discoverTemplates(sources, '날짜', ['Notebook'], 'current');
  const previous = discoverTemplates(sources, '날짜', ['Notebook'], 'previous');
  assert.deepEqual(previous, current);
  assert.equal(current.length, 1);
  assert.equal(current[0].name, 'Agenda');
  assert.match(current[0].markdown, /\*\*\{\{ 날짜 \}\}\*\*/);
  assert.doesNotMatch(current[0].markdown, /05-25|06-01|06-08/);
  assert.deepEqual(
    current[0].sourceTitles,
    sources.map((note) => note.title)
  );
  const expanded = [...sources, note('Notebook/Archive/Two', body('06-15 월'))];
  for (const mode of ['current', 'previous']) {
    const templates = discoverTemplates(expanded, '날짜', ['Notebook'], mode);
    assert.deepEqual(
      templates.map((template) => template.name),
      ['Agenda', 'Agenda (2)']
    );
    assert.ok(templates.every((template) => template.sourceTitles.length === 2));
    const [single] = discoverTemplates(sources.slice(0, 2), '날짜', ['Notebook'], mode);
    assert.equal(single.name, 'Teams · Agenda');
  }
  assert.equal(JSON.stringify(sources), before);
});

test('repeated tables in one note or unnamed data tables do not support fallback templates', () => {
  const named =
    '<table><tr><th>Case</th><th>Result</th></tr><tr><td>A</td><td>Secret</td></tr></table>';
  assert.deepEqual(discoverTemplates([note('Only', named + named + named)]), []);
  const unnamed = '<table><tr><td>Value</td><td>Private</td></tr></table>';
  const sources = [
    note('One', '<h2>Unique plan</h2><h2>Schedule</h2>' + unnamed),
    note('Two', '<h2>Other review</h2><h2>Risks</h2>' + unnamed),
  ];
  assert.deepEqual(discoverTemplates(sources), []);
});

test('title templates and note previews use only the separated top-level source group', () => {
  const { discoverTitleTemplates } = loadTs('titleTemplates.ts', {
    './template': loadTs('template.ts'),
    './titleGrouping': titleGrouping,
  });
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  const sources = ['Teams', 'Archive'].flatMap((folder) =>
    [1, 2].map((index) => note(`${folder}/Weekly meeting ${index}`, body))
  );
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 2);
  assert.equal(templates[0].markdown, templates[1].markdown);
  for (const template of templates) {
    const related = templateNotes(template, sources);
    const folder = related[0].title.split('/')[0];
    assert.equal(related.length, 2);
    assert.ok(related.every((source) => source.title.startsWith(folder + '/')));
    const titles = discoverTitleTemplates(related);
    assert.deepEqual(
      titles.map((title) => title.pattern),
      [`${folder}/Weekly meeting {{ Number }}`]
    );
    assert.deepEqual(new Set(titles[0].sourceTitles), new Set(template.sourceTitles));
  }
});

test('automatic templates use the entire group and exclude minority sections beyond the first five notes', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2><h2>Decision</h2>';
  const sources = Array.from({ length: 8 }, (_, index) =>
    note('Folder/Note ' + index, body + (index < 2 ? '<h2>Occasional item</h2><p>secret</p>' : ''))
  );
  const [template] = discoverTemplates(sources);
  assert.equal(template.sourceTitles.length, 8);
  assert.match(template.markdown, /## Decision/);
  assert.doesNotMatch(template.markdown, /Occasional item|secret/);
  assert.deepEqual(template, discoverTemplates(sources)[0]);
});

test('discovery never offers a blank template for single notes or unrelated free-form prose', () => {
  assert.deepEqual(discoverTemplates([note('Only', '<h2>Agenda</h2><h2>Actions</h2>')]), []);
  assert.deepEqual(
    discoverTemplates([
      note('First', '<p>A free-form story.</p>'),
      note('Second', '<p>Another unrelated story.</p>'),
    ]),
    []
  );
});

test('discovery offers all supported structural groups beyond twelve candidates', () => {
  const sources = Array.from({ length: 15 }, (_, index) => [
    note(`Category ${index}/One`, `<h2>Topic ${index}</h2><h2>Action ${index}</h2>`),
    note(`Category ${index}/Two`, `<h2>Topic ${index}</h2><h2>Action ${index}</h2>`),
  ]).flat();
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 15);
  assert.equal(new Set(templates.flatMap((template) => template.sourceTitles)).size, 30);
});

test('daily scrum discovery preserves dates between escaped HTML tables in their original order', () => {
  const renderer = new markdownIt();
  const table = (person) =>
    '<table><tr><th>이름</th><th>내용</th><th>비고</th></tr>' +
    `<tr><td>Private person ${person}</td><td>Confidential work</td><td>Done</td></tr></table>`;
  const sources = [
    {
      title: 'Daily scrum/Week one',
      description: renderer.render(
        `**05-25 월**\n\n${table('A')}\n\n**05-26 화**\n\n${table('A')}`
      ),
    },
    {
      title: 'Daily scrum/Week two',
      description: renderer.render(
        `**06-01 월**\n\n${table('B')}\n\n**06-02 화**\n\n${table('B')}`
      ),
    },
  ];
  const [template] = discoverTemplates(sources, '날짜');
  assert.deepEqual(
    template.sourceTitles,
    sources.map((source) => source.title)
  );
  assert.match(
    template.markdown,
    /\*\*\{\{ 날짜 \}\}\*\*[\s\S]*\| 이름 \| 내용 \| 비고 \|[\s\S]*\*\*\{\{ 날짜 \(2\) \}\}\*\*[\s\S]*\| 이름 \| 내용 \| 비고 \|/
  );
  assert.doesNotMatch(
    template.markdown,
    /05-25|05-26|06-01|06-02|Private person|Confidential work|Done/
  );
  const filled = fillTemplate(template.markdown, {
    title: 'Week three',
    날짜: '06-08 월',
    '날짜 (2)': '06-09 화',
  });
  assert.match(
    renderer.render(filled),
    /<strong>06-08 월<\/strong>[\s\S]*<table>[\s\S]*<strong>06-09 화<\/strong>[\s\S]*<table>/
  );
});

test('duplicate normalized paths do not count as two notes or prevent discovery in other groups', () => {
  const body = '<h2>Agenda</h2><h2>Actions</h2>';
  assert.deepEqual(
    discoverTemplates([note('한글', body), note('한글'.normalize('NFD'), body)]),
    []
  );
  const [template] = discoverTemplates([
    note('한글', body),
    note('한글'.normalize('NFD'), body),
    note('Other', body),
  ]);
  assert.equal(template.sourceTitles.length, 2);
});

test('template note previews use only the corresponding group and the latest scoped source contents', () => {
  const [template] = discoverTemplates([
    note('Meetings/One', '<h2>Agenda</h2><h2>Actions</h2>'),
    note('Meetings/Two', '<h2>Agenda</h2><h2>Actions</h2>'),
  ]);
  const current = [
    note('Other', '<p>Unrelated body</p>'),
    note('Meetings/Two', '<p>Changed body</p>'),
    note('Meetings/One', '<p>Current body</p>'),
  ];
  const related = templateNotes(template, current);
  assert.deepEqual(
    related.map((item) => item.title),
    ['Meetings/Two', 'Meetings/One']
  );
  assert.match(related[0].description, /Changed body/);
  assert.deepEqual(templateNotes(template, []), []);
  assert.deepEqual(
    templateNotes(template, current.slice(0, 2)).map((item) => item.title),
    ['Meetings/Two']
  );
});

test('source lookup normalizes paths and cannot recover hidden notes absent from the scoped query', () => {
  const template = { name: 'Test', markdown: '# {{title}}', sourceTitles: ['한글', '.Hidden'] };
  const related = templateNotes(template, [
    note('한글'.normalize('NFD'), '<p>Visible</p>'),
    note('한글', '<p>Duplicate</p>'),
    note('Unrelated', '<p>Other</p>'),
  ]);
  assert.equal(related.length, 1);
  assert.match(related[0].description, /Visible/);
});
