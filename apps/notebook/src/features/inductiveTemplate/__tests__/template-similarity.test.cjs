const assert = require('node:assert/strict');
const { test } = require('node:test');
const markdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const inference = loadTs('inference.ts');
const { templateSimilarity, groupSimilarTemplates, TEMPLATE_SIMILARITY_THRESHOLD } = loadTs(
  'templateSimilarity.ts',
  { './inference': inference }
);
const render = (markdown) => new markdownIt().render(markdown);
const candidate = (name, sections) => ({
  name,
  markdown: '# {{title}}\n\n' + sections,
  sourceTitles: ['Private/' + name],
});
const headings = (...names) =>
  names.map((name) => '## ' + name + '\n\n{{ ' + name + ' }}').join('\n\n');

test('the exact two-thirds boundary is included', () => {
  assert.equal(TEMPLATE_SIMILARITY_THRESHOLD, 2 / 3);
  const a = candidate('A', headings('One', 'Two'));
  const b = candidate('B', headings('One', 'Two', 'Three'));
  assert.equal(templateSimilarity(a, b, render), 2 / 3);
  const groups = groupSimilarTemplates([a, b], render);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].similarity, 2 / 3);
});

test('66 percent is below two thirds and stays in separate groups', () => {
  const fields = (count) =>
    Array.from({ length: count }, (_, index) => '- Field ' + index + ': {{ Value }}').join('\n');
  const a = candidate('A', fields(33));
  const b = candidate('B', fields(50));
  assert.equal(templateSimilarity(a, b, render), 0.66);
  assert.equal(groupSimilarTemplates([a, b], render).length, 2);
});

test('similar templates form flat groups while preserving each original candidate and source set', () => {
  const a = candidate('Plan', headings('Vertices', 'Edges', 'Faces'));
  const b = candidate('Plan variant', headings('Vertices', 'Edges', 'Faces', 'Appendix'));
  const other = candidate('Research', headings('Hypothesis', 'Method', 'Result'));
  const before = JSON.stringify([a, b, other]);
  const groups = groupSimilarTemplates([a, b, other], render);
  assert.equal(groups.length, 2);
  const similar = groups.find((group) => group.templates.length === 2);
  assert.equal(similar.similarity, 0.75);
  assert.ok(similar.templates.includes(a) && similar.templates.includes(b));
  assert.strictEqual(
    similar.templates.find((item) => item.name === a.name),
    a
  );
  assert.ok(groups.every((group) => !('children' in group) && !('groups' in group)));
  assert.equal(JSON.stringify([a, b, other]), before);
});

test('similarity ignores source paths, candidate names, placeholder names and section order', () => {
  const a = candidate('One', '- Date: {{ Date }}\n\n' + headings('Vertices', 'Edges'));
  const b = {
    name: 'Unrelated name',
    sourceTitles: ['Other/Notebook'],
    markdown:
      '# {{ title }}\n\n- Date: {{ Other }}\n\n' +
      headings('Edges', 'Vertices').replaceAll('{{ Edges }}', '{{ Value }}'),
  };
  assert.equal(templateSimilarity(a, b, render), 1);
  assert.equal(templateSimilarity(b, a, render), 1);
});

test('ancestry, table columns and list types remain part of structural similarity', () => {
  const a = candidate('Root', headings('Vertices', 'Edges'));
  const nested = candidate('Nested', '## Vertices\n{{ Vertices }}\n\n### Edges\n{{ Edges }}');
  assert.ok(templateSimilarity(a, nested, render) < TEMPLATE_SIMILARITY_THRESHOLD);
  const table = '| Topic | Result |\n| --- | --- |\n| Work | {{ Result }} |';
  assert.equal(
    templateSimilarity(
      candidate('A', table),
      candidate('B', table.replace('Result |', 'Owner |')),
      render
    ),
    0.4
  );
  assert.equal(
    templateSimilarity(candidate('A', '- {{ Items }}'), candidate('B', '1. {{ Items }}'), render),
    0
  );
});

test('synthetic forms share columns and fields even when their row labels differ', () => {
  const form = (columns, rows) =>
    candidate(
      'Synthetic form',
      '- 표본 번호: {{ 번호 }}\n\n- 표본 이름: {{ 이름 }}\n\n' +
        '| ' +
        columns.join(' | ') +
        ' |\n| ' +
        columns.map(() => '---').join(' | ') +
        ' |\n' +
        rows
          .map((row) => '| ' + [row, ...columns.slice(1).map(() => '{{ 값 }}')].join(' | ') + ' |')
          .join('\n')
    );
  const a = form(['분류', '값', '표식'], ['도형 가', '도형 나', '도형 다', '도형 라']);
  const b = form(
    ['분류', '값', '표식', '설명'],
    ['색상 가', '색상 나', '색상 다', '색상 라', '색상 마']
  );
  assert.equal(templateSimilarity(a, b, render), 0.75);
  assert.equal(templateSimilarity(b, a, render), 0.75);
  const before = JSON.stringify([a, b]);
  const groups = groupSimilarTemplates([a, b], render);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].similarity, 0.75);
  assert.equal(JSON.stringify([a, b]), before);
});

test('shared row labels add evidence across column changes without merging unrelated tables', () => {
  const table = (columns, row) =>
    candidate(
      'Table',
      '| ' +
        columns.join(' | ') +
        ' |\n| ' +
        columns.map(() => '---').join(' | ') +
        ' |\n| ' +
        [row, ...columns.slice(1).map(() => '{{ Value }}')].join(' | ') +
        ' |'
    );
  const a = table(['Topic', 'Result', 'Faces'], 'Work');
  const extra = table(['Topic', 'Result', 'Faces', 'Note'], 'Work');
  const differentRows = table(['Topic', 'Result', 'Faces', 'Note'], 'Other');
  assert.ok(templateSimilarity(a, extra, render) > templateSimilarity(a, differentRows, render));
  assert.ok(
    templateSimilarity(a, table(['Name', 'Owner'], 'Work'), render) < TEMPLATE_SIMILARITY_THRESHOLD
  );
  assert.equal(templateSimilarity(a, table(['Faces', 'Topic', 'Result'], 'Work'), render), 1);
  assert.ok(
    templateSimilarity(table(['Name', 'Name'], 'Work'), table(['Name', 'Value'], 'Work'), render) <
      TEMPLATE_SIMILARITY_THRESHOLD
  );
});

test('column matching retains section ancestry, repeated tables, fullwidth characters and emoji', () => {
  const table = '| Name | Value |\n| --- | --- |\n| Work | {{ Value }} |';
  assert.ok(
    templateSimilarity(
      candidate('A', '## Vertices\n\n' + table),
      candidate('B', '## Other\n\n' + table),
      render
    ) < TEMPLATE_SIMILARITY_THRESHOLD
  );
  assert.equal(
    templateSimilarity(candidate('A', table), candidate('B', table + '\n\n' + table), render),
    0.5
  );
  assert.ok(
    templateSimilarity(
      candidate('A', table.replace('Name', 'ＡＢＣ')),
      candidate('B', table.replace('Name', 'ABC')),
      render
    ) < TEMPLATE_SIMILARITY_THRESHOLD
  );
  assert.ok(
    templateSimilarity(
      candidate('A', table.replace('Name', '🚀 Name')),
      candidate('B', table.replace('Name', '🌟 Name')),
      render
    ) < TEMPLATE_SIMILARITY_THRESHOLD
  );
});

test('date separators contribute to structure and localized date slots keep the same signature', () => {
  const table = '| Name | Work |\n| --- | --- |\n| {{ Name }} | {{ Work }} |';
  const english = candidate(
    'English',
    '**{{ Date }}**\n\n' + table + '\n\n**{{ Date (2) }}**\n\n' + table
  );
  const korean = candidate('Korean', english.markdown.replaceAll('Date', '날짜'));
  assert.equal(templateSimilarity(english, korean, render), 1);
  assert.ok(templateSimilarity(english, candidate('No dates', table + '\n\n' + table), render) < 1);
  assert.equal(groupSimilarTemplates([english, korean], render).length, 1);
});

test('weak A-B-C chains cannot place dissimilar endpoints in one group', () => {
  const templates = [
    candidate('A', headings('One', 'Two', 'Three', 'Four')),
    candidate('B', headings('One', 'Two', 'Three')),
    candidate('C', headings('One', 'Two', 'Three', 'Five')),
  ];
  assert.equal(templateSimilarity(templates[0], templates[1], render), 0.75);
  assert.equal(templateSimilarity(templates[1], templates[2], render), 0.75);
  assert.equal(templateSimilarity(templates[0], templates[2], render), 0.6);
  const groups = groupSimilarTemplates(templates, render);
  assert.deepEqual(groups.map((group) => group.templates.length).sort(), [1, 2]);
  for (const group of groups)
    for (const a of group.templates)
      for (const b of group.templates) {
        if (a !== b) assert.ok(templateSimilarity(a, b, render) >= TEMPLATE_SIMILARITY_THRESHOLD);
      }
  assert.deepEqual(groupSimilarTemplates([...templates].reverse(), render), groups);
});

test('empty skeletons do not appear similar and threshold rejects lower overlap', () => {
  const blank = candidate('Blank', '{{ Content }}');
  assert.equal(templateSimilarity(blank, blank, render), 0);
  assert.deepEqual(groupSimilarTemplates([], render), []);
  const groups = groupSimilarTemplates(
    [
      blank,
      candidate('A', headings('One', 'Two', 'Three')),
      candidate('B', headings('One', 'Two', 'Other')),
    ],
    render
  );
  assert.equal(groups.length, 3);
  assert.ok(groups.every((group) => group.similarity === null));
});

test('similarity grouping compares inferred templates after automatic discovery', () => {
  const { discoverTemplates } = loadTs('discovery.ts', {
    './inference': inference,
    './titleGrouping': loadTs('titleGrouping.ts'),
  });
  const table =
    '<table><tr><th>Topic</th><th>Result</th></tr>' +
    Array.from(
      { length: 20 },
      (_, index) => '<tr><td>Work ' + index + '</td><td>secret</td></tr>'
    ).join('') +
    '</table>';
  const notes = ['A', 'B'].flatMap((kind) =>
    [1, 2].map((index) => ({
      title: kind + '/' + index,
      description:
        '<h2>Plan</h2>' +
        table +
        ['Owner', 'Date', 'Status']
          .map((field) => '<p>' + kind + ' ' + field + ': confidential</p>')
          .join(''),
    }))
  );
  const templates = discoverTemplates(notes);
  assert.equal(templates.length, 2);
  const groups = groupSimilarTemplates(templates, render);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].templates.length, 2);
  assert.ok(groups[0].similarity >= TEMPLATE_SIMILARITY_THRESHOLD);
  assert.doesNotMatch(JSON.stringify(groups), /secret|confidential/);
});

test('identical bodies separated by top-level source folders remain distinct in a flat similarity group', () => {
  const { discoverTemplates } = loadTs('discovery.ts', {
    './inference': inference,
    './titleGrouping': loadTs('titleGrouping.ts'),
  });
  const templates = discoverTemplates(
    ['Samples', 'Archive'].flatMap((folder) =>
      [1, 2].map((index) => ({
        title: `${folder}/Shape ${index}`,
        description: '<h2>Vertices</h2><h2>Edges</h2>',
      }))
    )
  );
  const groups = groupSimilarTemplates(templates, render);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].similarity, 1);
  assert.equal(groups[0].templates.length, 2);
  assert.deepEqual(
    new Set(groups[0].templates.map((template) => template.name)),
    new Set(['Vertices / Edges', 'Vertices / Edges (2)'])
  );
  assert.deepEqual(
    new Set(groups[0].templates.flatMap((template) => template.sourceTitles)),
    new Set(['Samples/Shape 1', 'Samples/Shape 2', 'Archive/Shape 1', 'Archive/Shape 2'])
  );
});
