import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

/** External links gain the connected variant through a relation beyond their source references. */
export const findConnectedExternalLinkIds = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[]
): string[] => {
  const linkIds = new Set(
    nodes
      .filter(
        (node) =>
          node.role === 'INSTANCE' &&
          (node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK')
      )
      .map((node) => node.id)
  );
  const connectedIds = new Set<string>();

  for (const edge of edges) {
    if (edge.type === 'EXTERNAL_REFERENCE') continue;
    if (linkIds.has(edge.source)) connectedIds.add(edge.source);
    if (linkIds.has(edge.target)) connectedIds.add(edge.target);
  }

  return [...connectedIds].sort();
};
