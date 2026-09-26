import { getRelationType, INFERRED_RELATIONS, isInferredRelationType } from './relations';
import {
  AxiomEvaluationResult,
  AxiomViolation,
  InferableRelationType,
  InferredOntologyEdge,
  InferredRelationType,
  OntologyEdge,
  OntologyInference,
  OntologyNode,
  ProblemRecord,
} from '../types';

/**
 * Application Validation and Inference Engine for Notebook Ontology
 * Evaluates application-level ontology validation rules:
 * 1. REFERENTIAL_INTEGRITY & ISOLATED_ENTITY: Adapted from problem records.
 * 2. Logical inference: class inheritance with explicit supporting edges.
 */
export const evaluateOntologyAxioms = (
  nodes: OntologyNode[],
  edges: OntologyEdge[],
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
          // page. In the ontology graph it is a valid skeleton target once a concrete
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

  // Logical class inheritance is kept separate from asserted graph edges.
  const inferredEdges: InferredOntologyEdge[] = [];
  const relationKey = (source: string, target: string, type: InferableRelationType) =>
    JSON.stringify([source, type, target]);
  const existingDirectEdges = new Set(
    edges
      .filter((e) => !isInferredRelationType(e.type))
      .map((e) => JSON.stringify([e.source, getRelationType(e.type), e.target]))
  );
  const inferredByRelation = new Map<string, InferredOntologyEdge>();

  const addInferredEdge = (
    source: string,
    target: string,
    relation: InferableRelationType,
    inference: OntologyInference
  ) => {
    if (source === target) return;
    const key = relationKey(source, target, relation);
    if (existingDirectEdges.has(key)) return;
    const existing = inferredByRelation.get(key);
    if (existing) {
      const evidenceKey = JSON.stringify([inference.rule, [...inference.premiseEdgeIds].sort()]);
      if (
        !existing.inferences.some(
          (item) => JSON.stringify([item.rule, [...item.premiseEdgeIds].sort()]) === evidenceKey
        )
      ) {
        existing.inferences.push(inference);
      }
      return;
    }
    const type: InferredRelationType = `INFERRED_${relation}`;
    const edge: InferredOntologyEdge = {
      id: `edge:inferred:${key}`,
      source,
      target,
      type,
      inferences: [inference],
      propertyLabel: INFERRED_RELATIONS[type].label,
      dashed: true,
      color: '#9B59B6',
    };
    inferredByRelation.set(key, edge);
    inferredEdges.push(edge);
  };

  // Polymorphic inheritance: subClassOf & instanceOf.
  // If X instanceOf Y and Y subClassOf Z => X inferred instanceOf Z
  // If C1 subClassOf C2 and C2 subClassOf C3 => C1 inferred subClassOf C3
  const subClassEdges = edges.filter((e) => e.type === 'SUBCLASS_OF');
  const instanceOfEdges = edges.filter((e) => e.type === 'INSTANCE_OF');

  // Adjacency for subClassOf: childClass -> [parentClasses]
  const subClassMap = new Map<string, OntologyEdge[]>();
  for (const edge of subClassEdges) {
    if (!subClassMap.has(edge.source)) {
      subClassMap.set(edge.source, []);
    }
    subClassMap.get(edge.source)!.push(edge);
  }

  // Helper to find all ancestor classes for a given class ID with memoization
  const ancestorCache = new Map<string, { id: string; premiseEdgeIds: string[] }[]>();
  const getAncestorClasses = (classId: string) => {
    const cached = ancestorCache.get(classId);
    if (cached) return cached;

    const ancestors: { id: string; premiseEdgeIds: string[] }[] = [];
    const queue = [{ id: classId, premiseEdgeIds: [] as string[] }];
    const visited = new Set<string>([classId]);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const parents = subClassMap.get(curr.id) || [];
      for (const edge of parents) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          const ancestor = {
            id: edge.target,
            premiseEdgeIds: [...curr.premiseEdgeIds, edge.id],
          };
          ancestors.push(ancestor);
          queue.push(ancestor);
        }
      }
    }
    ancestorCache.set(classId, ancestors);
    return ancestors;
  };

  // 1) Instance polymorphism: Card/Instance -> Subclass -> Ancestor Class
  for (const instEdge of instanceOfEdges) {
    const instId = instEdge.source;
    const classId = instEdge.target;
    const ancestors = getAncestorClasses(classId);
    for (const ancestor of ancestors) {
      addInferredEdge(instId, ancestor.id, 'INSTANCE_OF', {
        rule: 'INSTANCE_INHERITANCE',
        premiseEdgeIds: [instEdge.id, ...ancestor.premiseEdgeIds],
      });
    }
  }

  // 2) Subclass transitivity: Subclass -> Intermediate -> Ancestor Class
  for (const [childClassId, directParents] of subClassMap.entries()) {
    const directSet = new Set(directParents.map((edge) => edge.target));
    const allAncestors = getAncestorClasses(childClassId);
    for (const ancestor of allAncestors) {
      if (!directSet.has(ancestor.id)) {
        addInferredEdge(childClassId, ancestor.id, 'SUBCLASS_OF', {
          rule: 'SUBCLASS_TRANSITIVITY',
          premiseEdgeIds: ancestor.premiseEdgeIds,
        });
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
    inferredEdges,
  };
};
