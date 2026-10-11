const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const domino = require('@mixmark-io/domino');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../../../..');
const compile = (source, bindings = {}) => {
  const exports = {};
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  compileFunction(js, ['exports', ...Object.keys(bindings)])(exports, ...Object.values(bindings));
  return exports;
};
const { extractHtmlLinks } = compile(
  readFileSync(path.join(root, 'packages/blacktokki-editor/src/lib/dom.ts'), 'utf8')
);
const source = ts.createSourceFile(
  'SearchBar.tsx',
  readFileSync(path.join(__dirname, '../SearchBar.tsx'), 'utf8'),
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX
);
const names = ['toNoteParams', 'urlToNoteLink', 'onLink', 'getLinks'];
const functions = source.statements
  .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
  .map((node) => node.getText(source));
const keywordHandler = source.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) => declaration.name.getText() === 'useOnPressKeyword'
    )
);
const pushes = [];
const navigation = {
  push: (...args) => pushes.push(args),
  getState: () => ({ index: 0, routes: [{ params: { title: 'unrelated/route' } }] }),
};
const { urlToNoteLink, onLink, getLinks, useOnPressKeyword } = compile(
  [
    ...functions,
    keywordHandler.getText(source),
    'exports.useOnPressKeyword = useOnPressKeyword;',
  ].join('\n'),
  {
    extractHtmlLinks,
    useNavigation: () => navigation,
    useAddKeyowrd: () => ({ mutate: () => {} }),
    useCallback: (callback) => callback,
  }
);

const previousLocation = global.location;
const previousDOMParser = global.DOMParser;
const previousWindow = global.window;
const opened = [];
test.before(() => {
  global.location = {
    origin: 'https://notebook.test',
    href: 'https://notebook.test/blacktokki-notebook/NotePage?title=unrelated%2Froute',
  };
  global.DOMParser = class {
    parseFromString(html) {
      return domino.createWindow(html, global.location.href).document;
    }
  };
  global.window = { open: (...args) => opened.push(args) };
});
test.after(() => {
  global.location = previousLocation;
  global.DOMParser = previousDOMParser;
  global.window = previousWindow;
});

test('resolves ancestors and siblings from the source note instead of the app route', () => {
  assert.deepEqual(urlToNoteLink('../../Root%20%23%20%5B1%5D.md', 'Root # [1]/folder/source'), {
    title: 'Root # [1]',
  });
  assert.deepEqual(urlToNoteLink('./sibling.markdown', 'folder/source'), {
    title: 'folder/sibling',
  });
  assert.deepEqual(urlToNoteLink('/root.MD', 'folder/source'), { title: 'root' });
});

test('preserves encoded titles, paragraphs, and section discriminators', () => {
  for (const title of ['문서 # [1]', 'résumé 日本語', '100% complete']) {
    assert.deepEqual(
      urlToNoteLink(encodeURIComponent(title) + '.md?section=parent#part%20%231', 'folder/source'),
      { title: 'folder/' + title, paragraph: 'part #1', section: 'parent' }
    );
  }
});

test('resolves same-document fragments using the displayed note', () => {
  assert.deepEqual(urlToNoteLink('#part%20one', 'folder/source'), {
    title: 'folder/source',
    paragraph: 'part one',
  });
});

test('keeps legacy title-query links and external Markdown URLs distinct', () => {
  assert.deepEqual(
    urlToNoteLink('?title=legacy%2Ftarget&paragraph=part&section=parent', 'source'),
    { title: 'legacy/target', paragraph: 'part', section: 'parent' }
  );
  for (const url of [
    'https://external.test/target.md',
    '//external.test/target.md',
    'mailto:a@test.md',
  ]) {
    assert.equal(urlToNoteLink(url, 'folder/source'), undefined);
  }
});

test('malformed links do not abort scanning subsequent links', () => {
  for (const url of ['%E0%A4%A.md', 'target.md#%E0%A4%A', '?title=target#%E0%A4%A', 'http://[']) {
    assert.equal(urlToNoteLink(url, 'folder/source'), undefined);
  }
  const links = getLinks(
    [
      {
        title: 'folder/source',
        description: '<a href="%E0%A4%A.md">broken</a><a href="valid.md">valid</a>',
      },
    ],
    true
  );
  assert.equal(links[1].title, 'folder/valid');
});

test('search and backlink analysis use raw hrefs and each source folder', () => {
  const html = '<a href="../target.md?section=parent#part">linked name</a>';
  const [extracted] = extractHtmlLinks(html);
  assert.notEqual(extracted.url, extracted.rawUrl);
  assert.deepEqual(
    getLinks(
      [
        { title: 'one/nested/source', description: html },
        { title: 'two/nested/source', description: html },
      ],
      true
    ),
    ['one', 'two'].map((folder) => ({
      type: '_NOTELINK',
      name: 'linked name',
      title: folder + '/target',
      paragraph: 'part',
      section: 'parent',
      origin: folder + '/nested/source',
    }))
  );
});

test('click navigation uses an explicit source title and retains all target parameters', () => {
  pushes.length = 0;
  onLink('../target.md?section=parent#part', navigation, 'folder/nested/source');
  assert.deepEqual(pushes, [
    ['NotePage', { title: 'folder/target', paragraph: 'part', section: 'parent' }],
  ]);
});

test('click navigation retains the current-route fallback and opens external URLs', () => {
  pushes.length = 0;
  opened.length = 0;
  onLink('sibling.md', navigation);
  onLink('https://external.test/target.md', navigation, 'folder/source');
  assert.deepEqual(pushes, [['NotePage', { title: 'unrelated/sibling' }]]);
  assert.deepEqual(opened, [['https://external.test/target.md', '_blank']]);
});

test('selecting an internal search result preserves its section', () => {
  pushes.length = 0;
  useOnPressKeyword({})({
    type: '_NOTELINK',
    name: 'link',
    title: 'folder/target',
    paragraph: 'part',
    section: 'parent',
  });
  assert.deepEqual(pushes, [
    ['NotePage', { title: 'folder/target', paragraph: 'part', section: 'parent' }],
  ]);
});
