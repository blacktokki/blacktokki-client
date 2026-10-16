const assert = require('node:assert/strict');
const { test } = require('node:test');
const MarkdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const template = loadTs('template.ts');
const {
  findTemplateTables,
  initialTableLayout,
  changeTableLayout,
  applyTableLayout,
  renameTableColumn,
} = loadTs('tableLayout.ts', { './template': template });
const render = new MarkdownIt({ html: true });
const table = (headers, rows) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
const req = (number) => `REQ-${String(number).padStart(3, '0')}`;
const numbered = (headers = ['ID', 'Description', 'Owner', 'Status']) =>
  table(headers, [
    [
      'REQ-nnn 형태의 오름차순으로 표시합니다.',
      ...headers.slice(1).map((_, i) => `{{Instruction ${i}}}`),
    ],
    ...Array.from({ length: 5 }, (_, number) => [
      req(number),
      ...headers.slice(1).map((column) => `{{${req(number)} · ${column}}}`),
    ]),
  ]);
function setup(markdown) {
  const definitions = findTemplateTables(markdown);
  let state = initialTableLayout(definitions);
  return {
    definitions,
    change: (group, removeId) => {
      state = changeTableLayout(definitions, state, group.id, removeId);
    },
    rename: (group, ordinal, label) => {
      state = renameTableColumn(state, group.id, ordinal, label);
    },
    view: () => applyTableLayout(markdown, definitions, state),
  };
}
const group = (fixture, axis) => fixture.definitions[0].groups.find((item) => item.axis === axis);
const variables = (row) => row.cells.flatMap((cell) => cell.variables);

test('REQ rows grow and shrink independently of their fixed instruction row', () => {
  const markdown = numbered();
  const fixture = setup(markdown);
  const rows = group(fixture, 'row');
  assert.equal(fixture.definitions[0].groups.length, 1);
  assert.equal(fixture.view().markdown, markdown);
  const values = { 'REQ-003 · Description': 'Retain this requirement' };
  fixture.change(rows);
  assert.equal(fixture.view().tables[0].rows.at(-1).label, 'REQ-005');
  fixture.change(rows, 2);
  assert.deepEqual(
    fixture.view().tables[0].rows.map((row) => row.label),
    [
      'REQ-nnn 형태의 오름차순으로 표시합니다.',
      'REQ-000',
      'REQ-001',
      'REQ-003',
      'REQ-004',
      'REQ-005',
    ]
  );
  assert.match(
    template.fillNoteTemplate(fixture.view().markdown, values),
    /Retain this requirement/
  );
  assert.doesNotMatch(fixture.view().markdown, /REQ-002/);
  for (const row of fixture.view().tables[0].rows.filter((row) => row.groupId))
    fixture.change(rows, row.ordinal);
  assert.equal(fixture.view().tables[0].rows.length, 1);
  fixture.change(rows);
  assert.equal(fixture.view().tables[0].rows.at(-1).label, 'REQ-006');
  assert.equal(fixture.definitions[0].rows.length, 6);
});

test('tables with only repeating columns keep fixed row labels and support column removal/addition', () => {
  const markdown = table(
    ['Metric', 'Sprint 1', 'Sprint 2'],
    [
      ['Owner', '{{Owner 1}}', '{{Owner 2}}'],
      ['Result', '{{Result 1}}', '{{Result 2}}'],
    ]
  );
  const fixture = setup(markdown);
  assert.equal(group(fixture, 'row'), undefined);
  const columns = group(fixture, 'column');
  fixture.change(columns);
  assert.deepEqual(
    fixture.view().tables[0].columns.map((column) => column.label),
    ['Metric', 'Sprint 1', 'Sprint 2', 'Sprint 3']
  );
  const key = fixture.view().tables[0].rows[0].cells.at(-1).variables[0];
  fixture.change(columns, 0);
  assert.equal(fixture.view().tables[0].rows[0].cells.at(-1).variables[0], key);
  const html = render.render(
    template.fillNoteTemplate(fixture.view().markdown, { [key]: 'Alice', 'Owner 2': 'Bob' })
  );
  assert.match(html, /<th>Metric<\/th>[\s\S]*<th>Sprint 2<\/th>[\s\S]*<th>Sprint 3<\/th>/);
  assert.match(html, /<td>Owner<\/td>[\s\S]*<td>Bob<\/td>[\s\S]*<td>Alice<\/td>/);
  assert.doesNotMatch(html, /Sprint 1/);
  for (const column of fixture.view().tables[0].columns.filter((column) => column.groupId))
    fixture.change(columns, column.ordinal);
  assert.equal(fixture.view().tables[0].columns.length, 1);
  fixture.change(columns);
  assert.equal(fixture.view().tables[0].columns.at(-1).label, 'Sprint 4');
});

test('both axes can expand in either order and surviving intersection values keep their identity', () => {
  const markdown = numbered(['ID', '열 1', '열 2']);
  const fixture = setup(markdown);
  fixture.change(group(fixture, 'row'));
  fixture.change(group(fixture, 'column'));
  const before = fixture.view();
  const key = before.tables[0].rows.at(-1).cells.at(-1).variables[0];
  const other = setup(markdown);
  other.change(group(other, 'column'));
  other.change(group(other, 'row'));
  assert.equal(other.view().markdown, before.markdown);
  fixture.change(group(fixture, 'row'), 1);
  fixture.change(group(fixture, 'column'), 0);
  assert.equal(fixture.view().tables[0].rows.at(-1).cells.at(-1).variables[0], key);
  const saved = render.render(
    template.fillNoteTemplate(fixture.view().markdown, { [key]: 'Intersection value' })
  );
  assert.match(saved, /Intersection value/);
  assert.doesNotMatch(saved, /REQ-001|열 1/);
});

test('a variable-only row can be removed to zero and restored without reviving deleted values', () => {
  const fixture = setup(table(['Name', 'Result'], [['{{Name}}', '{{Result}}']]));
  const rows = group(fixture, 'row');
  fixture.change(rows, 0);
  assert.equal(fixture.view().tables[0].rows.length, 0);
  fixture.change(rows);
  const fields = variables(fixture.view().tables[0].rows[0]);
  assert.equal(fields.length, 2);
  assert.ok(fields.every((key) => !['Name', 'Result'].includes(key)));
  const html = render.render(
    template.fillNoteTemplate(fixture.view().markdown, { Name: 'Deleted value' })
  );
  assert.doesNotMatch(html, /Deleted value/);
});

test('named repeating columns resize without a numbered header pattern and can be renamed safely', () => {
  const fixture = setup(
    table(
      ['Item', 'Alice', 'Bob'],
      [
        ['Owner', '{{Owner Alice}}', '{{Owner Bob}}'],
        ['Result', '{{Result Alice}}', '{{Result Bob}}'],
      ]
    )
  );
  assert.equal(group(fixture, 'row'), undefined);
  const columns = group(fixture, 'column');
  fixture.change(columns);
  const key = fixture.view().tables[0].rows[0].cells.at(-1).variables[0];
  fixture.rename(columns, 2, 'Charlie | {{title}}');
  const renamed = fixture.view();
  assert.equal(renamed.tables[0].columns.at(-1).label, 'Charlie | {{title}}');
  assert.equal(renamed.tables[0].rows[0].cells.at(-1).variables[0], key);
  const html = render.render(
    template.fillNoteTemplate(renamed.markdown, { [key]: 'Retained' }, 'Note')
  );
  assert.match(html, /<th>Charlie \| \{\{title\}\}<\/th>/);
  assert.match(html, /<td>Retained<\/td>/);
  assert.equal((html.match(/<th>/g) || []).length, 4);
  fixture.change(columns);
  fixture.change(columns, 0);
  assert.equal(
    fixture.view().tables[0].columns.find((column) => column.ordinal === 2).label,
    'Charlie | {{title}}'
  );
});

test('renaming a numbered column never changes its cell keys when a row is subsequently added', () => {
  const fixture = setup(numbered(['ID', 'Sprint 1', 'Sprint 2']));
  const columns = group(fixture, 'column');
  fixture.change(columns);
  fixture.change(group(fixture, 'row'));
  const key = fixture.view().tables[0].rows.at(-1).cells.at(-1).variables[0];
  fixture.rename(columns, 2, 'Review');
  fixture.change(group(fixture, 'row'));
  assert.equal(fixture.view().tables[0].rows.at(-2).cells.at(-1).variables[0], key);
  assert.match(
    render.render(template.fillNoteTemplate(fixture.view().markdown, { [key]: 'Stable' })),
    /<td>Stable<\/td>/
  );
});

test('the last remaining column cannot be removed when no fixed label column exists', () => {
  const fixture = setup(table(['Column 1', 'Column 2'], [['{{First}}', '{{Second}}']]));
  const columns = group(fixture, 'column');
  fixture.change(columns, 0);
  fixture.change(columns, 1);
  assert.equal(fixture.view().tables[0].columns.length, 1);
  fixture.change(columns);
  assert.equal(fixture.view().tables[0].columns.length, 2);
});

test('fixed key/value tables, nonconsecutive identifiers and fenced examples do not become repeats', () => {
  const fixed = table(
    ['Field', 'Value'],
    [
      ['Owner', '{{Owner}}'],
      ['Date', '{{Date}}'],
    ]
  );
  const nonconsecutive = table(
    ['ID', 'Value'],
    [
      ['REQ-000', '{{A}}'],
      ['REQ-009', '{{B}}'],
    ]
  );
  const fenced = `\n\n\`\`\`markdown\n${numbered()}\n\`\`\`\n`;
  const markdown = `${fixed}\n\n${nonconsecutive}${fenced}`;
  assert.deepEqual(findTemplateTables(markdown), []);
  assert.equal(applyTableLayout(markdown, [], {}).markdown, markdown);
});

test('multiple tables and repeat groups have independent state and unique new cell variables', () => {
  const markdown = `${numbered()}\n\n${numbered()}\n\n${table(
    ['ID', 'Value'],
    [
      ['A-01', '{{A1}}'],
      ['A-02', '{{A2}}'],
      ['Footer', '{{Footer}}'],
      ['B-01', '{{B1}}'],
      ['B-02', '{{B2}}'],
    ]
  )}`;
  const fixture = setup(markdown);
  assert.equal(fixture.definitions.length, 3);
  for (const definition of fixture.definitions)
    for (const repeat of definition.groups) fixture.change(repeat);
  const view = fixture.view();
  const added = view.tables
    .flatMap((item) =>
      item.rows.filter((row) => row.ordinal >= 2 && row.groupId).flatMap(variables)
    )
    .filter((key) => /\(\d+\./.test(key));
  assert.equal(added.length, new Set(added).size);
  const second = view.tables[1].rows.at(-1).cells[1].variables[0];
  for (const row of view.tables[0].rows.filter((row) => row.groupId))
    fixture.change(group(fixture, 'row'), row.ordinal);
  assert.equal(fixture.view().tables[1].rows.at(-1).cells[1].variables[0], second);
  assert.equal(view.tables[2].rows.filter((row) => row.label === 'Footer').length, 1);
});

test('escaped pipes, column alignment, code fences and long names remain valid after expansion', () => {
  const headers = ['ID', 'Label\\|Value', 'Long ' + '열'.repeat(85)];
  const markdown = numbered(headers).replace('| --- | --- | --- |', '| :--- | :---: | ---: |');
  const fixture = setup(`\`\`\`\nignore\n\`\`\`\n\n${markdown}`);
  fixture.change(group(fixture, 'row'));
  const view = fixture.view();
  assert.match(view.markdown, /\| :--- \| :---: \| ---: \|/);
  assert.equal(view.tables[0].columns.length, 3);
  assert.ok(variables(view.tables[0].rows.at(-1)).every((key) => key.length <= 100));
  const html = render.render(view.markdown);
  assert.match(html, /Label\|Value/);
  assert.equal((html.match(/<th\b/g) || []).length, 3);
});

test('table values containing pipes or pasted newlines cannot add rows or columns or trigger another substitution', () => {
  const markdown = table(['ID', 'Value'], [['REQ-000', '{{Value}}']]);
  for (const value of ['A|B', 'A\\|B', '{{title}}\nnext row']) {
    const filled = template.fillNoteTemplate(markdown, { Value: value }, 'Note', ['Value']);
    const html = render.render(filled);
    assert.equal((html.match(/<td>/g) || []).length, 2);
    assert.equal((html.match(/<tr>/g) || []).length, 2);
    if (value.includes('{{title}}')) assert.match(html, /\{\{title\}\}<br>next row/);
    else assert.match(html, /A\|B/);
  }
});
