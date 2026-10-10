/* eslint @typescript-eslint/consistent-type-assertions: "off" */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const ts = require('typescript');

let paragraphReads = 0;
const dependencies = {
  '@blacktokki/account': {},
  react: {},
  '@blacktokki/editor': {
    cleanHtml: (html) => html.replace(/<a[^>]*>.*?<\/a>/g, ''),
    toRaw: (html) => html.replace(/<[^>]*>/g, ''),
    findLists: () => [],
  },
  '../../components/HeaderSelectBar': {
    parseHtmlToParagraphs: (html) => {
      paragraphReads++;
      return [
        { title: '', path: '', level: 0, description: html },
        ...[...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => ({
          title: m[1],
          path: btoa(m[1]),
          level: 3,
          description: 'body',
        })),
      ];
    },
    paragraphDescription: () => 'body',
    base64Decode: atob,
    paragraphByKey: (paragraph, key) =>
      paragraph.title === key.paragraph && key.section === undefined,
  },
  '../../components/SearchBar': {
    getLinks: (pages) =>
      pages.flatMap((page) =>
        (page.links ?? []).map((link) => ({
          type: '_NOTELINK',
          origin: page.title,
          name: link.title,
          ...link,
        }))
      ),
    titleFormat: (link) => link.title + (link.paragraph ? ' ▶ ' + link.paragraph : ''),
  },
  '../../hooks/useNoteStorage': {
    getSplitTitle: (title) =>
      title.includes('/')
        ? [title.slice(0, title.lastIndexOf('/')), title.slice(title.lastIndexOf('/') + 1)]
        : [title],
  },
  '../../hooks/useBoardStorage': {},
  '../../hooks/useUsageMode': {},
};
const code = ts.transpileModule(readFileSync(path.join(__dirname, '../useProblem.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const fixture = { exports: {} };
compileFunction(code, ['require', 'module', 'exports'])(
  (name) => dependencies[name] ?? {},
  fixture,
  fixture.exports
);
const { getData, getValidationData } = fixture.exports;
const note = (title, links = [], description = 'body') => ({
  title,
  links,
  description,
  updated: '2026-01-01',
  id: title,
});
const validationProjection = (records) =>
  records
    .flatMap((record) =>
      record.subtitles
        .filter((subtitle) =>
          /^(Unknown note link|Unknown paragraph link|Empty parent note|Isolated note)/.test(
            subtitle
          )
        )
        .map((subtitle) => [record.title, subtitle])
    )
    .sort();

test('graph validation preserves matrix reference and isolation results including missing and empty targets', () => {
  const pages = [
    note('source', [
      { title: 'target', paragraph: 'valid' },
      { title: 'target', paragraph: 'missing' },
      { title: 'empty' },
      { title: 'absent' },
      { title: 'absent' },
      { title: 'Board' },
    ]),
    note('target', [], '<h3>valid</h3><p>body</p>'),
    note('empty', [], ''),
    note('missing/child', [{ title: 'missing' }]),
    note('empty/child'),
    note('Board/child'),
    note('isolated'),
    note('self', [{ title: 'self', paragraph: 'unknown' }]),
  ];
  const boards = [{ title: 'Board' }];
  assert.deepEqual(
    validationProjection(getValidationData(pages, boards)),
    validationProjection(getData(0, 110, pages, boards))
  );
});

test('only explicitly linked target paragraphs are parsed once per target', () => {
  paragraphReads = 0;
  const pages = Array.from({ length: 500 }, (_, i) => note('note' + i));
  pages.push(
    note('source', [
      { title: 'target', paragraph: 'valid' },
      { title: 'target', paragraph: 'missing' },
    ])
  );
  pages.push(note('target', [], '<h3>valid</h3><p>body</p>'));
  getValidationData(pages, []);
  assert.equal(paragraphReads, 1);
});
