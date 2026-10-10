const assert = require('node:assert/strict');
const { test } = require('node:test');
const markdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const grouping = loadTs('titleGrouping.ts');
const template = loadTs('template.ts');
const { discoverTitleTemplates, titleFromTemplate } = loadTs('titleTemplates.ts', {
  './titleGrouping': grouping,
  './template': template,
});
const inference = loadTs('inference.ts');
const { discoverTemplates, templateNotes } = loadTs('discovery.ts', {
  './inference': inference,
  './titleGrouping': grouping,
});
const names = { date: '날짜', number: '번호', keyword: '키워드' };
const note = (title) => ({
  title,
  description:
    '<p>Date: confidential</p><h2>Agenda</h2><p>secret</p><h2>Actions</h2><p>private</p>',
});

test('one body template offers multiple title patterns from only its source notes', () => {
  const notes = [
    note('Meetings/2026-10-01 Weekly meeting'),
    note('Meetings/2026-10-08 Weekly meeting'),
    note('Meetings/Reports/Weekly report 1'),
    note('Meetings/Reports/Weekly report 2'),
    { title: 'Science/Experiment 1', description: '<h2>Hypothesis</h2><h2>Result</h2>' },
    { title: 'Science/Experiment 2', description: '<h2>Hypothesis</h2><h2>Result</h2>' },
  ];
  const body = discoverTemplates(notes).find((item) => item.name === 'Meetings · Agenda');
  const titles = discoverTitleTemplates(templateNotes(body, notes), names);
  assert.deepEqual(
    titles.map((item) => item.pattern),
    ['Meetings/{{ 날짜 }} Weekly meeting', 'Meetings/Reports/Weekly report {{ 번호 }}']
  );
  assert.deepEqual(
    titles.map((item) => item.variables),
    [['날짜'], ['번호']]
  );
  assert.deepEqual(
    new Set(titles.flatMap((item) => item.sourceTitles)),
    new Set(body.sourceTitles)
  );
  assert.doesNotMatch(JSON.stringify(titles), /secret|confidential|Science/);
});

test('selected title pattern provides the saved path and body heading with shared field values', () => {
  const notes = [
    note('Meetings/2026-10-01 Weekly meeting'),
    note('Meetings/2026-10-08 Weekly meeting'),
  ];
  const [body] = discoverTemplates(notes);
  const [titleTemplate] = discoverTitleTemplates(notes);
  const values = { Date: '2026-10-15', Agenda: 'New agenda', Actions: 'New actions' };
  const title = titleFromTemplate(titleTemplate, values);
  assert.equal(title, 'Meetings/2026-10-15 Weekly meeting');
  const html = new markdownIt().render(
    template.fillTemplate(body.markdown, { ...values, title: title.split('/').at(-1) })
  );
  assert.match(html, /<h1>2026-10-15 Weekly meeting<\/h1>/);
  assert.match(html, /Date: 2026-10-15/);
  assert.match(html, /New agenda/);
  assert.doesNotMatch(html, /secret|confidential|\{\{/);
});

test('all title fields are required and cannot add a path or leave unresolved placeholders', () => {
  const [title] = discoverTitleTemplates([
    note('Folder/Version1 - Item10'),
    note('Folder/Version2 - Item20'),
  ]);
  assert.deepEqual(title.variables, ['Number', 'Number 2']);
  for (const values of [
    {},
    { Number: '3' },
    { Number: '3', 'Number 2': ' ' },
    { Number: '../Other', 'Number 2': '30' },
    { Number: '3', 'Number 2': '{{ Missing }}' },
    { Number: '3', 'Number 2': 'bad:name' },
  ]) {
    assert.equal(titleFromTemplate(title, values), null);
  }
  assert.equal(
    titleFromTemplate(title, { Number: '3', 'Number 2': '30' }),
    'Folder/Version3 - Item30'
  );
});

test('folder names remain literal while entered note names normalize to NFC', () => {
  const [title] = discoverTitleTemplates([
    note('{{ Keyword }}/Review Alpha'),
    note('{{ Keyword }}/Review Beta'),
  ]);
  assert.equal(
    titleFromTemplate(title, { Keyword: '한글'.normalize('NFD') }),
    '{{ Keyword }}/Review 한글'
  );
});

test('nonrepeating names do not produce title choices and removed sources cannot support old choices', () => {
  const notes = [note('Folder/Review 1'), note('Folder/Review 2'), note('Folder/Design')];
  assert.equal(discoverTitleTemplates(notes).length, 1);
  assert.deepEqual(discoverTitleTemplates(notes.slice(1)), []);
  assert.deepEqual(discoverTitleTemplates([]), []);
  assert.deepEqual(discoverTitleTemplates([note('한글'), note('한글'.normalize('NFD'))]), []);
});

test('title patterns never accept inherited values as filled fields', () => {
  const [title] = discoverTitleTemplates([note('Report 1'), note('Report 2')]);
  assert.equal(titleFromTemplate(title, Object.create({ Number: '3' })), null);
});
