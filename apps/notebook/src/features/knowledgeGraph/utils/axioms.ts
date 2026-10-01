import {
  AxiomEvaluationResult,
  AxiomViolation,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  ProblemRecord,
} from '../types';

/**
 * Application Validation for Knowledge Graph
 * Evaluates application-level knowledge graph validation rules:
 * 1. REFERENTIAL_INTEGRITY & ISOLATED_ENTITY: Adapted from problem records.
 */
export const evaluateKnowledgeGraphAxioms = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  problemRecords?: ProblemRecord[]
): AxiomEvaluationResult => {
  const violations: AxiomViolation[] = [];

  // -------------------------------------------------------------
  // 1. REFERENTIAL_INTEGRITY & ISOLATED_ENTITY (adapted from problem records)
  // -------------------------------------------------------------
  if (problemRecords && problemRecords.length > 0) {
    const noteNodes = nodes.filter(
      (node) => node.role === 'INSTANCE' && node.instanceKind === 'NOTE'
    );

    for (const record of problemRecords) {
      let sourceNode = nodes.find(
        (n) =>
          n.noteTitle === record.title &&
          (record.paragraph
            ? n.name === record.paragraph || n.paragraph?.title === record.paragraph
            : true)
      );
      if (!sourceNode) {
        sourceNode = nodes.find((n) => n.noteTitle === record.title || n.name === record.title);
      }
      const sourceNodeId = sourceNode?.id || `note:${record.title}`;

      const sourceNodeIds = new Set(
        nodes
          .filter(
            (node) =>
              node.id === sourceNodeId ||
              node.noteTitle === record.title ||
              node.boardTitle === record.title
          )
          .map((node) => node.id)
      );

      for (const subtitle of record.subtitles) {
        let sub = subtitle;
        const unknownNoteMatch = /^Unknown note link\((.*)\)$/.exec(subtitle);
        if (unknownNoteMatch) {
          const targetLabel = unknownNoteMatch[1];
          const exactTargetNote = noteNodes.find((node) => node.noteTitle === targetLabel);
          const hasResolvedNoteReference =
            exactTargetNote !== undefined &&
            edges.some(
              (edge) =>
                edge.type === 'REFERENCES' &&
                sourceNodeIds.has(edge.source) &&
                edge.target === exactTargetNote.id
            );

          // The shared problem subsystem treats an existing empty note like a missing
          // page. In the knowledge graph it is a valid skeleton target once a concrete
          // reference edge exists, so suppress only that graph-specific false positive.
          if (hasResolvedNoteReference) continue;

          if (!exactTargetNote) {
            const paragraphTargetNote = noteNodes
              .filter((node) => targetLabel.startsWith(`${node.noteTitle} ▶ `))
              .sort((a, b) => b.noteTitle.length - a.noteTitle.length)[0];
            if (paragraphTargetNote) {
              sub = `Unknown paragraph link(${targetLabel})`;
            }
          }
        }

        if (
          sub.startsWith('Unknown note link') ||
          sub.startsWith('Unknown paragraph link') ||
          sub.startsWith('Empty parent note')
        ) {
          violations.push({
            id: `violation:ref:${sourceNodeId}:${sub}`,
            type: 'REFERENTIAL_INTEGRITY',
            severity: 'warning',
            message: `'${sourceNode?.name || record.title}' 문서에서 참조 무결성 결함 감지: ${sub}`,
            affectedNodeIds: [sourceNodeId],
          });
        } else if (sub === 'Isolated note') {
          violations.push({
            id: `violation:isolated:${sourceNodeId}`,
            type: 'ISOLATED_ENTITY',
            severity: 'warning',
            message: `'${
              sourceNode?.name || record.title
            }' 노트가 보드, 상위 노트, 역링크와 연결되지 않은 고립된 개체입니다.`,
            affectedNodeIds: [sourceNodeId],
          });
        }
      }
    }
  }

  const hasErrors = violations.some((violation) => violation.severity === 'error');
  const hasWarnings = violations.some((violation) => violation.severity === 'warning');

  return {
    isConsistent: !hasErrors,
    hasErrors,
    hasWarnings,
    violations,
  };
};
