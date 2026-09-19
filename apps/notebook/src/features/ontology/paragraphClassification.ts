import type { OntologyEdge, OntologyNode } from './types';

export interface ParagraphHierarchyCandidate {
  nodeId: string;
  documentId: string;
  path: string;
  containerNodeId: string;
}

export interface ParagraphPartOfAssignment {
  sourceNodeId: string;
  targetNodeId: string;
}

const isContainmentRelation = (type: OntologyEdge['type']): boolean =>
  type === 'PART_OF' || type === 'PARENT_CHILD' || type === 'INFERRED_PART_OF';

const isClassificationRelation = (type: OntologyEdge['type']): boolean =>
  type === 'INSTANCE_OF' || type === 'INFERRED_INSTANCE_OF';

/** Assign every paragraph to exactly one nearest parent paragraph or its containing note. */
export const buildParagraphPartOfAssignments = (
  candidates: ParagraphHierarchyCandidate[]
): ParagraphPartOfAssignment[] => {
  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.nodeId, candidate])).values(),
  ];

  return uniqueCandidates
    .map((candidate) => {
      let nearestParent: ParagraphHierarchyCandidate | undefined;
      let nearestDepth = -1;
      for (const possibleParent of uniqueCandidates) {
        if (
          possibleParent.nodeId === candidate.nodeId ||
          possibleParent.documentId !== candidate.documentId ||
          !candidate.path.startsWith(possibleParent.path + ',')
        ) {
          continue;
        }
        const depth = possibleParent.path.split(',').length;
        if (
          depth > nearestDepth ||
          (depth === nearestDepth &&
            possibleParent.nodeId.localeCompare(nearestParent?.nodeId || '') < 0)
        ) {
          nearestParent = possibleParent;
          nearestDepth = depth;
        }
      }
      return {
        sourceNodeId: candidate.nodeId,
        targetNodeId: nearestParent?.nodeId || candidate.containerNodeId,
      };
    })
    .sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
};

/** Add a direct note containment only for connected paragraphs that already have a parent paragraph. */
export const buildConnectedParagraphNotePartOfAssignments = (
  candidates: ParagraphHierarchyCandidate[],
  hierarchyAssignments: ParagraphPartOfAssignment[],
  connectedNodeIds: string[]
): ParagraphPartOfAssignment[] => {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.nodeId, candidate] as const)
  );
  const assignmentBySource = new Map(
    hierarchyAssignments.map((assignment) => [assignment.sourceNodeId, assignment] as const)
  );

  return [...new Set(connectedNodeIds)].sort().flatMap((sourceNodeId) => {
    const candidate = candidateById.get(sourceNodeId);
    const hierarchyAssignment = assignmentBySource.get(sourceNodeId);
    if (
      !candidate ||
      !hierarchyAssignment ||
      !candidateById.has(hierarchyAssignment.targetNodeId)
    ) {
      return [];
    }
    return [{ sourceNodeId, targetNodeId: candidate.containerNodeId }];
  });
};

/** Find paragraphs directly connected by a semantic relation or Title Keyword membership. */
export const findConnectedParagraphIds = (
  nodes: OntologyNode[],
  edges: OntologyEdge[]
): string[] => {
  const paragraphIds = new Set(
    nodes
      .filter(
        (node) =>
          node.role === 'INSTANCE' &&
          (node.instanceKind === 'PARAGRAPH' || node.instanceKind === 'CONNECTED_PARAGRAPH')
      )
      .map((node) => node.id)
  );
  const titleKeywordClassIds = new Set(
    nodes.filter((node) => node.classKind === 'TITLE_KEYWORD').map((node) => node.id)
  );
  const connectedIds = new Set<string>();

  for (const edge of edges) {
    if (isContainmentRelation(edge.type)) continue;
    if (isClassificationRelation(edge.type) && !titleKeywordClassIds.has(edge.target)) continue;
    if (paragraphIds.has(edge.source)) connectedIds.add(edge.source);
    if (paragraphIds.has(edge.target)) connectedIds.add(edge.target);
  }

  return [...connectedIds].sort();
};

/** Find paragraph instances that directly participate in a note-link reference. */
export const findLinkedParagraphIds = (nodes: OntologyNode[], edges: OntologyEdge[]): string[] => {
  const paragraphIds = new Set(
    nodes
      .filter(
        (node) =>
          node.role === 'INSTANCE' &&
          (node.instanceKind === 'PARAGRAPH' || node.instanceKind === 'CONNECTED_PARAGRAPH')
      )
      .map((node) => node.id)
  );
  const linkedIds = new Set<string>();

  for (const edge of edges) {
    if (edge.type !== 'REFERENCES') continue;
    if (paragraphIds.has(edge.source)) linkedIds.add(edge.source);
    if (paragraphIds.has(edge.target)) linkedIds.add(edge.target);
  }

  return [...linkedIds].sort();
};
