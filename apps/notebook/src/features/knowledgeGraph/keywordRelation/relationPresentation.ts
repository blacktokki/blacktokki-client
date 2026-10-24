import { relationKeywordKey } from './keyword/keywordUtils';
import {
  matchesRelationFilter,
  relationAggregationBasis,
  relationAggregationKind,
  relationAssociationType,
  compareRelationScore,
  relationCandidateEvidence,
  relationCandidateRank,
} from './relationResults';
import type {
  RelationAggregationKind,
  RelationAssociationType,
  RelationFilterOperator,
  RelationGroupingKind,
  RelationEvidence,
} from './relationResults';
import type { InductiveRelationCandidate, RelationObservation } from './types';

/** Collapse type-pattern copies, preserving source text, optional full context and metric differences. */
export function uniqueRelationEvidence<T extends RelationEvidence>(
  rows: T[],
  sourceContextOf?: (row: T) => string | undefined
): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const { observation, measurement, associationContext } = row;
    const source = relationKeywordKey(observation.source);
    const target = relationKeywordKey(observation.target);
    const reversed = source.localeCompare(target) > 0;
    const metrics = measurement?.association;
    const key = JSON.stringify([
      [source, target].sort((a, b) => a.localeCompare(b)),
      metrics?.context ?? associationContext ?? observation.origin,
      row.associationFamily,
      observation.noteTitle,
      observation.sectionPath ?? observation.section,
      observation.evidence,
      sourceContextOf?.(row),
      observation.direction,
      metrics && [
        metrics.contextCount,
        reversed ? metrics.targetCount : metrics.sourceCount,
        reversed ? metrics.sourceCount : metrics.targetCount,
        metrics.pairCount,
        metrics.lift,
        metrics.npmi,
        metrics.specificity,
        metrics.score,
      ],
    ]);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export type RelationTypeRole = { kind: RelationGroupingKind; name: string };

/** Require selected contexts within the same concrete pair and retain only matching evidence. */
export function filterRelationEvidence<T extends RelationEvidence>(
  rows: T[],
  associationTypes: RelationAssociationType[] = [],
  aggregationKinds: RelationAggregationKind[] = [],
  associationOperator: RelationFilterOperator = 'or',
  aggregationOperator: RelationFilterOperator = 'or'
): T[] {
  const matching = rows.filter(
    (item) =>
      matchesRelationFilter(associationTypes, relationAssociationType(item)) &&
      matchesRelationFilter(aggregationKinds, relationAggregationKind(item))
  );
  const retained = new Set<T>();
  for (const pair of groupRelationEvidenceByPair(matching, (item) => item.observation)) {
    if (
      matchesRelationFilter(
        associationTypes,
        pair.items.map(relationAssociationType),
        associationOperator
      ) &&
      matchesRelationFilter(
        aggregationKinds,
        pair.items.map(relationAggregationKind),
        aggregationOperator
      )
    ) {
      for (const item of pair.items) retained.add(item);
    }
  }
  return matching.filter((item) => retained.has(item));
}

/** Satisfy at least two conditions: repeated children, limited singletons and a score of at least 0.5. */
export function relationGroupEvidenceSatisfied(rows: RelationEvidence[], groupScore = 0): boolean {
  let repeated = 0;
  let single = 0;
  for (const pair of groupRelationEvidenceByPair(rows, (item) => item.observation)) {
    const sources = new Set(
      pair.items.map(({ observation }) =>
        JSON.stringify([
          observation.noteTitle,
          observation.sectionPath ?? (observation.section ? [observation.section] : []),
          observation.evidence,
        ])
      )
    );
    if (sources.size >= 2) repeated++;
    else single++;
  }
  return [repeated >= 2, single <= 1, groupScore >= 0.5].filter(Boolean).length >= 2;
}

const relationTypeRoleKey = (role: RelationTypeRole) =>
  JSON.stringify([role.kind, relationKeywordKey(role.name)]);

/** Select the same descriptor priority for relationship lists and an entity's related peers. */
function relationTypeRole(
  type: string | undefined,
  pattern: string | null,
  keyword: string
): RelationTypeRole {
  return type?.trim()
    ? { kind: 'type', name: type }
    : pattern?.trim()
    ? { kind: 'pattern', name: pattern }
    : { kind: 'keyword', name: keyword };
}

/** Keep keyword children only when richer groups do not already contain the same concrete pair. */
function resolveRelationKeywordGroups<
  T extends RelationEvidence,
  G extends { key: string; items: T[] }
>(
  groups: G[],
  rolesOf: (group: G) => RelationTypeRole[],
  keywordGroup: (pair: RelationEvidencePair<T>) => G
): G[] {
  const keywordCount = (group: G) =>
    rolesOf(group).filter((role) => role.kind === 'keyword').length;
  const typeCount = (group: G) => rolesOf(group).filter((role) => role.kind === 'type').length;
  const sorted = [...groups].sort(
    (a, b) =>
      keywordCount(a) - keywordCount(b) || (keywordCount(a) ? typeCount(b) - typeCount(a) : 0)
  );
  const retained: G[] = [];
  const pending: G[] = [];
  const owners = new Map<string, G[]>();
  for (const group of sorted) {
    const pairs = groupRelationEvidenceByPair(group.items, (item) => item.observation);
    const remaining = keywordCount(group) ? pairs.filter((pair) => !owners.has(pair.key)) : pairs;
    if (rolesOf(group).some((role) => role.kind !== 'keyword') && remaining.length >= 2) {
      const keptItems = new Set(remaining.flatMap((pair) => pair.items));
      const kept = { ...group, items: group.items.filter((item) => keptItems.has(item)) };
      retained.push(kept);
      for (const pair of remaining) {
        const groups = owners.get(pair.key) ?? [];
        groups.push(kept);
        owners.set(pair.key, groups);
      }
      const remainingKeys = new Set(remaining.map((pair) => pair.key));
      for (const pair of pairs) if (!remainingKeys.has(pair.key)) pending.push(keywordGroup(pair));
    } else {
      for (const pair of pairs) pending.push(keywordGroup(pair));
    }
  }
  const keywords = new Map<string, G>();
  for (const group of pending) {
    const pair = groupRelationEvidenceByPair(group.items, (item) => item.observation)[0];
    const existing = owners.get(pair.key);
    if (existing) {
      for (const owner of existing) {
        for (const item of group.items) owner.items.push(item);
      }
    } else {
      let keyword = keywords.get(group.key);
      if (!keyword) keywords.set(group.key, (keyword = { ...group, items: [] }));
      for (const item of group.items) keyword.items.push(item);
    }
  }
  return [...retained, ...keywords.values()];
}

/** Group peers by type or pattern only when at least two distinct peers share the descriptor. */
export function groupRelationEvidenceByPeerRole<T extends RelationEvidence>(
  rows: T[],
  entityKey: string
) {
  const selected = relationKeywordKey(entityKey);
  type PeerGroup = { key: string; role: RelationTypeRole; items: T[] };
  const groups = new Map<string, PeerGroup>();
  for (const row of rows) {
    const { observation } = row;
    const side =
      relationKeywordKey(observation.source) === selected
        ? 'target'
        : relationKeywordKey(observation.target) === selected
        ? 'source'
        : undefined;
    if (!side) continue;
    const role = relationTypeRole(
      observation[`${side}EntityTypes`]?.[0],
      observation[`${side}Type`],
      observation[side]
    );
    const key = relationTypeRoleKey(role);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, role, items: [] }));
    group.items.push(row);
  }
  return resolveRelationKeywordGroups<T, PeerGroup>(
    [...groups.values()],
    (group) => [group.role],
    (pair) => {
      const role: RelationTypeRole = {
        kind: 'keyword',
        name: pair.sourceKey === selected ? pair.target : pair.source,
      };
      return { key: relationTypeRoleKey(role), role, items: pair.items };
    }
  );
}

/** Keep the actual scoring population and unordered pair together, regardless of source note. */
export function groupRelationEvidenceByBasis<T extends RelationEvidence>(rows: T[]) {
  const groups = new Map<
    string,
    {
      key: string;
      sourceKey: string;
      associationType: RelationAssociationType;
      roles: string[];
      items: T[];
    }
  >();
  for (const row of rows) {
    const associationType = relationAssociationType(row);
    const family = relationAggregationBasis(row);
    const pair = [row.observation.source, row.observation.target]
      .map(relationKeywordKey)
      .sort((a, b) => a.localeCompare(b));
    const key = JSON.stringify([associationType, family, pair]);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        sourceKey: pair[0],
        associationType,
        roles: row.associationRoles ?? [],
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(row);
  }
  return [...groups.values()];
}

type RelationTypeGroup<T> = {
  key: string;
  associationType: RelationAssociationType;
  sourceRole: RelationTypeRole;
  targetRole: RelationTypeRole;
  items: T[];
};

/** Group undirected type combinations before concrete pairs, retaining name-pattern and literal fallbacks. */
export function groupRelationEvidenceByType<T extends RelationEvidence>(
  rows: T[]
): RelationTypeGroup<T>[] {
  const groups = new Map<string, RelationTypeGroup<T>>();
  for (const row of rows) {
    const { observation } = row;
    const roles = [
      relationTypeRole(
        observation.sourceEntityTypes?.[0],
        observation.sourceType,
        observation.source
      ),
      relationTypeRole(
        observation.targetEntityTypes?.[0],
        observation.targetType,
        observation.target
      ),
    ].sort((a, b) => relationTypeRoleKey(a).localeCompare(relationTypeRoleKey(b)));
    const associationType = relationAssociationType(row);
    const key = JSON.stringify([associationType, ...roles.map(relationTypeRoleKey)]);
    let group = groups.get(key);
    if (!group) {
      group = { key, associationType, sourceRole: roles[0], targetRole: roles[1], items: [] };
      groups.set(key, group);
    }
    group.items.push(row);
  }
  return [...groups.values()];
}

type RelationContextFilters = {
  associationTypes?: RelationAssociationType[];
  aggregationKinds?: RelationAggregationKind[];
  associationOperator?: RelationFilterOperator;
  aggregationOperator?: RelationFilterOperator;
};

/** Apply context filters before keyword fallbacks, keeping association types within their role pair. */
export function groupRelationEvidenceByRolePair<T extends RelationEvidence>(
  rows: T[],
  filters?: RelationContextFilters
) {
  const filtered = filters
    ? filterRelationEvidence(
        rows,
        filters.associationTypes,
        filters.aggregationKinds,
        filters.associationOperator,
        filters.aggregationOperator
      )
    : rows;
  type RolePairGroup = {
    key: string;
    sourceRole: RelationTypeRole;
    targetRole: RelationTypeRole;
    items: T[];
  };
  const groups = new Map<string, RolePairGroup>();
  for (const association of groupRelationEvidenceByType(filtered)) {
    const key = JSON.stringify(
      [association.sourceRole, association.targetRole].map((role) => [
        role.kind,
        relationKeywordKey(role.name),
      ])
    );
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        sourceRole: association.sourceRole,
        targetRole: association.targetRole,
        items: [],
      };
      groups.set(key, group);
    }
    for (const item of association.items) group.items.push(item);
  }
  return resolveRelationKeywordGroups<T, RolePairGroup>(
    [...groups.values()],
    (group) => [group.sourceRole, group.targetRole],
    (pair) => {
      const roles: RelationTypeRole[] = [pair.source, pair.target].map((name) => ({
        kind: 'keyword',
        name,
      }));
      return {
        key: JSON.stringify(roles.map((role) => [role.kind, relationKeywordKey(role.name)])),
        sourceRole: roles[0],
        targetRole: roles[1],
        items: pair.items,
      };
    }
  ).map((group) => {
    const associations = new Map<RelationAssociationType, RelationTypeGroup<T>>();
    for (const item of group.items) {
      const associationType = relationAssociationType(item);
      let association = associations.get(associationType);
      if (!association) {
        association = {
          key: JSON.stringify([
            associationType,
            ...[group.sourceRole, group.targetRole].map(relationTypeRoleKey),
          ]),
          associationType,
          sourceRole: group.sourceRole,
          targetRole: group.targetRole,
          items: [],
        };
        associations.set(associationType, association);
      }
      association.items.push(item);
    }
    return { ...group, associations: [...associations.values()] };
  });
}

export type RelationEvidencePair<T> = {
  key: string;
  sourceKey: string;
  targetKey: string;
  source: string;
  target: string;
  items: T[];
};

/** Match the result index's candidate identities, ranking and final displayed group resolution. */
export function groupRelationCandidatesByRolePair(
  candidates: InductiveRelationCandidate[],
  filters?: RelationContextFilters
) {
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const evidence = unique
    .map((candidate) => ({ candidate, ...relationCandidateRank(candidate) }))
    .sort(compareRelationScore)
    .flatMap(({ candidate }) => relationCandidateEvidence(candidate));
  return groupRelationEvidenceByRolePair(evidence, filters);
}

/** Group normalized unordered endpoints while retaining each original evidence row and its rank. */
export function groupRelationEvidenceByPair<T>(
  rows: T[],
  observationOf: (row: T) => Pick<RelationObservation, 'source' | 'target'>
): RelationEvidencePair<T>[] {
  const pairs = new Map<string, RelationEvidencePair<T>>();
  for (const row of rows) {
    const observation = observationOf(row);
    const endpoints = [observation.source, observation.target]
      .map((text) => ({ text, key: relationKeywordKey(text) }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const [source, target] = endpoints;
    const key = JSON.stringify(endpoints.map((endpoint) => endpoint.key));
    let pair = pairs.get(key);
    if (!pair) {
      pair = {
        key,
        sourceKey: source.key,
        targetKey: target.key,
        source: source.text,
        target: target.text,
        items: [],
      };
      pairs.set(key, pair);
    }
    pair.items.push(row);
  }
  return [...pairs.values()];
}

export type RelationSentenceSegment = { text: string; entityKey?: string };

/** Highlight known endpoints in source titles without reconstructing or changing the source text. */
export function relationEvidenceTitleSegments(
  text: string,
  source: string,
  target: string
): RelationSentenceSegment[] {
  const names = [...new Set([source, target])].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text }];
  const expression = new RegExp(
    names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'giu'
  );
  const segments: RelationSentenceSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    const start = match.index!;
    const end = start + match[0].length;
    if (/[\p{L}\p{N}]$/u.test(text.slice(0, start))) continue;
    const after = text.slice(end);
    if (
      /^[\p{L}\p{N}]/u.test(after) &&
      !/^(?:은|는|이|가|을|를|의|에|에서|에게|으로|로|와|과|도|만|부터|까지)+(?:\s|[.,!?]|$)/.test(
        after
      )
    )
      continue;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: match[0], entityKey: relationKeywordKey(match[0]) });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/** Keep literal slashes in headings; older in-memory results can still use their displayed path. */
export function relationSectionParams(
  noteTitle: string,
  section: string,
  sectionPath?: string[]
): { title: string; paragraph?: string; section?: string } {
  const path = sectionPath?.length ? sectionPath : section.split(' / ').filter(Boolean);
  const paragraph = path.at(-1);
  const parent = path.at(-2);
  return paragraph
    ? { title: noteTitle, paragraph, ...(parent ? { section: parent } : {}) }
    : { title: noteTitle };
}
