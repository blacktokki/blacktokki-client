import {
  InferableRelationType,
  InferredRelationType,
  OntologyEdge,
  OntologyRelationType,
} from './types';

export const INFERRED_RELATIONS = {
  INFERRED_INSTANCE_OF: { relation: 'INSTANCE_OF', label: 'inferred instanceOf' },
  INFERRED_SUBCLASS_OF: { relation: 'SUBCLASS_OF', label: 'inferred subClassOf' },
  INFERRED_PART_OF: { relation: 'PART_OF', label: 'inferred partOf' },
} as const satisfies Record<
  InferredRelationType,
  { relation: InferableRelationType; label: string }
>;

export const isInferredRelationType = (type: OntologyRelationType): type is InferredRelationType =>
  Object.prototype.hasOwnProperty.call(INFERRED_RELATIONS, type);

/** Return the original predicate, including normalization of compatibility aliases. */
export const getRelationType = (type: OntologyRelationType) => {
  if (isInferredRelationType(type)) return INFERRED_RELATIONS[type].relation;
  if (type === 'PARENT_CHILD') return 'PART_OF';
  return type;
};

export interface OntologyRelationSummary {
  key: string;
  label: string;
  type: OntologyRelationType;
  baseType: OntologyRelationType;
  count: number;
  dashed: boolean;
  isInferred: boolean;
  isDatatype: boolean;
}

const DEFAULT_RELATION_LABELS: Partial<Record<OntologyRelationType, string>> = {
  INSTANCE_OF: 'instanceOf',
  SUBCLASS_OF: 'subClassOf',
  REFERENCES: 'references',
  PART_OF: 'partOf',
  DATATYPE_PROPERTY: 'datatypeProperty',
};

const RELATION_ORDER: OntologyRelationType[] = [
  'INSTANCE_OF',
  'SUBCLASS_OF',
  'REFERENCES',
  'PART_OF',
  'DATATYPE_PROPERTY',
  ...Object.keys(INFERRED_RELATIONS).map((type) => type as InferredRelationType),
];

/** Count visible relations without collapsing predicates that have distinct displayed meanings. */
export const summarizeOntologyRelations = (edges: OntologyEdge[]): OntologyRelationSummary[] => {
  const summaries = new Map<string, OntologyRelationSummary>();

  for (const edge of edges) {
    const isInferred = isInferredRelationType(edge.type);
    const type = isInferred ? edge.type : getRelationType(edge.type);
    const baseType = getRelationType(edge.type);
    const label = edge.propertyLabel || edge.label || DEFAULT_RELATION_LABELS[type] || type;
    const key = JSON.stringify([type, label]);
    const existing = summaries.get(key);
    if (existing) {
      existing.count += 1;
      existing.dashed ||= Boolean(edge.dashed);
      continue;
    }
    summaries.set(key, {
      key,
      label,
      type,
      baseType,
      count: 1,
      dashed: Boolean(edge.dashed),
      isInferred,
      isDatatype: type === 'DATATYPE_PROPERTY',
    });
  }

  return [...summaries.values()].sort((left, right) => {
    const leftOrder =
      RELATION_ORDER.indexOf(left.type) + (left.label === 'connectedPartOf' ? 0.5 : 0);
    const rightOrder =
      RELATION_ORDER.indexOf(right.type) + (right.label === 'connectedPartOf' ? 0.5 : 0);
    return leftOrder - rightOrder || left.label.localeCompare(right.label);
  });
};
