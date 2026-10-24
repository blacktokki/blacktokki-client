/** Unicode-safe evidence ranges, excerpts and source block boundaries. */
import { toMarkdown, toRaw, toToken } from '@blacktokki/editor';

import type { GraphContextCitation, GraphSource } from '../types';

type EvidenceRange = { start: number; end: number };

type EvidenceExcerpt = EvidenceRange & { relevance: number; complete: boolean };

type EvidenceQuery = {
  terms: string[];
  pair?: string[];
  relation?: string;
  evidence?: EvidenceRange;
  blocks?: EvidenceRange[];
  prepared?: ReturnType<typeof prepareEvidenceQuery>;
};

/** Canonical composition discovers normalization boundaries without language-specific character tables. */
function* normalizationSegments(text: string) {
  let segment = '';
  let index = 0;
  let offset = 0;
  for (const character of text) {
    if (
      segment &&
      !/\p{M}/u.test(character) &&
      (segment + character).normalize('NFC') ===
        segment.normalize('NFC') + character.normalize('NFC')
    ) {
      yield { segment, index };
      segment = '';
      index = offset;
    }
    segment += character;
    offset += character.length;
  }
  if (segment) yield { segment, index };
}

/** Search normalized text while retaining offsets into the unchanged original source. */
export function createEvidenceText(original: string) {
  const canonical = original.normalize('NFC');
  const text = canonical.toLowerCase();
  const changes: { start: number; end: number; rawStart: number; rawEnd: number }[] = [];
  if (canonical !== original || text.length !== original.length) {
    let offset = 0;
    // Only normalization boundaries affect offsets. Grapheme iteration can copy the whole
    // source for every character in some runtimes, making long notes quadratic to index.
    for (const { segment, index } of normalizationSegments(original)) {
      const folded = segment.normalize('NFC').toLowerCase();
      if (folded.length !== segment.length || segment.normalize('NFC') !== segment)
        changes.push({
          start: offset,
          end: offset + folded.length,
          rawStart: index,
          rawEnd: index + segment.length,
        });
      offset += folded.length;
    }
  }
  const rawOffset = (offset: number, end: boolean) => {
    let left = 0;
    let right = changes.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (changes[middle].start <= offset) left = middle + 1;
      else right = middle;
    }
    const change = changes[left - 1];
    if (!change) return offset;
    if (offset < change.end)
      return offset === change.start || !end ? change.rawStart : change.rawEnd;
    return offset + change.rawEnd - change.end;
  };
  let statements: ReturnType<typeof createStatementIndex> | undefined;
  const passages = new Map<string, { text: string; matches: Map<string, boolean> }>();
  const passage = ({ start, end }: EvidenceRange) => {
    const key = start + ':' + end;
    let value = passages.get(key);
    if (!value) {
      value = {
        text: original.slice(start, end).normalize('NFC').toLowerCase(),
        matches: new Map(),
      };
      passages.set(key, value);
    }
    return value;
  };
  return {
    text,
    passage: (range: EvidenceRange) => passage(range).text,
    coverage: (range: EvidenceRange, terms: string[]) => {
      const value = passage(range);
      let count = 0;
      for (const term of terms) {
        let matches = value.matches.get(term);
        if (matches === undefined) {
          matches = value.text.includes(term);
          value.matches.set(term, matches);
        }
        if (matches) count++;
      }
      return count / Math.max(1, terms.length);
    },
    range: (start: number, end: number): EvidenceRange => ({
      start: rawOffset(start, false),
      end: rawOffset(end, true),
    }),
    statement: (range: EvidenceRange) => (statements ||= createStatementIndex(original))(range),
  };
}

type EvidenceText = ReturnType<typeof createEvidenceText>;

const normalize = (value: string) => value.normalize('NFC').toLowerCase();

/** Normalize a relationship query once before evaluating its source ranges. */
export function prepareEvidenceQuery({
  terms,
  pair = [],
  relation = '',
}: Pick<EvidenceQuery, 'terms' | 'pair' | 'relation'>) {
  return {
    endpoints: [...new Set(pair.map(normalize).filter(Boolean))],
    query: [...new Set(terms.map(normalize).filter(Boolean))],
    predicates: [
      ...new Set(
        normalize(relation)
          .split(/[^\p{L}\p{N}]+/u)
          .filter(Boolean)
      ),
    ],
  };
}

/** Index sentence boundaries once per shared source; repeated endpoint matches do not rescan the whole note. */
function createStatementIndex(text: string) {
  const ends = [0];
  for (const match of text.matchAll(/[.!?。！？](?=\s|$)|\r?\n/gu))
    ends.push(match.index! + match[0].length);
  if (ends.at(-1) !== text.length) ends.push(text.length);
  const boundaryIndex = (offset: number, inclusive: boolean) => {
    let left = 1;
    let right = ends.length - 1;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (ends[middle] < offset || (!inclusive && ends[middle] === offset)) left = middle + 1;
      else right = middle;
    }
    return left;
  };
  return (range: EvidenceRange): EvidenceRange => {
    const first = boundaryIndex(range.start, false);
    const last = boundaryIndex(range.end, true);
    let start = ends[first - 1];
    const end = ends[last];
    while (start < range.start && /\s/u.test(text[start])) start++;
    return { start, end };
  };
}

/** Rank complete source units; a relationship's wording never excludes other evidence about its parties. */
export function graphEvidenceExcerpts(
  original: string,
  search: EvidenceText,
  size: number,
  { terms, pair = [], relation = '', evidence, blocks, prepared }: EvidenceQuery
): EvidenceExcerpt[] {
  const { endpoints, query, predicates } =
    prepared || prepareEvidenceQuery({ terms, pair, relation });
  const evaluate = (range: EvidenceRange, recorded = false): EvidenceExcerpt => {
    const subjects = search.coverage(range, endpoints);
    return {
      ...range,
      complete: recorded || (endpoints.length > 0 && subjects === 1),
      relevance:
        (recorded ? 1000 : 0) +
        (endpoints.length ? subjects * 300 : 0) +
        search.coverage(range, query) * 20 +
        search.coverage(range, predicates) * 5,
    };
  };
  if (evidence) {
    let range = {
      start: Math.max(0, Math.floor(evidence.start)),
      end: Math.min(original.length, Math.floor(evidence.end)),
    };
    if (range.end > range.start) {
      const enclosing = blocks?.filter(
        (block) => block.start < range.end && block.end > range.start
      );
      if (enclosing?.length)
        range = {
          start: Math.min(range.start, enclosing[0].start),
          end: Math.max(range.end, enclosing.at(-1)!.end),
        };
      return [evaluate(range, true)];
    }
  }
  if (blocks?.length) {
    const candidates = blocks.map((range) => evaluate(range));
    const joint = endpoints.length ? candidates.filter((range) => range.complete) : [];
    const matching = candidates.filter((range) => range.relevance > 0);
    return (joint.length ? joint : matching.length ? matching : candidates).sort(
      (a, b) => b.relevance - a.relevance || a.start - b.start
    );
  }
  const statements = new Map<string, EvidenceExcerpt>();
  const addStatement = (start: number, end: number) => {
    const range = search.statement(search.range(start, end));
    const key = range.start + ':' + range.end;
    if (!statements.has(key)) statements.set(key, evaluate(range));
  };
  if (endpoints.length === 2 && endpoints.every((value) => search.text.includes(value))) {
    let a = search.text.indexOf(endpoints[0]);
    let b = search.text.indexOf(endpoints[1]);
    while (a >= 0 && b >= 0) {
      addStatement(Math.min(a, b), Math.max(a + endpoints[0].length, b + endpoints[1].length));
      if (a < b) a = search.text.indexOf(endpoints[0], a + endpoints[0].length);
      else b = search.text.indexOf(endpoints[1], b + endpoints[1].length);
    }
  }
  if (statements.size) {
    const candidates = [...statements.values()].sort((a, b) => b.start - a.start || a.end - b.end);
    let minimumEnd = Infinity;
    return candidates
      .filter((range) => {
        const contained = minimumEnd <= range.end;
        minimumEnd = Math.min(minimumEnd, range.end);
        return !contained;
      })
      .sort((a, b) => b.relevance - a.relevance || a.start - b.start);
  }
  const length = Math.min(Math.max(1, size), search.text.length);
  let best = evaluate(search.range(0, length));
  const upperBound = evaluate({ start: 0, end: original.length }).relevance;
  if (best.relevance >= upperBound) return [best];
  for (const anchor of new Set([...query, ...endpoints, ...predicates])) {
    let position = search.text.indexOf(anchor);
    while (position >= 0) {
      for (const focus of [
        position + anchor.length / 2 - length / 2,
        position,
        position + anchor.length - length,
      ]) {
        const start = Math.max(0, Math.min(search.text.length - length, Math.floor(focus)));
        const range = evaluate(search.range(start, start + length));
        if (range.relevance > best.relevance) best = range;
        if (best.relevance >= upperBound) return [best];
      }
      position = search.text.indexOf(anchor, position + anchor.length);
    }
  }
  return [best];
}

export const graphEvidenceExcerpt = (
  text: string,
  search: EvidenceText,
  size: number,
  query: EvidenceQuery
) => graphEvidenceExcerpts(text, search, size, query)[0];

type SourceBlock = EvidenceRange & { heading?: number };

/** Heading containment supplies context dependencies without guessing discourse from vocabulary. */
const contextScopes = (blocks: SourceBlock[], length: number): EvidenceRange[] => {
  const scopes: EvidenceRange[] = [];
  const parents: { start: number; level: number }[] = [];
  for (const block of blocks) {
    if (!block.heading) continue;
    while (parents.length && parents.at(-1)!.level >= block.heading)
      scopes.push({ start: parents.pop()!.start, end: block.start });
    parents.push({ start: block.start, level: block.heading });
  }
  for (const parent of parents) scopes.push({ start: parent.start, end: length });
  if (length && !scopes.some((scope) => scope.start === 0 && scope.end === length))
    scopes.push({ start: 0, end: length });
  return scopes.length ? scopes : length ? [{ start: 0, end: length }] : [];
};

/** Markdown's root blocks retain complete paragraphs, lists, tables and fenced content. */
function graphTextStructure(text: string) {
  const offsets = [0];
  for (const match of text.matchAll(/\n/gu)) offsets.push(match.index! + 1);
  const ranges = toToken(text).flatMap((token) => {
    if (token.level !== 0 || token.nesting === -1 || !token.map) return [];
    const start = offsets[token.map[0]] ?? text.length;
    let end = offsets[token.map[1]] ?? text.length;
    while (end > start && /\s/u.test(text[end - 1])) end--;
    return end > start
      ? [
          {
            start,
            end,
            ...(token.type === 'heading_open' && { heading: Number(token.tag.slice(1)) }),
          },
        ]
      : [];
  });
  const blocks = ranges.length ? ranges : text ? [{ start: 0, end: text.length }] : [];
  return {
    blocks: blocks.map(({ start, end }) => ({ start, end })),
    scopes: contextScopes(blocks, text.length),
  };
}

export const graphTextBlocks = (text: string): EvidenceRange[] => graphTextStructure(text).blocks;
const graphTextScopes = (text: string): EvidenceRange[] => graphTextStructure(text).scopes;

/** Locate exact or whitespace-equivalent extraction text without losing Unicode source offsets. */
export function graphSourceRanges(
  text: string,
  excerpt: string,
  search: EvidenceText = createEvidenceText(text)
): EvidenceRange[] {
  if (!excerpt) return [];
  const value = excerpt.normalize('NFC').toLowerCase();
  const ranges: EvidenceRange[] = [];
  let position = search.text.indexOf(value);
  while (position >= 0) {
    ranges.push(search.range(position, position + value.length));
    position = search.text.indexOf(value, position + Math.max(1, value.length));
  }
  if (ranges.length) return ranges;
  const pattern = value
    .trim()
    .split(/\s+/u)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
  if (!pattern) return [];
  for (const match of search.text.matchAll(new RegExp(pattern, 'gu')))
    ranges.push(search.range(match.index!, match.index! + match[0].length));
  return ranges;
}

/** Resolve every explicit HTML ID with one DOM parse and one text traversal. */
function sourceHtmlAnchors(html: string, text: string): { name: string; start: number }[] {
  if (!/\bid(?:\s*=|\s*\/?>)/iu.test(html)) return [];
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(html, 'text/html');
    document.querySelectorAll('.yaml-frontmatter').forEach((element) => element.remove());
    if (document.body.textContent === text) {
      const result: { name: string; start: number }[] = [];
      const stack: Node[] = [document.body];
      let offset = 0;
      while (stack.length) {
        const node = stack.pop()!;
        if (node.nodeType === 3) offset += node.textContent?.length || 0;
        else if (node.nodeType === 1) {
          const name = (node as Element).getAttribute('id');
          if (name !== null) result.push({ name, start: offset });
          for (let child = node.lastChild; child; child = child.previousSibling) stack.push(child);
        }
      }
      return result;
    }
  }
  const anchors: { name: string; start: number }[] = [];
  for (const match of html.matchAll(/<[a-z][\w:-]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu)) {
    const attributes = match[0].replace(/^<[a-z][\w:-]*/iu, '');
    const id = [
      ...attributes.matchAll(/([^\s/>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu),
    ].find((attribute) => attribute[1].toLowerCase() === 'id');
    if (id)
      anchors.push({
        name: id[2] ?? id[3] ?? id[4] ?? '',
        start: toRaw(html.slice(0, match.index!)).length,
      });
  }
  return anchors;
}

/** Match parsed HTML blocks back to raw text; no sentence or language-specific semantic rules are used. */
export function graphSourceStructure(html: string, text: string) {
  // A single plain HTML paragraph already supplies its exact block; no Markdown round trip is needed.
  if (/^<p>[^<]*<\/p>$/iu.test(html)) {
    const content = text.trim();
    const start = content ? text.indexOf(content) : 0;
    const blocks = [{ start, end: content ? start + content.length : text.length }];
    return { blocks, scopes: contextScopes(blocks, text.length), anchors: [], references: [] };
  }
  if (!/<[a-z][^>]*>/iu.test(html))
    return html === text
      ? graphTextStructure(text)
      : { blocks: [{ start: 0, end: text.length }], scopes: [{ start: 0, end: text.length }] };
  const tokens = toToken(toMarkdown(html));
  const search = createEvidenceText(text);
  const ranges: SourceBlock[] = [];
  const references: NonNullable<GraphSource['references']> = [];
  let blockLinks: { href: string; name: string }[] = [];
  let parts = '';
  let cursor = 0;
  let unresolved = false;
  let heading: number | undefined;
  const flush = () => {
    if (!parts) return;
    const value = parts.normalize('NFC').toLowerCase();
    let start = search.text.indexOf(value, cursor);
    let end = start + value.length;
    if (start < 0) {
      const pattern = value
        .trim()
        .split(/\s+/u)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*');
      const matcher = new RegExp(pattern, 'gu');
      matcher.lastIndex = cursor;
      const match = matcher.exec(search.text);
      start = match?.index ?? -1;
      end = start + (match?.[0].length || 0);
    }
    if (start >= 0) {
      const range = search.range(start, end);
      ranges.push({ ...range, ...(heading && { heading }) });
      references.push(...blockLinks.map((link) => ({ ...link, ...range })));
      cursor = end;
    } else unresolved = true;
    parts = '';
    blockLinks = [];
  };
  for (const token of tokens) {
    if (token.level === 0 && token.nesting !== -1) {
      flush();
      heading = token.type === 'heading_open' ? Number(token.tag.slice(1)) : undefined;
    }
    if (token.children) {
      let link: { href: string; name: string } | undefined;
      for (const child of token.children) {
        if (child.type === 'link_open') link = { href: child.attrGet('href') || '', name: '' };
        if (child.type === 'link_close' && link) {
          blockLinks.push(link);
          link = undefined;
        }
        if (link && child.nesting === 0) link.name += child.content;
        if (child.type === 'html_inline') parts += toRaw(child.content);
        else if (child.nesting === 0) parts += child.content;
      }
    } else if (token.nesting === 0) parts += token.content;
  }
  flush();
  const blocks = ranges.length && !unresolved ? ranges : [{ start: 0, end: text.length }];
  const scopes = contextScopes(blocks, text.length);
  const anchors: NonNullable<GraphSource['anchors']> = [];
  const parents: { level: number; name: string }[] = [];
  for (const block of ranges) {
    if (!block.heading) continue;
    while (parents.length && parents.at(-1)!.level >= block.heading) parents.pop();
    const scope = scopes
      .filter((scope) => scope.start === block.start)
      .sort((a, b) => a.end - b.end)[0];
    if (!scope) continue;
    const name = text.slice(block.start, block.end);
    anchors.push({
      ...scope,
      name,
      path: parents.map((parent) => parent.name),
      kind: 'heading',
      ...(parents.length && { section: parents.at(-1)!.name }),
    });
    parents.push({ level: block.heading, name });
  }
  // Explicit HTML IDs are source identities, including anchors whose display text differs from their ID.
  for (const { name, start } of sourceHtmlAnchors(html, text)) {
    const scope = scopes
      .filter((scope) => scope.start <= start && scope.end > start)
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    if (scope) {
      const heading = anchors.find(
        (anchor) =>
          anchor.kind === 'heading' && anchor.start === scope.start && anchor.end === scope.end
      );
      anchors.push({ ...heading, ...scope, name, kind: 'id' });
    }
  }
  return {
    blocks: blocks.map(({ start, end }) => ({ start, end })),
    scopes,
    anchors,
    references: unresolved
      ? references.map((reference) => ({ ...reference, start: 0, end: text.length }))
      : references,
  };
}

/** Preserve structural context and the transitive closure of explicit source references as one bundle. */
export function createEvidenceContext(sources: Map<string, GraphSource>) {
  const structures = new Map<string, { blocks: EvidenceRange[]; scopes: EvidenceRange[] }>();
  const cache = new Map<
    string,
    {
      context: GraphContextCitation[];
      unresolved: boolean;
      bundleIdentity?: object;
      minimumCharacters?: number;
    }
  >();
  const blockIdentities = new Map<string, Set<string>>();
  const scopeBundles = new Map<
    string,
    { citations: GraphContextCitation[]; ids: Set<string>; unresolved: boolean }
  >();
  const structureFor = (source: GraphSource) => {
    let structure = structures.get(source.id);
    if (!structure) {
      structure = {
        blocks: source.blocks || graphTextBlocks(source.text),
        scopes: source.scopes || graphTextScopes(source.text),
      };
      structures.set(source.id, structure);
      blockIdentities.set(
        source.id,
        new Set(structure.blocks.map((block) => block.start + ':' + block.end))
      );
    }
    return structure;
  };
  const scopeMinimums = new Map<string, { minimumCharacters: number; unresolved: boolean }>();
  return (primary: GraphContextCitation, maxCharacters = Infinity) => {
    const cached = cache.get(primary.id);
    if (cached) return cached;
    const original = sources.get(primary.sourceId);
    let bundleKey: string | undefined;
    let minimumKey: string | undefined;
    let primaryScope: EvidenceRange | undefined;
    if (original) {
      const { scopes } = structureFor(original);
      const parents = scopes
        .filter((scope) => scope.start <= primary.start && scope.end >= primary.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start));
      primaryScope = parents[0] || { start: 0, end: original.text.length };
      minimumKey = JSON.stringify([original.id, primaryScope, parents]);
      const minimum = scopeMinimums.get(minimumKey);
      if (minimum && minimum.minimumCharacters > maxCharacters) return { ...minimum, context: [] };
      if (blockIdentities.get(original.id)!.has(primary.start + ':' + primary.end)) {
        bundleKey = minimumKey;
        const bundle = scopeBundles.get(bundleKey);
        if (bundle && !(original.references || []).some((reference) => reference.internal)) {
          const result = {
            context: bundle.citations.filter((citation) => citation.id !== primary.id),
            unresolved: bundle.unresolved,
            bundleIdentity: bundle,
          };
          cache.set(primary.id, result);
          return result;
        }
      }
    }
    const citations = new Map<string, GraphContextCitation>([[primary.id, primary]]);
    const visited = new Set<string>();
    const queue = [{ sourceId: primary.sourceId, start: primary.start, end: primary.end }];
    let unresolved = false;
    const jobs: { source: GraphSource; item: EvidenceRange; regions: EvidenceRange[] }[] = [];
    for (let index = 0; index < queue.length; index++) {
      const item = queue[index];
      const source = sources.get(item.sourceId);
      if (!source) {
        unresolved = true;
        continue;
      }
      const structure = structureFor(source);
      const { scopes } = structure;
      const parents = scopes
        .filter((scope) => scope.start <= item.start && scope.end >= item.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start));
      const scope = parents[0] || { start: 0, end: source.text.length };
      const identity = source.id + '@' + scope.start + ':' + scope.end;
      if (visited.has(identity)) continue;
      visited.add(identity);
      const regions = [
        scope,
        ...parents.slice(1).map((parent) => ({
          start: parent.start,
          end: Math.min(
            parent.end,
            ...scopes
              .filter(
                (child) =>
                  child.start >= parent.start &&
                  child.end <= parent.end &&
                  (child.start !== parent.start || child.end !== parent.end)
              )
              .map((child) => child.start)
          ),
        })),
      ];
      jobs.push({ source, item, regions });
      for (const reference of source.references || []) {
        if (
          !reference.internal ||
          !regions.some((region) => region.start < reference.end && region.end > reference.start)
        )
          continue;
        if (reference.unresolved || !reference.targets?.length) unresolved = true;
        for (const target of reference.targets || []) queue.push(target);
      }
    }
    let minimumCharacters = 0;
    const covered = new Map<string, EvidenceRange[]>();
    for (const job of jobs) {
      const ranges = covered.get(job.source.id) || [];
      ranges.push(...job.regions);
      covered.set(job.source.id, ranges);
    }
    for (const [sourceId, ranges] of covered) {
      const text = sources.get(sourceId)!.text;
      const ordered = ranges
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);
      let end = 0;
      for (const range of ordered) {
        const start = Math.max(end, range.start);
        if (range.end > start)
          minimumCharacters += text.slice(start, range.end).replace(/\s/gu, '').length;
        end = Math.max(end, range.end);
      }
    }
    if (minimumKey) scopeMinimums.set(minimumKey, { minimumCharacters, unresolved });
    if (minimumCharacters > maxCharacters) return { context: [], unresolved, minimumCharacters };
    for (const [index, { source, item, regions }] of jobs.entries()) {
      const { blocks } = structureFor(source);
      const add = ({ start, end }: EvidenceRange) => {
        if (end <= start) return;
        if (
          [...citations.values()].some(
            (citation) =>
              citation.sourceId === source.id && citation.start <= start && citation.end >= end
          )
        )
          return;
        const id = source.id + '@' + start + ':' + end;
        citations.set(id, {
          ...source,
          start,
          end,
          sourceId: source.id,
          id,
          text: source.text.slice(start, end),
        });
      };
      if (index) add(item);
      for (const region of regions) {
        let cursor = region.start;
        for (const block of [item, ...blocks]
          .filter((block) => block.end > region.start && block.start < region.end)
          .sort((a, b) => a.start - b.start)) {
          const start = Math.max(region.start, block.start);
          const end = Math.min(region.end, block.end);
          if (start > cursor && source.text.slice(cursor, start).trim())
            add({ start: cursor, end: start });
          if (start < item.start) add({ start, end: Math.min(end, item.start) });
          if (end > item.end) add({ start: Math.max(start, item.end), end });
          cursor = Math.max(cursor, end);
        }
        if (cursor < region.end && source.text.slice(cursor, region.end).trim())
          add({ start: cursor, end: region.end });
      }
    }
    const result: {
      context: GraphContextCitation[];
      unresolved: boolean;
      bundleIdentity?: object;
      minimumCharacters?: number;
    } = {
      context: [...citations.values()].filter((citation) => citation.id !== primary.id),
      unresolved,
      minimumCharacters,
    };
    if (bundleKey && primaryScope) {
      let index = 0;
      while (index < result.context.length) {
        const citation = result.context[index];
        if (
          citation.sourceId !== primary.sourceId ||
          citation.start < primaryScope.start ||
          citation.end > primaryScope.end ||
          citation.start >= primary.end
        )
          break;
        index++;
      }
      const ids = new Set([primary.id, ...result.context.map((citation) => citation.id)]);
      let bundle = scopeBundles.get(bundleKey);
      if (!bundle) {
        bundle = {
          citations: [...result.context.slice(0, index), primary, ...result.context.slice(index)],
          ids,
          unresolved,
        };
        scopeBundles.set(bundleKey, bundle);
      }
      if (bundle.ids.size === ids.size && [...ids].every((id) => bundle!.ids.has(id)))
        result.bundleIdentity = bundle;
    }
    cache.set(primary.id, result);
    return result;
  };
}
