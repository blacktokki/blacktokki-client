import type { getOntologyPalette } from './palette';
import {
  InferableRelationType,
  InferredRelationType,
  OntologyEdge,
  OntologyNode,
  OntologyRelationType,
} from '../types';

export const INFERRED_RELATIONS = {
  INFERRED_INSTANCE_OF: { relation: 'INSTANCE_OF', label: 'inferred instanceOf' },
  INFERRED_SUBCLASS_OF: { relation: 'SUBCLASS_OF', label: 'inferred subClassOf' },
} as const satisfies Record<
  InferredRelationType,
  { relation: InferableRelationType; label: string }
>;

export const isInferredRelationType = (type: OntologyRelationType): type is InferredRelationType =>
  Object.prototype.hasOwnProperty.call(INFERRED_RELATIONS, type);

/** Return the asserted predicate represented by an inferred relation. */
export const getRelationType = (type: OntologyRelationType) => {
  if (isInferredRelationType(type)) return INFERRED_RELATIONS[type].relation;
  return type;
};

export type OntologyRelationLabelMode = 'intuitive' | 'rdf';

export type OntologyNodeKindLabel = keyof ReturnType<typeof getOntologyPalette>;

const INSTANCE_NODE_KINDS: Partial<
  Record<NonNullable<OntologyNode['instanceKind']>, OntologyNodeKindLabel>
> = {
  CARD: 'card',
  BOARD_PARAGRAPH: 'boardParagraph',
  PARAGRAPH: 'paragraph',
  CONNECTED_PARAGRAPH: 'connectedParagraph',
  EXTERNAL_LINK: 'externalLink',
  CONNECTED_EXTERNAL_LINK: 'connectedExternalLink',
};

/** Use one classification for the legend, detail badge, and palette. */
export const getOntologyNodeKind = (node: OntologyNode): OntologyNodeKindLabel => {
  if (node.role === 'CLASS') {
    return node.classCategory === 'BOARD'
      ? 'boardClass'
      : node.classCategory === 'TOPIC'
      ? 'topicClass'
      : 'builtInClass';
  }
  if (node.role === 'LITERAL') return 'literal';
  if (node.instanceKind === 'NOTE') return node.boardTitle ? 'boardNote' : 'note';
  return INSTANCE_NODE_KINDS[node.instanceKind || 'CARD'] || 'card';
};

/** Human-facing category names for the legend and node detail badge. */
export const getOntologyNodeKindLabel = (
  kind: OntologyNodeKindLabel,
  mode: OntologyRelationLabelMode,
  translate: (key: string) => string
): string => {
  const labels: Record<OntologyNodeKindLabel, [string, string]> = {
    builtInClass: ['Built-in category', 'Built-in Class'],
    boardClass: ['Board category', 'Board Class'],
    topicClass: ['Topic category', 'Topic Class'],
    note: ['Note', 'Instance (Note)'],
    boardNote: ['Board note', 'Instance (Board Note)'],
    boardParagraph: ['Board paragraph', 'Instance (Board Paragraph)'],
    card: ['Card paragraph', 'Instance (Card Paragraph)'],
    paragraph: ['Paragraph', 'Instance (Paragraph)'],
    connectedParagraph: ['Connected paragraph', 'Instance (Connected Paragraph)'],
    externalLink: ['External link', 'Instance (External Link)'],
    connectedExternalLink: ['Connected external link', 'Instance (Connected External Link)'],
    literal: ['Property value', 'Literal'],
  };
  return translate(labels[kind][mode === 'rdf' ? 1 : 0]);
};

/** Canvas-only node labels; RDF identifiers and exported rdfs:label remain unchanged. */
export const getOntologyNodeDisplayLabel = (
  node: Pick<OntologyNode, 'name' | 'role' | 'instanceKind'>,
  mode: OntologyRelationLabelMode
): string => {
  if (mode === 'intuitive') return node.name;
  if (node.role === 'CLASS') return `owl:Class · ${node.name}`;
  if (node.role === 'LITERAL') return `rdfs:Literal · ${node.name}`;
  const type = {
    CARD: 'bt:Card',
    NOTE: 'bt:Note',
    PARAGRAPH: 'bt:Paragraph',
    BOARD_PARAGRAPH: 'bt:BoardParagraph',
    CONNECTED_PARAGRAPH: 'bt:ConnectedParagraph',
    EXTERNAL_LINK: 'bt:ExternalLink',
    CONNECTED_EXTERNAL_LINK: 'bt:ConnectedExternalLink',
  }[node.instanceKind || 'NOTE'];
  return `${type} · ${node.name}`;
};

const rdfLocalName = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `property_${cleaned}`;
};

/** The predicate emitted for an asserted or inferred edge in the Turtle export. */
export const getOntologyRdfPredicate = (
  edge: Pick<OntologyEdge, 'type' | 'propertyLabel' | 'label'>
): string => {
  if (edge.type === 'DATATYPE_PROPERTY') {
    return `bt:${rdfLocalName(edge.propertyLabel || edge.label || 'hasValue')}`;
  }
  switch (getRelationType(edge.type)) {
    case 'INSTANCE_OF':
      return 'rdf:type';
    case 'SUBCLASS_OF':
      return 'rdfs:subClassOf';
    case 'REPRESENTED_BY_NOTE':
      return 'bt:representedByNote';
    case 'REFERENCES':
      return 'dcterms:references';
    case 'EXTERNAL_REFERENCE':
      return 'bt:externalReference';
    case 'PART_OF':
      return 'dcterms:isPartOf';
    default:
      return `bt:${rdfLocalName(edge.type)}`;
  }
};

/** Display-only labels; the edges and their exported RDF predicates stay unchanged. */
export const getOntologyRelationDisplayLabel = (
  edge: Pick<OntologyEdge, 'type' | 'propertyLabel' | 'label'>,
  mode: OntologyRelationLabelMode,
  translate: (key: string) => string
): string => {
  if (mode === 'rdf') return getOntologyRdfPredicate(edge);
  if (edge.type === 'INFERRED_INSTANCE_OF') return translate('Inferred category');
  if (edge.type === 'INFERRED_SUBCLASS_OF') return translate('Inferred subcategory');
  switch (edge.type) {
    case 'INSTANCE_OF':
      return translate('Category');
    case 'SUBCLASS_OF':
      return translate('Subcategory');
    case 'REPRESENTED_BY_NOTE':
      return translate('Corresponding note');
    case 'REFERENCES':
      return translate('Reference');
    case 'EXTERNAL_REFERENCE':
      return translate('External link relation');
    case 'PART_OF':
      switch (edge.propertyLabel) {
        case 'notePartOf':
          return translate('Note containment');
        case 'cardPartOf':
          return translate('Card containment');
        case 'paragraphPartOf':
          return translate('Paragraph containment');
        case 'connectedPartOf':
          return translate('Connected paragraph note containment');
        default:
          return translate('Containment');
      }
    case 'DATATYPE_PROPERTY': {
      if (edge.propertyLabel === 'hasSchedule') return translate('Schedule property');
      const key = edge.propertyLabel || edge.label || 'value';
      const name = key
        .replace(/^has(?=[A-Z])/, '')
        .replace(/^./, (character) => character.toLowerCase());
      return `${translate('Property')}: ${name}`;
    }
    default:
      return edge.propertyLabel || edge.label || edge.type;
  }
};

export interface OntologyRelationSummary {
  key: string;
  label: string;
  type: OntologyRelationType;
  baseType: OntologyRelationType;
  count: number;
  dashed: boolean;
  isInferred: boolean;
  isDatatype: boolean;
}

const DEFAULT_RELATION_LABELS: Partial<Record<OntologyRelationType, string>> = {
  INSTANCE_OF: 'instanceOf',
  SUBCLASS_OF: 'subClassOf',
  REPRESENTED_BY_NOTE: 'representedByNote',
  REFERENCES: 'references',
  EXTERNAL_REFERENCE: 'externalReference',
  PART_OF: 'partOf',
  DATATYPE_PROPERTY: 'datatypeProperty',
};

const RELATION_ORDER: OntologyRelationType[] = [
  'INSTANCE_OF',
  'SUBCLASS_OF',
  'REPRESENTED_BY_NOTE',
  'REFERENCES',
  'EXTERNAL_REFERENCE',
  'PART_OF',
  'DATATYPE_PROPERTY',
  ...Object.keys(INFERRED_RELATIONS).map((type) => type as InferredRelationType),
];

/** Count visible relations without collapsing predicates that have distinct displayed meanings. */
export const summarizeOntologyRelations = (edges: OntologyEdge[]): OntologyRelationSummary[] => {
  const summaries = new Map<string, OntologyRelationSummary>();

  for (const edge of edges) {
    const isInferred = isInferredRelationType(edge.type);
    const type = isInferred ? edge.type : getRelationType(edge.type);
    const baseType = getRelationType(edge.type);
    const label = edge.propertyLabel || edge.label || DEFAULT_RELATION_LABELS[type] || type;
    const key = JSON.stringify([type, label]);
    const existing = summaries.get(key);
    if (existing) {
      existing.count += 1;
      existing.dashed ||= Boolean(edge.dashed);
      continue;
    }
    summaries.set(key, {
      key,
      label,
      type,
      baseType,
      count: 1,
      dashed: Boolean(edge.dashed),
      isInferred,
      isDatatype: type === 'DATATYPE_PROPERTY',
    });
  }

  return [...summaries.values()].sort((left, right) => {
    const leftOrder =
      RELATION_ORDER.indexOf(left.type) + (left.label === 'connectedPartOf' ? 0.5 : 0);
    const rightOrder =
      RELATION_ORDER.indexOf(right.type) + (right.label === 'connectedPartOf' ? 0.5 : 0);
    return leftOrder - rightOrder || left.label.localeCompare(right.label);
  });
};
