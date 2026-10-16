import type { RelationObservation } from '../relationDiscovery';
import { namedAtoms } from './claims';

export type RelationSchema = {
  kind: 'table' | 'field';
  subject: string;
  sourceHeader?: string;
  targetHeader: string;
  value: string;
  /** Coordinates refer to decoded source cells, not positions guessed from a rendered hypothesis. */
  location?: {
    table?: number;
    row?: number;
    sourceColumn?: number;
    targetColumn?: number;
    targetStart: number;
    targetEnd: number;
  };
  /** Nonlexical table evidence for a policy learned from source reviews. */
  structure?: {
    width: number;
    sourcePosition: number;
    targetPosition: number;
    sourceUnique: number;
    targetUnique: number;
    sourceAtomic: number;
    targetAtomic: number;
    unresolvedHeaders: boolean;
  };
};
export type SchemaObservation = RelationObservation & { schema?: RelationSchema };

/** Read the actual record roles. No field/header names map to predefined predicates. */
export function schemaOf(observation: SchemaObservation): RelationSchema | undefined {
  if (observation.schema) return observation.schema;
  if (observation.origin !== 'field') return;
  const value = observation.evidence.slice(observation.evidence.indexOf('\n') + 1);
  const separator = value.indexOf(': ');
  if (separator < 0) return;
  return {
    kind: 'field',
    subject: observation.source,
    targetHeader: value.slice(0, separator),
    value: value.slice(separator + 2),
  };
}

/** Describe only the selected value. The original cell and its qualifiers stay in the premise. */
export function schemaHypothesis(schema: RelationSchema, target: string): string {
  return schema.kind === 'table'
    ? `${schema.sourceHeader}: ${schema.subject}. ${schema.targetHeader}: ${target}.`
    : `${schema.subject}\n${schema.targetHeader}: ${target}.`;
}

/** Check a selected endpoint at its recorded position; never infer a relation from string equality. */
export function schemaMembership(schema: RelationSchema, target: string): boolean {
  if (!schema.location) {
    const start = schema.value.indexOf(target);
    return (
      start >= 0 &&
      !!namedAtoms(schema.value, () => [
        { text: target, key: target, type: null, start, end: start + target.length },
      ])
    );
  }
  const { targetStart: start, targetEnd: end } = schema.location;
  return start >= 0 && end > start && schema.value.slice(start, end) === target;
}
