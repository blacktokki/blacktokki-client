export interface GenericTitleKeywordCandidate {
  nodeId: string;
  occurrenceId?: string;
  title: string;
  noteId: string;
  /** Keep the normalized title intact instead of extracting token keywords. */
  singleKeyword?: boolean;
}

export interface GenericTitleKeywordGroup {
  keyword: string;
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

/** Return the complete hostname when a visible link name is itself an HTTP(S) URL pattern. */
export const extractUrlDomainKeyword = (value: string): string | undefined => {
  const normalizedValue = value.normalize('NFKC').trim();
  if (!normalizedValue || /\s/.test(normalizedValue)) return undefined;

  const hasHttpScheme = /^https?:\/\//i.test(normalizedValue);
  const isProtocolRelative = normalizedValue.startsWith('//');
  let parseTarget = normalizedValue;

  if (isProtocolRelative) {
    parseTarget = `https:${normalizedValue}`;
  } else if (!hasHttpScheme) {
    const authority = normalizedValue.split(/[/?#]/, 1)[0];
    const hostnameWithoutPort = authority.replace(/:\d+$/, '');
    const lastLabel = hostnameWithoutPort.split('.').at(-1) || '';
    const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostnameWithoutPort);
    const hasDomainSuffix = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(lastLabel);
    if (!hostnameWithoutPort.includes('.') || (!isIpv4 && !hasDomainSuffix)) return undefined;
    parseTarget = `https://${normalizedValue}`;
  }

  try {
    const parsed = new URL(parseTarget);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return hostname || undefined;
  } catch {
    return undefined;
  }
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

interface ContainmentMatcherNode {
  transitions: Map<string, number>;
  failure: number;
  outputs: string[];
}

/**
 * Find complete normalized values contained in each value without comparing
 * every candidate pair. The Aho-Corasick matcher keeps topic entry responsive
 * when a notebook contains thousands of link or title occurrences.
 */
const findContainedNormalizedValues = (values: string[]): Map<string, Set<string>> => {
  const patterns = [...new Set(values.filter((value) => value.length >= 2))];
  const matches = new Map<string, Set<string>>();
  if (patterns.length === 0) return matches;

  const nodes: ContainmentMatcherNode[] = [
    { transitions: new Map<string, number>(), failure: 0, outputs: [] },
  ];
  for (const pattern of patterns) {
    let state = 0;
    for (const character of pattern) {
      let nextState = nodes[state].transitions.get(character);
      if (nextState === undefined) {
        nextState = nodes.length;
        nodes[state].transitions.set(character, nextState);
        nodes.push({ transitions: new Map<string, number>(), failure: 0, outputs: [] });
      }
      state = nextState;
    }
    nodes[state].outputs.push(pattern);
  }

  const queue: number[] = [];
  for (const childState of nodes[0].transitions.values()) {
    queue.push(childState);
  }
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const state = queue[queueIndex];
    for (const [character, childState] of nodes[state].transitions) {
      queue.push(childState);
      let fallbackState = nodes[state].failure;
      while (fallbackState !== 0 && !nodes[fallbackState].transitions.has(character)) {
        fallbackState = nodes[fallbackState].failure;
      }
      nodes[childState].failure = nodes[fallbackState].transitions.get(character) ?? 0;
      nodes[childState].outputs.push(...nodes[nodes[childState].failure].outputs);
    }
  }

  for (const value of patterns) {
    let state = 0;
    const valueMatches = new Set<string>();
    for (const character of value) {
      while (state !== 0 && !nodes[state].transitions.has(character)) {
        state = nodes[state].failure;
      }
      state = nodes[state].transitions.get(character) ?? 0;
      nodes[state].outputs.forEach((output) => valueMatches.add(output));
    }
    matches.set(value, valueMatches);
  }

  return matches;
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

/** Group title keywords across note-title and heading distinctions. */
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
  const containedTitles = findContainedNormalizedValues(
    normalizedCandidates.map((candidate) => candidate.normalizedTitle)
  );
  const occurrenceIdsByTitle = new Map<string, Set<string>>();
  for (const candidate of normalizedCandidates) {
    const occurrenceIds = occurrenceIdsByTitle.get(candidate.normalizedTitle) || new Set<string>();
    occurrenceIds.add(candidate.occurrenceId);
    occurrenceIdsByTitle.set(candidate.normalizedTitle, occurrenceIds);
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
  normalizedCandidates.forEach((candidate) => {
    const keywords = candidate.singleKeyword ? new Set<string>() : extractKeywords(candidate.title);
    keywords.add(candidate.normalizedTitle);
    if (!candidate.singleKeyword) {
      containedTitles.get(candidate.normalizedTitle)?.forEach((keyword) => {
        if (keyword === candidate.normalizedTitle) return;
        if (
          [...(occurrenceIdsByTitle.get(keyword) || [])].some(
            (occurrenceId) => occurrenceId !== candidate.occurrenceId
          )
        ) {
          keywords.add(keyword);
        }
      });
    }
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
    if (bucket.occurrenceIds.size < 2 || bucket.noteIds.size < 2) {
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
