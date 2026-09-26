const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-class-membership-'));
let findInstanceClassIds;
try {
  const source = readFileSync(path.join(__dirname, '../utils/classMembership.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'classMembership.js');
  writeFileSync(outputFile, compiled.outputText);
  ({ findInstanceClassIds } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const edge = (source, target, type) => ({ source, target, type });

test('lists only asserted classes directly assigned to an instance', () => {
  const edges = [
    edge('instance', 'class:status', 'INSTANCE_OF'),
    edge('instance', 'class:status', 'INSTANCE_OF'),
    edge('instance', 'class:inferred', 'INFERRED_INSTANCE_OF'),
    edge('class:status', 'class:board', 'SUBCLASS_OF'),
    edge('other', 'class:item', 'INSTANCE_OF'),
  ];

  assert.deepEqual(findInstanceClassIds('instance', edges), ['class:status']);
});
