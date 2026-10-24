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
      'Shapes/One',
      '<p>Date: 2026-01-01</p><h2>Vertices</h2><p>Secret budget</p><h2>Edges</h2><p>Call Alice</p>'
    ),
    note(
      'Archive/Two',
      '<p>Date: 2026-02-02</p><h2>Vertices</h2><p>Private launch</p><h2>Edges</h2><p>Call Bob</p>'
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
  const meeting = templates.find((template) => template.name === 'Vertices / Edges');
  assert.deepEqual(meeting.sourceTitles, ['Shapes/One', 'Archive/Two']);
  assert.doesNotMatch(meeting.markdown, /2026-|Secret|Private|Alice|Bob/);
  const renderer = new markdownIt();
  const preview = renderer.render(meeting.markdown);
  assert.match(preview, /<h2>Vertices<\/h2>/);
  assert.match(preview, /\{\{Vertices\}\}/);
  const newNote = renderer.render(
    fillTemplate(meeting.markdown, {
      title: 'New shape',
      Date: '2026-10-10',
      Vertices: 'Plan the release',
      Edges: 'Review results',
    })
  );
  assert.match(newNote, /<h1>New shape<\/h1>/);
  assert.match(newNote, /Plan the release/);
  assert.doesNotMatch(newNote, /\{\{/);
  assert.equal(JSON.stringify(sources), snapshot);
});

test('supported top-level groups split together and use the original structural name', () => {
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = [
    note('Samples/Weekly/Shape 1', body),
    note('Archive/Shape 1', body),
    note('Samples/Monthly/Shape 2', body),
    note('Archive/Shape 2', body),
    note('Root shape', body),
    note('Other root shape', body),
  ];
  const before = JSON.stringify(sources);
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 3);
  for (const template of templates)
    assert.ok(titleGrouping.groupNotePaths(templateNotes(template, sources)).folders.length <= 1);
  assert.deepEqual(
    templates.find((template) => template.sourceTitles[0].startsWith('Samples/')).sourceTitles,
    ['Samples/Weekly/Shape 1', 'Samples/Monthly/Shape 2']
  );
  assert.deepEqual(
    templates.find((template) => template.sourceTitles[0].startsWith('Archive/')).sourceTitles,
    ['Archive/Shape 1', 'Archive/Shape 2']
  );
  assert.deepEqual(
    templates.find((template) => template.sourceTitles[0] === 'Root shape').sourceTitles,
    ['Root shape', 'Other root shape']
  );
  assert.deepEqual(
    new Set(templates.map((template) => template.name)),
    new Set(['Vertices / Edges', 'Vertices / Edges (2)', 'Vertices / Edges (3)'])
  );
  assert.equal(new Set(templates.map((template) => template.markdown)).size, 1);
  const titles = templates.flatMap((template) => template.sourceTitles);
  assert.equal(titles.length, sources.length);
  assert.deepEqual(new Set(titles), new Set(sources.map((source) => source.title)));
  assert.equal(JSON.stringify(sources), before);
});

test('a single-note top-level group keeps the entire original template together', () => {
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = [note('Samples/One', body), note('Samples/Two', body), note('Archive/One', body)];
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Vertices / Edges');
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
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = ['Samples', 'Archive'].flatMap((folder) =>
    [1, 2].map((index) => note(`${folder}/Shape ${index}`, body))
  );
  sources.push(note('Loose note', body));
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Vertices / Edges');
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((source) => source.title)
  );
});

test('one top-level folder names the template and retains loose sources without splitting', () => {
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = [
    note('도형 모음/첫 묶음/첫째', body),
    note('도형 모음/둘째 묶음/둘째', body),
    note('도형', body),
  ];
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, '도형 모음 · Vertices / Edges');
  assert.equal(templates[0].folderName, '도형 모음');
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((source) => source.title)
  );
});

test('templates without top-level folders use their common outline and retain source sets', () => {
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = [note('One', body), note('Two', body)];
  const [template] = discoverTemplates(sources);
  assert.equal(template.name, 'Vertices / Edges');
  assert.deepEqual(template.sourceTitles, ['One', 'Two']);
  assert.equal(titleGrouping.groupNotePaths(templateNotes(template, sources)).folders.length, 0);
});

test('notebook containers do not count as top-level groups for naming or splitting', () => {
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = ['Samples', 'Archive'].flatMap((folder) =>
    [1, 2].map((index) => note(`Notebook/${folder}/Shape ${index}`, body))
  );
  const templates = discoverTemplates(sources, 'Date', ['Notebook']);
  assert.equal(templates.length, 2);
  assert.deepEqual(
    new Set(templates.map((template) => template.name)),
    new Set(['Vertices / Edges', 'Vertices / Edges (2)'])
  );
  for (const template of templates) {
    assert.ok(template.sourceTitles.every((title) => title.startsWith('Notebook/')));
    assert.equal(
      titleGrouping.groupNotePaths(templateNotes(template, sources), ['Notebook']).folders.length,
      1
    );
  }
  const [single] = discoverTemplates(sources.slice(0, 2), 'Date', ['Notebook']);
  assert.equal(single.name, 'Samples · Vertices / Edges');
});

test('shared tables do not produce templates when surrounding document structures differ', () => {
  const table = (value) =>
    '<table><tr><th>Priority</th><th>Case</th><th>Expected</th></tr>' +
    `<tr><td>${value}</td><td>Confidential case</td><td>Secret outcome</td></tr></table>`;
  const sources = [
    note('Tests/One', '<h2>Project plan</h2><h3>Scope</h3>' + table('High') + '<h3>Schedule</h3>'),
    note(
      'Tests/Two',
      '<h2>Release review</h2><h3>Acceptance</h3>' + table('Medium') + '<h3>Symmetry</h3>'
    ),
  ];
  const before = JSON.stringify(sources);
  assert.deepEqual(discoverTemplates(sources), []);
  assert.equal(JSON.stringify(sources), before);
});

test('recurring title families recover numbered shape cores despite different optional sections', () => {
  const sources = [1, 2].map((month) =>
    note(
      `ShapeSets/2026-0${month} Shape set`,
      '<h2>Shape</h2><p>Confidential result</p><h2>Scale</h2><h2>Symmetry</h2>' +
        Array.from({ length: 4 }, (_, index) => `<h2>Month ${month} topic ${index}</h2>`).join('')
    )
  );
  const before = JSON.stringify(sources);
  const [template] = discoverTemplates(sources, 'Date', []);
  assert.equal(template.name, 'ShapeSets · Shape / Scale / Symmetry');
  assert.deepEqual(
    template.sourceTitles,
    sources.map((source) => source.title)
  );
  assert.match(template.markdown, /## Shape[\s\S]*## Scale[\s\S]*## Symmetry/);
  assert.doesNotMatch(template.markdown, /Confidential|Month|2026-/);
  const newNote = new markdownIt().render(
    fillTemplate(template.markdown, {
      title: 'New shape',
      Shape: 'Highlights',
      Scale: 'Stable',
      Symmetry: 'Rotation',
    })
  );
  assert.match(newNote, /<h1>New shape<\/h1>[\s\S]*Rotation/);
  assert.equal(JSON.stringify(sources), before);
});

test('matching titles alone cannot invent templates or pool notes from separate folders', () => {
  const first = note('Set A/2026-01 ShapeSet', '<h2>Shape</h2><h2>Scale</h2>');
  const second = note('Set A/2026-02 ShapeSet', '<h2>Width</h2><h2>Height</h2>');
  assert.deepEqual(discoverTemplates([first, second]), []);
  const optional = (month) =>
    note(
      `ShapeSets/2026-0${month} ShapeSet`,
      '<h2>Shape</h2>' +
        (month < 3 ? '<h2>Scale</h2>' : '') +
        Array.from({ length: 4 }, (_, index) => `<h2>Unique ${month}-${index}</h2>`).join('')
    );
  assert.deepEqual(discoverTemplates([1, 2, 3, 4, 5].map(optional)), []);
  // A repeated title in another folder must not support the title-family fallback.
  const uniqueBody = (id) =>
    '<h2>Core</h2><h2>Related</h2>' +
    Array.from({ length: 4 }, (_, n) => `<h2>Unique ${id}-${n}</h2>`).join('');
  assert.deepEqual(
    discoverTemplates([
      note(first.title, uniqueBody(1)),
      note('Set B/2026-02 ShapeSet', uniqueBody(2)),
    ]),
    []
  );
});

test('title family recovery does not duplicate an already discovered whole-note format', () => {
  const sources = [1, 2].map((month) =>
    note(`ShapeSets/2026-0${month} ShapeSet`, '<h2>Shape</h2><h2>Scale</h2>')
  );
  assert.equal(discoverTemplates(sources).length, 1);
});

test('different names and folders share a three-section research core despite optional sections', () => {
  const body = (id) =>
    '<h2>Purpose</h2><p>Secret subject</p><h2>Evidence</h2>' +
    '<h2>Next steps</h2>' +
    Array.from({ length: 4 }, (_, index) => `<h2>Unique ${id}-${index}</h2>`).join('');
  const sources = [note('Research/One', body(1)), note('Research/Two', body(2))];
  const [template] = discoverTemplates(sources, 'Date', []);
  assert.equal(template.name, 'Research · Purpose / Evidence / Next steps');
  assert.deepEqual(new Set(template.sourceTitles), new Set(sources.map((source) => source.title)));
  assert.doesNotMatch(template.markdown, /Unique|Secret/);
  assert.match(template.markdown, /## Purpose[\s\S]*## Evidence[\s\S]*## Next steps/);
  const [crossFolder] = discoverTemplates(
    [sources[0], { ...sources[1], title: 'Other/Two' }],
    'Date',
    []
  );
  assert.equal(crossFolder.markdown, template.markdown);
  assert.deepEqual(crossFolder.sourceTitles, ['Research/One', 'Other/Two']);
});

test('numeric-only outer headings cannot support a partial core across different folders', () => {
  const sources = [1, 2].map((id) =>
    note(
      `Folder ${id}/Note ${id}`,
      '<h2>1.</h2><h2>2.</h2><h2>3.</h2>' +
        Array.from({ length: 4 }, (_, index) => `<h2>Unique ${id}-${index}</h2>`).join('')
    )
  );
  assert.deepEqual(discoverTemplates(sources), []);
});

test('folder core recovery cannot merge sources through a weak chain of different three-section cores', () => {
  const sources = [
    ['One', ['Alpha', 'Beta', 'Gamma']],
    ['Two', ['Alpha', 'Beta', 'Gamma', 'Delta']],
    ['Three', ['Beta', 'Gamma', 'Delta']],
  ].map(([title, headings]) =>
    note(
      `Research/${title}`,
      [...headings, ...Array.from({ length: 4 }, (_, index) => `${title} unique ${index}`)]
        .map((heading) => `<h2>${heading}</h2>`)
        .join('')
    )
  );
  const templates = discoverTemplates(sources, 'Date', []);
  assert.equal(templates.length, 2);
  const members = templates.map((template) => [...template.sourceTitles].sort());
  assert.deepEqual(
    new Set(members.map((member) => JSON.stringify(member))),
    new Set([
      JSON.stringify(['Research/One', 'Research/Two']),
      JSON.stringify(['Research/Three', 'Research/Two']),
    ])
  );
});

test('whole-note templates do not add separate table forms from unmatched child sections', () => {
  const table =
    '<table><tr><th>Environment</th><th>Domain</th></tr>' +
    '<tr><td>prod</td><td>https://private.example</td></tr></table>';
  const sources = [1, 2].map((id) =>
    note(`Server ${id}`, `<h2>Plan</h2><h3>Service ${id}</h3>${table}<h2>Validation</h2>`)
  );
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Plan / Validation');
  assert.doesNotMatch(templates[0].markdown, /Environment|Domain|Service|private/);
});

test('discovery retains dates, notebook-root exclusion and minimum split group sizes', () => {
  const body = (date) => `<p><strong>${date}</strong></p><h2>Vertices</h2><h2>Edges</h2>`;
  const sources = [
    note('Notebook/Samples/One', body('05-25 월')),
    note('Notebook/Samples/Two', body('06-01 월')),
    note('Notebook/Archive/One', body('06-08 월')),
  ];
  const before = JSON.stringify(sources);
  const templates = discoverTemplates(sources, '날짜', ['Notebook']);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Vertices / Edges');
  assert.match(templates[0].markdown, /\*\*\{\{ 날짜 \}\}\*\*/);
  assert.doesNotMatch(templates[0].markdown, /05-25|06-01|06-08/);
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((note) => note.title)
  );
  const expanded = [...sources, note('Notebook/Archive/Two', body('06-15 월'))];
  const expandedTemplates = discoverTemplates(expanded, '날짜', ['Notebook']);
  assert.deepEqual(
    expandedTemplates.map((template) => template.name),
    ['Vertices / Edges', 'Vertices / Edges (2)']
  );
  assert.ok(expandedTemplates.every((template) => template.sourceTitles.length === 2));
  const [single] = discoverTemplates(sources.slice(0, 2), '날짜', ['Notebook']);
  assert.equal(single.name, 'Samples · Vertices / Edges');
  assert.equal(JSON.stringify(sources), before);
});

test('heading-driven discovery offers a usable common skeleton despite varying fields and tables', () => {
  const sources = [0, 1, 2].map((index) =>
    note(
      `Notebook/Plans/Note ${index}`,
      `<h2>Plan</h2><p>Owner ${index}: private person</p><h2>Steps</h2>` +
        `<table><tr><th>Task ${index}</th><th>Result ${index}</th></tr><tr><td>Private value ${index}</td><td>Confidential result</td></tr></table>` +
        (index === 1 ? '<h2>Appendix</h2><p>Historical detail</p>' : '')
    )
  );
  const before = JSON.stringify(sources);
  const templates = discoverTemplates(sources, 'Date', ['Notebook']);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Plans · Plan / Steps');
  assert.deepEqual(
    templates[0].sourceTitles,
    sources.map((note) => note.title)
  );
  assert.match(templates[0].markdown, /## Plan[\s\S]*## Steps/);
  assert.doesNotMatch(
    templates[0].markdown,
    /Owner|Task|Result|Private|Confidential|Historical|Appendix/
  );
  const filled = fillTemplate(templates[0].markdown, {
    title: 'New plan',
    Plan: 'Scope',
    Steps: 'Proceed',
  });
  assert.match(new markdownIt().render(filled), /<h2>Steps<\/h2>[\s\S]*Proceed/);
  assert.equal(JSON.stringify(sources), before);
});

test('topic notes share an outer outline despite many unique child headings and optional sections', () => {
  const renderer = new markdownIt();
  const sources = [
    ['Framework A', ['Concept', 'Version', 'Examples']],
    ['Framework B', ['Concept', 'Examples']],
    ['Language A', ['Concept', 'Version', 'Examples']],
    ['Database', ['Issues', 'Examples']],
    ['Language B', ['Concept', 'Version', 'Examples', 'Questions']],
  ].map(([title, headings], index) => ({
    title,
    description: renderer.render(
      headings
        .map(
          (heading) =>
            `## ${heading}\n\n` +
            Array.from(
              { length: index + 8 },
              (_, detail) =>
                `### ${title} ${heading} topic ${detail}\n\nPrivate explanation ${index}-${detail}\n\n` +
                '```markdown\n## Do not use this code heading\n```'
            ).join('\n\n')
        )
        .join('\n\n')
    ),
  }));
  const before = JSON.stringify(sources);
  const templates = discoverTemplates(sources, 'Date', []);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Concept / Version / Examples');
  assert.deepEqual(templates[0].sourceTitles, [
    'Framework A',
    'Framework B',
    'Language A',
    'Language B',
  ]);
  assert.equal(
    templates[0].markdown,
    '## Concept\n\n{{Concept}}\n\n## Version\n\n{{Version}}\n\n## Examples\n\n{{Examples}}'
  );
  assert.doesNotMatch(templates[0].markdown, /Questions|Issues|topic|Private|code heading/);
  const reversed = discoverTemplates([...sources].reverse(), 'Date', [])[0];
  assert.equal(reversed.markdown, templates[0].markdown);
  assert.equal(reversed.name, templates[0].name);
  const filled = fillTemplate(templates[0].markdown, {
    title: 'New topic',
    Concept: 'Overview',
    Version: 'Latest',
    Examples: 'Sample',
  });
  assert.match(renderer.render(filled), /<h2>Concept<\/h2>[\s\S]*<h2>Examples<\/h2>[\s\S]*Sample/);
  assert.doesNotMatch(renderer.render(filled), /<h1>|New topic/);
  assert.equal(JSON.stringify(sources), before);
});

test('repeated tables in one note or unrelated data documents do not produce templates', () => {
  const named =
    '<table><tr><th>Case</th><th>Result</th></tr><tr><td>A</td><td>Secret</td></tr></table>';
  assert.deepEqual(discoverTemplates([note('Only', named + named + named)]), []);
  const unnamed = '<table><tr><td>Value</td><td>Private</td></tr></table>';
  const sources = [
    note('One', '<h2>Unique plan</h2><h2>Schedule</h2>' + unnamed),
    note('Two', '<h2>Other review</h2><h2>Symmetry</h2>' + unnamed),
  ];
  assert.deepEqual(discoverTemplates(sources), []);
});

test('template names include retained headings at every level, excluding unique sections and deduplicating repeats', () => {
  const sources = [0, 1, 2].map((index) =>
    note(
      `문서 ${index}`,
      (index === 0 ? '<h2>개별 서문</h2>' : '') +
        `<h2>개념</h2><h3>개별 주제 ${index}</h3>` +
        (index < 2 ? '<h2>버전</h2>' : '') +
        '<h2>예제</h2><h3>세부 내용</h3><h4>실행 방법</h4><h2>예제</h2>'
    )
  );
  const [template] = discoverTemplates(sources, '날짜', []);
  assert.equal(template.name, '개념 / 버전 / 예제 / 세부 내용 / 실행 방법');
  assert.doesNotMatch(template.markdown, /개별 서문|개별 주제/);
  assert.match(template.markdown, /### 세부 내용/);
  assert.match(template.markdown, /#### 실행 방법/);
  assert.match(template.markdown, /\{\{예제 \(2\)\}\}/);
});

test('long common outlines retain their final child heading in the template name', () => {
  const sections = Array.from({ length: 8 }, (_, index) => `공통 상위 섹션 ${index}의 상세한 제목`);
  const body =
    sections.map((heading) => `<h2>${heading}</h2>`).join('') + '<h3>마지막 하위 헤더</h3>';
  const [template] = discoverTemplates([note('One', body), note('Two', body)], '날짜', []);
  assert.equal(template.name, [...sections, '마지막 하위 헤더'].join(' / '));
  assert.ok(template.name.length > 110);
});

test('title templates and note previews use only the separated top-level source group', () => {
  const { discoverTitleTemplates } = loadTs('titleTemplates.ts', {
    './template': loadTs('template.ts'),
    './titleGrouping': titleGrouping,
  });
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
  const sources = ['Samples', 'Archive'].flatMap((folder) =>
    [1, 2].map((index) => note(`${folder}/Shape sample ${index}`, body))
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
      [`${folder}/Shape sample {{ Number }}`]
    );
    assert.deepEqual(new Set(titles[0].sourceTitles), new Set(template.sourceTitles));
  }
});

test('automatic templates use the entire group and exclude minority sections beyond the first five notes', () => {
  const body = '<h2>Vertices</h2><h2>Edges</h2><h2>Faces</h2>';
  const sources = Array.from({ length: 8 }, (_, index) =>
    note('Folder/Note ' + index, body + (index < 2 ? '<h2>Occasional item</h2><p>secret</p>' : ''))
  );
  const [template] = discoverTemplates(sources);
  assert.equal(template.sourceTitles.length, 8);
  assert.match(template.markdown, /## Faces/);
  assert.doesNotMatch(template.markdown, /Occasional item|secret/);
  assert.deepEqual(template, discoverTemplates(sources)[0]);
});

test('discovery never offers a blank template for single notes or unrelated free-form prose', () => {
  assert.deepEqual(discoverTemplates([note('Only', '<h2>Vertices</h2><h2>Edges</h2>')]), []);
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
  const body = '<h2>Vertices</h2><h2>Edges</h2>';
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
    note('Shapes/One', '<h2>Vertices</h2><h2>Edges</h2>'),
    note('Shapes/Two', '<h2>Vertices</h2><h2>Edges</h2>'),
  ]);
  const current = [
    note('Other', '<p>Unrelated body</p>'),
    note('Shapes/Two', '<p>Changed body</p>'),
    note('Shapes/One', '<p>Current body</p>'),
  ];
  const related = templateNotes(template, current);
  assert.deepEqual(
    related.map((item) => item.title),
    ['Shapes/Two', 'Shapes/One']
  );
  assert.match(related[0].description, /Changed body/);
  assert.deepEqual(templateNotes(template, []), []);
  assert.deepEqual(
    templateNotes(template, current.slice(0, 2)).map((item) => item.title),
    ['Shapes/Two']
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
