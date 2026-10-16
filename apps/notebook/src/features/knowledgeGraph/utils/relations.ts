import type { getKnowledgeGraphPalette } from '../inductiveTemplate/palette';
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
  TEMPLATE: 'template',
  KEYWORD: 'keyword',
};

/** Use one classification for the legend, detail badge, and palette. */
export const getKnowledgeGraphNodeKind = (
  node: KnowledgeGraphNode
): KnowledgeGraphNodeKindLabel => {
  if (node.role === 'CLASS') {
    if (node.classKind === 'TEMPLATE_GROUP') return 'templateGroup';
    return node.classCategory === 'BOARD' ? 'boardClass' : 'builtInClass';
  }
  if (node.instanceKind === 'NOTE') return node.boardTitle ? 'boardNote' : 'note';
  return INSTANCE_NODE_KINDS[node.instanceKind || 'CARD'] || 'card';
};

/** Human-facing category names for the legend and node detail badge. */
export const getKnowledgeGraphNodeKindLabel = (
  kind: KnowledgeGraphNodeKindLabel,
  translate: (key: string) => string,
  usageMode: string | undefined = 'NOTE'
): string => {
  const labels: Record<KnowledgeGraphNodeKindLabel, string> = {
    builtInClass: usageMode === 'NOTEBOOK' ? 'Notebook' : 'Note Mode',
    boardClass: 'Board category',
    note: 'Note',
    boardNote: 'Board note',
    boardParagraph: 'Board paragraph',
    card: 'Card paragraph',
    paragraph: 'Paragraph',
    connectedParagraph: 'Connected paragraph',
    externalLink: 'External link',
    connectedExternalLink: 'Connected external link',
    template: 'Template',
    templateGroup: 'Template group',
    keyword: 'Keyword',
  };
  return translate(labels[kind]);
};

export const getKnowledgeGraphRelationDisplayLabel = (
  edge: Pick<KnowledgeGraphEdge, 'type' | 'propertyLabel' | 'label'>,
  translate: (key: string) => string
): string => {
  switch (edge.type) {
    case 'INSTANCE_OF':
      if (edge.propertyLabel === 'templateGroup') return translate('Template group');
      return translate('Category');
    case 'DERIVED_FROM':
      return translate('Template source');
    case 'KEYWORD_SOURCE':
      return translate('Keyword source');
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
          return translate('Paragraph note containment');
        default:
          return translate('Containment');
      }
    default:
      return edge.propertyLabel || edge.label || edge.type;
  }
};

/** Switch between the full paragraph hierarchy and direct note containment for visible paragraphs. */
export const visibleKnowledgeGraphEdges = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  showParagraphs: boolean
): KnowledgeGraphEdge[] => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const visible = edges.filter((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
    if (edge.type !== 'PART_OF') return true;
    if (edge.propertyLabel === 'connectedPartOf') return !showParagraphs;
    if (edge.propertyLabel === 'paragraphPartOf') return showParagraphs;
    return true;
  });
  if (showParagraphs) return visible;

  const notes = new Map(
    nodes.filter((node) => node.instanceKind === 'NOTE').map((node) => [node.noteTitle, node.id])
  );
  const hierarchy = new Map(
    edges
      .filter((edge) => edge.propertyLabel === 'paragraphPartOf')
      .map((edge) => [edge.source, edge])
  );
  const direct = new Set(
    visible
      .filter((edge) => edge.propertyLabel === 'connectedPartOf')
      .map((edge) => JSON.stringify([edge.source, edge.target]))
  );
  for (const node of nodes) {
    if (node.instanceKind !== 'CONNECTED_PARAGRAPH' && node.instanceKind !== 'BOARD_PARAGRAPH')
      continue;
    const origins = node.paragraphOccurrences?.length
      ? node.paragraphOccurrences.map((paragraph) => paragraph.origin || node.noteTitle)
      : [node.paragraph?.origin || node.noteTitle];
    for (const origin of new Set(origins)) {
      const target = notes.get(origin);
      const key = JSON.stringify([node.id, target]);
      if (!target || direct.has(key)) continue;
      direct.add(key);
      visible.push({
        id: `edge:connectedPart:${node.id}->${target}`,
        source: node.id,
        target,
        type: 'PART_OF',
        propertyLabel: 'connectedPartOf',
        color: hierarchy.get(node.id)?.color,
        dashed: true,
      });
    }
  }
  return visible;
};

export interface KnowledgeGraphRelationSummary {
  key: string;
  label: string;
  type: KnowledgeGraphRelationType;
  count: number;
  dashed: boolean;
  directed: boolean;
  color?: string;
}

const DEFAULT_RELATION_LABELS: Partial<Record<KnowledgeGraphRelationType, string>> = {
  INSTANCE_OF: 'instanceOf',
  SUBCLASS_OF: 'subClassOf',
  REPRESENTED_BY_NOTE: 'representedByNote',
  REFERENCES: 'references',
  EXTERNAL_REFERENCE: 'externalReference',
  PART_OF: 'partOf',
  DERIVED_FROM: 'templateSource',
  KEYWORD_SOURCE: 'keywordSource',
};

const RELATION_ORDER: KnowledgeGraphRelationType[] = [
  'INSTANCE_OF',
  'SUBCLASS_OF',
  'REPRESENTED_BY_NOTE',
  'REFERENCES',
  'EXTERNAL_REFERENCE',
  'PART_OF',
  'DERIVED_FROM',
  'KEYWORD_SOURCE',
  'KEYWORD_RELATION',
];

/** Preserve structural predicates; keyword relations share the two verdict legend entries. */
export const summarizeKnowledgeGraphRelations = (
  edges: KnowledgeGraphEdge[]
): KnowledgeGraphRelationSummary[] => {
  const summaries = new Map<string, KnowledgeGraphRelationSummary>();

  for (const edge of edges) {
    const type = edge.type;
    const label =
      type === 'KEYWORD_RELATION'
        ? edge.keywordRelation?.verdict === 'contradicted'
          ? 'Contradicted'
          : 'Supported'
        : edge.propertyLabel || edge.label || DEFAULT_RELATION_LABELS[type] || type;
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
      directed: edge.directed !== false,
      color: edge.color,
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
