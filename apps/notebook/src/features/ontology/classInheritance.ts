import type { OntologyEdge } from './types';

/** Return only classes connected directly through instanceOf or subClassOf. */
export const findDirectClassIds = (nodeId: string, edges: OntologyEdge[]): string[] =>
  [
    ...new Set(
      edges
        .filter(
          (edge) =>
            edge.source === nodeId && (edge.type === 'INSTANCE_OF' || edge.type === 'SUBCLASS_OF')
        )
        .map((edge) => edge.target)
    ),
  ].sort();

/** Return only classes whose asserted subClassOf relation targets the selected class. */
export const findDirectSubclassIds = (classNodeId: string, edges: OntologyEdge[]): string[] =>
  [
    ...new Set(
      edges
        .filter((edge) => edge.target === classNodeId && edge.type === 'SUBCLASS_OF')
        .map((edge) => edge.source)
    ),
  ].sort();
