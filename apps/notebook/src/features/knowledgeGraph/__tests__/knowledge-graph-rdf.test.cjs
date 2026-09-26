const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { Parser } = require('n3');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-rdf-'));
let serializeOntologyToTurtle;
try {
  for (const name of ['relations', 'rdf']) {
    const source = readFileSync(path.join(__dirname, '../utils', `${name}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ serializeOntologyToTurtle } = require(path.join(output, 'rdf.js')));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const node = (id, overrides = {}) => ({
  id,
  name: id,
  noteTitle: id,
  role: 'INSTANCE',
  type: 'INSTANCE',
  properties: {},
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 8,
  color: '#000000',
  ...overrides,
});
const edge = (id, source, target, type, overrides = {}) => ({
  id,
  source,
  target,
  type,
  ...overrides,
});

const source = {
  nodes: [
    node('class:project', {
      name: '프로젝트 "A"',
      noteTitle: '프로젝트 A',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'TITLE_KEYWORD',
      classCategory: 'TOPIC',
      matchLabel: '프로젝트',
    }),
    node('class:topic-root', {
      name: '주제: 프로젝트',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'TITLE_KEYWORD',
      classCategory: 'TOPIC',
    }),
    node('class:note', {
      name: '노트',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'NOTE',
      classCategory: 'BUILT_IN',
    }),
    node('class:board', {
      name: '프로젝트 보드',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'BOARD_CARD',
      classCategory: 'BOARD',
    }),
    node('paragraph:board', {
      name: '백엔드',
      noteTitle: '프로젝트 A/할 일',
      boardTitle: '프로젝트 A',
      instanceKind: 'BOARD_PARAGRAPH',
      paragraphOccurrences: [
        { origin: '프로젝트 A/할 일', title: '백엔드', level: 2, path: 'first/path' },
        { origin: '프로젝트 A/완료', title: '백엔드', level: 2, path: 'second/path' },
      ],
    }),
    node('class:external-link', {
      name: '외부 링크',
      role: 'CLASS',
      type: 'CLASS',
      classKind: 'EXTERNAL_LINK',
      classCategory: 'BUILT_IN',
    }),
    node('external:1', {
      name: '프로젝트 문서',
      noteTitle: '프로젝트 문서',
      description: 'https://example.com/docs',
      instanceKind: 'CONNECTED_EXTERNAL_LINK',
    }),
    node('card:1', {
      name: '작업\n1',
      noteTitle: '프로젝트 A/할 일',
      boardTitle: '프로젝트 A',
      instanceKind: 'CARD',
      paragraph: {
        title: '작업\n1',
        level: 3,
        path: 'card/path',
        autoSection: '진행',
      },
      properties: {
        schedule: '2026-09-17',
        updated: '2026-09-17T10:20:30.000Z',
        sections: [{ title: '상세', level: 4, path: 'path/value', autoSection: '상위' }],
      },
    }),
    node('note:1', { name: '참조 노트', instanceKind: 'NOTE' }),
    node('paragraph:connected', {
      name: '연결 문단',
      noteTitle: '참조 노트',
      instanceKind: 'CONNECTED_PARAGRAPH',
    }),
  ],
  edges: [
    edge('instance', 'card:1', 'class:project', 'INSTANCE_OF'),
    edge('board-paragraph-type', 'paragraph:board', 'class:board', 'INSTANCE_OF'),
    edge('subclass', 'class:project', 'class:topic-root', 'SUBCLASS_OF'),
    edge('external-instance', 'external:1', 'class:external-link', 'INSTANCE_OF'),
    edge('external-topic', 'external:1', 'class:project', 'INSTANCE_OF'),
    edge('external-reference', 'card:1', 'external:1', 'EXTERNAL_REFERENCE'),
    edge('represented', 'class:board', 'note:1', 'REPRESENTED_BY_NOTE', {
      propertyType: 'annotation',
      propertyLabel: 'representedByNote',
    }),
    edge('board-paragraph-parent', 'card:1', 'paragraph:board', 'PART_OF', {
      propertyLabel: 'cardPartOf',
    }),
    edge('reference', 'card:1', 'note:1', 'REFERENCES', { targetSection: '두 번째' }),
  ],
  datatypeNodes: [
    node('literal:schedule', {
      name: '2026-09-17',
      noteTitle: '2026-09-17',
      role: 'LITERAL',
      type: 'LITERAL',
      datatypeKey: 'schedule',
      literalValue: '2026-09-17',
    }),
  ],
  datatypeEdges: [
    edge('schedule', 'card:1', 'literal:schedule', 'DATATYPE_PROPERTY', {
      propertyLabel: 'hasSchedule',
    }),
  ],
  axioms: {
    isConsistent: true,
    hasErrors: false,
    hasWarnings: true,
    violations: [
      {
        id: 'broken:1',
        type: 'REFERENTIAL_INTEGRITY',
        severity: 'warning',
        message: '깨진 "링크"',
        affectedNodeIds: ['card:1'],
        affectedEdgeIds: ['reference'],
      },
    ],
    inferredEdges: [
      edge('inferred:1', 'card:1', 'class:topic-root', 'INFERRED_INSTANCE_OF', {
        inferences: [
          {
            rule: 'INSTANCE_INHERITANCE',
            premiseEdgeIds: ['instance', 'subclass'],
          },
        ],
      }),
    ],
  },
};

test('produces Turtle accepted by a standards-compliant RDF parser', () => {
  const turtle = serializeOntologyToTurtle(source, { scopeId: 'scope' });
  const quads = new Parser({ format: 'text/turtle' }).parse(turtle);
  assert.ok(quads.length > 0);
});

test('serializes ontology entities, standard predicates and typed data values', () => {
  const turtle = serializeOntologyToTurtle(source, {
    scopeId: 'local:1/지식',
    title: '지식 그래프',
  });
  assert.match(turtle, /@prefix rdf:/);
  assert.match(turtle, /@prefix bt: <urn:blacktokki:ontology:>/);
  assert.doesNotMatch(turtle, /blacktokki\.github\.io/);
  assert.doesNotMatch(turtle, /bt:includesName/);
  assert.match(turtle, /:node:class%3Aproject> rdf:type owl:Class/);
  assert.match(turtle, /:node:class%3Aproject> rdf:type bt:TopicClass/);
  assert.match(turtle, /:node:class%3Aproject> bt:classKind "TITLE_KEYWORD"/);
  assert.match(turtle, /:node:class%3Aproject> bt:classCategory bt:TOPIC/);
  assert.match(turtle, /:node:class%3Aproject> rdfs:subClassOf bt:KnowledgeItem/);
  assert.doesNotMatch(turtle, /EXTERNAL_TOPIC|class%3Alink-project/);
  assert.doesNotMatch(turtle, /:node:class%3Aproject> rdfs:subClassOf bt:Topic/);
  assert.doesNotMatch(turtle, /bt:TopicClass rdfs:subClassOf rdfs:Class/);
  assert.match(turtle, /dcterms:conformsTo <https:\/\/www\.w3\.org\/TR\/rdf11-concepts\/>/);
  assert.match(turtle, /bt:semanticProfile "RDF 1\.1 application snapshot/);
  assert.match(turtle, /:node:class%3Anote> owl:equivalentClass bt:Note/);
  assert.match(turtle, /:node:class%3Aboard> rdfs:subClassOf bt:KnowledgeItem/);
  assert.match(turtle, /bt:BoardParagraph rdfs:subClassOf bt:Paragraph/);
  assert.match(turtle, /:node:paragraph%3Aboard> rdf:type bt:BoardParagraph/);
  assert.match(turtle, /:node:paragraph%3Aboard> rdf:type <[^>]+:node:class%3Aboard>/);
  assert.match(turtle, /:node:paragraph%3Aboard> prov:wasDerivedFrom <[^>]+:paragraphOccurrence:/);
  assert.match(turtle, /bt:sourceNoteTitle "프로젝트 A\/완료"/);
  assert.match(turtle, /:node:class%3Aexternal-link> owl:equivalentClass bt:ExternalLink/);
  assert.match(turtle, /bt:ConnectedExternalLink rdfs:subClassOf bt:ExternalLink/);
  assert.match(turtle, /:node:external%3A1> rdf:type bt:ConnectedExternalLink/);
  assert.match(turtle, /:node:external%3A1> rdf:type <[^>]+:node:class%3Aproject>/);
  assert.match(turtle, /:node:card%3A1> bt:externalReference <[^>]+:node:external%3A1>/);
  assert.match(turtle, /bt:externalReference rdfs:subPropertyOf dcterms:references/);
  assert.match(turtle, /:node:external%3A1> rdfs:seeAlso <https:\/\/example\.com\/docs>/);
  assert.match(turtle, /:node:card%3A1> rdf:type owl:NamedIndividual/);
  assert.match(turtle, /:node:card%3A1> rdf:type <[^>]+:node:class%3Aproject>/);
  assert.match(turtle, /bt:Note rdfs:subClassOf bt:KnowledgeItem/);
  assert.match(turtle, /bt:ConnectedParagraph rdfs:subClassOf bt:Paragraph/);
  assert.match(turtle, /:node:paragraph%3Aconnected> rdf:type bt:ConnectedParagraph/);
  assert.match(turtle, /:node:card%3A1> dcterms:references <[^>]+:node:note%3A1>/);
  assert.match(turtle, /bt:representedByNote rdf:type owl:AnnotationProperty/);
  assert.match(turtle, /bt:representedByNote rdfs:subPropertyOf rdfs:seeAlso/);
  assert.match(turtle, /:node:class%3Aboard> bt:representedByNote <[^>]+:node:note%3A1>/);
  assert.match(turtle, /:node:card%3A1> dcterms:isPartOf <[^>]+:node:paragraph%3Aboard>/);
  assert.doesNotMatch(turtle, /:node:class%3Aboard> rdfs:subClassOf <[^>]+:node:note%3A1>/);
  assert.doesNotMatch(turtle, /:node:note%3A1> rdf:type <[^>]+:node:class%3Aboard>/);
  assert.match(turtle, /:edge:reference> bt:targetSection "두 번째"/);
  assert.doesNotMatch(turtle, /dcterms:requires/);
  assert.match(turtle, /bt:hasSchedule "2026-09-17"\^\^xsd:date/);
  assert.match(turtle, /dcterms:modified "2026-09-17T10:20:30\.000Z"\^\^xsd:dateTime/);
  assert.match(turtle, /:node:card%3A1> dcterms:title "작업\\n1"/);
  assert.doesNotMatch(turtle, /:node:card%3A1> dcterms:title "프로젝트 A\/할 일"/);
  assert.match(turtle, /:node:card%3A1> bt:level "3"\^\^xsd:integer/);
  assert.match(turtle, /:node:card%3A1> bt:path "card\/path"/);
  assert.match(turtle, /:node:card%3A1> bt:autoSection "진행"/);
  assert.doesNotMatch(turtle, /rdf:type bt:Section/);
  assert.doesNotMatch(turtle, /:section:/);
  assert.match(turtle, /"프로젝트 \\"A\\""/);
  assert.match(turtle, /bt:matchedLabel "프로젝트"/);
  assert.match(turtle, /"작업\\n1"/);
});

test('does not export the removed related-note compatibility vocabulary', () => {
  const turtle = serializeOntologyToTurtle(source, { scopeId: 'scope' });
  assert.doesNotMatch(turtle, /bt:relatedNote/);
  assert.doesNotMatch(turtle, /owl:sameAs/);
});

test('reifies asserted and logical inferred relations with inference provenance', () => {
  const turtle = serializeOntologyToTurtle(source, { scopeId: 'scope' });
  assert.match(turtle, /:edge:reference> rdf:type bt:AssertedRelation/);
  assert.match(turtle, /:edge:inferred%3A1> rdf:type bt:InferredRelation/);
  assert.match(turtle, /:node:card%3A1> rdf:type <[^>]+:node:class%3Atopic-root>/);
  assert.match(turtle, /bt:inferenceRule bt:INSTANCE_INHERITANCE/);
  assert.match(turtle, /prov:wasGeneratedBy <[^>]+:inference:inferred%3A1%3A0>/);
  assert.match(turtle, /prov:used <[^>]+:edge:instance>/);
});

test('does not export heuristic recommendation triples', () => {
  const turtle = serializeOntologyToTurtle(source, { scopeId: 'scope' });
  assert.doesNotMatch(turtle, /bt:RecommendedRelation/);
  assert.doesNotMatch(turtle, /bt:recommendationRule/);
  assert.doesNotMatch(turtle, /bt:CLASS_NAME_NOTE_MATCH/);
});

test('exports validation results and their affected resources', () => {
  const turtle = serializeOntologyToTurtle(source, { scopeId: 'scope' });
  assert.match(turtle, /rdf:type bt:ValidationResult/);
  assert.match(turtle, /rdf:type sh:ValidationReport/);
  assert.match(turtle, /sh:conforms "false"\^\^xsd:boolean/);
  assert.match(turtle, /bt:isConsistent "true"\^\^xsd:boolean/);
  assert.match(turtle, /bt:hasErrors "false"\^\^xsd:boolean/);
  assert.match(turtle, /bt:hasWarnings "true"\^\^xsd:boolean/);
  assert.match(turtle, /bt:validationMode "application-snapshot"/);
  assert.match(turtle, /Application validation snapshot/);
  assert.match(turtle, /sh:resultSeverity sh:Warning/);
  assert.match(turtle, /sh:sourceConstraintComponent sh:SPARQLConstraintComponent/);
  assert.match(turtle, /sh:sourceShape bt:REFERENTIAL_INTEGRITY_warningShape/);
  assert.match(turtle, /bt:REFERENTIAL_INTEGRITY_warningShape rdf:type sh:NodeShape/);
  assert.match(turtle, /sh:targetSubjectsOf bt:validationIssue/);
  assert.match(turtle, /sh:sparql bt:REFERENTIAL_INTEGRITY_warningConstraint/);
  assert.match(turtle, /bt:REFERENTIAL_INTEGRITY_warningConstraint rdf:type sh:SPARQLConstraint/);
  assert.match(turtle, /sh:select "PREFIX bt:/);
  assert.doesNotMatch(turtle, /rdf:type sh:ConstraintComponent/);
  assert.match(turtle, /bt:constraintType bt:REFERENTIAL_INTEGRITY/);
  assert.match(turtle, /rdfs:comment "깨진 \\"링크\\""/);
  assert.match(turtle, /bt:affectedNode <[^>]+:node:card%3A1>/);
  assert.match(turtle, /bt:affectedEdge <[^>]+:edge:reference>/);
  assert.match(turtle, /:node:card%3A1> bt:validationIssue <[^>]+:violation:broken%3A1>/);
});

test('emits one SHACL validation result per focus node', () => {
  const multipleFocusSource = {
    ...source,
    axioms: {
      ...source.axioms,
      violations: [
        {
          ...source.axioms.violations[0],
          affectedNodeIds: ['card:1', 'note:1'],
        },
      ],
    },
  };
  const turtle = serializeOntologyToTurtle(multipleFocusSource, { scopeId: 'scope' });
  const quads = new Parser({ format: 'text/turtle' }).parse(turtle);
  const validationResultType = 'http://www.w3.org/ns/shacl#ValidationResult';
  const focusPredicate = 'http://www.w3.org/ns/shacl#focusNode';
  const results = quads
    .filter(
      (quad) =>
        quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        quad.object.value === validationResultType
    )
    .map((quad) => quad.subject.value);

  assert.equal(results.length, 2);
  for (const result of results) {
    assert.equal(
      quads.filter(
        (quad) => quad.subject.value === result && quad.predicate.value === focusPredicate
      ).length,
      1
    );
  }
});

test('can omit derived triples and stays deterministic', () => {
  const options = { scopeId: 'scope', includeInferred: false };
  const first = serializeOntologyToTurtle(source, options);
  const second = serializeOntologyToTurtle(source, options);
  assert.equal(first, second);
  assert.doesNotMatch(first, /rdf:type bt:InferredRelation/);
  assert.doesNotMatch(first, /bt:inferenceRule bt:/);
  assert.doesNotMatch(first, /rdf:type bt:RecommendedRelation/);
  assert.doesNotMatch(first, /bt:recommendationRule bt:/);
  assert.doesNotMatch(first, /:node:card%3A1> bt:relatedNote/);
});

test('does not assign XSD date types to invalid lexical dates', () => {
  const invalidDateSource = {
    ...source,
    nodes: source.nodes.map((item) =>
      item.id === 'card:1'
        ? { ...item, properties: { ...item.properties, schedule: '2026-99-99' } }
        : item
    ),
  };
  const turtle = serializeOntologyToTurtle(invalidDateSource, { scopeId: 'scope' });
  assert.match(turtle, /bt:hasSchedule "2026-99-99"/);
  assert.doesNotMatch(turtle, /"2026-99-99"\^\^xsd:date/);
});

test('rejects a non-absolute or unsafe custom base IRI', () => {
  assert.throws(
    () => serializeOntologyToTurtle(source, { scopeId: 'scope', baseIri: 'relative/path' }),
    /Invalid absolute IRI/
  );
  assert.throws(
    () => serializeOntologyToTurtle(source, { scopeId: 'scope', baseIri: 'https://bad iri/' }),
    /Invalid absolute IRI/
  );
});
