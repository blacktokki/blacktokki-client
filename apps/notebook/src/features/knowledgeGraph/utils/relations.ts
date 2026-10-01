import type { getKnowledgeGraphPalette } from './palette';
import { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphRelationType } from '../types';

export type KnowledgeGraphNodeKindLabel = keyof ReturnType<typeof getKnowledgeGraphPalette>;

const INSTANCE_NODE_KINDS: Partial<
  Record<NonNullable<KnowledgeGraphNode['instanceKind']>, KnowledgeGraphNodeKindLabel>
> = {
  CARD: 'card',
  BOARD_PARAGRAPH: 'boardParagraph',
  PARAGRAPH: 'paragraph',
  CONNECTED_PARAGRAPH: 'connectedParagraph',
  EXTERNAL_LINK: 'externalLink',
  CONNECTED_EXTERNAL_LINK: 'connectedExternalLink',
};

/** Use one classification for the legend, detail badge, and palette. */
export const getKnowledgeGraphNodeKind = (
  node: KnowledgeGraphNode
): KnowledgeGraphNodeKindLabel => {
  if (node.role === 'CLASS') {
    return node.classCategory === 'BOARD' ? 'boardClass' : 'builtInClass';
  }
  if (node.instanceKind === 'NOTE') return node.boardTitle ? 'boardNote' : 'note';
  return INSTANCE_NODE_KINDS[node.instanceKind || 'CARD'] || 'card';
};

/** Human-facing category names for the legend and node detail badge. */
export const getKnowledgeGraphNodeKindLabel = (
  kind: KnowledgeGraphNodeKindLabel,
  translate: (key: string) => string
): string => {
  const labels: Record<KnowledgeGraphNodeKindLabel, string> = {
    builtInClass: 'Built-in category',
    boardClass: 'Board category',
    note: 'Note',
    boardNote: 'Board note',
    boardParagraph: 'Board paragraph',
    card: 'Card paragraph',
    paragraph: 'Paragraph',
    connectedParagraph: 'Connected paragraph',
    externalLink: 'External link',
    connectedExternalLink: 'Connected external link',
  };
  return translate(labels[kind]);
};

export const getKnowledgeGraphRelationDisplayLabel = (
  edge: Pick<KnowledgeGraphEdge, 'type' | 'propertyLabel' | 'label'>,
  translate: (key: string) => string
): string => {
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
    default:
      return edge.propertyLabel || edge.label || edge.type;
  }
};

export interface KnowledgeGraphRelationSummary {
  key: string;
  label: string;
  type: KnowledgeGraphRelationType;
  count: number;
  dashed: boolean;
}

const DEFAULT_RELATION_LABELS: Partial<Record<KnowledgeGraphRelationType, string>> = {
  INSTANCE_OF: 'instanceOf',
  SUBCLASS_OF: 'subClassOf',
  REPRESENTED_BY_NOTE: 'representedByNote',
  REFERENCES: 'references',
  EXTERNAL_REFERENCE: 'externalReference',
  PART_OF: 'partOf',
};

const RELATION_ORDER: KnowledgeGraphRelationType[] = [
  'INSTANCE_OF',
  'SUBCLASS_OF',
  'REPRESENTED_BY_NOTE',
  'REFERENCES',
  'EXTERNAL_REFERENCE',
  'PART_OF',
];

/** Count visible relations without collapsing predicates that have distinct displayed meanings. */
export const summarizeKnowledgeGraphRelations = (
  edges: KnowledgeGraphEdge[]
): KnowledgeGraphRelationSummary[] => {
  const summaries = new Map<string, KnowledgeGraphRelationSummary>();

  for (const edge of edges) {
    const type = edge.type;
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
      count: 1,
      dashed: Boolean(edge.dashed),
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
