import { toToken } from '@blacktokki/editor';

import type { RelationKeywordSource } from '../relationDiscovery';
import { normalizeRelationText as normalize } from '../relationKeywords';
import type { RelationAnalysisNote } from '../types';
import { retainDeferredNotes } from './claims';
import { retainSyntaxInputs } from './syntax';

type Token = ReturnType<typeof toToken>[number];
export const noteBasename = (title: string) => title.split('/').at(-1) || title;
export type RelationTextBlock = {
  section: string;
  sectionPath: string[];
  text: string;
  field?: string;
  column?: string;
  columnIndex?: number;
  table?: number;
  row?: number;
  /** A generic exported header has no semantic role until an actual schema row is found. */
  unresolvedColumns?: boolean;
  /** Keep a full contextual claim even when it is not eligible for a binary relation. */
  sourceText?: string;
  /** This whole value was delimited by an actual Markdown link in a pure field-value list. */
  explicitFieldEntry?: boolean;
};
type Region = {
  blocks: RelationTextBlock[];
  sources: RelationKeywordSource[];
  text: string;
  references: { text: string; href: string }[];
  position: string;
  selfReference: boolean;
  identities: string[];
};
export type RelationDocument = {
  description: string;
  title: string;
  regions: Region[];
  metadataValues: { field: string; value: string }[];
  /** Only explicit Markdown header rows; inferred rows never corroborate themselves. */
  headerRows: string[][];
};
export type RelationContent = {
  blocks: RelationTextBlock[];
  keywordSources: RelationKeywordSource[];
  sentences: Pick<RelationTextBlock, 'section' | 'sectionPath' | 'text'>[];
  excludedRegions: number[];
};

/** Inline tokens decode escapes, entities and nested links without interpreting URL text as prose. */
function tokenText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content;
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
      if (token.type === 'html_inline' && /^<br\b/i.test(token.content)) return ' ';
      return '';
    })
    .join('');
}
/** Resolve explicit file links only. Plain document mentions never become document links. */
function fileTarget(href: string, title: string, titles: Set<string>): string | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) return;
  let path: string;
  try {
    path = decodeURIComponent(href.split('#')[0].split('?')[0]);
  } catch {
    return;
  }
  const parts = path.startsWith('/') ? [] : title.split('/').slice(0, -1);
  for (const part of path.replace(/\.(md|markdown)$/i, '').split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  const target = normalize(parts.join('/'));
  return titles.has(target) ? target : undefined;
}

/** Parse the editor's Markdown once; preserve field, heading, cell and source offsets together. */
export function parseRelationDocument(
  note: RelationAnalysisNote,
  toMarkdown: (html: string) => string
): RelationDocument {
  const description = note.description || '';
  let source = description
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(pre|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const hiddenMetadata =
    /<div\b[^>]*class=["'][^"']*yaml-frontmatter[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  const hiddenYaml = /data-yaml=["']([^"']*)["']/i.exec(source)?.[1];
  let decodedMetadata = '';
  try {
    decodedMetadata = decodeURIComponent(hiddenYaml || '');
  } catch {}
  source = source.replace(hiddenMetadata, '');
  if (/<[a-z][^>]*>/i.test(source)) source = toMarkdown(source);
  const frontmatter = /^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  const metadata = frontmatter?.[1] || decodedMetadata;
  const metadataUrls = new Set(
    [...metadata.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0])
  );
  const metadataValues = [...metadata.matchAll(/^\s*([^:#\n]+):\s*(.+?)\s*$/gm)]
    .map((match) => ({ field: match[1].trim(), value: match[2].replace(/^(["'])(.*)\1$/, '$2') }))
    .filter(({ value }) => !metadataUrls.has(value));
  const identities = (href: string) => {
    if (!metadataUrls.has(href)) return [];
    try {
      const url = new URL(href);
      const components = decodeURIComponent(url.pathname).split('/');
      url.searchParams.forEach((value) => components.push(value));
      return metadataValues
        .filter(({ value }) => components.includes(value))
        .map(({ field, value }) => JSON.stringify([field, value]));
    } catch {
      return [];
    }
  };
  source = source.slice(frontmatter?.[0].length || 0);
  const tokens = toToken(source);
  const regions: Region[] = [];
  const headings: { level: number; title: string }[] = [];
  let table = -1;
  let row = -1;
  let column = -1;
  let columns: string[] = [];
  const headerRows: string[][] = [];
  const containers: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'table_open') {
      table++;
      columns = [];
    }
    if (token.type === 'tr_open') {
      row++;
      column = -1;
    }
    if (token.type === 'td_open' || token.type === 'th_open') column++;
    if (token.type === 'thead_close') headerRows.push([...columns]);
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      while (headings.at(-1) && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, title: normalize(tokenText(tokens[index + 1]?.children || [])) });
    }
    if (token.nesting === -1) containers.pop();
    if (token.type === 'inline') {
      const children = token.children || [];
      const text = normalize(tokenText(children));
      const sectionPath = headings.map((item) => item.title);
      const context = { section: sectionPath.join(' / '), sectionPath };
      const sources: RelationKeywordSource[] = [];
      const add = (
        kind: RelationKeywordSource['kind'],
        keyword: string,
        sourceText = text,
        href?: string
      ) => {
        keyword = normalize(keyword);
        if ([...keyword].length > 1 && /\p{L}/u.test(keyword))
          sources.push({
            noteTitle: note.title,
            ...context,
            kind,
            keyword,
            text: sourceText,
            ...(href ? { href } : {}),
          });
      };
      const references: Region['references'] = [];
      const openings: { type: string; at: number; href?: string }[] = [];
      children.forEach((child, at) => {
        if (child.type === 'link_open' || child.type === 'strong_open')
          openings.push({ type: child.type, at, href: child.attrGet('href') || undefined });
        if (child.type === 'link_close' || child.type === 'strong_close') {
          const open = openings.pop();
          if (!open) return;
          const label = normalize(tokenText(children.slice(open.at + 1, at)));
          add(open.type === 'link_open' ? 'link' : 'bold', label, text, open.href);
          if (open.href) references.push({ text: label, href: open.href });
        }
      });
      const previous = tokens[index - 1]?.type;
      const blocks: RelationTextBlock[] = [];
      if (previous === 'heading_open') add('heading', text);
      else if (previous === 'th_open') {
        columns[column] = text;
        add('table-header', text);
      } else if (previous === 'td_open') {
        if (text && columns[column])
          blocks.push({
            ...context,
            text,
            column: columns[column],
            columnIndex: column,
            table,
            row,
          });
      } else {
        const lines: Token[][] = [[]];
        for (const child of children) {
          if (child.type === 'softbreak' || child.type === 'hardbreak') lines.push([]);
          else lines.at(-1)!.push(child);
        }
        let prose: string[] = [];
        const flush = () => {
          for (const sentence of normalize(prose.join(' ')).split(/(?<=[.!?。！？])\s+/))
            if (sentence) blocks.push({ ...context, text: sentence });
          prose = [];
        };
        for (const line of lines) {
          const value = normalize(tokenText(line));
          // A URI is a reference address, not a predicate between words inside the address.
          if (/^[a-z][a-z\d+.-]*:\/\/\S+$/i.test(value)) {
            flush();
            continue;
          }
          // Parenthetical examples, timestamps and executable syntax are not property keys.
          const field = /^([^:：\n]+)[:：]\s*(.+)$/.exec(value);
          if (field && !field[2].startsWith('//')) {
            const named = namedFields(value);
            if (!named.length) {
              prose.push(value);
              continue;
            }
            flush();
            for (const item of named) {
              add('field-name', item.field, value);
              add('field-value', item.value, value);
              const entries = linkedFieldValues(line, value, item.start, item.value);
              for (const text of entries || [item.value])
                blocks.push({
                  ...context,
                  text,
                  field: item.field,
                  sourceText: value,
                  ...(entries ? { explicitFieldEntry: true } : {}),
                });
            }
          } else prose.push(value);
        }
        flush();
      }
      regions.push({
        blocks,
        sources,
        text,
        references,
        position: containers.join('/'),
        selfReference:
          references.length === 1 &&
          metadataUrls.has(references[0].href) &&
          text === references[0].text,
        identities: references.length === 1 ? identities(references[0].href) : [],
      });
    }
    if (token.nesting === 1) containers.push(token.type);
  }
  return { description, title: note.title, regions, metadataValues, headerRows };
}

/** Split explicit property boundaries, without interpreting a colon inside a value as a new role. */
function namedFields(text: string): { field: string; value: string; start: number }[] {
  const first = /^([^:：\n]+)[:：]\s*(.+)$/.exec(text);
  if (!first || /[()[\]{}<>.!?。！？=]/u.test(first[1]) || !/\p{L}/u.test(first[1])) return [];
  const result: { field: string; value: string; start: number }[] = [];
  let field = first[1].trim();
  let start = first[0].length - first[2].length;
  const boundaries = /\s*[;·]\s*([^:：;·()[\]{}<>.!?=]+)[:：]\s*/gu;
  boundaries.lastIndex = start;
  for (const match of text.matchAll(boundaries)) {
    result.push({ field, value: text.slice(start, match.index).trim(), start });
    field = match[1].trim();
    start = match.index! + match[0].length;
  }
  result.push({ field, value: text.slice(start).trim(), start });
  return result.filter((item) => item.value.length > 0);
}

/** Split only complete AST link lists; unknown linked names cannot suppress other whole entries. */
function linkedFieldValues(tokens: Token[], text: string, start: number, value: string) {
  const entries: { text: string; start: number; end: number }[] = [];
  let open = -1;
  for (let at = 0; at < tokens.length; at++) {
    if (tokens[at].type === 'link_open') open = at;
    if (tokens[at].type !== 'link_close' || open < 0) continue;
    const label = normalize(tokenText(tokens.slice(open + 1, at)));
    // Preserve a trailing normalized space in the prefix so repeated plain text cannot steal
    // the position of a later linked occurrence. Verify spelling after normalization.
    const position = tokenText(tokens.slice(0, open))
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trimStart().length;
    open = -1;
    if (
      !label ||
      position < start ||
      position + label.length > start + value.length ||
      text.slice(position, position + label.length) !== label
    )
      continue;
    entries.push({ text: label, start: position - start, end: position - start + label.length });
  }
  if (!entries.length || text.slice(start, start + value.length) !== value) return;
  let cursor = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const gap = value.slice(cursor, entry.start);
    if (entry.start < cursor || !/^[\s,;/·|]*$/u.test(gap) || (i > 0 && !gap)) return;
    cursor = entry.end;
  }
  if (/^[\s,;/·|]*$/u.test(value.slice(cursor))) return entries.map((entry) => entry.text);
}

/** Recover a schema row only when exported ordinal columns and an entire label row corroborate it. */
function restoreTableHeaders(regions: Region[], knownHeaders: string[][]) {
  const tables = new Map<number, Region[]>();
  for (const region of regions) {
    const table = region.blocks[0]?.table;
    if (table === undefined) continue;
    const group = tables.get(table) || [];
    group.push(region);
    tables.set(table, group);
  }
  for (const group of tables.values()) {
    const blocks = group.flatMap((region) => region.blocks);
    const columns = [...new Map(blocks.map((block) => [block.columnIndex!, block.column!]))];
    const ordinals = columns.map(([, column]) => /^(\D+?)(\d+)$/u.exec(column));
    // Detect an ordinal family from its shared prefix and consecutive numbers, in any language.
    // No exported header name is reserved. Ordinary semantic headers remain untouched.
    if (
      !ordinals.every(
        (match, index) =>
          match && match[1] === ordinals[0]?.[1] && Number(match[2]) === columns[index][0] + 1
      )
    )
      continue;
    const width = new Set(blocks.map((block) => block.columnIndex)).size;
    const rows = new Map<number, RelationTextBlock[]>();
    for (const block of blocks) {
      const row = rows.get(block.row!) || [];
      row.push(block);
      rows.set(block.row!, row);
    }
    // Exported tables may start with sparse section captions before their actual schema.
    // Never search past a complete record: an ordinary later row must not become a header.
    const firstRow = [...rows.values()].find((row) => row.length === width) || [];
    const names = new Map(firstRow.map((block) => [block.columnIndex, block.text]));
    const corroborated = knownHeaders.some(
      (headers) =>
        headers.length > 1 &&
        headers.length <= width &&
        headers.every((header, index) => header && header === names.get(index))
    );
    const restored =
      firstRow.length === width &&
      width > 1 &&
      (firstRow[0].row === blocks[0].row || corroborated) &&
      firstRow.every((block) => /\p{L}/u.test(block.text) && !/[\d@:/\n]/u.test(block.text)) &&
      new Set(firstRow.map((block) => block.text)).size === width &&
      // Short words alone cannot distinguish a header from an ordinary first record.
      blocks.some((block) => block.row !== firstRow[0].row && /[\d@:/\n]/u.test(block.text));
    const headerRows = new Set(
      restored
        ? [...rows]
            .filter(
              ([, row]) =>
                row.length === width &&
                row.every((block) => block.text === names.get(block.columnIndex))
            )
            .map(([index]) => index)
        : []
    );
    for (const region of group) {
      if (headerRows.has(region.blocks[0].row!)) {
        for (const block of region.blocks)
          region.sources.push({
            noteTitle: '',
            section: block.section,
            sectionPath: block.sectionPath,
            kind: 'table-header',
            keyword: block.text,
            text: block.text,
          });
        region.blocks = [];
      } else
        for (const block of region.blocks) {
          if (restored && block.row! > firstRow[0].row!)
            block.column = names.get(block.columnIndex);
          else block.unresolvedColumns = true;
        }
    }
  }
}

/**
 * Discover repeated navigation roles from actual ancestry and region structure, irrespective of
 * separator spelling or position. Uncorroborated regions remain semantic input. Navigation link
 * keywords remain available; confirmed self-source footers do not become keyword entities.
 */
export async function prepareRelationCorpus(
  notes: RelationAnalysisNote[],
  toMarkdown: (html: string) => string,
  documents = new Map<string, RelationDocument>(),
  check: () => void = () => undefined
): Promise<Map<string, RelationContent>> {
  const titles = new Set(notes.map((note) => normalize(note.title)));
  for (const title of documents.keys()) if (!titles.has(title)) documents.delete(title);
  const proposals = new Map<Region, string>();
  const support = new Map<string, Set<string>>();
  const metadataOwners = new Map<string, Set<string>>();
  let yielded = Date.now();
  for (const note of notes) {
    check();
    const title = normalize(note.title);
    let document = documents.get(title);
    if (
      !document ||
      document.title !== note.title ||
      document.description !== (note.description || '')
    ) {
      document = parseRelationDocument(note, toMarkdown);
      documents.set(title, document);
    }
    for (const item of document.metadataValues) {
      const value = JSON.stringify([item.field, item.value]);
      const owners = metadataOwners.get(value) || new Set<string>();
      owners.add(title);
      metadataOwners.set(value, owners);
    }
    if (Date.now() - yielded >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      yielded = Date.now();
    }
  }
  const headerRows = [
    ...new Map(
      [...documents.values()]
        .flatMap((document) => document.headerRows || [])
        .map((row) => [JSON.stringify(row), row])
    ).values(),
  ];
  // Recompute inferred roles from cached raw regions. Removing corroborating notes must undo
  // a previous inference rather than leave mutated headers in the document cache.
  const prepared = new Map<string, RelationDocument>();
  for (const [title, document] of documents) {
    check();
    const regions = document.regions.map((region) => ({
      ...region,
      blocks: region.blocks.map((block) => ({ ...block })),
      sources: [...region.sources],
    }));
    restoreTableHeaders(regions, headerRows);
    prepared.set(title, { ...document, regions });
    if (Date.now() - yielded >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      yielded = Date.now();
    }
  }
  for (const note of notes) {
    check();
    const title = normalize(note.title);
    const document = prepared.get(title)!;
    for (const region of document.regions) {
      if (!region.blocks.length || region.blocks.some((block) => block.column)) continue;
      const targets = region.references.map((ref) => fileTarget(ref.href, note.title, titles));
      let chain =
        targets.length > 0 &&
        targets.every(
          (target, index) =>
            target &&
            title.startsWith(target + '/') &&
            (!index || target.startsWith(targets[index - 1]! + '/'))
        );
      let residual = region.text;
      for (const ref of region.references) residual = residual.replace(ref.text, '');
      if (!region.references.length) {
        // Plain ancestor captions can establish a region role, but never a hyperlink or entity.
        const parts = title.split('/');
        const ancestors = parts
          .slice(0, -1)
          .map((_, index) => parts.slice(0, index + 1).join('/'))
          .filter((ancestor) => titles.has(ancestor));
        let end = 0;
        let count = 0;
        let ambiguous = false;
        const captions = new Set<string>();
        for (const ancestor of ancestors) {
          const caption = noteBasename(ancestor);
          const at = residual.indexOf(caption, end);
          if (at < 0) continue;
          if (captions.has(caption)) {
            ambiguous = true;
            break;
          }
          captions.add(caption);
          end = at + caption.length;
          count++;
        }
        if (count > 1 && !ambiguous) {
          for (const caption of captions) residual = residual.replace(caption, '');
          chain = true;
        }
      }
      const selfReference =
        (region.selfReference &&
          region.identities.some((value) => metadataOwners.get(value)?.size === 1)) ||
        (targets.length === 1 && targets[0] === title && region.text === region.references[0].text);
      if (selfReference) region.selfReference = true;
      if (!selfReference && (!chain || /[\p{L}\p{N}]/u.test(residual))) continue;
      const role = `${selfReference ? 'self-reference' : 'ancestry'}:${region.position}`;
      proposals.set(region, role);
      const notes = support.get(role) || new Set<string>();
      notes.add(title);
      support.set(role, notes);
    }
    if (Date.now() - yielded >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      yielded = Date.now();
    }
  }
  const result = new Map<string, RelationContent>();
  for (const note of notes) {
    check();
    const document = prepared.get(normalize(note.title))!;
    const blocks: RelationTextBlock[] = [];
    const keywordSources: RelationKeywordSource[] = [
      {
        noteTitle: note.title,
        section: '',
        sectionPath: [],
        kind: 'title',
        keyword: noteBasename(note.title),
        text: noteBasename(note.title),
      },
    ].filter(
      (source) => [...source.keyword].length > 1 && /\p{L}/u.test(source.keyword)
    ) as RelationKeywordSource[];
    const excludedRegions: number[] = [];
    document.regions.forEach((region, index) => {
      const role = proposals.get(region);
      const excluded = role !== undefined && support.get(role)!.size > 1;
      if (excluded) excludedRegions.push(index);
      else blocks.push(...region.blocks);
      if (!excluded || !region.selfReference)
        keywordSources.push(
          ...region.sources.map((source) =>
            source.noteTitle ? source : { ...source, noteTitle: note.title }
          )
        );
    });
    const sentences: RelationContent['sentences'] = [];
    let row: RelationTextBlock[] = [];
    const flush = () => {
      if (row.length)
        sentences.push({
          ...row[0],
          text: row.map((cell) => `${cell.column}: ${cell.text}`).join('; '),
        });
      row = [];
    };
    for (const block of blocks) {
      if (block.column) {
        if (row.length && row[0].row !== block.row) flush();
        row.push(block);
      } else {
        flush();
        sentences.push({
          ...block,
          text: block.field ? `${block.field}: ${block.text}` : block.text,
        });
      }
    }
    flush();
    result.set(normalize(note.title), { blocks, keywordSources, sentences, excludedRegions });
  }
  retainSyntaxInputs(
    new Set([...result.values()].flatMap((content) => content.blocks.map((block) => block.text)))
  );
  retainDeferredNotes(new Set(notes.map((note) => note.title)));
  return result;
}
