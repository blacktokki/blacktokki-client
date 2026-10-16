export type RelationKeywordIdentity = {
  text: string;
  type: string | null;
  key: string;
};

export const TABLE_RECORD_TYPE = '{{TABLE_RECORD}}';

export const normalizeRelationText = (text: string) =>
  text.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Identity always uses original text; patterns only classify keywords. */
export const relationKeywordKey = (text: string) => normalizeRelationText(text).toLowerCase();

export function relationKeyword(text: string): RelationKeywordIdentity {
  const value = normalizeRelationText(text);
  return {
    text: value,
    type: /[0-9]/.test(value) ? value.replace(/[0-9]+/g, '{{NUM}}') : null,
    key: value.toLowerCase(),
  };
}

export const relationKeywordEntityKey = (entity: { text: string; key?: string }) =>
  entity.key ?? relationKeywordKey(entity.text);

type Keyword = { text: string; type: string | null; key?: string };
type Match = { key: string; text: string; type: string | null; start: number; end: number };
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type PrefixNode = {
  count: number;
  sample: string[];
  children: Map<string, PrefixNode>;
};
const brackets = /[\p{Ps}\p{Pe}<>＜＞]/u;
const special = /[\p{P}\p{S}]/u;

/** Count proper prefixes once per distinct keyword, stopping before bracket delimiters. */
function prefixIndex(words: string[][]): PrefixNode {
  const root: PrefixNode = { count: 0, sample: [], children: new Map() };
  for (const word of words) {
    let node = root;
    for (let i = 0; i < word.length - 1; i++) {
      if (brackets.test(word[i])) break;
      const character = word[i].toLowerCase();
      let next = node.children.get(character);
      if (!next) {
        next = { count: 0, sample: word, children: new Map() };
        node.children.set(character, next);
      }
      next.count++;
      node = next;
    }
  }
  return root;
}

function longestPrefix(root: PrefixNode, word: string[]) {
  let node = root;
  let length = 0;
  let sample: string[] = [];
  for (let i = 0; i < word.length - 1; i++) {
    const next = node.children.get(word[i].toLowerCase());
    if (!next || next.count < 3) break;
    node = next;
    if (special.test(word[i]) || (/\s/u.test(word[i]) && length === i)) {
      length = i + 1;
      sample = node.sample;
    }
  }
  return { length, characters: sample.slice(0, length) };
}

/** Table records keep their marker in supported prefixes; ordinary keywords prefer numeric types. */
export function classifyRelationKeywords<T extends Keyword>(entities: T[]): T[] {
  const unique = new Map<string, RelationKeywordIdentity>();
  const tableRecords = new Set<string>();
  for (const entity of entities) {
    const keyword = relationKeyword(entity.text);
    if (entity.type?.endsWith(TABLE_RECORD_TYPE)) tableRecords.add(keyword.key);
    const previous = unique.get(keyword.key);
    if (!previous || keyword.text < previous.text) unique.set(keyword.key, keyword);
  }
  const keywords = [...unique.values()].sort((a, b) =>
    a.text < b.text ? -1 : a.text > b.text ? 1 : 0
  );
  const numericCounts = new Map<string, number>();
  for (const keyword of keywords)
    if (keyword.type !== null)
      numericCounts.set(keyword.type, (numericCounts.get(keyword.type) || 0) + 1);
  // Digit runs use an empty token, distinct from every literal source character or placeholder.
  const words = keywords.map(({ text }) =>
    text.split(/([0-9]+)/).flatMap((part, index) => (index % 2 ? [''] : [...part]))
  );
  const prefixes = prefixIndex(words);
  const types = new Map<string, string | null>();
  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const tableRecord = tableRecords.has(keyword.key);
    if (!tableRecord && keyword.type !== null && numericCounts.get(keyword.type)! >= 3) {
      types.set(keyword.key, keyword.type);
      continue;
    }
    const prefix = longestPrefix(prefixes, words[i]);
    const placeholder = tableRecord ? TABLE_RECORD_TYPE : '{{TEXT}}';
    types.set(
      keyword.key,
      prefix.length
        ? `${prefix.characters
            .map((character) => character || '{{NUMBER}}')
            .join('')}${placeholder}`
        : tableRecord
        ? placeholder
        : null
    );
  }
  return entities.map((entity) => ({
    ...entity,
    type: types.get(relationKeywordKey(entity.text)) ?? null,
  }));
}

/** Match original keywords literally; a classification pattern never changes matching semantics. */
export function createRelationKeywordMatcher(entities: Keyword[]) {
  if (!entities.length) return (_text: string): Match[] => [];
  const inventory = new Map(entities.map((entity) => [relationKeywordEntityKey(entity), entity]));
  const expressions = entities.map((entity) => escapeRegex(entity.text));
  const expression = new RegExp(expressions.join('|'), 'giu');
  const identities = new Map<string, { key: string; type: string | null }>();
  const cache = new Map<string, Match[]>();
  return (text: string): Match[] => {
    const previous = cache.get(text);
    if (previous) return previous;
    const matches: Match[] = [];
    for (const match of text.matchAll(expression)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (/[\p{L}\p{N}]$/u.test(text.slice(Math.max(0, start - 2), start))) continue;
      const after = text.slice(end);
      if (
        /^[\p{L}\p{N}]/u.test(after) &&
        !/^(?:은|는|이|가|을|를|의|에|에서|에게|으로|로|와|과|도|만|부터|까지)(?:\s|[.,!?]|$)/.test(
          after
        )
      )
        continue;
      let identity = identities.get(match[0]);
      if (!identity) {
        const key = relationKeywordKey(match[0]);
        identity = { key, type: inventory.get(key)!.type };
        identities.set(match[0], identity);
      }
      matches.push({ ...identity, text: match[0], start, end });
    }
    cache.set(text, matches);
    return matches;
  };
}
