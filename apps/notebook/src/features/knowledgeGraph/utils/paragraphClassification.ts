import type { OntologyEdge, OntologyNode, OntologyParagraph } from '../types';

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

/** List each note represented by a shared board paragraph once. */
export const getBoardParagraphSourceNotes = (
  node: OntologyNode
): { noteTitle: string; paragraph: OntologyParagraph }[] => {
  if (node.instanceKind !== 'BOARD_PARAGRAPH') return [];
  const occurrences = node.paragraphOccurrences?.length
    ? node.paragraphOccurrences
    : node.paragraph
    ? [node.paragraph]
    : [];
  const paragraphByNote = new Map<string, OntologyParagraph>();
  for (const occurrence of occurrences) {
    const noteTitle = occurrence.origin || node.noteTitle;
    if (noteTitle && !paragraphByNote.has(noteTitle)) {
      paragraphByNote.set(noteTitle, occurrence);
    }
  }
  return [...paragraphByNote]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([noteTitle, paragraph]) => ({ noteTitle, paragraph }));
};

const isContainmentRelation = (type: OntologyEdge['type']): boolean => type === 'PART_OF';

const isClassificationRelation = (type: OntologyEdge['type']): boolean =>
  type === 'INSTANCE_OF' || type === 'INFERRED_INSTANCE_OF';

/** Assign every paragraph to exactly one nearest parent paragraph or its containing note. */
export const buildParagraphPartOfAssignments = (
  candidates: ParagraphHierarchyCandidate[]
): ParagraphPartOfAssignment[] => {
  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.nodeId, candidate])).values(),
  ];

  const candidatesByDoc = new Map<string, ParagraphHierarchyCandidate[]>();
  for (const c of uniqueCandidates) {
    let list = candidatesByDoc.get(c.documentId);
    if (!list) {
      list = [];
      candidatesByDoc.set(c.documentId, list);
    }
    list.push(c);
  }

  return uniqueCandidates
    .map((candidate) => {
      let nearestParent: ParagraphHierarchyCandidate | undefined;
      let nearestDepth = -1;
      const sameDocCandidates = candidatesByDoc.get(candidate.documentId) || [];
      for (const possibleParent of sameDocCandidates) {
        if (
          possibleParent.nodeId === candidate.nodeId ||
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
