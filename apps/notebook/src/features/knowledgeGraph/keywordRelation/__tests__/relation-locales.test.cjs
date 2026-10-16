const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const loadTs = require('./loadTs.cjs');
const root = path.resolve(__dirname, '..');
const ko = JSON.parse(readFileSync(path.resolve(root, '../../../lang/ko.json'), 'utf8'));

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? entry.name === '__tests__'
        ? []
        : sources(filename)
      : /\.tsx?$/.test(entry.name)
      ? [filename]
      : [];
  });
}

test('compact UI uses existing translations and never substitutes translated tooltips for labels', () => {
  const keys = new Set();
  for (const filename of [
    ...sources(root),
    path.resolve(root, '../components/KnowledgeGraphNavToolbar.tsx'),
  ]) {
    const source = readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /\bTooltip\b/, filename);
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const collect = (node) => {
      if (ts.isStringLiteral(node)) keys.add(node.text);
      else if (ts.isConditionalExpression(node)) {
        collect(node.whenTrue);
        collect(node.whenFalse);
      } else if (ts.isJsxExpression(node) && node.expression) collect(node.expression);
    };
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 'lang') {
        if (node.arguments[0]) collect(node.arguments[0]);
      }
      if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'label' && node.initializer) {
        collect(node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  const { relationSourceTypeLabels } = loadTs('relationFilters.ts');
  Object.values(relationSourceTypeLabels).forEach((key) => keys.add(key));
  const { relationEntityTypeLabels } = loadTs('relationFilters.ts');
  Object.values(relationEntityTypeLabels).forEach((key) => keys.add(key));
  const { relationAnalysisDisplay } = loadTs('relationStatus.ts');
  for (const status of [
    'idle',
    'running',
    'ready',
    'stopping',
    'cancelled',
    'completed',
    'failed',
  ]) {
    for (const phase of ['keywords', 'embedding', 'merge', 'validation', 'retry']) {
      for (const prepareOnly of [true, false]) {
        const display = relationAnalysisDisplay({
          status,
          phase,
          prepareOnly,
          total: 1,
          processed: 0,
        });
        keys.add(display.statusLabel);
        keys.add(display.phaseLabel);
      }
    }
  }
  for (const key of keys) assert.ok(Object.hasOwn(ko, key), `Missing translation: ${key}`);
});
