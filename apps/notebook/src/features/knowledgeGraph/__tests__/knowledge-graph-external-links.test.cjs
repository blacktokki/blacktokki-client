const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-external-links-'));
let findConnectedExternalLinkIds;
let shouldHideExternalLinkClass;
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
  ({ findConnectedExternalLinkIds, shouldHideExternalLinkClass } = require(outputFile));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const nodes = [
  { id: 'link:shared', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
  { id: 'link:ordinary', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
  { id: 'class:externalLink', role: 'CLASS', classKind: 'EXTERNAL_LINK' },
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

test('an additional relation marks only its external-link endpoint connected', () => {
  const edges = [
    edge('note:one', 'link:shared', 'EXTERNAL_REFERENCE'),
    edge('link:shared', 'class:externalLink', 'INSTANCE_OF'),
    edge('link:shared', 'note:one', 'REFERENCES'),
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

test('shouldHideExternalLinkClass hides external link class when no connected links exist and ordinary links are turned off or absent', () => {
  const onlyOrdinaryNodes = [
    { id: 'link:1', role: 'INSTANCE', instanceKind: 'EXTERNAL_LINK' },
    { id: 'class:externalLink', role: 'CLASS', classKind: 'EXTERNAL_LINK' },
  ];
  const withConnectedNodes = [
    { id: 'link:1', role: 'INSTANCE', instanceKind: 'CONNECTED_EXTERNAL_LINK' },
    { id: 'class:externalLink', role: 'CLASS', classKind: 'EXTERNAL_LINK' },
  ];
  const noLinkNodes = [
    { id: 'note:1', role: 'INSTANCE', instanceKind: 'NOTE' },
    { id: 'class:externalLink', role: 'CLASS', classKind: 'EXTERNAL_LINK' },
  ];

  // 1. Only ordinary links exist, view toggle is off -> should hide
  assert.equal(shouldHideExternalLinkClass(onlyOrdinaryNodes, false), true);

  // 2. Only ordinary links exist, view toggle is on -> should NOT hide
  assert.equal(shouldHideExternalLinkClass(onlyOrdinaryNodes, true), false);

  // 3. Connected links exist, view toggle is off -> should NOT hide
  assert.equal(shouldHideExternalLinkClass(withConnectedNodes, false), false);

  // 4. Connected links exist, view toggle is on -> should NOT hide
  assert.equal(shouldHideExternalLinkClass(withConnectedNodes, true), false);

  // 5. No link nodes exist at all, view toggle is off -> should hide
  assert.equal(shouldHideExternalLinkClass(noLinkNodes, false), true);

  // 6. No link nodes exist at all, view toggle is on -> should hide (since there are no ordinary links)
  assert.equal(shouldHideExternalLinkClass(noLinkNodes, true), true);
});
