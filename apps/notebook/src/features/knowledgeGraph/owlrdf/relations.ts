import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';
import { getRelationType, isInferredRelationType } from './inference';
import {
  getKnowledgeGraphNodeKindLabel as getBaseNodeKindLabel,
  getKnowledgeGraphRelationDisplayLabel as getBaseRelationDisplayLabel,
  KnowledgeGraphNodeKindLabel,
  KnowledgeGraphRelationSummary as BaseRelationSummary,
  summarizeKnowledgeGraphRelations as summarizeBaseRelations,
} from '../utils/relations';

export type KnowledgeGraphRelationLabelMode = 'intuitive' | 'rdf';

/** Display labels for RDF/OWL mode while retaining the graph's normal category labels. */
export const getKnowledgeGraphNodeKindLabel = (
  kind: KnowledgeGraphNodeKindLabel,
  mode: KnowledgeGraphRelationLabelMode,
  translate: (key: string) => string,
  extensionClassLabels: readonly [string, string] = ['Extension category', 'Extension Class']
): string => {
  if (mode === 'intuitive') {
    return kind === 'extensionClass'
      ? translate(extensionClassLabels[0])
      : getBaseNodeKindLabel(kind, translate);
  }
  const rdfLabels: Record<KnowledgeGraphNodeKindLabel, string> = {
    builtInClass: 'Built-in Class',
    boardClass: 'Board Class',
    extensionClass: extensionClassLabels[1],
    note: 'Instance (Note)',
    boardNote: 'Instance (Board Note)',
    boardParagraph: 'Instance (Board Paragraph)',
    card: 'Instance (Card Paragraph)',
    paragraph: 'Instance (Paragraph)',
    connectedParagraph: 'Instance (Connected Paragraph)',
    externalLink: 'Instance (External Link)',
    connectedExternalLink: 'Instance (Connected External Link)',
    literal: 'Literal',
  };
  return translate(rdfLabels[kind]);
};

/** Canvas-only node labels; RDF identifiers and exported rdfs:label remain unchanged. */
export const getKnowledgeGraphNodeDisplayLabel = (
  node: Pick<KnowledgeGraphNode, 'name' | 'role' | 'instanceKind'>,
  mode: KnowledgeGraphRelationLabelMode
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
export const getKnowledgeGraphRdfPredicate = (
  edge: Pick<KnowledgeGraphEdge, 'type' | 'propertyLabel' | 'label'>
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
export const getKnowledgeGraphRelationDisplayLabel = (
  edge: Pick<KnowledgeGraphEdge, 'type' | 'propertyLabel' | 'label'>,
  mode: KnowledgeGraphRelationLabelMode,
  translate: (key: string) => string
): string => {
  if (mode === 'rdf') return getKnowledgeGraphRdfPredicate(edge);
  if (edge.type === 'DATATYPE_PROPERTY') {
    if (edge.propertyLabel === 'hasSchedule') return translate('Schedule property');
    const key = edge.propertyLabel || edge.label || 'value';
    const name = key
      .replace(/^has(?=[A-Z])/, '')
      .replace(/^./, (character) => character.toLowerCase());
    return `${translate('Property')}: ${name}`;
  }
  if (isInferredRelationType(edge.type)) {
    return translate(
      edge.type === 'INFERRED_INSTANCE_OF' ? 'Inferred category' : 'Inferred subcategory'
    );
  }
  return getBaseRelationDisplayLabel(edge, translate);
};

export interface KnowledgeGraphRelationSummary extends BaseRelationSummary {
  isDatatype: boolean;
  isInferred: boolean;
  baseType: KnowledgeGraphEdge['type'];
}

/** Add datatype relations to the base graph legend without changing its summarization rules. */
export const summarizeKnowledgeGraphRelations = (
  edges: KnowledgeGraphEdge[]
): KnowledgeGraphRelationSummary[] => {
  const summaries = summarizeBaseRelations(edges).map((summary) => ({
    ...summary,
    isDatatype: summary.type === 'DATATYPE_PROPERTY',
    isInferred: isInferredRelationType(summary.type),
    baseType: getRelationType(summary.type),
  }));
  return [
    ...summaries.filter((summary) => !summary.isDatatype && !summary.isInferred),
    ...summaries.filter((summary) => summary.isDatatype),
    ...summaries.filter((summary) => summary.isInferred),
  ];
};

/** Label colors for OWL inference and RDF datatype edges on the shared canvas. */
export const getOwlRdfEdgeLabelColors = (
  edge: KnowledgeGraphEdge,
  isDark: boolean
): { fill: string; border: string; text: string } => {
  const isInferred = isInferredRelationType(edge.type);
  const isDatatype = edge.type === 'DATATYPE_PROPERTY';
  const accentColor = isInferred
    ? '#9B59B6'
    : isDatatype
    ? isDark
      ? '#48C78E'
      : '#16A085'
    : undefined;
  return {
    fill: isInferred
      ? isDark
        ? '#2E1A47'
        : '#F5EEF8'
      : isDatatype
      ? isDark
        ? '#14382A'
        : '#E8F8F5'
      : isDark
      ? '#1F2937'
      : '#FFFFFF',
    border: accentColor || (isDark ? '#4B5563' : '#CBD5E1'),
    text: accentColor || (isDark ? '#D1D5DB' : '#475569'),
  };
};

export const getOwlRdfRelationLegendColor = (
  summary: KnowledgeGraphRelationSummary,
  isDark: boolean
): string | undefined => {
  if (summary.isInferred) return '#9B59B6';
  if (summary.isDatatype) return isDark ? '#48C78E' : '#16A085';
  return undefined;
};
