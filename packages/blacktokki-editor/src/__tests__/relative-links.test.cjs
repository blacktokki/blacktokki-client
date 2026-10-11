const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const domino = require('@mixmark-io/domino');
const ts = require('typescript');

const refs = [];
let refIndex = 0;
const react = {
  createElement: (type, props) => ({ type, props }),
  useRef: (value) => (refs[refIndex++] ||= { current: value }),
};
const compiled = ts.transpileModule(
  readFileSync(path.join(__dirname, '../lib/TinymceWeb.tsx'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }
).outputText;
const moduleExports = {};
compileFunction(compiled, ['exports', 'require'])(moduleExports, (request) => {
  if (request === 'react') return react;
  if (request === '@tinymce/tinymce-react') return { Editor: 'editor' };
  if (request === './dom') return { cleanId: (text) => text };
  if (request === './markdown') return { renderer: () => '', parser: () => '' };
  throw new Error('Unexpected dependency ' + request);
});
const previousDocument = global.document;
test.before(() => {
  global.document = domino.createWindow('').document;
});
test.after(() => {
  global.document = previousDocument;
});
const render = (props) => {
  refIndex = 0;
  return moduleExports.default({
    theme: 'light',
    value: '',
    onReady: () => {},
    setValue: () => {},
    ...props,
  }).props;
};

test('viewer clicks use raw hrefs and the latest source callback after a rerender', () => {
  refs.length = 0;
  const calls = [];
  const first = render({
    readonly: true,
    onPress: () => {},
    onLink: (url) => calls.push(['first', url]),
  });
  let click;
  first.init.init_instance_callback({
    mode: { set: () => {} },
    getWin: () => ({
      addEventListener: (type, callback) => {
        if (type === 'click') click = callback;
      },
    }),
    on: () => {},
  });
  const document = domino.createWindow(
    '<a href="../../target.md?section=parent#part"><span>target</span></a>',
    'https://app.test/blacktokki-notebook/NotePage'
  ).document;
  const press = () =>
    click({
      target: document.querySelector('span'),
      preventDefault: () => {},
      stopPropagation: () => {},
    });
  press();
  render({ readonly: true, onPress: () => {}, onLink: (url) => calls.push(['second', url]) });
  press();
  assert.deepEqual(calls, [
    ['first', '../../target.md?section=parent#part'],
    ['second', '../../target.md?section=parent#part'],
  ]);
});
