import type {
  AxiomEvaluationResult,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphRelationType,
} from '../types';

export type InferredRelationType = 'INFERRED_INSTANCE_OF' | 'INFERRED_SUBCLASS_OF';
export type InferableRelationType = 'INSTANCE_OF' | 'SUBCLASS_OF';

export interface KnowledgeGraphInference {
  rule: 'INSTANCE_INHERITANCE' | 'SUBCLASS_TRANSITIVITY';
  premiseEdgeIds: string[];
}

export interface InferredKnowledgeGraphEdge extends KnowledgeGraphEdge {
  type: InferredRelationType;
  inferences: KnowledgeGraphInference[];
}

export interface OwlRdfAxiomResult extends AxiomEvaluationResult {
  inferredEdges: InferredKnowledgeGraphEdge[];
}

export const INFERRED_RELATIONS = {
  INFERRED_INSTANCE_OF: { relation: 'INSTANCE_OF', label: 'inferred instanceOf' },
  INFERRED_SUBCLASS_OF: { relation: 'SUBCLASS_OF', label: 'inferred subClassOf' },
} as const satisfies Record<
  InferredRelationType,
  { relation: InferableRelationType; label: string }
>;

export const isInferredRelationType = (
  type: KnowledgeGraphRelationType
): type is InferredRelationType => Object.prototype.hasOwnProperty.call(INFERRED_RELATIONS, type);

export const getRelationType = (type: KnowledgeGraphRelationType): KnowledgeGraphRelationType =>
  isInferredRelationType(type) ? INFERRED_RELATIONS[type].relation : type;

/** Derive class inheritance without modifying asserted relations or application validation. */
export const inferKnowledgeGraphRelations = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[]
): InferredKnowledgeGraphEdge[] => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const asserted = edges.filter((edge) => !isInferredRelationType(edge.type));
  const directRelations = new Set(
    asserted.map((edge) => JSON.stringify([edge.source, edge.type, edge.target]))
  );
  const parentsByClass = new Map<string, KnowledgeGraphEdge[]>();
  for (const edge of asserted) {
    if (edge.type !== 'SUBCLASS_OF' || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    const parents = parentsByClass.get(edge.source) || [];
    parents.push(edge);
    parentsByClass.set(edge.source, parents);
  }

  const ancestorsByClass = new Map<string, { id: string; premiseEdgeIds: string[] }[]>();
  const ancestorsOf = (classId: string) => {
    const cached = ancestorsByClass.get(classId);
    if (cached) return cached;
    const ancestors: { id: string; premiseEdgeIds: string[] }[] = [];
    const queue = [{ id: classId, premiseEdgeIds: [] as string[] }];
    const visited = new Set([classId]);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const edge of parentsByClass.get(current.id) || []) {
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        const ancestor = {
          id: edge.target,
          premiseEdgeIds: [...current.premiseEdgeIds, edge.id],
        };
        ancestors.push(ancestor);
        queue.push(ancestor);
      }
    }
    ancestorsByClass.set(classId, ancestors);
    return ancestors;
  };

  const inferredByRelation = new Map<string, InferredKnowledgeGraphEdge>();
  const addInference = (
    source: string,
    target: string,
    relation: InferableRelationType,
    inference: KnowledgeGraphInference
  ) => {
    if (source === target) return;
    const key = JSON.stringify([source, relation, target]);
    if (directRelations.has(key)) return;
    const existing = inferredByRelation.get(key);
    if (existing) {
      const evidence = JSON.stringify([inference.rule, [...inference.premiseEdgeIds].sort()]);
      if (
        !existing.inferences.some(
          (item) => JSON.stringify([item.rule, [...item.premiseEdgeIds].sort()]) === evidence
        )
      ) {
        existing.inferences.push(inference);
      }
      return;
    }
    const type: InferredRelationType = `INFERRED_${relation}`;
    inferredByRelation.set(key, {
      id: `edge:inferred:${key}`,
      source,
      target,
      type,
      inferences: [inference],
      propertyLabel: INFERRED_RELATIONS[type].label,
      dashed: true,
      color: '#9B59B6',
    });
  };

  for (const edge of asserted) {
    if (edge.type !== 'INSTANCE_OF' || !nodeIds.has(edge.source)) continue;
    for (const ancestor of ancestorsOf(edge.target)) {
      addInference(edge.source, ancestor.id, 'INSTANCE_OF', {
        rule: 'INSTANCE_INHERITANCE',
        premiseEdgeIds: [edge.id, ...ancestor.premiseEdgeIds],
      });
    }
  }
  for (const [classId, parents] of parentsByClass) {
    const directParents = new Set(parents.map((edge) => edge.target));
    for (const ancestor of ancestorsOf(classId)) {
      if (directParents.has(ancestor.id)) continue;
      addInference(classId, ancestor.id, 'SUBCLASS_OF', {
        rule: 'SUBCLASS_TRANSITIVITY',
        premiseEdgeIds: ancestor.premiseEdgeIds,
      });
    }
  }

  return [...inferredByRelation.values()];
};
