import type { RelationKeywordSource, RelationValidation } from './relationDiscovery';
import { TABLE_RECORD_TYPE } from './relationKeywords';

/** An empty selection means all items; selecting All clears the specific choices. */
export function toggleRelationFilter<T extends string>(selected: T[], value: T | 'all'): T[] {
  if (value === 'all') return [];
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

export type RelationFilterOperator = 'and' | 'or';

/** Match any or all selected values within one filter; an empty selection remains unrestricted. */
export function matchesRelationFilter<T extends string>(
  selected: T[],
  value: T | T[],
  operator: RelationFilterOperator = 'or'
) {
  if (!selected.length) return true;
  const matches = (choice: T) => (Array.isArray(value) ? value.includes(choice) : value === choice);
  return operator === 'and' ? selected.every(matches) : selected.some(matches);
}

export type RelationVerdict = RelationValidation['verdict'];

export const matchesRelationValidation = (
  selected: RelationVerdict[],
  validation?: RelationValidation
) => matchesRelationFilter(selected, validation?.verdict ?? 'unverified');

export const relationVerdictLabels: Record<RelationVerdict, string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  neutral: 'Neutral',
  uncertain: 'Uncertain',
  unverified: 'Unverified',
};

/** Missing validations count as pending evidence in every analysis tab. */
export function countRelationVerdicts(validations: Iterable<RelationValidation | undefined>) {
  const counts = { all: 0, supported: 0, contradicted: 0, neutral: 0, uncertain: 0, unverified: 0 };
  for (const validation of validations) {
    counts.all++;
    counts[validation?.verdict ?? 'unverified']++;
  }
  return counts;
}

export type RelationEntityType = 'numeric' | 'prefix' | 'table-record' | 'untyped';

export const relationEntityTypeLabels: Record<RelationEntityType, string> = {
  numeric: 'Numeric pattern',
  prefix: 'Common prefix',
  'table-record': 'Table record',
  untyped: 'No type',
};

/** The filter groups generated type values without replacing the original type shown in details. */
export function relationEntityType(type: string | null): RelationEntityType {
  if (type === TABLE_RECORD_TYPE) return 'table-record';
  if (type?.includes('{{NUM}}')) return 'numeric';
  if (type?.endsWith('{{TEXT}}') || type?.endsWith(TABLE_RECORD_TYPE)) return 'prefix';
  return 'untyped';
}

export function countRelationEntityTypes(types: Iterable<string | null>) {
  const counts = { all: 0, numeric: 0, prefix: 0, 'table-record': 0, untyped: 0 };
  for (const type of types) {
    counts.all++;
    counts[relationEntityType(type)]++;
  }
  return counts;
}

export type RelationSourceType = RelationKeywordSource['kind'];
export const relationSourceTypeLabels: Record<RelationSourceType, string> = {
  title: 'Note',
  heading: 'Paragraph',
  link: 'Reference',
  'table-header': 'Table header',
  'table-cell': 'Table record',
  bold: 'Bold text',
  'field-name': 'Property',
  'field-value': 'Property value',
};

/** Each item contributes once per type; callers supply keywords or individual source entries. */
export function countRelationSourceTypes(items: Iterable<Iterable<RelationSourceType>>) {
  const counts = {
    all: 0,
    title: 0,
    heading: 0,
    link: 0,
    'table-header': 0,
    'table-cell': 0,
    bold: 0,
    'field-name': 0,
    'field-value': 0,
  };
  for (const types of items) {
    counts.all++;
    for (const type of new Set(types)) counts[type]++;
  }
  return counts;
}
