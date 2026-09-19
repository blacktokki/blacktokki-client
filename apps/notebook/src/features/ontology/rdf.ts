import { getRelationType, isInferredRelationType } from './relations';
import { AxiomEvaluationResult, InferredOntologyEdge, OntologyEdge, OntologyNode } from './types';

const ONTOLOGY_NAMESPACE = 'urn:blacktokki:ontology:';
const RESOURCE_ROOT = 'urn:blacktokki:notebook:';

export interface OntologyRdfSource {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  datatypeNodes?: OntologyNode[];
  datatypeEdges?: OntologyEdge[];
  axioms: AxiomEvaluationResult;
}

export interface OntologyRdfOptions {
  scopeId: string | number;
  title?: string;
  baseIri?: string;
  includeInferred?: boolean;
}

const escapeLiteral = (value: unknown): string =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );

const literal = (value: unknown, datatype?: string): string =>
  `"${escapeLiteral(value)}"${datatype ? `^^${datatype}` : ''}`;

const assertAbsoluteIri = (value: string): string => {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) || /[\s<>"{}|^`\\]/.test(value)) {
    throw new Error(`Invalid absolute IRI: ${value}`);
  }
  return value;
};

const normalizeBaseIri = (options: OntologyRdfOptions): string => {
  const base = options.baseIri || `${RESOURCE_ROOT}${encodeURIComponent(String(options.scopeId))}:`;
  if (base.endsWith('/') || base.endsWith('#') || base.endsWith(':')) {
    return assertAbsoluteIri(base);
  }
  return assertAbsoluteIri(base.startsWith('urn:') ? `${base}:` : `${base}/`);
};

const iri = (value: string): string => `<${assertAbsoluteIri(value)}>`;

const localName = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `property_${cleaned}`;
};

const propertyLiteral = (key: string, value: string): string => {
  if (key === 'schedule' && isValidDate(value)) {
    return literal(value, 'xsd:date');
  }
  if (
    key === 'updated' &&
    /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  ) {
    return literal(value, 'xsd:dateTime');
  }
  return literal(value);
};

const isValidDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
};

const dataProperty = (key: string): string => {
  if (key === 'schedule') return 'bt:hasSchedule';
  if (key === 'updated') return 'dcterms:modified';
  return `bt:${localName(key)}`;
};

const relationPredicate = (edge: OntologyEdge): string => {
  if (edge.type === 'DATATYPE_PROPERTY') {
    return `bt:${localName(edge.propertyLabel || edge.label || 'hasValue')}`;
  }
  switch (getRelationType(edge.type)) {
    case 'INSTANCE_OF':
      return 'rdf:type';
    case 'SUBCLASS_OF':
      return 'rdfs:subClassOf';
    case 'REFERENCES':
      return 'dcterms:references';
    case 'PART_OF':
      return 'dcterms:isPartOf';
    default:
      return `bt:${localName(edge.type)}`;
  }
};

/** Serialize the current ontology snapshot as deterministic RDF 1.1 Turtle. */
export const serializeOntologyToTurtle = (
  source: OntologyRdfSource,
  options: OntologyRdfOptions
): string => {
  const baseIri = normalizeBaseIri(options);
  const separator = baseIri.endsWith(':') ? ':' : '/';
  const resourceIri = (kind: string, id: string | number) =>
    iri(`${baseIri}${kind}${separator}${encodeURIComponent(String(id))}`);
  const nodeIri = (id: string) => resourceIri('node', id);
  const edgeIri = (id: string) => resourceIri('edge', id);
  const triples = new Set<string>();
  const add = (subject: string, predicate: string, object: string) =>
    triples.add(`${subject} ${predicate} ${object} .`);

  const ontology = iri(baseIri);
  add(ontology, 'rdf:type', 'owl:Ontology');
  add(ontology, 'dcterms:title', literal(options.title || 'Blacktokki Notebook Ontology'));
  add(ontology, 'bt:formatVersion', literal('2'));
  add(ontology, 'dcterms:conformsTo', iri('https://www.w3.org/TR/rdf11-concepts/'));
  add(
    ontology,
    'bt:semanticProfile',
    literal(
      'RDF 1.1 application snapshot with RDFS entailment and selected OWL, SHACL, Dublin Core, and PROV-O vocabulary; not an OWL 2 DL conformance claim.'
    )
  );

  const schemaTriples: [string, string, string][] = [
    ['bt:KnowledgeItem', 'rdf:type', 'owl:Class'],
    ['bt:Note', 'rdf:type', 'owl:Class'],
    ['bt:Note', 'rdfs:subClassOf', 'bt:KnowledgeItem'],
    ['bt:Card', 'rdf:type', 'owl:Class'],
    ['bt:Card', 'rdfs:subClassOf', 'bt:KnowledgeItem'],
    ['bt:Paragraph', 'rdf:type', 'owl:Class'],
    ['bt:Paragraph', 'rdfs:subClassOf', 'bt:KnowledgeItem'],
    ['bt:ConnectedParagraph', 'rdf:type', 'owl:Class'],
    ['bt:ConnectedParagraph', 'rdfs:subClassOf', 'bt:Paragraph'],
    ['bt:TopicClass', 'rdf:type', 'owl:Class'],
    ['bt:AssertedRelation', 'rdf:type', 'owl:Class'],
    ['bt:AssertedRelation', 'rdfs:subClassOf', 'rdf:Statement'],
    ['bt:InferredRelation', 'rdf:type', 'owl:Class'],
    ['bt:InferredRelation', 'rdfs:subClassOf', 'rdf:Statement'],
    ['bt:Inference', 'rdf:type', 'owl:Class'],
    ['bt:Inference', 'rdfs:subClassOf', 'prov:Activity'],
    ['bt:InferenceRule', 'rdf:type', 'owl:Class'],
    ['bt:INSTANCE_INHERITANCE', 'rdf:type', 'bt:InferenceRule'],
    ['bt:SUBCLASS_TRANSITIVITY', 'rdf:type', 'bt:InferenceRule'],
    ['bt:ValidationResult', 'rdf:type', 'owl:Class'],
    ['bt:ValidationResult', 'rdfs:subClassOf', 'sh:ValidationResult'],
    ['bt:ConstraintType', 'rdf:type', 'owl:Class'],
    ['bt:REFERENTIAL_INTEGRITY', 'rdf:type', 'bt:ConstraintType'],
    ['bt:ISOLATED_ENTITY', 'rdf:type', 'bt:ConstraintType'],
    ['bt:hasSchedule', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:inferenceRule', 'rdf:type', 'owl:ObjectProperty'],
    ['bt:constraintType', 'rdf:type', 'owl:ObjectProperty'],
    ['bt:validationIssue', 'rdf:type', 'owl:ObjectProperty'],
    ['bt:affectedNode', 'rdf:type', 'owl:ObjectProperty'],
    ['bt:affectedEdge', 'rdf:type', 'owl:ObjectProperty'],
    ['bt:formatVersion', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:semanticProfile', 'rdf:type', 'owl:AnnotationProperty'],
    ['bt:isConsistent', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:hasErrors', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:hasWarnings', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:validationMode', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:entityRole', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:instanceKind', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:classKind', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:classCategory', 'rdf:type', 'owl:AnnotationProperty'],
    ['bt:ClassCategory', 'rdf:type', 'owl:Class'],
    ['bt:BUILT_IN', 'rdf:type', 'bt:ClassCategory'],
    ['bt:BOARD', 'rdf:type', 'bt:ClassCategory'],
    ['bt:TOPIC', 'rdf:type', 'bt:ClassCategory'],
    ['bt:boardTitle', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:level', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:path', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:autoSection', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:targetSection', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:severity', 'rdf:type', 'owl:DatatypeProperty'],
    ['bt:matchedLabel', 'rdf:type', 'owl:AnnotationProperty'],
  ];
  schemaTriples.forEach(([subject, predicate, object]) => add(subject, predicate, object));

  const allNodes = [...source.nodes, ...(source.datatypeNodes || [])];
  const nodeMap = new Map(allNodes.map((node) => [node.id, node]));

  for (const node of source.nodes) {
    const subject = nodeIri(node.id);
    add(subject, 'rdf:type', node.role === 'CLASS' ? 'owl:Class' : 'owl:NamedIndividual');
    add(subject, 'rdfs:label', literal(node.name));
    add(subject, 'dcterms:identifier', literal(node.id));
    add(subject, 'bt:entityRole', literal(node.role));
    if (node.instanceKind) {
      add(subject, 'bt:instanceKind', literal(node.instanceKind));
      const instanceType = {
        CARD: 'bt:Card',
        NOTE: 'bt:Note',
        PARAGRAPH: 'bt:Paragraph',
        CONNECTED_PARAGRAPH: 'bt:ConnectedParagraph',
      }[node.instanceKind];
      add(subject, 'rdf:type', instanceType);
    }
    if (node.classKind) add(subject, 'bt:classKind', literal(node.classKind));
    if (node.classCategory) add(subject, 'bt:classCategory', `bt:${node.classCategory}`);
    if (node.matchLabel) add(subject, 'bt:matchedLabel', literal(node.matchLabel));
    if (node.role === 'CLASS') {
      if (node.classKind === 'NOTE') add(subject, 'owl:equivalentClass', 'bt:Note');
      if (node.classKind === 'LINKED_PARAGRAPH') {
        add(subject, 'rdfs:subClassOf', 'bt:ConnectedParagraph');
      }
      if (node.classKind === 'BOARD_CARD' || node.classKind === 'BOARD_STATUS') {
        add(subject, 'rdfs:subClassOf', 'bt:Card');
      }
      if (node.classKind === 'TITLE_KEYWORD') {
        add(subject, 'rdf:type', 'bt:TopicClass');
        add(subject, 'rdfs:subClassOf', 'bt:KnowledgeItem');
      }
    }
    add(subject, 'dcterms:title', literal(node.name));
    if (node.boardTitle) add(subject, 'bt:boardTitle', literal(node.boardTitle));
    if (node.description) add(subject, 'dcterms:description', literal(node.description));

    if (node.paragraph) {
      add(subject, 'bt:level', literal(node.paragraph.level, 'xsd:integer'));
      add(subject, 'bt:path', literal(node.paragraph.path));
      if (node.paragraph.autoSection) {
        add(subject, 'bt:autoSection', literal(node.paragraph.autoSection));
      }
    }

    for (const key of ['schedule', 'updated'] as const) {
      const value = node.properties?.[key];
      if (typeof value === 'string' && value.length > 0) {
        add(subject, dataProperty(key), propertyLiteral(key, value));
      }
    }
  }

  const edgeObject = (edge: OntologyEdge): string | undefined => {
    const target = nodeMap.get(edge.target);
    if (edge.type !== 'DATATYPE_PROPERTY') return nodeIri(edge.target);
    if (!target) return undefined;
    const key = target.datatypeKey || edge.propertyLabel?.replace(/^has/, '').toLowerCase() || '';
    return propertyLiteral(key, target.literalValue ?? target.name);
  };

  const addStatement = (edge: OntologyEdge, origin: 'asserted' | 'inferred') => {
    const object = edgeObject(edge);
    if (!object) return;
    const subject = nodeIri(edge.source);
    const predicate = relationPredicate(edge);
    const statement = edgeIri(edge.id);
    add(subject, predicate, object);
    add(statement, 'rdf:type', 'rdf:Statement');
    add(statement, 'rdf:type', 'prov:Entity');
    add(
      statement,
      'rdf:type',
      origin === 'inferred' ? 'bt:InferredRelation' : 'bt:AssertedRelation'
    );
    add(statement, 'rdf:subject', subject);
    add(statement, 'rdf:predicate', predicate);
    add(statement, 'rdf:object', object);
    add(statement, 'dcterms:identifier', literal(edge.id));
    if (edge.targetSection) add(statement, 'bt:targetSection', literal(edge.targetSection));
  };

  const assertedEdges = [...source.edges, ...(source.datatypeEdges || [])].filter(
    (edge) => !isInferredRelationType(edge.type)
  );
  assertedEdges.forEach((edge) => addStatement(edge, 'asserted'));

  if (options.includeInferred !== false) {
    const inferredEdges = new Map(
      [...source.edges.filter(isInferredRdfEdge), ...source.axioms.inferredEdges].map((edge) => [
        edge.id,
        edge,
      ])
    );
    for (const edge of inferredEdges.values()) {
      addStatement(edge, 'inferred');
      const statement = edgeIri(edge.id);
      edge.inferences.forEach((inference, index) => {
        const proof = resourceIri('inference', `${edge.id}:${index}`);
        add(statement, 'prov:wasGeneratedBy', proof);
        add(proof, 'rdf:type', 'bt:Inference');
        add(proof, 'rdf:type', 'prov:Activity');
        add(proof, 'bt:inferenceRule', `bt:${inference.rule}`);
        inference.premiseEdgeIds.forEach((premise) => add(proof, 'prov:used', edgeIri(premise)));
      });
    }
  }

  const validationReport = resourceIri('validation', 'report');
  add(validationReport, 'rdf:type', 'sh:ValidationReport');
  add(
    validationReport,
    'sh:conforms',
    literal(source.axioms.violations.length === 0, 'xsd:boolean')
  );
  add(validationReport, 'bt:isConsistent', literal(source.axioms.isConsistent, 'xsd:boolean'));
  add(validationReport, 'bt:hasErrors', literal(source.axioms.hasErrors, 'xsd:boolean'));
  add(validationReport, 'bt:hasWarnings', literal(source.axioms.hasWarnings, 'xsd:boolean'));
  add(validationReport, 'bt:validationMode', literal('application-snapshot'));
  add(
    validationReport,
    'dcterms:description',
    literal(
      'Application validation snapshot. The included SHACL constraints replay exported bt:validationIssue markers and do not independently recompute notebook constraints.'
    )
  );

  const validationShapeDefinitions = new Map<
    string,
    { type: string; severity: 'error' | 'warning' }
  >();
  for (const violation of source.axioms.violations) {
    validationShapeDefinitions.set(`${violation.type}:${violation.severity}`, {
      type: violation.type,
      severity: violation.severity,
    });
  }
  for (const definition of validationShapeDefinitions.values()) {
    const shapeSuffix = `${localName(definition.type)}_${definition.severity}`;
    const sourceShape = `bt:${shapeSuffix}Shape`;
    const constraint = `bt:${shapeSuffix}Constraint`;
    add(sourceShape, 'rdf:type', 'sh:NodeShape');
    add(sourceShape, 'sh:targetSubjectsOf', 'bt:validationIssue');
    add(
      sourceShape,
      'sh:severity',
      definition.severity === 'error' ? 'sh:Violation' : 'sh:Warning'
    );
    add(sourceShape, 'sh:sparql', constraint);
    add(constraint, 'rdf:type', 'sh:SPARQLConstraint');
    add(
      constraint,
      'sh:message',
      literal(`Blacktokki ${definition.type} application validation issue.`)
    );
    add(
      constraint,
      'sh:select',
      literal(
        `PREFIX bt: <${ONTOLOGY_NAMESPACE}>\nSELECT $this\nWHERE {\n  $this bt:validationIssue ?issue .\n  ?issue bt:constraintType bt:${definition.type} ;\n    bt:severity "${definition.severity}" .\n}`
      )
    );
  }

  for (const violation of source.axioms.violations) {
    const focusNodeIds = violation.affectedNodeIds.length
      ? violation.affectedNodeIds
      : [`validation:${violation.id}`];
    focusNodeIds.forEach((id, index) => {
      const resultId = focusNodeIds.length === 1 ? violation.id : `${violation.id}:focus:${index}`;
      const subject = resourceIri('violation', resultId);
      const shapeSuffix = `${localName(violation.type)}_${violation.severity}`;
      const sourceShape = `bt:${shapeSuffix}Shape`;
      add(subject, 'rdf:type', 'bt:ValidationResult');
      add(subject, 'rdf:type', 'sh:ValidationResult');
      add(validationReport, 'sh:result', subject);
      add(
        subject,
        'sh:resultSeverity',
        violation.severity === 'error' ? 'sh:Violation' : 'sh:Warning'
      );
      add(subject, 'sh:resultMessage', literal(violation.message));
      add(subject, 'sh:sourceConstraintComponent', 'sh:SPARQLConstraintComponent');
      add(subject, 'sh:sourceShape', sourceShape);
      add(subject, 'bt:constraintType', `bt:${violation.type}`);
      add(subject, 'bt:severity', literal(violation.severity));
      add(subject, 'rdfs:comment', literal(violation.message));
      add(subject, 'bt:affectedNode', nodeIri(id));
      add(subject, 'sh:focusNode', nodeIri(id));
      add(nodeIri(id), 'bt:validationIssue', subject);
      violation.affectedEdgeIds?.forEach((edgeId) =>
        add(subject, 'bt:affectedEdge', edgeIri(edgeId))
      );
    });
  }

  const prefixes = [
    `@prefix bt: <${ONTOLOGY_NAMESPACE}> .`,
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix prov: <http://www.w3.org/ns/prov#> .',
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix sh: <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
  ];

  return `${prefixes.join('\n')}\n\n${Array.from(triples).sort().join('\n')}\n`;
};

export const isInferredRdfEdge = (edge: OntologyEdge): edge is InferredOntologyEdge =>
  isInferredRelationType(edge.type);

export { ONTOLOGY_NAMESPACE };
