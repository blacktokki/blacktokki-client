import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

/** External links gain the connected variant only through a relation beyond their base links and class. */
export const findConnectedExternalLinkIds = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  externalLinkClassId: string
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
    if (edge.type === 'INSTANCE_OF' && edge.target === externalLinkClassId) continue;
    if (linkIds.has(edge.source)) connectedIds.add(edge.source);
    if (linkIds.has(edge.target)) connectedIds.add(edge.target);
  }

  return [...connectedIds].sort();
};

/**
 * External link class node is hidden when:
 * 1. There are no connected external link nodes, AND
 * 2. Showing ordinary link nodes is turned off OR there are no ordinary link nodes.
 */
export const shouldHideExternalLinkClass = (
  nodes: KnowledgeGraphNode[],
  showOrdinaryExternalLinks: boolean
): boolean => {
  const hasConnectedExternalLinks = nodes.some(
    (node) => node.instanceKind === 'CONNECTED_EXTERNAL_LINK'
  );
  const hasOrdinaryExternalLinks = nodes.some((node) => node.instanceKind === 'EXTERNAL_LINK');
  return !hasConnectedExternalLinks && (!showOrdinaryExternalLinks || !hasOrdinaryExternalLinks);
};
