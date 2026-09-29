const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-literal-canvas-'));
let findNodeAtScreenCoord;
try {
  for (const [name, file] of [
    ['relations', '../utils/relations.ts'],
    ['inference', 'inference.ts'],
    ['owlRelations', 'relations.ts'],
    ['canvasRenderer', '../utils/canvasRenderer.ts'],
  ]) {
    const source = readFileSync(path.join(__dirname, file), 'utf8')
      .replaceAll('../utils/relations', './relations')
      .replaceAll('../owlrdf/relations', './owlRelations')
      .replaceAll('../owlrdf/inference', './inference');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ findNodeAtScreenCoord } = require(path.join(output, 'canvasRenderer.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

test('rectangular RDF literal nodes use width and height for hit testing', () => {
  const nodes = [
    {
      id: 'node:literal',
      name: 'Literal Value',
      role: 'LITERAL',
      x: 500,
      y: 500,
      width: 60,
      height: 24,
      radius: 10,
    },
  ];

  assert.equal(findNodeAtScreenCoord(nodes, 500, 500, 0, 0, 1)?.id, 'node:literal');
  assert.equal(findNodeAtScreenCoord(nodes, 533, 514, 0, 0, 1)?.id, 'node:literal');
  assert.equal(findNodeAtScreenCoord(nodes, 550, 500, 0, 0, 1), null);
});
