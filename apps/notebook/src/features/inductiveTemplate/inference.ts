import { ExampleNote, ExtractionMode, TemplateBlock, TemplateDraft, TemplateGroup } from './types';

type HtmlNode = { tag: string; text: string; children: HtmlNode[] };
type StructureBlock = Omit<TemplateBlock, 'sources'>;

const decodeEntities = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : +entity.slice(1);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return (
      { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>
    )[entity.toLowerCase()];
  });

/** A structural reader, not an HTML renderer; also works without a browser DOM on native. */
function readHtml(html: string, mode: ExtractionMode): HtmlNode {
  // Markdown imports may contain escaped HTML tables. Code examples remain excluded.
  const importedTags =
    mode === 'previous'
      ? /&lt;(\/?(?:table|thead|tbody|tfoot|tr|th|td|colgroup|col|div|p|ul|ol|li|h[1-6]|br)\b[\s\S]*?)&gt;/gi
      : /&lt;(\/?(?:table|thead|tbody|tfoot|tr|th|td|colgroup|col|div|p|ul|ol|li|h[1-6]|br|strong|b|em|i|span|code)\b[\s\S]*?)&gt;/gi;
  const input = html
    .replace(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, '')
    .replace(importedTags, (_, tag: string) => `<${decodeEntities(tag)}>`);
  const root: HtmlNode = { tag: 'root', text: '', children: [] };
  const stack = [root];
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'wbr']);
  for (const token of input.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith('<!--')) continue;
    const tag = /^<\s*(\/?)\s*([\w-]+)/.exec(token);
    if (!tag) {
      stack[stack.length - 1].children.push({ tag: '', text: token, children: [] });
      continue;
    }
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      const index = stack.findLastIndex(
        (node) => node.tag === name || node.tag === `ignored:${name}`
      );
      if (index > 0) stack.length = index;
      continue;
    }
    const ignored =
      ['script', 'style', 'code', 'pre'].includes(name) ||
      /\bclass\s*=\s*["'][^"']*\byaml-frontmatter\b/i.test(token);
    const node: HtmlNode = { tag: ignored ? `ignored:${name}` : name, text: '', children: [] };
    stack[stack.length - 1].children.push(node);
    if (!voidTags.has(name) && !/\/\s*>$/.test(token)) stack.push(node);
  }
  return root;
}

function textOf(node: HtmlNode, skipContainers = false): string {
  if (node.tag.startsWith('ignored:')) return '';
  if (skipContainers && ['table', 'ul', 'ol'].includes(node.tag)) return '';
  if (node.tag === 'br') return ' ';
  return (
    decodeEntities(node.text) + node.children.map((child) => textOf(child, skipContainers)).join('')
  );
}

const cleanLabel = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
const labelKey = (label: string) =>
  cleanLabel(label)
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*[.)]?\s+/, '');
const tableRows = (node: HtmlNode): HtmlNode[] =>
  node.children.flatMap((child) =>
    child.tag === 'tr'
      ? [child]
      : ['thead', 'tbody', 'tfoot'].includes(child.tag)
      ? tableRows(child)
      : []
  );
const rowCells = (row: HtmlNode) =>
  row.children.filter((child) => ['td', 'th'].includes(child.tag));
const emphasizedText = (node: HtmlNode): string =>
  ['strong', 'b'].includes(node.tag)
    ? textOf(node, true)
    : node.children.map(emphasizedText).join('');
const isHeaderCell = (cell: HtmlNode): boolean => {
  const label = cleanLabel(textOf(cell, true));
  return cell.tag === 'th' || (!!label && cleanLabel(emphasizedText(cell)) === label);
};
const columnKey = (columns: string[]) => JSON.stringify(columns.map(labelKey));

const weekday =
  '(?:[월화수목금토일](?:요일)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)';
const dateSuffix = `(?:\\s*\\(?${weekday}\\)?)?`;
const numericDate = new RegExp(
  `^(?:(\\d{4})[-./]\\s*)?(\\d{1,2})[-./]\\s*(\\d{1,2})\\.?${dateSuffix}$`,
  'i'
);
const koreanDate = new RegExp(
  `^(?:(\\d{4})년\\s*)?(\\d{1,2})월\\s*(\\d{1,2})일${dateSuffix}$`,
  'i'
);

/** Recognize complete standalone calendar labels, including short dates and optional weekdays. */
function isDateLabel(label: string): boolean {
  if (/^\{\{\s*(?:Date|날짜)(?:\s*\(\d+\))?\s*\}\}$/.test(label)) return true;
  const match = numericDate.exec(label) || koreanDate.exec(label);
  if (!match) return false;
  const year = +(match[1] || 2000);
  const month = +match[2];
  const day = +match[3];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Extract structural labels and shapes, never example body values. */
export function extractStructure(
  note: ExampleNote,
  mode: ExtractionMode = 'current'
): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  const headings: { level: number; id: string }[] = [];
  const occurrences = new Map<string, number>();
  const basename = note.title.split('/').at(-1) || note.title;
  const add = (block: Omit<StructureBlock, 'id'>): string => {
    const base = [block.parentId || '', block.kind, encodeURIComponent(labelKey(block.label))].join(
      '/'
    );
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    const id = `${base}:${occurrence}`;
    blocks.push({ ...block, id });
    return id;
  };
  const walk = (node: HtmlNode, container?: string, insideTable = false) => {
    if (node.tag.startsWith('ignored:')) return;
    let parentId = container || headings.at(-1)?.id;
    if (/^h[1-6]$/.test(node.tag)) {
      const label = cleanLabel(textOf(node));
      const level = +node.tag[1];
      if (!label || label.length > 180 || labelKey(label) === labelKey(basename)) return;
      if (!container) {
        while (headings.length && headings.at(-1)!.level >= level) headings.pop();
        parentId = headings.at(-1)?.id;
      }
      const date = isDateLabel(label);
      const id = add({
        kind: date ? 'date' : 'heading',
        label: date ? 'Date' : label,
        parentId,
        level: Math.min(6, headings.length + 2),
      });
      if (!container) headings.push({ level, id });
      return;
    }
    if (node.tag === 'table') {
      const rows = tableRows(node);
      const first = rows[0] && rowCells(rows[0]);
      if (!first || first.length < 2) return;
      const hasHeader = first.every((cell) =>
        mode === 'current' ? isHeaderCell(cell) : cell.tag === 'th'
      );
      const columns = hasHeader
        ? first.map((cell) => cleanLabel(textOf(cell, true)))
        : first.map((_, index) => `Column ${index + 1}`);
      if (columns.some((label) => !label || label.length > 96)) return;
      const id = add({ kind: 'table', label: columns.join(' / '), columns, parentId });
      for (const row of rows.slice(hasHeader ? 1 : 0)) {
        const cells = rowCells(row);
        const label = cells[0] && cleanLabel(textOf(cells[0], true));
        if (
          !label ||
          label.length > 80 ||
          isDateLabel(label) ||
          /https?:|\d{4}[-/.]\d|\{\{/.test(label)
        )
          continue;
        const rowId = add({ kind: 'row', label, parentId: id });
        for (const cell of cells.slice(1))
          for (const child of cell.children) walk(child, rowId, true);
      }
      return;
    }
    if (!insideTable && ['p', 'li'].includes(node.tag)) {
      const text = cleanLabel(textOf(node, true));
      if (node.tag === 'p' && isDateLabel(text)) {
        add({
          kind: 'date',
          label: 'Date',
          parentId,
          dateStyle: node.children.some((child) => ['strong', 'b'].includes(child.tag))
            ? 'bold'
            : 'plain',
        });
        return;
      }
      const match = /^([^:\n：]{1,60})\s*[:：]/.exec(text);
      if (match && /[\p{L}]/u.test(match[1]) && !/https?$/i.test(match[1])) {
        add({ kind: 'field', label: match[1].trim(), parentId });
        return;
      }
    }
    if (!insideTable && ['ul', 'ol'].includes(node.tag)) {
      const items = node.children.filter((child) => child.tag === 'li');
      const hasFields = items.some((item) =>
        /^[^:：]{1,60}[:：]/.test(cleanLabel(textOf(item, true)))
      );
      if (!hasFields && items.length) {
        const listType =
          node.tag === 'ol'
            ? 'number'
            : items.some((item) => /^\[[ xX]\]/.test(cleanLabel(textOf(item))))
            ? 'task'
            : 'bullet';
        add({ kind: 'list', label: listType, listType, parentId });
        return;
      }
    }
    for (const child of node.children) walk(child, container, insideTable);
  };
  walk(readHtml(note.description || '', mode));
  return blocks;
}

/** Rebase a repeated table form so different document headings do not hide its common structure. */
function tableStructure(blocks: StructureBlock[], columns: string[]): StructureBlock[] {
  const key = columnKey(columns);
  const selected = new Map<string, string>();
  const occurrences = new Map<string, number>();
  const result: StructureBlock[] = [];
  for (const block of blocks) {
    const parentId = block.parentId && selected.get(block.parentId);
    const matchingTable = block.kind === 'table' && columnKey(block.columns || []) === key;
    if (!parentId && !matchingTable) continue;
    const base = [parentId || '', block.kind, encodeURIComponent(labelKey(block.label))].join('/');
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    const id = `${base}:${occurrence}`;
    selected.set(block.id, id);
    result.push({ ...block, id, parentId });
  }
  return result;
}

export function inferTemplate(
  notes: ExampleNote[],
  tableColumns?: string[],
  mode: ExtractionMode = 'current'
): TemplateDraft {
  const unique = [...new Map(notes.map((note) => [note.title.normalize('NFC'), note])).values()];
  if (unique.length < 2) throw new Error('Select at least two example notes.');
  const blocks: TemplateBlock[] = [];
  const byId = new Map<string, TemplateBlock>();
  for (const note of unique) {
    const extracted = extractStructure(note, mode);
    const structure = tableColumns ? tableStructure(extracted, tableColumns) : extracted;
    let previous: string | undefined;
    for (let index = 0; index < structure.length; index++) {
      const item = structure[index];
      const existing = byId.get(item.id);
      if (existing) existing.sources.push(note.title);
      else {
        const block = { ...item, sources: [note.title] };
        const next = structure.slice(index + 1).find((candidate) => byId.has(candidate.id));
        const nextIndex = next ? blocks.findIndex((candidate) => candidate.id === next.id) : -1;
        const previousIndex = previous
          ? blocks.findIndex((candidate) => candidate.id === previous)
          : -1;
        blocks.splice(nextIndex > previousIndex ? nextIndex : previousIndex + 1, 0, block);
        byId.set(block.id, block);
      }
      previous = item.id;
    }
  }
  return { sourceTitles: unique.map((note) => note.title), blocks };
}

export function withAncestors(draft: TemplateDraft, ids: string[]): string[] {
  const selected = new Set(ids);
  const byId = new Map(draft.blocks.map((block) => [block.id, block]));
  for (const id of ids) {
    let parent = byId.get(id)?.parentId;
    while (parent) {
      selected.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  return [...selected];
}

export function commonBlockIds(draft: TemplateDraft): string[] {
  return withAncestors(
    draft,
    draft.blocks.filter((block) => block.sources.length >= 2).map((block) => block.id)
  );
}

export function toggleBlock(draft: TemplateDraft, ids: string[], id: string): string[] {
  if (!ids.includes(id)) return withAncestors(draft, [...ids, id]);
  const byId = new Map(draft.blocks.map((block) => [block.id, block]));
  return ids.filter((candidate) => {
    let current: string | undefined = candidate;
    while (current) {
      if (current === id) return false;
      current = byId.get(current)?.parentId;
    }
    return true;
  });
}

const escapeMarkdown = (text: string) => text.replace(/([\\`*_{}[\]<>#|!])/g, '\\$1');

/** Generate an editable Markdown skeleton. Example prose, metadata and links are excluded. */
export function renderTemplate(draft: TemplateDraft, ids: string[], dateLabel = 'Date'): string {
  const selected = new Set(withAncestors(draft, ids));
  const usedNames = new Set(['title']);
  const variable = (label: string, spaced = false): string => {
    const name =
      label
        .replace(/[\\`*_{}[\]<>#|!\n]/g, ' ')
        .trim()
        .slice(0, 90) || 'Content';
    let unique = name;
    let suffix = 2;
    while (usedNames.has(unique)) unique = `${name} (${suffix++})`;
    usedNames.add(unique);
    return spaced ? `{{ ${unique} }}` : `{{${unique}}}`;
  };
  const children = new Map<string | undefined, TemplateBlock[]>();
  for (const block of draft.blocks) {
    if (!selected.has(block.id)) continue;
    const list = children.get(block.parentId) || [];
    list.push(block);
    children.set(block.parentId, list);
  }
  const render = (block: TemplateBlock): string => {
    const label = escapeMarkdown(block.label);
    if (block.kind === 'date') {
      const value = variable(dateLabel, true);
      if (!block.level) return block.dateStyle === 'bold' ? `**${value}**` : value;
      const nested = (children.get(block.id) || []).map(render).filter(Boolean).join('\n\n');
      return `${'#'.repeat(block.level)} ${value}${nested ? '\n\n' + nested : ''}`;
    }
    if (block.kind === 'heading') {
      const content = variable(block.label);
      const nested = (children.get(block.id) || []).map(render).filter(Boolean).join('\n\n');
      return `${'#'.repeat(block.level || 2)} ${label}\n\n${content}${
        nested ? '\n\n' + nested : ''
      }`;
    }
    if (block.kind === 'field') return `- ${label}: ${variable(block.label)}`;
    if (block.kind === 'list')
      return `${
        block.listType === 'number' ? '1.' : block.listType === 'task' ? '- [ ]' : '-'
      } ${variable('Items')}`;
    if (block.kind === 'row') return '';
    const columns = block.columns || [];
    const rows = (children.get(block.id) || []).filter((item) => item.kind === 'row');
    const rowText = rows.length
      ? rows.map(
          (row) =>
            `| ${escapeMarkdown(row.label)} | ${columns
              .slice(1)
              .map((column) => variable(`${row.label} · ${column}`))
              .join(' | ')} |`
        )
      : [`| ${columns.map((column) => variable(column)).join(' | ')} |`];
    // Nested tables become standalone Markdown tables with their original section context.
    const nestedTables = rows.flatMap((row) =>
      (children.get(row.id) || []).map(
        (item) => `**${escapeMarkdown(row.label)}**\n\n${render(item)}`
      )
    );
    return (
      [
        `| ${columns.map(escapeMarkdown).join(' | ')} |`,
        `| ${columns.map(() => '---').join(' | ')} |`,
        ...rowText,
      ].join('\n') + (nestedTables.length ? '\n\n' + nestedTables.join('\n\n') : '')
    );
  };
  return ['# {{title}}', ...(children.get(undefined) || []).map(render)]
    .filter(Boolean)
    .join('\n\n');
}

/** Group by structural overlap, independent of notebook names, folders and document domains. */
export function suggestTemplateGroups(
  notes: ExampleNote[],
  mode: ExtractionMode = 'current'
): TemplateGroup[] {
  const groups: { notes: ExampleNote[]; tokens: Set<string>; title: string }[] = [];
  const inverted = new Map<string, Set<number>>();
  const tables = new Map<string, { columns: string[]; notes: Map<string, ExampleNote> }>();
  for (const note of notes) {
    const structure = extractStructure(note, mode);
    for (const block of mode === 'current' ? structure : []) {
      if (
        block.kind !== 'table' ||
        !block.columns?.length ||
        block.columns.every((column) => /^Column \d+$/i.test(column))
      )
        continue;
      const key = columnKey(block.columns);
      const table = tables.get(key) || { columns: block.columns, notes: new Map() };
      table.notes.set(note.title.normalize('NFC'), note);
      tables.set(key, table);
    }
    const tokens = new Set(
      structure
        .filter((block) => ['heading', 'field', 'table', 'date'].includes(block.kind))
        .map((block) => `${block.kind}:${labelKey(block.label)}`)
    );
    if (!tokens.size) continue;
    const candidates = new Set<number>();
    for (const token of tokens) for (const id of inverted.get(token) || []) candidates.add(id);
    let best = -1;
    let score = 0.6;
    for (const id of candidates) {
      const representative = groups[id].tokens;
      const shared = [...tokens].filter((token) => representative.has(token));
      const overlap = shared.length / (tokens.size + representative.size - shared.length);
      if (
        (shared.length >= 2 || shared.some((token) => token.startsWith('table:'))) &&
        overlap >= score
      ) {
        best = id;
        score = overlap;
      }
    }
    if (best >= 0) groups[best].notes.push(note);
    else {
      const id = groups.length;
      groups.push({
        notes: [note],
        tokens,
        title:
          structure.find((block) => ['heading', 'table'].includes(block.kind))?.label || note.title,
      });
      for (const token of tokens) {
        const list = inverted.get(token) || new Set<number>();
        list.add(id);
        inverted.set(token, list);
      }
    }
  }
  const supported = groups
    .filter((group) => group.notes.length >= 2)
    .map(({ title, notes }) => ({ title, notes }));
  const covered = new Set(
    supported.flatMap((group) => group.notes.map((note) => note.title.normalize('NFC')))
  );
  const recovered = [...tables.values()]
    .filter(
      (table) =>
        table.notes.size >= 2 && [...table.notes.keys()].some((title) => !covered.has(title))
    )
    .map(({ columns, notes }) => ({
      title: columns.join(' / '),
      notes: [...notes.values()],
      tableColumns: columns,
    }));
  return [...supported, ...recovered].sort(
    (a, b) => b.notes.length - a.notes.length || a.title.localeCompare(b.title)
  );
}
