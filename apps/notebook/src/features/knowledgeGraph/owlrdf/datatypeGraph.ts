import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';
import { getKnowledgeGraphPalette } from '../utils/palette';

export interface KnowledgeGraphDatatypeNode extends KnowledgeGraphNode {
  role: 'LITERAL';
  datatypeKey: string;
  literalValue: string;
}

export interface KnowledgeGraphDatatypeGraph {
  datatypeNodes: KnowledgeGraphDatatypeNode[];
  datatypeEdges: KnowledgeGraphEdge[];
}

/** Represent YAML properties of note instances as datatype relations and literal nodes. */
export const buildKnowledgeGraphDatatypeGraph = (
  nodes: KnowledgeGraphNode[],
  isDark: boolean,
  stableId: (value: string) => string
): KnowledgeGraphDatatypeGraph => {
  const palette = getKnowledgeGraphPalette(isDark);
  const datatypeNodes: KnowledgeGraphDatatypeNode[] = [];
  const datatypeEdges: KnowledgeGraphEdge[] = [];

  for (const node of nodes) {
    if (node.role !== 'INSTANCE' || node.instanceKind !== 'NOTE') continue;
    for (const [key, rawValue] of Object.entries(node.properties || {})) {
      if (rawValue === undefined || rawValue === null) continue;
      const value = typeof rawValue === 'object' ? JSON.stringify(rawValue) : String(rawValue);
      if (!value.trim()) continue;
      const literalId = `literal:${key}:${node.id}:${stableId(value)}`;
      const literalNode: KnowledgeGraphDatatypeNode = {
        id: literalId,
        name: value,
        role: 'LITERAL',
        datatypeKey: key,
        literalValue: value,
        noteTitle: value,
        properties: {},
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: palette.literal.fill,
        strokeColor: palette.literal.stroke,
        radius: 8,
        width: Math.max(44, value.length * 7 + 14),
        height: 19,
      };
      datatypeNodes.push(literalNode);
      const propertyLabel =
        key === 'schedule'
          ? 'hasSchedule'
          : key === 'updated'
          ? 'hasUpdated'
          : `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      datatypeEdges.push({
        id: `edge:data:${node.id}:${key}->${literalId}`,
        source: node.id,
        target: literalId,
        type: 'DATATYPE_PROPERTY',
        propertyLabel,
        color: isDark ? '#F39C12' : '#D35400',
      });
    }
  }

  return { datatypeNodes, datatypeEdges };
};
