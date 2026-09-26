import { getOntologyRdfPredicate, isInferredRelationType } from './relations';
import { InferredOntologyEdge, OntologyEdge, OntologyGraphData } from '../types';

const ONTOLOGY_NAMESPACE = 'urn:blacktokki:ontology:';
const RESOURCE_ROOT = 'urn:blacktokki:notebook:';

export type OntologyRdfSource = OntologyGraphData;

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

  const schemaTypes: Record<string, string[]> = {
    'owl:Class': [
      'KnowledgeItem',
      'Note',
      'Card',
      'Paragraph',
      'BoardParagraph',
      'ParagraphOccurrence',
      'ConnectedParagraph',
      'ExternalLink',
      'ConnectedExternalLink',
      'TopicClass',
      'AssertedRelation',
      'InferredRelation',
      'Inference',
      'InferenceRule',
      'ValidationResult',
      'ConstraintType',
      'ClassCategory',
    ],
    'bt:InferenceRule': ['INSTANCE_INHERITANCE', 'SUBCLASS_TRANSITIVITY'],
    'bt:ConstraintType': ['REFERENTIAL_INTEGRITY', 'ISOLATED_ENTITY'],
    'bt:ClassCategory': ['BUILT_IN', 'BOARD', 'TOPIC'],
    'owl:DatatypeProperty': [
      'hasSchedule',
      'sourceNoteTitle',
      'formatVersion',
      'isConsistent',
      'hasErrors',
      'hasWarnings',
      'validationMode',
      'entityRole',
      'instanceKind',
      'classKind',
      'boardTitle',
      'level',
      'path',
      'autoSection',
      'targetSection',
      'severity',
    ],
    'owl:AnnotationProperty': [
      'representedByNote',
      'semanticProfile',
      'classCategory',
      'matchedLabel',
    ],
    'owl:ObjectProperty': [
      'externalReference',
      'inferenceRule',
      'constraintType',
      'validationIssue',
      'affectedNode',
      'affectedEdge',
    ],
  };
  for (const [type, names] of Object.entries(schemaTypes)) {
    names.forEach((name) => add(`bt:${name}`, 'rdf:type', type));
  }
  const subclassParents: Record<string, string[]> = {
    'bt:KnowledgeItem': ['Note', 'Card', 'Paragraph', 'ExternalLink'],
    'bt:Paragraph': ['BoardParagraph', 'ConnectedParagraph'],
    'prov:Entity': ['ParagraphOccurrence'],
    'bt:ExternalLink': ['ConnectedExternalLink'],
    'rdf:Statement': ['AssertedRelation', 'InferredRelation'],
    'prov:Activity': ['Inference'],
    'sh:ValidationResult': ['ValidationResult'],
  };
  for (const [parent, names] of Object.entries(subclassParents)) {
    names.forEach((name) => add(`bt:${name}`, 'rdfs:subClassOf', parent));
  }
  add('bt:representedByNote', 'rdfs:subPropertyOf', 'rdfs:seeAlso');
  add('bt:externalReference', 'rdfs:subPropertyOf', 'dcterms:references');

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
        BOARD_PARAGRAPH: 'bt:BoardParagraph',
        CONNECTED_PARAGRAPH: 'bt:ConnectedParagraph',
        EXTERNAL_LINK: 'bt:ExternalLink',
        CONNECTED_EXTERNAL_LINK: 'bt:ConnectedExternalLink',
      }[node.instanceKind];
      add(subject, 'rdf:type', instanceType);
    }
    if (node.classKind) add(subject, 'bt:classKind', literal(node.classKind));
    if (node.classCategory) add(subject, 'bt:classCategory', `bt:${node.classCategory}`);
    if (node.matchLabel) add(subject, 'bt:matchedLabel', literal(node.matchLabel));
    if (node.role === 'CLASS') {
      if (node.classKind === 'NOTE') add(subject, 'owl:equivalentClass', 'bt:Note');
      if (node.classKind === 'EXTERNAL_LINK')
        add(subject, 'owl:equivalentClass', 'bt:ExternalLink');
      if (node.classKind === 'BOARD_CARD') {
        add(subject, 'rdfs:subClassOf', 'bt:KnowledgeItem');
      }
      if (node.classKind === 'TITLE_KEYWORD') {
        add(subject, 'rdf:type', 'bt:TopicClass');
        add(subject, 'rdfs:subClassOf', 'bt:KnowledgeItem');
      }
    }
    add(subject, 'dcterms:title', literal(node.name));
    if (node.boardTitle) add(subject, 'bt:boardTitle', literal(node.boardTitle));
    if (node.description) add(subject, 'dcterms:description', literal(node.description));
    if (
      (node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK') &&
      node.description
    ) {
      try {
        const url = new URL(
          node.description.startsWith('//') ? `https:${node.description}` : node.description
        );
        if (['http:', 'https:', 'ftp:', 'mailto:'].includes(url.protocol)) {
          add(subject, 'rdfs:seeAlso', iri(url.href));
        }
      } catch {
        // Keep the displayed URL as a description if it is not a valid absolute IRI.
      }
    }

    if (node.paragraph && node.instanceKind !== 'BOARD_PARAGRAPH') {
      add(subject, 'bt:level', literal(node.paragraph.level, 'xsd:integer'));
      add(subject, 'bt:path', literal(node.paragraph.path));
      if (node.paragraph.autoSection) {
        add(subject, 'bt:autoSection', literal(node.paragraph.autoSection));
      }
    }
    if (node.instanceKind === 'BOARD_PARAGRAPH') {
      for (const occurrence of node.paragraphOccurrences || []) {
        const occurrenceIri = resourceIri(
          'paragraphOccurrence',
          `${node.id}:${occurrence.origin || ''}:${occurrence.path}:${occurrence.autoSection || ''}`
        );
        add(subject, 'prov:wasDerivedFrom', occurrenceIri);
        add(occurrenceIri, 'rdf:type', 'bt:ParagraphOccurrence');
        add(occurrenceIri, 'bt:sourceNoteTitle', literal(occurrence.origin || ''));
        add(occurrenceIri, 'bt:level', literal(occurrence.level, 'xsd:integer'));
        add(occurrenceIri, 'bt:path', literal(occurrence.path));
        if (occurrence.autoSection) {
          add(occurrenceIri, 'bt:autoSection', literal(occurrence.autoSection));
        }
      }
    }

    for (const [key, rawVal] of Object.entries(node.properties || {})) {
      if (rawVal === undefined || rawVal === null) continue;
      const value = typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal);
      if (value.length > 0) {
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
    const predicate = getOntologyRdfPredicate(edge);
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

  const validationShapes = new Map(
    source.axioms.violations.map((violation) => [
      `${violation.type}:${violation.severity}`,
      violation,
    ])
  );
  for (const { type, severity } of validationShapes.values()) {
    const shapeSuffix = `${localName(type)}_${severity}`;
    const sourceShape = `bt:${shapeSuffix}Shape`;
    const constraint = `bt:${shapeSuffix}Constraint`;
    add(sourceShape, 'rdf:type', 'sh:NodeShape');
    add(sourceShape, 'sh:targetSubjectsOf', 'bt:validationIssue');
    add(sourceShape, 'sh:severity', severity === 'error' ? 'sh:Violation' : 'sh:Warning');
    add(sourceShape, 'sh:sparql', constraint);
    add(constraint, 'rdf:type', 'sh:SPARQLConstraint');
    add(constraint, 'sh:message', literal(`Blacktokki ${type} application validation issue.`));
    add(
      constraint,
      'sh:select',
      literal(
        `PREFIX bt: <${ONTOLOGY_NAMESPACE}>\nSELECT $this\nWHERE {\n  $this bt:validationIssue ?issue .\n  ?issue bt:constraintType bt:${type} ;\n    bt:severity "${severity}" .\n}`
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
