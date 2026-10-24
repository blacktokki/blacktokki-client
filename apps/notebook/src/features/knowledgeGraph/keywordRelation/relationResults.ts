/** Relationship result indexes, evidence classifications and filters. */
import {
  relationEnumerationItemKey,
  analyzeRelationKeywordComposition,
  relationKeywordEntityKey,
  relationKeywordKey,
  associationContextLabels,
} from './keyword/keywordUtils';
import type {
  InductiveRelationCandidate,
  RelationEntityResult,
  RelationObservation,
  RelationEvidenceMeasurement,
  RelationEntitySources,
  RelationEntityType,
  AssociationContextKind,
  RelationKeywordSource,
} from './types';

export type RelationAssociationRank = { score: number; evidenceCount: number };

type RelationEntityMembership = { name: string; keywordKeys: string[] };

type RelationEntityGeneralRelations = {
  entityTypes: RelationEntityMembership[];
  pattern?: RelationEntityMembership;
  compoundKeys: string[];
  containedKeys: string[];
  syntheticKeys: string[];
  constituentKeys: string[];
};

type EntityRelationship = RelationAssociationRank & {
  sentences: {
    context: Pick<
      RelationEntitySources['sentences'][number],
      'noteTitle' | 'section' | 'sectionPath' | 'text'
    >;
    relatedEntityKey: string;
    evidence: RelationEvidence;
  }[];
};

export type RelationEntityDetail = RelationEntityResult['entities'][number] & {
  key: string;
  relationships: Map<string, EntityRelationship>;
  relatedEntities: Set<string>;
  sources: RelationEntitySources['sources'];
  entityTypeNames?: string[];
  /** Root type identities include subtype membership and remain stable across name changes. */
  entityTypeKeys?: string[];
  isCompoundKeyword?: boolean;
  /** Original keyword containing a generated constituent key. */
  isSyntheticKeyword?: boolean;
  /** New common key generated from at least three original synthetic keywords. */
  isConstituentKeyword?: boolean;
  isContainedKeyword?: boolean;
  generalRelations?: RelationEntityGeneralRelations;
};

export type RelationEvidence = {
  /** Preserve the association type before per-evidence measurements become available. */
  associationContext?: AssociationContextKind;
  associationFamily?: string;
  associationRoles?: string[];
  observation: RelationObservation;
  measurement?: RelationEvidenceMeasurement;
};

export type RelationDetail = RelationAssociationRank & {
  candidate: InductiveRelationCandidate;
  evidence: RelationEvidence[];
};

/** Candidate summaries and measured evidence share one ordering in lists and console totals. */
export function relationCandidateRank(
  candidate: InductiveRelationCandidate
): RelationAssociationRank {
  return candidate.association
    ? { score: candidate.association.score, evidenceCount: candidate.association.evidenceCount }
    : relationAssociationRank(candidate.measurements);
}

/** Project identical context and scoring metadata for the dashboard and result index. */
export function relationCandidateEvidence(
  candidate: InductiveRelationCandidate
): RelationEvidence[] {
  return candidate.observations.map((observation, index) => ({
    observation,
    measurement: candidate.measurements[index],
    associationContext: candidate.association?.context ?? candidate.associationContext,
    ...(candidate.associationFamily
      ? {
          associationFamily: candidate.associationFamily,
          associationRoles: candidate.associationRoles,
        }
      : {}),
  }));
}

/** Rank measured associations without converting scores into truth categories. */
export function relationAssociationRank(
  measurements: (RelationEvidenceMeasurement | undefined)[]
): RelationAssociationRank {
  const contexts = new Map<string, { sum: number; count: number }>();
  for (const row of measurements) {
    if (!row?.association) continue;
    const key = row.evidenceId || JSON.stringify([row.noteTitle, row.evidence]);
    const context = contexts.get(key) || { sum: 0, count: 0 };
    context.sum += row.association.score;
    context.count++;
    contexts.set(key, context);
  }
  const unique = [...contexts.values()];
  return {
    score: unique.length
      ? unique.reduce((sum, row) => sum + row.sum / row.count, 0) / unique.length
      : 0,
    evidenceCount: unique.length,
  };
}

export const compareRelationScore = (a: RelationAssociationRank, b: RelationAssociationRank) =>
  b.score - a.score || b.evidenceCount - a.evidenceCount;

/** Original keyword identity stays independent of its classification pattern. */
export { relationKeywordKey as relationEntityKey };

const relationSentenceEntityKeys = (sentence: RelationEntitySources['sentences'][number]) =>
  sentence.entityKeys ?? sentence.entities.map(relationKeywordKey);

/** Index once per result; detail navigation never scans the entire evidence corpus. */
export function createRelationResultsIndex(
  inventory: RelationEntityResult['entities'],
  candidates: InductiveRelationCandidate[],
  details: Record<string, RelationEntitySources> = {},
  entityTypes: RelationEntityType[] = []
) {
  const { compounds, constituents } = analyzeRelationKeywordComposition(inventory);
  const compoundKeys = new Set(compounds.map((compound) => compound.key));
  const containedKeys = new Set(compounds.flatMap((compound) => compound.keywords));
  const constituentKeys = new Set(constituents.map((keyword) => keyword.key));
  const syntheticKeys = new Set(constituents.flatMap((keyword) => keyword.sourceKeys));
  const originals = new Map(
    inventory.map((entity) => [relationKeywordKey(relationKeywordEntityKey(entity)), entity])
  );
  const constituentSources = new Map<string, RelationEntitySources['sources']>();
  const indexedInventory = [...inventory];
  for (const constituent of constituents) {
    if (originals.has(constituent.key)) continue;
    const supporters = constituent.sourceKeys.map((key) => originals.get(key)!);
    const sources = [
      ...new Map(
        supporters.flatMap((entity) =>
          (details[relationKeywordEntityKey(entity)]?.sources || []).map((source) => {
            const projected = { ...source, keyword: constituent.key };
            return [JSON.stringify(projected), projected] as const;
          })
        )
      ).values(),
    ];
    constituentSources.set(constituent.key, sources);
    indexedInventory.push({
      key: constituent.key,
      text: constituent.key,
      type: null,
      mentionCount:
        sources.length || supporters.reduce((sum, entity) => sum + entity.mentionCount, 0),
      noteCount: sources.length
        ? new Set(sources.map((source) => source.noteTitle)).size
        : Math.max(...supporters.map((entity) => entity.noteCount)),
    });
  }
  const entityTypeLabels: Record<string, string> = {};
  const rootMemberships = new Map<number, string[]>();
  for (const [index, type] of entityTypes.entries()) {
    if (type.parentIndices.length) continue;
    const key = JSON.stringify(type.items.map(relationEnumerationItemKey).sort());
    entityTypeLabels[key] = type.name;
    for (const member of [index, ...type.childIndices]) {
      const roots = rootMemberships.get(member) || [];
      roots.push(key);
      rootMemberships.set(member, roots);
    }
  }
  const memberships = new Map<string, Set<number>>();
  for (const [index, type] of entityTypes.entries())
    for (const item of type.items)
      for (const keyword of item.keywords) {
        let types = memberships.get(keyword.key);
        if (!types) memberships.set(keyword.key, (types = new Set()));
        types.add(index);
      }
  const entities = new Map<string, RelationEntityDetail>(
    indexedInventory.map((entity) => {
      const key = relationKeywordEntityKey(entity);
      const normalizedKey = relationKeywordKey(key);
      const membership = memberships.get(key) || new Set<number>();
      const entityTypeNames = [
        ...new Set(
          [...membership]
            .filter(
              (index) => !entityTypes[index].childIndices.some((child) => membership.has(child))
            )
            .sort((a, b) => entityTypes[b].items.length - entityTypes[a].items.length)
            .map((index) => entityTypes[index].name)
        ),
      ];
      return [
        key,
        {
          ...entity,
          key,
          relationships: new Map(),
          relatedEntities: new Set(),
          sources: details[key]?.sources || constituentSources.get(key) || [],
          isCompoundKeyword: compoundKeys.has(normalizedKey),
          isConstituentKeyword: constituentKeys.has(normalizedKey),
          isSyntheticKeyword: syntheticKeys.has(normalizedKey),
          isContainedKeyword: containedKeys.has(normalizedKey),
          generalRelations: {
            entityTypes: [],
            compoundKeys: [],
            containedKeys: [],
            syntheticKeys: [],
            constituentKeys: [],
          },
          entityTypeNames,
          entityTypeKeys: [
            ...new Set([...membership].flatMap((index) => rootMemberships.get(index) || [])),
          ],
        },
      ];
    })
  );
  const normalizedEntities = new Map(
    [...entities.values()].map((entity) => [relationKeywordKey(entity.key), entity])
  );
  for (const type of entityTypes) {
    const keywordKeys = [
      ...new Set(type.items.flatMap((item) => item.keywords.map((keyword) => keyword.key))),
    ].filter((key) => entities.has(key));
    const membership = { name: type.name, keywordKeys };
    for (const key of keywordKeys) {
      const entity = entities.get(key)!;
      entity.generalRelations!.entityTypes.push(membership);
    }
  }
  const patterns = new Map<string, RelationEntityMembership>();
  for (const entity of entities.values()) {
    if (!entity.type) continue;
    let membership = patterns.get(entity.type);
    if (!membership) {
      membership = { name: entity.type, keywordKeys: [] };
      patterns.set(entity.type, membership);
    }
    membership.keywordKeys.push(entity.key);
    entity.generalRelations!.pattern = membership;
  }
  for (const compound of compounds) {
    const owner = normalizedEntities.get(compound.key);
    if (!owner) continue;
    for (const key of compound.keywords) {
      const contained = normalizedEntities.get(key);
      if (!contained) continue;
      owner.generalRelations!.containedKeys.push(contained.key);
      contained.generalRelations!.compoundKeys.push(owner.key);
    }
  }
  for (const constituent of constituents) {
    const component = normalizedEntities.get(constituent.key);
    if (!component) continue;
    for (const key of constituent.sourceKeys) {
      const owner = normalizedEntities.get(key);
      if (!owner) continue;
      owner.generalRelations!.constituentKeys.push(component.key);
      component.generalRelations!.syntheticKeys.push(owner.key);
    }
  }
  const relations = new Map<string, RelationDetail>();
  const relationshipSentences = new WeakMap<EntityRelationship, Set<string>>();
  const sentenceLocations = new Map<string, Map<string, RelationEntitySources['sentences']>>();
  for (const key of candidates.length ? entities.keys() : []) {
    const locations = new Map<string, RelationEntitySources['sentences']>();
    for (const sentence of details[key]?.sentences || []) {
      const location = JSON.stringify([sentence.noteTitle, sentence.section]);
      const rows = locations.get(location) || [];
      rows.push(sentence);
      locations.set(location, rows);
    }
    sentenceLocations.set(key, locations);
  }
  for (const candidate of candidates) {
    const ranking = relationCandidateRank(candidate);
    const verificationIds = new Map<string, number>();
    const evidence = relationCandidateEvidence(candidate);
    evidence.forEach((relationEvidence) => {
      const { observation } = relationEvidence;
      const verificationKey = JSON.stringify(relationEvidence);
      const verificationId = verificationIds.get(verificationKey) ?? verificationIds.size;
      verificationIds.set(verificationKey, verificationId);
      const source = relationKeywordKey(observation.source);
      const target = relationKeywordKey(observation.target);
      for (const key of new Set([source, target])) {
        const entity = entities.get(key);
        if (!entity) continue;
        let relationship = entity.relationships.get(candidate.id);
        if (!relationship) {
          relationship = {
            ...ranking,
            sentences: [],
          };
          entity.relationships.set(candidate.id, relationship);
          relationshipSentences.set(relationship, new Set());
        }
        const other = key === source ? target : source;
        if (other !== key && entities.has(other)) {
          entity.relatedEntities.add(other);
        }
        const matching = (
          sentenceLocations
            .get(key)
            ?.get(JSON.stringify([observation.noteTitle, observation.section])) || []
        ).filter(
          (sentence) =>
            relationKeywordKey(sentence.text).includes(relationKeywordKey(observation.evidence)) &&
            relationSentenceEntityKeys(sentence).includes(other)
        );
        const sentences = matching.length
          ? matching
          : [
              {
                noteTitle: observation.noteTitle,
                section: observation.section,
                sectionPath: observation.sectionPath,
                text: observation.evidence,
              },
            ];
        for (const sentence of sentences) {
          const indexed = relationshipSentences.get(relationship)!;
          const sentenceKey = JSON.stringify([
            sentence.noteTitle,
            sentence.section,
            sentence.sectionPath,
            sentence.text,
            other,
            verificationId,
          ]);
          if (indexed.has(sentenceKey)) continue;
          indexed.add(sentenceKey);
          relationship.sentences.push({
            context: sentence,
            relatedEntityKey: other,
            evidence: relationEvidence,
          });
        }
      }
    });
    relations.set(candidate.id, { candidate, ...ranking, evidence });
  }
  return { entities, relations, entityTypeLabels };
}

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

/** Group kinds and the evidence criterion are choices within the same OR/AND filter. */
export function matchesRelationGroupingFilter<T extends string>(
  selected: T[],
  kind: T,
  evidenceSelected: boolean,
  evidenceSatisfied: boolean,
  operator: RelationFilterOperator = 'or'
) {
  return matchesRelationFilter<string>(
    [...selected, ...(evidenceSelected ? ['evidence-satisfied'] : [])],
    [kind, ...(evidenceSatisfied ? ['evidence-satisfied'] : [])],
    operator
  );
}

export type RelationAssociationType = AssociationContextKind;

export const relationAssociationTypeLabels = associationContextLabels;

/** Pending evidence retains its candidate's type; older results use their source category. */
export function relationAssociationType({
  observation,
  measurement,
  associationContext,
}: {
  observation: RelationObservation;
  measurement?: RelationEvidenceMeasurement;
  associationContext?: RelationAssociationType;
}): RelationAssociationType {
  return (
    measurement?.association?.context ??
    associationContext ??
    (observation.origin === 'table' ? 'table-row' : observation.origin)
  );
}

/** Match the exact population used for scoring, independently of the concrete entity pair. */
export function relationAggregationBasis(row: RelationEvidence): string {
  return row.associationFamily ?? JSON.stringify([relationAssociationType(row)]);
}

export type RelationAggregationKind = 'property' | 'table-columns' | 'evidence-group';

export const relationAggregationKindLabels: Record<RelationAggregationKind, string> = {
  property: 'Property',
  'table-columns': 'Table column combination',
  'evidence-group': 'Evidence group',
};

/** Filter the three visible group kinds rather than individual property names or column pairs. */
export function relationAggregationKind(row: RelationEvidence): RelationAggregationKind {
  if (!row.associationRoles?.length) return 'evidence-group';
  const type = relationAssociationType(row);
  return type === 'field' || type === 'field-value'
    ? 'property'
    : type === 'table-row'
    ? 'table-columns'
    : 'evidence-group';
}

export function countRelationAggregationKinds(
  rows: Iterable<RelationEvidence>,
  associationTypes: RelationAssociationType[] = []
) {
  const counts = { all: 0, property: 0, 'table-columns': 0, 'evidence-group': 0 };
  for (const row of rows) {
    if (matchesRelationFilter(associationTypes, relationAssociationType(row))) {
      counts.all++;
      counts[relationAggregationKind(row)]++;
    }
  }
  return counts;
}

/** Count individual evidence rows by their association type. */
export function countRelationAssociationTypes(types: Iterable<RelationAssociationType>) {
  const counts = {
    all: 0,
    sentence: 0,
    'list-item': 0,
    field: 0,
    'table-row': 0,
    'table-cell': 0,
    'field-value': 0,
  };
  for (const type of types) {
    counts.all++;
    counts[type]++;
  }
  return counts;
}

export type RelationGroupingKind = 'type' | 'pattern' | 'keyword';

export const relationGroupingKindLabels: Record<RelationGroupingKind, string> = {
  type: 'Entity type',
  pattern: 'Entity pattern',
  keyword: 'Keyword',
};

/** Each top-level group contributes exactly once, regardless of its evidence count. */
export function countRelationGroupingKinds(kinds: Iterable<RelationGroupingKind>) {
  const counts = { all: 0, type: 0, pattern: 0, keyword: 0 };
  for (const kind of kinds) {
    counts.all++;
    counts[kind]++;
  }
  return counts;
}

export type RelationPairGroupingKind =
  | 'type-type'
  | 'type-pattern'
  | 'type-keyword'
  | 'pattern-pattern'
  | 'pattern-keyword'
  | 'keyword-keyword';

/** Compose pair labels from the same translated names as the individual grouping filter. */
export function relationPairGroupingKindLabels(
  translate: (value: string) => string = (value) => value
): Record<RelationPairGroupingKind, string> {
  const type = translate(relationGroupingKindLabels.type);
  const pattern = translate(relationGroupingKindLabels.pattern);
  const keyword = translate(relationGroupingKindLabels.keyword);
  return {
    'type-type': `${type} - ${type}`,
    'type-pattern': `${type} - ${pattern}`,
    'type-keyword': `${type} - ${keyword}`,
    'pattern-pattern': `${pattern} - ${pattern}`,
    'pattern-keyword': `${pattern} - ${keyword}`,
    'keyword-keyword': `${keyword} - ${keyword}`,
  };
}

/** Classify both displayed endpoints without distinguishing A–B from B–A. */
export function relationPairGroupingKind(
  source: { kind: RelationGroupingKind },
  target: { kind: RelationGroupingKind }
): RelationPairGroupingKind {
  const order = { type: 0, pattern: 1, keyword: 2 };
  const [first, second] = [source.kind, target.kind].sort((a, b) => order[a] - order[b]);
  return `${first}-${second}` as RelationPairGroupingKind;
}

export function countRelationPairGroupingKinds(kinds: Iterable<RelationPairGroupingKind>) {
  const counts = {
    all: 0,
    'type-type': 0,
    'type-pattern': 0,
    'type-keyword': 0,
    'pattern-pattern': 0,
    'pattern-keyword': 0,
    'keyword-keyword': 0,
  };
  for (const kind of kinds) {
    counts.all++;
    counts[kind]++;
  }
  return counts;
}

/** Repeated numeric or common-prefix structure in literal entity names. */
export type RelationEntityPattern = 'numeric' | 'prefix' | 'none';

export const relationEntityPatternLabels: Record<RelationEntityPattern, string> = {
  numeric: 'Numeric pattern',
  prefix: 'Common prefix',
  none: 'None',
};

/** Group name patterns without replacing the original pattern shown in details. */
export function relationEntityPattern(pattern: string | null): RelationEntityPattern {
  if (pattern?.includes('{{NUM}}')) return 'numeric';
  if (pattern?.endsWith('{{TEXT}}')) return 'prefix';
  return 'none';
}

export function countRelationEntityPatterns(patterns: Iterable<string | null>) {
  const counts = { all: 0, numeric: 0, prefix: 0, none: 0 };
  for (const pattern of patterns) {
    counts.all++;
    counts[relationEntityPattern(pattern)]++;
  }
  return counts;
}

export type RelationKeywordComposition =
  | 'compound'
  | 'contained'
  | 'synthetic'
  | 'constituent'
  | 'none';

export const relationKeywordCompositionLabels: Record<RelationKeywordComposition, string> = {
  compound: 'Compound keyword',
  contained: 'Contained keyword',
  synthetic: 'Synthetic keyword',
  constituent: 'Constituent keyword',
  none: 'None',
};

/** Nested names may contain smaller keywords and also belong inside larger keywords. */
export function relationKeywordComposition(entity: {
  isCompoundKeyword?: boolean;
  isConstituentKeyword?: boolean;
  isSyntheticKeyword?: boolean;
  isContainedKeyword?: boolean;
}): RelationKeywordComposition[] {
  const values: RelationKeywordComposition[] = [];
  if (entity.isCompoundKeyword) values.push('compound');
  if (entity.isContainedKeyword) values.push('contained');
  if (entity.isSyntheticKeyword) values.push('synthetic');
  if (entity.isConstituentKeyword) values.push('constituent');
  return values.length ? values : ['none'];
}

export function countRelationKeywordCompositions(items: Iterable<RelationKeywordComposition[]>) {
  const counts = { all: 0, compound: 0, contained: 0, synthetic: 0, constituent: 0, none: 0 };
  for (const values of items) {
    counts.all++;
    for (const value of new Set(values)) counts[value]++;
  }
  return counts;
}

export type RelationSourceType = RelationKeywordSource['kind'];

export const relationSourceTypeLabels: Record<RelationSourceType, string> = {
  title: 'Note',
  heading: 'Paragraph',
  link: 'Reference',
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
