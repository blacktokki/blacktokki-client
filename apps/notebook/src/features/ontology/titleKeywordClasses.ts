interface BaseTitleKeywordCandidate {
  /** Node that becomes an instance of the generated class. */
  nodeId: string;
  /** Stable ID of the source title occurrence, shared by inherited card candidates. */
  occurrenceId?: string;
  title: string;
}

export type TitleKeywordCandidate =
  | (BaseTitleKeywordCandidate & { scope: 'NOTE' })
  | (BaseTitleKeywordCandidate & { scope: 'HEADER'; level: number; noteId: string });

export interface TitleKeywordGroup {
  keyword: string;
  scope: 'NOTE' | 'HEADER';
  level?: number;
  memberNodeIds: string[];
}

export interface GenericTitleKeywordCandidate {
  nodeId: string;
  occurrenceId?: string;
  title: string;
  noteId: string;
}

export interface GenericTitleKeywordGroup {
  keyword: string;
  memberNodeIds: string[];
}

export interface SpecializedTitleKeywordClass {
  classId: string;
  keyword: string;
  memberNodeIds: string[];
}

export interface GenericTitleKeywordAssignment {
  subclassIds: string[];
  directMemberNodeIds: string[];
}

export interface CardTypeCandidate {
  nodeId: string;
  parentTitle: string;
}

export interface CardTypeGroup {
  normalizedTitle: string;
  title: string;
  memberNodeIds: string[];
}

interface HeaderPathCandidate {
  path: string;
  title: string;
  level: number;
}

const KOREAN_PARTICLES =
  /(은|는|이|가|을|를|의|에|로|으로|와|과|도|에서|에게|부터|까지|하고|이며|이고|란|이란)$/;

const STOP_WORDS = new Set([
  '있다',
  '하다',
  '되다',
  '이다',
  '있는',
  '하는',
  '되는',
  '위한',
  '통해',
  '대한',
  '관한',
  '그',
  '이',
  '저',
  '것',
  '수',
  '등',
  '및',
  '또는',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'in',
  'on',
  'of',
  'to',
  'for',
  'and',
  'with',
  'or',
  'at',
  'by',
  'from',
  'that',
  'this',
]);

export const normalizeTitle = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** True when every searchable token consists only of decimal digits. */
export const isNumericOnlyKeyword = (value: string): boolean => {
  const tokens = normalizeTitle(value).match(/[a-zA-Z0-9가-힣]+/g) || [];
  return tokens.length > 0 && tokens.every((token) => /^\d+$/.test(token));
};

/** Remove ancestor note paths before comparing note titles. */
export const noteTitleForKeywordComparison = (value: string): string => {
  const segments = value.split('/').map((segment) => segment.trim());
  return [...segments].reverse().find(Boolean) || value.trim();
};

export const extractKeywords = (text: string): Set<string> => {
  const words = normalizeTitle(text).match(/[a-zA-Z0-9가-힣]+/g) || [];
  const keywords = new Set<string>();
  for (const raw of words) {
    if (raw.length < 2) continue;
    if (!STOP_WORDS.has(raw)) keywords.add(raw);
    const stem = raw.replace(KOREAN_PARTICLES, '');
    if (stem.length >= 2 && !STOP_WORDS.has(stem)) keywords.add(stem);
  }
  return keywords;
};

/** Return only the closest ancestor heading for a card heading. */
export const findNearestParentHeader = <T extends HeaderPathCandidate>(
  headers: T[],
  card: HeaderPathCandidate
): T | undefined => {
  let nearest: T | undefined;
  let nearestDepth = -1;
  for (const header of headers) {
    if (
      header.level <= 0 ||
      header.level >= card.level ||
      !card.path.startsWith(header.path + ',') ||
      !header.title.trim()
    ) {
      continue;
    }
    const depth = header.path.split(',').length;
    if (depth > nearestDepth) {
      nearest = header;
      nearestDepth = depth;
    }
  }
  return nearest;
};

/** Group note titles globally and header titles only within the same heading level. */
export const buildTitleKeywordGroups = (
  candidates: TitleKeywordCandidate[]
): TitleKeywordGroup[] => {
  const normalizedCandidates = candidates
    .map((candidate, index) => ({
      ...candidate,
      occurrenceId: candidate.occurrenceId || `${candidate.nodeId}:${index}`,
      normalizedTitle: normalizeTitle(candidate.title),
    }))
    .filter((candidate) => candidate.normalizedTitle.length >= 2);
  const sharedKeywords = new Map<number, Set<string>>();

  for (let leftIndex = 0; leftIndex < normalizedCandidates.length; leftIndex++) {
    const left = normalizedCandidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedCandidates.length; rightIndex++) {
      const right = normalizedCandidates[rightIndex];
      if (left.scope !== right.scope) continue;
      if (left.scope === 'HEADER' && right.scope === 'HEADER' && left.level !== right.level) {
        continue;
      }
      if (left.occurrenceId === right.occurrenceId) continue;
      const containedTitle = left.normalizedTitle.includes(right.normalizedTitle)
        ? right.normalizedTitle
        : right.normalizedTitle.includes(left.normalizedTitle)
        ? left.normalizedTitle
        : undefined;
      if (!containedTitle) continue;
      for (const index of [leftIndex, rightIndex]) {
        const keywords = sharedKeywords.get(index) || new Set<string>();
        keywords.add(containedTitle);
        sharedKeywords.set(index, keywords);
      }
    }
  }

  const buckets = new Map<
    string,
    {
      keyword: string;
      scope: TitleKeywordCandidate['scope'];
      level?: number;
      memberNodeIds: Set<string>;
      occurrenceIds: Set<string>;
      exactMemberIds: Set<string>;
      noteIds: Set<string>;
    }
  >();

  normalizedCandidates.forEach((candidate, index) => {
    const { normalizedTitle } = candidate;
    const keywords = extractKeywords(candidate.title);
    keywords.add(normalizedTitle);
    sharedKeywords.get(index)?.forEach((keyword) => keywords.add(keyword));

    for (const keyword of keywords) {
      if (isNumericOnlyKeyword(keyword)) continue;
      const scopeKey = candidate.scope === 'HEADER' ? `HEADER:${candidate.level}` : candidate.scope;
      const key = JSON.stringify([scopeKey, keyword]);
      const bucket = buckets.get(key) || {
        keyword,
        scope: candidate.scope,
        level: candidate.scope === 'HEADER' ? candidate.level : undefined,
        memberNodeIds: new Set<string>(),
        occurrenceIds: new Set<string>(),
        exactMemberIds: new Set<string>(),
        noteIds: new Set<string>(),
      };
      bucket.memberNodeIds.add(candidate.nodeId);
      bucket.occurrenceIds.add(candidate.occurrenceId);
      bucket.noteIds.add(candidate.scope === 'HEADER' ? candidate.noteId : candidate.nodeId);
      if (keyword === normalizedTitle) bucket.exactMemberIds.add(candidate.nodeId);
      buckets.set(key, bucket);
    }
  });

  const candidatesByExtension = new Map<
    string,
    (TitleKeywordGroup & { isExactTitleGroup: boolean })[]
  >();
  for (const bucket of buckets.values()) {
    const memberNodeIds = [...bucket.memberNodeIds].sort();
    if (bucket.scope === 'NOTE') {
      if (bucket.occurrenceIds.size < 3 || memberNodeIds.length < 3) continue;
    } else if (bucket.scope === 'HEADER') {
      if (bucket.noteIds.size < 3 || memberNodeIds.length < 3) continue;
    } else {
      if (bucket.occurrenceIds.size < 3 || memberNodeIds.length < 3) continue;
    }
    const signature = JSON.stringify([bucket.scope, bucket.level ?? null, memberNodeIds]);
    const candidate = {
      keyword: bucket.keyword,
      scope: bucket.scope,
      level: bucket.level,
      memberNodeIds,
      isExactTitleGroup: bucket.exactMemberIds.size === memberNodeIds.length,
    };
    const extensionCandidates = candidatesByExtension.get(signature) || [];
    extensionCandidates.push(candidate);
    candidatesByExtension.set(signature, extensionCandidates);
  }

  // Coextensional keywords are not necessarily the same concept. Preserve all
  // non-exact keywords even when the current snapshot gives them the same
  // members. Only an exact title shared by every member suppresses its token
  // fragments, which is an explicit lexical rule rather than class identity.
  const selectedCandidates = [...candidatesByExtension.values()].flatMap((candidates) => {
    const exactTitleCandidates = candidates.filter((candidate) => candidate.isExactTitleGroup);
    if (exactTitleCandidates.length === 0) return candidates;
    return [
      exactTitleCandidates.sort(
        (left, right) =>
          right.keyword.length - left.keyword.length || left.keyword.localeCompare(right.keyword)
      )[0],
    ];
  });

  return selectedCandidates
    .map(({ isExactTitleGroup: _isExactTitleGroup, ...group }) => group)
    .sort((a, b) =>
      JSON.stringify([a.scope, a.level ?? null, a.keyword, a.memberNodeIds]).localeCompare(
        JSON.stringify([b.scope, b.level ?? null, b.keyword, b.memberNodeIds])
      )
    );
};

/** Group title keywords across note-title, card-type and heading distinctions. */
export const buildGenericTitleKeywordGroups = (
  candidates: GenericTitleKeywordCandidate[]
): GenericTitleKeywordGroup[] => {
  const normalizedCandidates = candidates
    .map((candidate, index) => ({
      ...candidate,
      occurrenceId: candidate.occurrenceId || `${candidate.nodeId}:${index}`,
      normalizedTitle: normalizeTitle(candidate.title),
    }))
    .filter((candidate) => candidate.normalizedTitle.length >= 2);
  const sharedKeywords = new Map<number, Set<string>>();

  for (let leftIndex = 0; leftIndex < normalizedCandidates.length; leftIndex++) {
    const left = normalizedCandidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedCandidates.length; rightIndex++) {
      const right = normalizedCandidates[rightIndex];
      if (left.occurrenceId === right.occurrenceId) continue;
      const containedTitle = left.normalizedTitle.includes(right.normalizedTitle)
        ? right.normalizedTitle
        : right.normalizedTitle.includes(left.normalizedTitle)
        ? left.normalizedTitle
        : undefined;
      if (!containedTitle) continue;
      for (const index of [leftIndex, rightIndex]) {
        const keywords = sharedKeywords.get(index) || new Set<string>();
        keywords.add(containedTitle);
        sharedKeywords.set(index, keywords);
      }
    }
  }

  const buckets = new Map<
    string,
    {
      memberNodeIds: Set<string>;
      occurrenceIds: Set<string>;
      exactMemberIds: Set<string>;
      noteIds: Set<string>;
    }
  >();
  normalizedCandidates.forEach((candidate, index) => {
    const keywords = extractKeywords(candidate.title);
    keywords.add(candidate.normalizedTitle);
    sharedKeywords.get(index)?.forEach((keyword) => keywords.add(keyword));
    for (const keyword of keywords) {
      if (isNumericOnlyKeyword(keyword)) continue;
      const bucket = buckets.get(keyword) || {
        memberNodeIds: new Set<string>(),
        occurrenceIds: new Set<string>(),
        exactMemberIds: new Set<string>(),
        noteIds: new Set<string>(),
      };
      bucket.memberNodeIds.add(candidate.nodeId);
      bucket.occurrenceIds.add(candidate.occurrenceId);
      bucket.noteIds.add(candidate.noteId);
      if (keyword === candidate.normalizedTitle) bucket.exactMemberIds.add(candidate.nodeId);
      buckets.set(keyword, bucket);
    }
  });

  const candidatesByExtension = new Map<
    string,
    (GenericTitleKeywordGroup & { isExactTitleGroup: boolean })[]
  >();
  for (const [keyword, bucket] of buckets) {
    const memberNodeIds = [...bucket.memberNodeIds].sort();
    if (bucket.occurrenceIds.size < 2 || memberNodeIds.length < 2 || bucket.noteIds.size < 2) {
      continue;
    }
    const signature = JSON.stringify(memberNodeIds);
    const candidate = {
      keyword,
      memberNodeIds,
      isExactTitleGroup: bucket.exactMemberIds.size === memberNodeIds.length,
    };
    const extensionCandidates = candidatesByExtension.get(signature) || [];
    extensionCandidates.push(candidate);
    candidatesByExtension.set(signature, extensionCandidates);
  }

  const selectedCandidates = [...candidatesByExtension.values()].flatMap((candidates) => {
    const exactTitleCandidates = candidates.filter((candidate) => candidate.isExactTitleGroup);
    if (exactTitleCandidates.length === 0) return candidates;
    return [
      exactTitleCandidates.sort(
        (left, right) =>
          right.keyword.length - left.keyword.length || left.keyword.localeCompare(right.keyword)
      )[0],
    ];
  });

  return selectedCandidates
    .map(({ isExactTitleGroup: _isExactTitleGroup, ...group }) => group)
    .sort((left, right) =>
      JSON.stringify([left.keyword, left.memberNodeIds]).localeCompare(
        JSON.stringify([right.keyword, right.memberNodeIds])
      )
    );
};

/** Prefer an existing same-keyword specialized class over duplicate generic memberships. */
export const assignGenericTitleKeywordGroup = (
  group: GenericTitleKeywordGroup,
  specializedClasses: SpecializedTitleKeywordClass[]
): GenericTitleKeywordAssignment => {
  const memberIds = new Set(group.memberNodeIds);
  const coveredMemberIds = new Set<string>();
  const subclassIds = specializedClasses
    .filter(
      (specializedClass) =>
        normalizeTitle(specializedClass.keyword) === group.keyword &&
        specializedClass.memberNodeIds.some((memberId) => memberIds.has(memberId))
    )
    .map((specializedClass) => {
      specializedClass.memberNodeIds.forEach((memberId) => {
        if (memberIds.has(memberId)) coveredMemberIds.add(memberId);
      });
      return specializedClass.classId;
    });

  return {
    subclassIds: [...new Set(subclassIds)].sort(),
    directMemberNodeIds: group.memberNodeIds.filter((memberId) => !coveredMemberIds.has(memberId)),
  };
};

/** Group cards by the normalized title of their nearest parent header. */
export const buildCardTypeGroups = (candidates: CardTypeCandidate[]): CardTypeGroup[] => {
  const groups = new Map<string, { title: string; memberNodeIds: Set<string> }>();
  for (const candidate of candidates) {
    const normalizedTitle = normalizeTitle(candidate.parentTitle);
    if (!normalizedTitle || isNumericOnlyKeyword(normalizedTitle)) continue;
    const group = groups.get(normalizedTitle) || {
      title: candidate.parentTitle.normalize('NFKC').trim().replace(/\s+/g, ' '),
      memberNodeIds: new Set<string>(),
    };
    group.memberNodeIds.add(candidate.nodeId);
    groups.set(normalizedTitle, group);
  }

  return [...groups.entries()]
    .map(([normalizedTitle, group]) => ({
      normalizedTitle,
      title: group.title,
      memberNodeIds: [...group.memberNodeIds].sort(),
    }))
    .sort((left, right) => left.normalizedTitle.localeCompare(right.normalizedTitle));
};
