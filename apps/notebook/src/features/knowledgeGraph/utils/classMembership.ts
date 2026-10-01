import type { KnowledgeGraphEdge } from '../types';

/** Return the classes explicitly assigned to an instance. */
export const findInstanceClassIds = (nodeId: string, edges: KnowledgeGraphEdge[]): string[] =>
  [
    ...new Set(
      edges
        .filter((edge) => edge.source === nodeId && edge.type === 'INSTANCE_OF')
        .map((edge) => edge.target)
    ),
  ].sort();
