const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-display-'));
let getKnowledgeGraphPalette;
let getKnowledgeGraphNodeDisplayLabel;
let getKnowledgeGraphNodeKindLabel;
let getKnowledgeGraphRelationDisplayLabel;
let getKnowledgeGraphRdfPredicate;
let summarizeKnowledgeGraphRelations;
try {
  for (const name of ['palette', 'baseRelations', 'inference', 'relations']) {
    const file =
      name === 'relations' || name === 'inference'
        ? path.join(__dirname, `${name}.ts`)
        : name === 'baseRelations'
        ? path.join(__dirname, '../utils/relations.ts')
        : path.join(__dirname, '../utils', `${name}.ts`);
    const source = readFileSync(file, 'utf8').replaceAll('../utils/relations', './baseRelations');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ getKnowledgeGraphPalette } = require(path.join(output, 'palette.js')));
  ({
    getKnowledgeGraphNodeDisplayLabel,
    getKnowledgeGraphNodeKindLabel,
    getKnowledgeGraphRelationDisplayLabel,
    getKnowledgeGraphRdfPredicate,
    summarizeKnowledgeGraphRelations,
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

test('one label mode changes node terms while preserving node names', () => {
  const topic = { name: '주제: 계획', role: 'CLASS' };
  const boardParagraph = { name: '진행', role: 'INSTANCE', instanceKind: 'BOARD_PARAGRAPH' };
  assert.equal(getKnowledgeGraphNodeDisplayLabel(topic, 'intuitive'), '주제: 계획');
  assert.equal(getKnowledgeGraphNodeDisplayLabel(topic, 'rdf'), 'owl:Class · 주제: 계획');
  assert.equal(
    getKnowledgeGraphNodeDisplayLabel(boardParagraph, 'rdf'),
    'bt:BoardParagraph · 진행'
  );
  assert.equal(boardParagraph.name, '진행');
  for (const kind of [
    'builtInClass',
    'boardClass',
    'extensionClass',
    'note',
    'boardNote',
    'boardParagraph',
    'card',
    'paragraph',
    'connectedParagraph',
    'externalLink',
    'connectedExternalLink',
    'literal',
  ]) {
    assert.doesNotMatch(
      getKnowledgeGraphNodeKindLabel(kind, 'intuitive', (key) => key),
      /class|instance/i
    );
  }
  assert.equal(
    getKnowledgeGraphNodeKindLabel('boardParagraph', 'rdf', (key) => key),
    'Instance (Board Paragraph)'
  );
  assert.equal(
    getKnowledgeGraphNodeDisplayLabel(
      { name: '문서', role: 'INSTANCE', instanceKind: 'CONNECTED_EXTERNAL_LINK' },
      'rdf'
    ),
    'bt:ConnectedExternalLink · 문서'
  );
});

test('relation view switches labels without changing RDF predicates or relation counts', () => {
  const translate = (key) =>
    ({
      'Card containment': '카드 소속',
      'Paragraph containment': '문단 소속',
      'Connected paragraph note containment': '연결 문단 노트 소속',
    }[key] || key);
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
      id: 'member',
      source: 'note',
      target: 'class',
      type: 'INSTANCE_OF',
      propertyLabel: 'instanceOf',
    },
    {
      id: 'inferred',
      source: 'card',
      target: 'class',
      type: 'INFERRED_INSTANCE_OF',
      propertyLabel: 'inferred instanceOf',
    },
    {
      id: 'data',
      source: 'note',
      target: 'literal',
      type: 'DATATYPE_PROPERTY',
      propertyLabel: 'hasSchedule',
    },
  ];
  assert.deepEqual(edges.map(getKnowledgeGraphRdfPredicate), [
    'dcterms:isPartOf',
    'dcterms:isPartOf',
    'rdf:type',
    'rdf:type',
    'bt:hasSchedule',
  ]);
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(edges[0], 'intuitive', translate),
    '카드 소속'
  );
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(edges[1], 'intuitive', translate),
    '문단 소속'
  );
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(edges[0], 'rdf', translate),
    'dcterms:isPartOf'
  );
  const connectedPartOf = { type: 'PART_OF', propertyLabel: 'connectedPartOf' };
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(connectedPartOf, 'intuitive', translate),
    '연결 문단 노트 소속'
  );
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(connectedPartOf, 'rdf', translate),
    'dcterms:isPartOf'
  );
  for (const edge of [
    edges[2],
    edges[3],
    { type: 'SUBCLASS_OF' },
    { type: 'INFERRED_SUBCLASS_OF' },
  ]) {
    assert.doesNotMatch(
      getKnowledgeGraphRelationDisplayLabel(edge, 'intuitive', translate),
      /class|instance/i
    );
  }
  assert.equal(
    getKnowledgeGraphRelationDisplayLabel(edges[4], 'intuitive', translate),
    'Schedule property'
  );
  const summaries = summarizeKnowledgeGraphRelations(edges);
  assert.equal(summaries.find((summary) => summary.label === 'hasSchedule')?.isDatatype, true);
  assert.ok(
    summaries.findIndex((summary) => summary.label === 'hasSchedule') <
      summaries.findIndex((summary) => summary.isInferred)
  );
  const partOfSummaries = summaries.filter((summary) => summary.baseType === 'PART_OF');
  assert.equal(partOfSummaries.length, 2);
  assert.ok(partOfSummaries.every((summary) => summary.count === 1));
  assert.ok(
    partOfSummaries.every(
      (summary) =>
        getKnowledgeGraphRelationDisplayLabel(
          { type: summary.type, propertyLabel: summary.label },
          'rdf',
          translate
        ) === 'dcterms:isPartOf'
    )
  );
  assert.equal(edges[0].propertyLabel, 'cardPartOf');
});
