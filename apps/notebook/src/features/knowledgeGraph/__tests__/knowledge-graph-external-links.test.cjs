const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-external-links-'));
let findConnectedExternalLinkIds;
try {
  const source = readFileSync(
    path.join(__dirname, '../utils/externalLinkClassification.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputFile = path.join(output, 'externalLinkClassification.js');
  writeFileSync(outputFile, compiled.outputText);
  ({ findConnectedExternalLinkIds } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const nodes = [
  { id: 'link:shared', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
  { id: 'link:ordinary', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
  { id: 'class:externalLink', role: 'CLASS', classKind: 'EXTERNAL_LINK' },
  { id: 'class:topic', role: 'CLASS', classKind: 'TITLE_KEYWORD' },
  { id: 'note:one', role: 'INSTANCE', instanceKind: 'NOTE' },
  { id: 'note:two', role: 'INSTANCE', instanceKind: 'NOTE' },
];
const edge = (source, target, type) => ({ source, target, type });

test('source count alone leaves external links ordinary', () => {
  const edges = [
    edge('note:one', 'link:shared', 'EXTERNAL_REFERENCE'),
    edge('note:two', 'link:shared', 'EXTERNAL_REFERENCE'),
    edge('link:shared', 'class:externalLink', 'INSTANCE_OF'),
    edge('link:ordinary', 'class:externalLink', 'INSTANCE_OF'),
  ];
  assert.deepEqual(findConnectedExternalLinkIds(nodes, edges, 'class:externalLink'), []);
});

test('topic membership or another relation marks only its external-link endpoint connected', () => {
  const edges = [
    edge('note:one', 'link:shared', 'EXTERNAL_REFERENCE'),
    edge('link:shared', 'class:externalLink', 'INSTANCE_OF'),
    edge('link:shared', 'class:topic', 'INSTANCE_OF'),
    edge('note:two', 'link:ordinary', 'EXTERNAL_REFERENCE'),
    edge('link:ordinary', 'class:externalLink', 'INSTANCE_OF'),
  ];
  assert.deepEqual(findConnectedExternalLinkIds(nodes, edges, 'class:externalLink'), [
    'link:shared',
  ]);
  assert.deepEqual(
    findConnectedExternalLinkIds(
      nodes,
      [...edges, edge('note:two', 'link:ordinary', 'REFERENCES')],
      'class:externalLink'
    ),
    ['link:ordinary', 'link:shared']
  );
});
