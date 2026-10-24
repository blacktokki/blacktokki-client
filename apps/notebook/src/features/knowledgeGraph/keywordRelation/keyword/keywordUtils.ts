/** Shared keyword algorithms, stage data, source labels and cancellation. */
import type {
  RelationAnalysisNote,
  RelationContent,
  RelationDiscoveryMemory,
  RelationEntityResult,
  RelationEntityType,
  RelationEnumerationKind,
  RelationKeywordEnumeration,
} from '../types';

export type KeywordExtraction = {
  notes: RelationAnalysisNote[];
  extraction: RelationEntityResult;
  composition: RelationKeywordCompositionResult;
  memory: RelationDiscoveryMemory;
  contents: Pick<RelationContent, 'enumerations'>[];
};

export type CollectedEntityTypes = RelationEntityResult & {
  enumerations: RelationKeywordEnumeration[];
  entityTypes: RelationEntityType[];
};

export type KeywordTypeCollection = Omit<KeywordExtraction, 'contents' | 'extraction'> & {
  extraction: CollectedEntityTypes;
};

export const associationContextLabels = {
  sentence: 'Associated in the same sentence',
  'list-item': 'Associated in the same list item',
  field: 'Associated through a property',
  'table-row': 'Associated in the same table row',
  'table-cell': 'Associated in the same table cell',
  'field-value': 'Associated in the same property value',
};

export const createRelationCancellationError = () =>
  Object.assign(new Error('Relation discovery cancelled.'), { name: 'AbortError' });

/** Stop analysis and search work with the same cancellation error on every platform. */
export function checkRelationCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw createRelationCancellationError();
}

/** Yield a task to input and rendering without the browser's nested timer minimum delay. */
export async function yieldRelationWork(signal?: AbortSignal) {
  checkRelationCancelled(signal);
  await new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      port2.close();
      resolve();
    };
    port2.postMessage(null);
  });
  checkRelationCancelled(signal);
}

export function createRelationDiscoveryMemory(): RelationDiscoveryMemory {
  return {
    notes: new Map(),
    documents: new Map(),
    stats: {
      changedNotes: 0,
      reusedNotes: 0,
      removedNotes: 0,
    },
  };
}

export const normalizeRelationText = (text: string) =>
  text.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Identity always uses original text; patterns only classify keywords. */
export const relationKeywordKey = (text: string) => normalizeRelationText(text).toLowerCase();

export const relationKeywordEntityKey = (entity: { text: string; key?: string }) =>
  entity.key ?? relationKeywordKey(entity.text);

type Keyword = { text: string; type: string | null; key?: string };

type Match = { key: string; text: string; type: string | null; start: number; end: number };

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Find every other admitted key contained literally in a name, including overlapping substrings. */
export function collectRelationCompoundKeywords(entities: Pick<Keyword, 'text' | 'key'>[] = []) {
  const keys = [
    ...new Set(
      entities.map((entity) => relationKeywordKey(relationKeywordEntityKey(entity))).filter(Boolean)
    ),
  ].sort();
  type Node = { children: Map<string, Node>; keyword?: string };
  const root: Node = { children: new Map() };
  for (const key of keys) {
    let node = root;
    for (const character of key) {
      let next = node.children.get(character);
      if (!next) node.children.set(character, (next = { children: new Map() }));
      node = next;
    }
    node.keyword = key;
  }
  return keys.flatMap((key) => {
    const contained = new Set<string>();
    const characters = [...key];
    for (let start = 0; start < characters.length; start++) {
      let node = root;
      for (let end = start; end < characters.length; end++) {
        const next = node.children.get(characters[end]);
        if (!next) break;
        node = next;
        if (node.keyword && node.keyword !== key) contained.add(node.keyword);
      }
    }
    return contained.size ? [{ key, keywords: [...contained].sort() }] : [];
  });
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

type CompositionKeyword = { text: string; key?: string };

type RelationConstituentKeyword = { key: string; sourceKeys: string[] };

export type RelationKeywordCompositionResult = {
  compounds: ReturnType<typeof collectRelationCompoundKeywords>;
  constituents: RelationConstituentKeyword[];
};

type State = {
  length: number;
  link: number;
  first: number;
  next: Map<string | symbol, number>;
  sources: Set<number>;
};

/** A suffix automaton shares substring support without materializing every substring of long names. */
function constituentKeywords(keys: string[]): RelationConstituentKeyword[] {
  if (keys.length < 3) return [];
  const states: State[] = [{ length: 0, link: -1, first: -1, next: new Map(), sources: new Set() }];
  const characters: (string | symbol)[] = [];
  let last = 0;
  const extend = (character: string | symbol, source?: number) => {
    const current = states.length;
    states.push({
      length: states[last].length + 1,
      link: 0,
      first: characters.length,
      next: new Map(),
      sources: new Set(source === undefined ? [] : [source]),
    });
    characters.push(character);
    let parent = last;
    while (parent >= 0 && !states[parent].next.has(character)) {
      states[parent].next.set(character, current);
      parent = states[parent].link;
    }
    if (parent >= 0) {
      const next = states[parent].next.get(character)!;
      if (states[parent].length + 1 === states[next].length) states[current].link = next;
      else {
        const clone = states.length;
        states.push({
          ...states[next],
          length: states[parent].length + 1,
          next: new Map(states[next].next),
          sources: new Set(),
        });
        while (parent >= 0 && states[parent].next.get(character) === next) {
          states[parent].next.set(character, clone);
          parent = states[parent].link;
        }
        states[next].link = clone;
        states[current].link = clone;
      }
    }
    last = current;
  };
  for (const [index, key] of keys.entries()) {
    for (const character of key) extend(character, index);
    extend(Symbol());
  }
  for (const state of [...states].sort((a, b) => b.length - a.length))
    if (state.link >= 0) for (const source of state.sources) states[state.link].sources.add(source);
  const redundant = new Set<State>();
  const sameSources = (a: State, b: State) =>
    a.sources.size === b.sources.size && [...a.sources].every((source) => b.sources.has(source));
  for (const state of states) {
    if (state.sources.size < 3) continue;
    if (state.link >= 0 && sameSources(state, states[state.link]))
      redundant.add(states[state.link]);
    if ([...state.next.values()].some((next) => sameSources(state, states[next])))
      redundant.add(state);
  }
  const groups = new Map<string, Map<string, number[]>>();
  for (const state of states) {
    if (state.sources.size < 3 || !state.length || redundant.has(state)) continue;
    const slice = characters.slice(state.first - state.length + 1, state.first + 1);
    if (slice.some((character) => typeof character !== 'string')) continue;
    const key = slice.join('').replace(/^[\s/|:;,_\-()[\]{}]+|[\s/|:;,_\-()[\]{}]+$/gu, '');
    if (!/\p{L}/u.test(key)) continue;
    let matched = 0;
    for (const character of key) matched = states[matched].next.get(character)!;
    const sources = [...states[matched].sources].sort((a, b) => a - b);
    if (
      [...key].length < 2 &&
      !sources.every((source) => keys[source].split(/[\s/|,:;()[\]{}<>]+/u).includes(key))
    )
      continue;
    const signature = sources.join(',');
    let group = groups.get(signature);
    if (!group) groups.set(signature, (group = new Map()));
    group.set(key, sources);
  }
  return [...groups.values()]
    .flatMap((group) =>
      [...group]
        .filter(([key]) => ![...group.keys()].some((other) => other !== key && other.includes(key)))
        .map(([key, sources]) => ({ key, sourceKeys: sources.map((index) => keys[index]) }))
    )
    .sort((a, b) => a.key.localeCompare(b.key));
}

const cache = new WeakMap<
  CompositionKeyword[],
  { signature: string; result: RelationKeywordCompositionResult }
>();

/** Only distinct original keys provide support; generated keys never recursively create support. */
export function analyzeRelationKeywordComposition(
  entities: CompositionKeyword[] = []
): RelationKeywordCompositionResult {
  const keys = [
    ...new Set(
      entities.map((entity) => relationKeywordKey(relationKeywordEntityKey(entity))).filter(Boolean)
    ),
  ].sort();
  const signature = JSON.stringify(keys);
  const previous = cache.get(entities);
  if (previous?.signature === signature) return previous.result;
  const originalKeys = new Set(keys);
  const constituents = constituentKeywords(keys).filter(
    (keyword) => !originalKeys.has(keyword.key)
  );
  const inventory = [...new Set([...keys, ...constituents.map((keyword) => keyword.key)])].map(
    (key) => ({ key, text: key })
  );
  const result = { compounds: collectRelationCompoundKeywords(inventory), constituents };
  cache.set(entities, { signature, result });
  return result;
}

/** Count the same unique original and generated identities shown in the CompositionKeyword tab. */
export function countRelationKeywords(entities: CompositionKeyword[]): number {
  const { constituents } = analyzeRelationKeywordComposition(entities);
  return new Set([
    ...entities.map(relationKeywordEntityKey),
    ...constituents.map((keyword) => keyword.key),
  ]).size;
}

const relationEnumerationParentKinds: Record<RelationEnumerationKind, string> = {
  'note-title': 'Document path',
  heading: 'Heading',
  list: 'List',
  'table-column': 'Table columns',
  'table-row': 'Table rows',
};

/** Share source names between diagnostic logs and type naming, preserving structural locations. */
export function relationEnumerationContext(
  enumeration: RelationKeywordEnumeration,
  translate: (value: string) => string = (value) => value
) {
  const paths = enumeration.items.map((item) =>
    enumeration.kind === 'heading' ? item.sectionPath.slice(0, -1) : item.sectionPath
  );
  const firstPath = paths[0] || [];
  let commonLength = 0;
  while (
    commonLength < firstPath.length &&
    paths.every((path) => path[commonLength] === firstPath[commonLength])
  )
    commonLength++;
  const parent = [enumeration.noteTitle, ...firstPath.slice(0, commonLength)].filter(Boolean);
  const sourceName =
    enumeration.kind === 'note-title' ? enumeration.parentPath || '' : parent.join(' / ');
  const numbered = (label: string, index?: number) =>
    index === undefined ? translate(label) : `${translate(label)} ${index + 1}`;
  if (enumeration.kind === 'heading')
    parent.push(enumeration.level === undefined ? translate('Heading') : `H${enumeration.level}`);
  if (enumeration.kind === 'list') {
    parent.push(numbered('List', enumeration.list));
    if (enumeration.parentItem !== undefined)
      parent.push(numbered('Parent item', enumeration.parentItem));
  }
  if (enumeration.kind === 'table-column' || enumeration.kind === 'table-row')
    parent.push(
      numbered('Table', enumeration.table),
      enumeration.kind === 'table-column'
        ? numbered('Table column', enumeration.column)
        : numbered('Table row', enumeration.row)
    );
  return {
    name: enumeration.kind === 'note-title' ? enumeration.parentPath || '/' : parent.join(' / '),
    sourceName,
    kind: translate(relationEnumerationParentKinds[enumeration.kind]),
    itemParents: enumeration.items.map((item, index) =>
      enumeration.kind !== 'note-title' &&
      (paths[index].length !== commonLength || item.noteTitle !== enumeration.noteTitle)
        ? {
            name: [item.noteTitle, ...paths[index]].join(' / '),
            kind: translate(paths[index].length ? 'Paragraph' : 'Document'),
          }
        : undefined
    ),
  };
}

export const relationEnumerationItemKey = (
  item: Pick<RelationKeywordEnumeration['items'][number], 'keywords'>
) => JSON.stringify([...new Set(item.keywords.map((keyword) => keyword.key))].sort());
