const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-class-inheritance-'));
let findDirectClassIds;
let findDirectSubclassIds;
try {
  const source = readFileSync(
    path.join(__dirname, '../classInheritance.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'classInheritance.js');
  writeFileSync(outputFile, compiled.outputText);
  ({ findDirectClassIds, findDirectSubclassIds } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const edge = (source, target, type) => ({ source, target, type });

test('lists only classes directly assigned to an instance', () => {
  const edges = [
    edge('instance', 'class:status', 'INSTANCE_OF'),
    edge('class:status', 'class:board', 'SUBCLASS_OF'),
    edge('class:board', 'class:item', 'SUBCLASS_OF'),
  ];

  assert.deepEqual(findDirectClassIds('instance', edges), ['class:status']);
});

test('lists only the direct parent classes of a class', () => {
  const edges = [
    edge('class:child', 'class:parent', 'SUBCLASS_OF'),
    edge('class:parent', 'class:root', 'SUBCLASS_OF'),
    edge('class:child', 'class:parent', 'SUBCLASS_OF'),
    edge('class:child', 'class:inferred', 'INFERRED_SUBCLASS_OF'),
  ];

  assert.deepEqual(findDirectClassIds('class:child', edges), ['class:parent']);
  assert.deepEqual(findDirectClassIds('class:root', edges), []);
});

test('lists only classes that directly inherit from a selected parent class', () => {
  const edges = [
    edge('class:child-a', 'class:parent', 'SUBCLASS_OF'),
    edge('class:child-b', 'class:parent', 'SUBCLASS_OF'),
    edge('class:grandchild', 'class:child-a', 'SUBCLASS_OF'),
    edge('class:inferred', 'class:parent', 'INFERRED_SUBCLASS_OF'),
  ];

  assert.deepEqual(findDirectSubclassIds('class:parent', edges), [
    'class:child-a',
    'class:child-b',
  ]);
  assert.deepEqual(findDirectSubclassIds('class:child-b', edges), []);
});
