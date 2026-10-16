const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-display-'));
let getKnowledgeGraphPalette;
let getKnowledgeGraphNodeKindLabel;
let getKnowledgeGraphRelationDisplayLabel;
let summarizeKnowledgeGraphRelations;
let visibleKnowledgeGraphEdges;
try {
  for (const name of ['palette', 'relations']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ getKnowledgeGraphPalette } = require(path.join(output, 'palette.js')));
  ({
    getKnowledgeGraphNodeKindLabel,
    getKnowledgeGraphRelationDisplayLabel,
    summarizeKnowledgeGraphRelations,
    visibleKnowledgeGraphEdges,
  } = require(path.join(output, 'relations.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const span = max - min;
  const raw = max === r ? (g - b) / span : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return (raw * 60 + 360) % 360;
};

test('class, note, and paragraph families have distinguishable hues in both themes', () => {
  for (const isDark of [false, true]) {
    const palette = getKnowledgeGraphPalette(isDark);
    for (const family of [
      ['builtInClass', 'boardClass'],
      ['note', 'boardNote'],
      ['card', 'paragraph', 'boardParagraph', 'connectedParagraph'],
    ]) {
      for (let i = 0; i < family.length; i++) {
        for (let j = i + 1; j < family.length; j++) {
          const difference = Math.abs(hue(palette[family[i]].fill) - hue(palette[family[j]].fill));
          assert.ok(
            Math.min(difference, 360 - difference) >= 40,
            `${isDark ? 'dark' : 'light'}: ${family[i]} and ${family[j]} are too similar`
          );
        }
      }
    }
    assert.deepEqual(palette.boardParagraph, palette.boardNote);
  }
});

test('graph labels use readable category and relation names', () => {
  const translate = (key) =>
    ({
      'Board paragraph': '보드 문단',
      'Note Mode': '노트 모드',
      Notebook: '노트북',
      'Card containment': '카드 소속',
      'Paragraph containment': '문단 소속',
      'Paragraph note containment': '문단 노트 소속',
    }[key] || key);
  assert.equal(getKnowledgeGraphNodeKindLabel('boardParagraph', translate), '보드 문단');
  assert.equal(getKnowledgeGraphNodeKindLabel('builtInClass', translate, 'NOTE'), '노트 모드');
  assert.equal(getKnowledgeGraphNodeKindLabel('builtInClass', translate, 'NOTEBOOK'), '노트북');

  const edges = [
    {
      id: 'card',
      source: 'card',
      target: 'paragraph',
      type: 'PART_OF',
      propertyLabel: 'cardPartOf',
    },
    {
      id: 'paragraph',
      source: 'paragraph',
      target: 'note',
      type: 'PART_OF',
      propertyLabel: 'paragraphPartOf',
    },
    {
      id: 'connected',
      source: 'paragraph',
      target: 'note',
      type: 'PART_OF',
      propertyLabel: 'connectedPartOf',
    },
    { id: 'member', source: 'note', target: 'class', type: 'INSTANCE_OF' },
  ];
  assert.equal(getKnowledgeGraphRelationDisplayLabel(edges[0], translate), '카드 소속');
  assert.equal(getKnowledgeGraphRelationDisplayLabel(edges[1], translate), '문단 소속');
  assert.equal(getKnowledgeGraphRelationDisplayLabel(edges[2], translate), '문단 노트 소속');
  assert.doesNotMatch(
    getKnowledgeGraphRelationDisplayLabel(edges[3], translate),
    /class|instance/i
  );
  const summaries = summarizeKnowledgeGraphRelations(edges);
  assert.equal(summaries.filter((summary) => summary.type === 'PART_OF').length, 3);
  assert.equal(edges[0].propertyLabel, 'cardPartOf');
});

test('paragraph visibility swaps direct note containment for hierarchy without losing sources or other relations', () => {
  const nodes = [
    { id: 'note', instanceKind: 'NOTE', noteTitle: 'Document' },
    { id: 'other-note', instanceKind: 'NOTE', noteTitle: 'Other' },
    { id: 'parent', instanceKind: 'PARAGRAPH', noteTitle: 'Document' },
    { id: 'nested', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    { id: 'top', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    { id: 'keyword-source', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    {
      id: 'shared',
      instanceKind: 'BOARD_PARAGRAPH',
      noteTitle: 'Document',
      paragraphOccurrences: [{ origin: 'Document' }, { origin: 'Other' }],
    },
    { id: 'card', instanceKind: 'CARD', noteTitle: 'Document' },
  ];
  const part = (id, source, target, propertyLabel = 'paragraphPartOf') => ({
    id,
    source,
    target,
    type: 'PART_OF',
    propertyLabel,
    color: '#B7950B',
  });
  const edges = [
    part('parent-hierarchy', 'parent', 'note'),
    part('nested-hierarchy', 'nested', 'parent'),
    part('nested-note', 'nested', 'note', 'connectedPartOf'),
    part('top-hierarchy', 'top', 'note'),
    part('keyword-hierarchy', 'keyword-source', 'parent'),
    part('shared-first', 'shared', 'note'),
    part('shared-other', 'shared', 'other-note'),
    part('card-parent', 'card', 'shared', 'cardPartOf'),
    { id: 'reference', source: 'note', target: 'nested', type: 'REFERENCES' },
  ];
  const before = structuredClone({ nodes, edges });
  const collapsed = visibleKnowledgeGraphEdges(
    nodes.filter((node) => node.id !== 'parent'),
    edges,
    false
  );
  assert.ok(collapsed.every((edge) => edge.source !== 'parent' && edge.target !== 'parent'));
  assert.ok(!collapsed.some((edge) => edge.propertyLabel === 'paragraphPartOf'));
  const direct = collapsed.filter((edge) => edge.propertyLabel === 'connectedPartOf');
  assert.deepEqual(
    new Set(direct.map((edge) => `${edge.source}:${edge.target}`)),
    new Set(['nested:note', 'top:note', 'keyword-source:note', 'shared:note', 'shared:other-note'])
  );
  assert.equal(direct.length, 5, 'an existing direct edge must not be duplicated');
  assert.ok(direct.every((edge) => edge.color === '#B7950B'));
  const expanded = visibleKnowledgeGraphEdges(nodes, edges, true);
  assert.ok(!expanded.some((edge) => edge.propertyLabel === 'connectedPartOf'));
  assert.equal(expanded.filter((edge) => edge.propertyLabel === 'paragraphPartOf').length, 6);
  assert.deepEqual(
    summarizeKnowledgeGraphRelations(collapsed)
      .filter((summary) => ['connectedPartOf', 'paragraphPartOf'].includes(summary.label))
      .map((summary) => summary.label),
    ['connectedPartOf']
  );
  assert.deepEqual(
    summarizeKnowledgeGraphRelations(expanded)
      .filter((summary) => ['connectedPartOf', 'paragraphPartOf'].includes(summary.label))
      .map((summary) => summary.label),
    ['paragraphPartOf']
  );
  for (const result of [collapsed, expanded]) {
    assert.ok(result.some((edge) => edge.id === 'card-parent'));
    assert.ok(result.some((edge) => edge.id === 'reference'));
  }
  assert.deepEqual({ nodes, edges }, before);
});
