/** Unicode-safe evidence ranges, excerpts and source block boundaries. */
import { toMarkdown, toRaw, toToken } from '@blacktokki/editor';

import type { GraphContextCitation, GraphSource } from '../types';
import { createScopeIndex } from './retrieval';

type EvidenceRange = { start: number; end: number };

const metadataIdentities = new WeakMap<object, symbol>();
/** Finalized source coordinates and links are immutable, so queries validate their shared identity once. */
export function graphSourceMetadataIdentity(metadata: object | undefined, finalize = false) {
  if (!metadata) return metadata;
  let identity = metadataIdentities.get(metadata);
  if (!identity && finalize) {
    const pending = [metadata];
    while (pending.length) {
      const value = pending.pop()!;
      if (Object.isFrozen(value)) continue;
      for (const child of Object.values(value))
        if (child && typeof child === 'object') pending.push(child);
      Object.freeze(value);
    }
    identity = Symbol('source-metadata');
    metadataIdentities.set(metadata, identity);
  }
  return identity || metadata;
}

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
    let base = 0;
    let input = original;
    if (text.length === canonical.length) {
      while (base < canonical.length && canonical[base] === original[base]) base++;
      let tail = 0;
      while (
        tail < canonical.length - base &&
        tail < original.length - base &&
        canonical[canonical.length - tail - 1] === original[original.length - tail - 1]
      )
        tail++;
      const middle = original.slice(base, original.length - tail);
      if (middle.normalize('NFC') === canonical.slice(base, canonical.length - tail))
        input = middle;
      else base = 0;
    }
    let offset = base;
    // Only normalization boundaries affect offsets. Grapheme iteration can copy the whole
    // source for every character in some runtimes, making long notes quadratic to index.
    for (const { segment, index } of normalizationSegments(input)) {
      const folded = segment.normalize('NFC').toLowerCase();
      if (folded.length !== segment.length || segment.normalize('NFC') !== segment)
        changes.push({
          start: offset,
          end: offset + folded.length,
          rawStart: base + index,
          rawEnd: base + index + segment.length,
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
      if (!terms.length) return 0;
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

const sourceSearches = new WeakMap<GraphSource, { text: string; search: EvidenceText }>();
/** Share normalized source coordinates between retrieval and quotation selection. */
export function graphSourceSearch(source: GraphSource) {
  let saved = sourceSearches.get(source);
  if (!saved || saved.text !== source.text) {
    saved = { text: source.text, search: createEvidenceText(source.text) };
    sourceSearches.set(source, saved);
  }
  return saved.search;
}

/** Read an existing normalized source without building another view or changing raw coordinates. */
export function cachedGraphSourceText(source: GraphSource) {
  const saved = sourceSearches.get(source);
  return saved?.text === source.text ? saved.search.text : undefined;
}

const whitespaceIndexes = new WeakMap<GraphSource, { text: string; offsets: number[] }>();

/** Count source characters with one shared whitespace scan across queries and evidence bundles. */
export function graphNonWhitespaceLength(source: GraphSource, start: number, end: number) {
  let saved = whitespaceIndexes.get(source);
  if (!saved || saved.text !== source.text) {
    const offsets: number[] = [];
    for (const match of source.text.matchAll(/\s/gu)) offsets.push(match.index!);
    saved = { text: source.text, offsets };
    whitespaceIndexes.set(source, saved);
  }
  const before = (position: number) => {
    let low = 0,
      high = saved.offsets.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (saved.offsets[middle] < position) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return end - start - before(end) + before(start);
}

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
  if (!/\S/u.test(original)) return [];
  const { endpoints, query, predicates } =
    prepared || prepareEvidenceQuery({ terms, pair, relation });
  const evaluate = (
    range: EvidenceRange,
    recorded = false,
    subjects = search.coverage(range, endpoints)
  ): EvidenceExcerpt => {
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
    const ranges = blocks.filter(
      (range) => range.end > range.start && /\S/u.test(original.slice(range.start, range.end))
    );
    const subjects = endpoints.length
      ? ranges.map((range) => search.coverage(range, endpoints))
      : undefined;
    const joint = subjects?.includes(1) || false;
    const candidates: EvidenceExcerpt[] = [];
    for (const [index, range] of ranges.entries()) {
      // Once intact party evidence exists, the other blocks cannot enter this selection.
      if (joint && subjects![index] !== 1) continue;
      candidates.push(evaluate(range, false, subjects?.[index] ?? 0));
    }
    const matching = joint ? candidates : candidates.filter((range) => range.relevance > 0);
    return (matching.length ? matching : candidates).sort(
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

/** Read source coordinates, complete blocks and links together without a Markdown round trip. */
function sourceDomStructure(html: string, text: string) {
  if (typeof DOMParser === 'undefined') return;
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('.yaml-frontmatter').forEach((element) => element.remove());
  if (document.body.textContent !== text) return;
  const ranges: SourceBlock[] = [];
  const ids: { name: string; start: number }[] = [];
  const references: NonNullable<GraphSource['references']> = [];
  const tables: NonNullable<GraphSource['tables']> = [];
  type Table = (typeof tables)[number];
  type Row = Table['rows'][number];
  type Cell = Row['cells'][number];
  const groupSpans = new Map<Element, { cell: Cell; row: number }[]>();
  const blockTags = new Set(['P', 'UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE', 'DL', 'HR']);
  type Visit = {
    node: Node;
    exit?: boolean;
    start?: number;
    block?: SourceBlock;
    table?: Table;
    row?: Row;
    cell?: Cell;
  };
  const stack: Visit[] = [{ node: document.body }];
  let offset = 0;
  while (stack.length) {
    let { node, exit, start, block, table, row, cell } = stack.pop()!;
    if (node.nodeType === 3) {
      offset += node.textContent?.length || 0;
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (exit) {
      if (block && start === block.start) block.end = offset;
      if (element.tagName === 'TABLE' && table) table.end = offset;
      if (cell) cell.end = offset;
      for (const span of groupSpans.get(element) || [])
        span.cell.rowSpan = table!.rows.length - span.row;
      groupSpans.delete(element);
      if (element.tagName === 'A' && element.hasAttribute('href'))
        references.push({
          start: start!,
          end: offset,
          href: element.getAttribute('href') || '',
          name: element.textContent || '',
        });
      continue;
    }
    const name = element.getAttribute('id');
    if (name !== null) ids.push({ name, start: offset });
    if (element.tagName === 'TABLE') {
      table = { start: offset, end: offset, rows: [] };
      tables.push(table);
      row = undefined;
    } else if (element.tagName === 'TR' && table) {
      row = { cells: [] };
      table.rows.push(row);
    } else if ((element.tagName === 'TD' || element.tagName === 'TH') && row) {
      const rowSpan = Number.parseInt(element.getAttribute('rowspan') || '', 10);
      const columnSpan = Number.parseInt(element.getAttribute('colspan') || '', 10);
      cell = {
        start: offset,
        end: offset,
        ...(element.tagName === 'TH' && { header: true }),
        ...(element.hasAttribute('rowspan') && rowSpan >= 0 && { rowSpan }),
        ...(columnSpan > 1 && { columnSpan }),
      };
      row.cells.push(cell);
      if (cell.rowSpan === 0 && element.parentElement?.parentElement && table) {
        const group = element.parentElement.parentElement;
        const spans = groupSpans.get(group) || [];
        spans.push({ cell, row: table.rows.length - 1 });
        groupSpans.set(group, spans);
      }
    }
    const heading = /^H[1-6]$/u.test(element.tagName)
      ? Number(element.tagName.slice(1))
      : undefined;
    let current = block;
    if (!current && (heading || blockTags.has(element.tagName))) {
      current = { start: offset, end: offset, ...(heading && { heading }) };
      ranges.push(current);
    }
    // Only the owner closes a structural block; descendants retain its complete context.
    stack.push({
      node,
      exit: true,
      start: offset,
      block: current === block ? undefined : current,
      table,
      cell,
    });
    for (let child = node.lastChild; child; child = child.previousSibling)
      stack.push({ node: child, block: current, table, row });
  }
  return { ranges: ranges.filter((range) => range.end > range.start), ids, references, tables };
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
  const dom = sourceDomStructure(html, text);
  const tokens = dom ? [] : toToken(toMarkdown(html));
  const search = dom ? undefined : createEvidenceText(text);
  const ranges: SourceBlock[] = dom?.ranges || [];
  const references: NonNullable<GraphSource['references']> = dom?.references || [];
  const tables: NonNullable<GraphSource['tables']> = dom?.tables || [];
  let tokenTable: (typeof tables)[number] | undefined;
  let tokenRow: NonNullable<typeof tokenTable>['rows'][number] | undefined;
  let tokenCell: NonNullable<typeof tokenRow>['cells'][number] | undefined;
  let blockLinks: { href: string; name: string }[] = [];
  let parts = '';
  let cursor = 0;
  let unresolved = false;
  let heading: number | undefined;
  const flush = () => {
    if (!parts) return;
    const value = parts.normalize('NFC').toLowerCase();
    let start = search!.text.indexOf(value, cursor);
    let end = start + value.length;
    if (start < 0) {
      const pattern = value
        .trim()
        .split(/\s+/u)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*');
      const matcher = new RegExp(pattern, 'gu');
      matcher.lastIndex = cursor;
      const match = matcher.exec(search!.text);
      start = match?.index ?? -1;
      end = start + (match?.[0].length || 0);
    }
    if (tokenTable) {
      let position = start >= 0 ? start : cursor;
      const limit = start >= 0 ? end : search!.text.length;
      let resolved = true;
      for (const row of tokenTable.rows)
        for (const cell of row.cells) {
          const value = parts.slice(cell.start, cell.end).normalize('NFC').toLowerCase().trim();
          let first = position;
          let last = position;
          if (value) {
            first = search!.text.indexOf(value, position);
            last = first + value.length;
            if (first < 0) {
              const pattern = value
                .split(/\s+/u)
                .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('\\s*');
              const matcher = new RegExp(pattern, 'gu');
              matcher.lastIndex = position;
              const match = matcher.exec(search!.text);
              first = match?.index ?? -1;
              last = first + (match?.[0].length || 0);
            }
          }
          if (first < 0 || last > limit || /\S/u.test(search!.text.slice(position, first)))
            resolved = false;
          else {
            Object.assign(cell, search!.range(first, last));
            position = last;
          }
        }
      const cells = tokenTable.rows.flatMap((row) => row.cells);
      if (resolved && cells.length)
        tables.push({ ...tokenTable, start: cells[0].start, end: cells.at(-1)!.end });
      tokenTable = undefined;
      tokenRow = undefined;
      tokenCell = undefined;
    }
    if (start >= 0) {
      const range = search!.range(start, end);
      ranges.push({ ...range, ...(heading && { heading }) });
      references.push(...blockLinks.map((link) => ({ ...link, ...range })));
      cursor = end;
    } else {
      unresolved = true;
      references.push(...blockLinks.map((link) => ({ ...link, start: 0, end: text.length })));
    }
    parts = '';
    blockLinks = [];
  };
  for (const token of tokens) {
    if (token.level === 0 && token.nesting !== -1) {
      flush();
      heading = token.type === 'heading_open' ? Number(token.tag.slice(1)) : undefined;
    }
    if (tokenTable || token.type === 'table_open') {
      if (token.type === 'table_open') tokenTable = { start: 0, end: 0, rows: [] };
      if (token.type === 'tr_open') {
        tokenRow = { cells: [] };
        tokenTable!.rows.push(tokenRow);
      }
      if ((token.type === 'th_open' || token.type === 'td_open') && tokenRow) {
        tokenCell = {
          start: parts.length,
          end: parts.length,
          ...(token.type === 'th_open' && { header: true }),
        };
        tokenRow.cells.push(tokenCell);
      }
      if ((token.type === 'th_close' || token.type === 'td_close') && tokenCell)
        tokenCell.end = parts.length;
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
  for (const { name, start } of dom?.ids || sourceHtmlAnchors(html, text)) {
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
  graphSourceMetadataIdentity(tables, true);
  return {
    blocks: blocks.map(({ start, end }) => ({ start, end })),
    ...(tables.length && { tables }),
    scopes,
    anchors,
    references: unresolved
      ? references.map((reference) => ({ ...reference, start: 0, end: text.length }))
      : references,
  };
}

/** Preserve structural context and the transitive closure of explicit source references as one bundle. */
export function createEvidenceContext(sources: Map<string, GraphSource>) {
  const structures = new Map<
    string,
    {
      blocks: EvidenceRange[];
      scopes: EvidenceRange[];
      index: ReturnType<typeof createScopeIndex>;
      tables?: ReturnType<typeof createScopeIndex>;
    }
  >();
  const navigationRanges = new Map<string, { ranges: EvidenceRange[]; counts: number[] }>();
  const bodyLength = (source: GraphSource, start: number, end: number) => {
    let metadata = navigationRanges.get(source.id);
    if (!metadata) {
      const normalized = (value: string) => value.normalize('NFC').toLowerCase().trim();
      const ordered = [
        ...(source.anchors || [])
          .filter((anchor) => anchor.kind === 'heading')
          .map((anchor) => {
            // Heading anchors cover their section; only the verified heading line is metadata.
            const newline = source.text.indexOf('\n', anchor.start);
            return {
              ...anchor,
              end: Math.min(anchor.end, newline < 0 ? source.text.length : newline),
            };
          }),
        ...(source.references || []),
      ]
        .filter(
          (range) =>
            normalized(source.text.slice(range.start, range.end)) === normalized(range.name)
        )
        .sort((a, b) => a.start - b.start || b.end - a.end);
      const ranges: EvidenceRange[] = [];
      for (const range of ordered) {
        const previous = ranges[ranges.length - 1];
        if (previous && previous.end >= range.start)
          previous.end = Math.max(previous.end, range.end);
        else ranges.push({ start: range.start, end: range.end });
      }
      const counts = [0];
      for (const range of ranges)
        counts.push(
          counts[counts.length - 1] + graphNonWhitespaceLength(source, range.start, range.end)
        );
      navigationRanges.set(source.id, (metadata = { ranges, counts }));
    }
    const before = (offset: number) => {
      const { ranges, counts } = metadata!;
      let low = 0,
        high = ranges.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (ranges[middle].end <= offset) low = middle + 1;
        else high = middle;
      }
      const range = ranges[low];
      return (
        counts[low] +
        (range && range.start < offset ? graphNonWhitespaceLength(source, range.start, offset) : 0)
      );
    };
    return graphNonWhitespaceLength(source, start, end) - before(end) + before(start);
  };
  const cache = new Map<
    string,
    {
      context: GraphContextCitation[];
      unresolved: boolean;
      bundleIdentity?: object;
      minimumCharacters?: number;
      hasBody: () => boolean;
    }
  >();
  const blockIdentities = new Map<string, Set<string>>();
  const scopeBundles = new Map<
    string,
    {
      citations: GraphContextCitation[];
      ids: Set<string>;
      unresolved: boolean;
      hasBody: () => boolean;
    }
  >();
  const structureFor = (source: GraphSource) => {
    let structure = structures.get(source.id);
    if (!structure) {
      const scopes = source.scopes || graphTextScopes(source.text);
      structure = {
        blocks: source.blocks || graphTextBlocks(source.text),
        scopes,
        index: createScopeIndex(scopes),
        ...(source.tables?.length && { tables: createScopeIndex(source.tables) }),
      };
      structures.set(source.id, structure);
      blockIdentities.set(
        source.id,
        new Set(structure.blocks.map((block) => block.start + ':' + block.end))
      );
    }
    return structure;
  };
  type ContextJob = { source: GraphSource; item: EvidenceRange; regions: EvidenceRange[] };
  const scopeMinimums = new Map<
    string,
    { minimumCharacters: number; unresolved: boolean; jobs: ContextJob[]; hasBody: () => boolean }
  >();
  return (primary: GraphContextCitation, maxCharacters = Infinity) => {
    const cached = cache.get(primary.id);
    if (cached) return cached;
    const original = sources.get(primary.sourceId);
    let bundleKey: string | undefined;
    let minimumKey: string | undefined;
    let primaryScope: EvidenceRange | undefined;
    if (original) {
      const structure = structureFor(original);
      const parents = structure.index.parents(primary);
      primaryScope = structure.scopes[parents[0]] || { start: 0, end: original.text.length };
      minimumKey = JSON.stringify([original.id, parents]);
      const minimum = scopeMinimums.get(minimumKey);
      if (minimum && minimum.minimumCharacters > maxCharacters)
        return {
          minimumCharacters: minimum.minimumCharacters,
          unresolved: minimum.unresolved,
          hasBody: minimum.hasBody,
          context: [],
        };
      if (blockIdentities.get(original.id)!.has(primary.start + ':' + primary.end)) {
        bundleKey = minimumKey;
        const bundle = scopeBundles.get(bundleKey);
        if (bundle?.ids.has(primary.id)) {
          const result = {
            context: bundle.citations.filter((citation) => citation.id !== primary.id),
            unresolved: bundle.unresolved,
            bundleIdentity: bundle,
            hasBody: bundle.hasBody,
          };
          cache.set(primary.id, result);
          return result;
        }
      }
    }
    const citations = new Map<string, GraphContextCitation>([[primary.id, primary]]);
    const metadata = minimumKey && scopeMinimums.get(minimumKey);
    const visited = new Set<string>();
    const queue = [{ sourceId: primary.sourceId, start: primary.start, end: primary.end }];
    let unresolved = metadata ? metadata.unresolved : false;
    const jobs: ContextJob[] = metadata
      ? metadata.jobs.map((job, index) => (index ? job : { ...job, item: primary }))
      : [];
    for (let index = 0; !metadata && index < queue.length; index++) {
      const item = queue[index];
      const source = sources.get(item.sourceId);
      if (!source) {
        unresolved = true;
        continue;
      }
      const structure = structureFor(source);
      const parents = structure.index.parents(item);
      const scope = structure.scopes[parents[0]] || { start: 0, end: source.text.length };
      const identity = source.id + '@' + scope.start + ':' + scope.end;
      if (visited.has(identity)) continue;
      visited.add(identity);
      const regions = [scope, ...parents.slice(1).map((id) => structure.index.introduction(id))];
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
    let minimumCharacters = metadata ? metadata.minimumCharacters : 0;
    let body: boolean | undefined;
    const hasBody = metadata
      ? metadata.hasBody
      : () =>
          (body ??= jobs.some(({ source, regions }) =>
            regions.some(
              (range) => range.end > range.start && bodyLength(source, range.start, range.end) > 0
            )
          ));
    const covered = new Map<string, EvidenceRange[]>();
    for (const job of metadata ? [] : jobs) {
      const ranges = covered.get(job.source.id) || [];
      ranges.push(...job.regions);
      covered.set(job.source.id, ranges);
    }
    for (const [sourceId, ranges] of covered) {
      const ordered = ranges
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);
      let end = 0;
      for (const range of ordered) {
        const start = Math.max(end, range.start);
        if (range.end > start) {
          minimumCharacters += graphNonWhitespaceLength(sources.get(sourceId)!, start, range.end);
        }
        end = Math.max(end, range.end);
      }
    }
    if (minimumKey && !metadata)
      scopeMinimums.set(minimumKey, { minimumCharacters, unresolved, jobs, hasBody });
    if (minimumCharacters > maxCharacters)
      return { context: [], unresolved, minimumCharacters, hasBody };
    for (const [index, { source, item, regions }] of jobs.entries()) {
      const add = ({ start, end }: EvidenceRange) => {
        // A partial table cannot retain column ownership; keep its original complete coordinates.
        const index = structureFor(source).tables;
        if (index && end > start) {
          const first = index.parents({ start, end: start + 1 }).at(-1);
          const last = index.parents({ start: end - 1, end }).at(-1);
          if (first !== undefined) start = Math.min(start, source.tables![first].start);
          if (last !== undefined) end = Math.max(end, source.tables![last].end);
        }
        if (end <= start || !/\S/u.test(source.text.slice(start, end))) return;
        for (const citation of citations.values())
          if (citation.sourceId === source.id && citation.start <= start && citation.end >= end)
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
        // Preserve the primary claim separately; adjacent context keeps its original span.
        if (region.start < item.start)
          add({ start: region.start, end: Math.min(region.end, item.start) });
        if (region.end > item.end)
          add({ start: Math.max(region.start, item.end), end: region.end });
      }
    }
    const result: {
      context: GraphContextCitation[];
      unresolved: boolean;
      bundleIdentity?: object;
      minimumCharacters?: number;
      hasBody: () => boolean;
    } = {
      context: [...citations.values()].filter((citation) => citation.id !== primary.id),
      unresolved,
      minimumCharacters,
      hasBody,
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
          hasBody,
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
