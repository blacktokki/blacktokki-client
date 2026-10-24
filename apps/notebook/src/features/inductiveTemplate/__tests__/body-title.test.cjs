const assert = require('node:assert/strict');
const { test } = require('node:test');
const MarkdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const inference = loadTs('inference.ts');
const { discoverTemplates } = loadTs('discovery.ts', {
  './inference': inference,
  './titleGrouping': loadTs('titleGrouping.ts'),
});
const { fillNoteTemplate } = loadTs('template.ts');
const renderer = new MarkdownIt();
const body = '<h2>Vertices</h2><p>private</p><h2>Edges</h2><p>secret</p>';
const note = (name, title = '', level = 1) => ({
  title: 'Shapes/' + name,
  description: (title ? `<h${level}>${title}</h${level}>` : '') + body,
});
const render = (notes) => {
  const draft = inference.inferTemplate(notes);
  return inference.renderTemplate(draft, inference.commonBlockIds(draft));
};

test('title-less source bodies stay title-less in discovery, live preview and saved content', () => {
  const notes = [note('One'), note('Two')];
  const [template] = discoverTemplates(notes, 'Date', []);
  assert.ok(template);
  assert.doesNotMatch(template.markdown, /\{\{title\}\}/);
  const html = renderer.render(
    fillNoteTemplate(template.markdown, { Vertices: 'Discuss', Edges: 'Proceed' }, 'Shapes/New')
  );
  assert.match(html, /<h2>Vertices<\/h2>[\s\S]*Discuss[\s\S]*Proceed/);
  assert.doesNotMatch(html, /<h1>|New|private|secret/);
});

test('a supported source title is retained with its actual heading level and filled note name', () => {
  for (const level of [1, 2]) {
    const notes = [note('One', 'One', level), note('Two', 'Two', level)];
    notes[0].description =
      '<div class="yaml-frontmatter"><h1>ignored</h1></div><div>' + notes[0].description + '</div>';
    const markdown = render(notes);
    assert.ok(markdown.startsWith('#'.repeat(level) + ' {{title}}\n\n'));
    const html = renderer.render(fillNoteTemplate(markdown, {}, 'Shapes/[New]_note'));
    assert.ok(html.startsWith(`<h${level}>[New]_note</h${level}>`));
  }
});

test('a minority or duplicate source title does not invent a supported body title', () => {
  assert.doesNotMatch(render([note('One', 'One'), note('Two'), note('Three')]), /\{\{title\}\}/);
  assert.match(render([note('One', 'One'), note('Two', 'Two'), note('Three')]), /^# \{\{title\}\}/);
  assert.doesNotMatch(
    render([note('One', 'One'), note('Two', 'Two'), note('Three'), note('Four')]),
    /\{\{title\}\}/
  );
  assert.doesNotMatch(
    render([note('One', 'One'), note('One', 'One'), note('Two')]),
    /\{\{title\}\}/
  );
});

test('a shared fixed heading remains a section and is not converted to the note name', () => {
  const markdown = render([note('One', 'Overview'), note('Two', 'Overview')]);
  assert.match(markdown, /## Overview/);
  assert.doesNotMatch(markdown, /\{\{title\}\}/);
});

test('whole-note tables retain their source title and section context', () => {
  const table =
    '<table><tr><th>Topic</th><th>Result</th></tr><tr><td>Work</td><td>private</td></tr></table>';
  const notes = [note('One', 'One'), note('Two', 'Two')].map((source) => ({
    ...source,
    description: source.description + table,
  }));
  const markdown = render(notes);
  assert.match(markdown, /^# \{\{title\}\}/);
  assert.match(markdown, /## Vertices[\s\S]*## Edges[\s\S]*\| Topic \| Result \|/);
  assert.doesNotMatch(markdown, /private|secret/);
});

test('a matching name in a later heading or a table cannot become a leading title', () => {
  const notes = [note('One'), note('Two')].map((source) => ({
    ...source,
    description: source.description + `<h1>${source.title.split('/').at(-1)}</h1>`,
  }));
  assert.doesNotMatch(render(notes), /\{\{title\}\}/);
  const tableNotes = notes.map((source) => ({
    ...source,
    description:
      `<table><tr><td><h1>${source.title.split('/').at(-1)}</h1></td></tr></table>` + body,
  }));
  assert.doesNotMatch(render(tableNotes), /\{\{title\}\}/);
});
