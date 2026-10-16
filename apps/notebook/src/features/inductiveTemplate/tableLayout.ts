import { templateVariables } from './template';

type Sequence = { prefix: string; suffix: string; start: number; width: number };
type AxisGroup = {
  id: string;
  axis: 'row' | 'column';
  start: number;
  length: number;
  sequence?: Sequence;
};

export type TemplateTable = {
  id: string;
  name: string;
  start: number;
  end: number;
  headers: string[];
  separators: string[];
  rows: string[][];
  groups: AxisGroup[];
};
export type TableLayoutState = Record<
  string,
  { ids: number[]; nextId: number; labels?: Record<number, string> }
>;
type AxisItem = { id: string; index: number; ordinal: number; group?: AxisGroup };
export type TableColumn = { id: string; label: string; groupId?: string; ordinal: number };
export type TableRow = {
  id: string;
  label: string;
  groupId?: string;
  ordinal: number;
  cells: { columnId: string; variables: string[] }[];
};
export type TemplateTableView = {
  id: string;
  name: string;
  groups: AxisGroup[];
  columns: TableColumn[];
  rows: TableRow[];
};

/** Split GFM cells at unescaped pipes, including an even number of preceding backslashes. */
function cells(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let escapes = 0;
  const text = line.trim();
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '|' && escapes % 2 === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
    escapes = char === '\\' ? escapes + 1 : 0;
  }
  parts.push(text.slice(start).trim());
  if (text.startsWith('|')) parts.shift();
  if (start === text.length) parts.pop();
  return parts;
}

const placeholder = (value: string) => /^\{\{\s*[^{}\n]{1,100}?\s*\}\}$/.test(value);
const sequence = (value: string): Sequence | undefined => {
  if (templateVariables(value).length) return;
  const match = /^(.*?)(\d+)(\D*)$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return;
  return { prefix: match[1], suffix: match[3], start: Number(match[2]), width: match[2].length };
};
const numberedLabel = (pattern: Sequence, ordinal: number) =>
  `${pattern.prefix}${String(pattern.start + ordinal).padStart(pattern.width, '0')}${
    pattern.suffix
  }`;

/** Only repeated identifiers/headers and wholly variable rows become resizable; form labels stay fixed. */
function groupsFor(
  tableId: string,
  axis: AxisGroup['axis'],
  labels: string[],
  eligible: boolean[],
  variableRows = false,
  variableColumns = false
): AxisGroup[] {
  const groups: AxisGroup[] = [];
  for (let start = 0; start < labels.length; start++) {
    if (!eligible[start]) continue;
    const pattern = sequence(labels[start]);
    const generic = variableRows && placeholder(labels[start]);
    let end = start + 1;
    while (
      end < labels.length &&
      eligible[end] &&
      (generic
        ? placeholder(labels[end])
        : pattern
        ? labels[end] === numberedLabel(pattern, end - start)
        : variableColumns || labels[end] === labels[start])
    )
      end++;
    if (generic || end - start >= 2) {
      groups.push({
        id: `${tableId}-${axis}-${start}`,
        axis,
        start,
        length: end - start,
        sequence: pattern,
      });
      start = end - 1;
    }
  }
  return groups;
}

/** Inspect extracted Markdown without changing discovery, fixed rows, fenced examples, or other tables. */
export function findTemplateTables(markdown: string): TemplateTable[] {
  const lines = markdown.split('\n');
  const tables: TemplateTable[] = [];
  let heading = '';
  let fence: { char: string; length: number } | undefined;
  for (let index = 0; index < lines.length - 1; index++) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(lines[index]);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (
        marker[1][0] === fence.char &&
        marker[1].length >= fence.length &&
        /^\s*$/.test(lines[index].slice(marker[0].length))
      )
        fence = undefined;
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(lines[index])) continue;
    const title = /^#{1,6}\s+(.+)$/.exec(lines[index]);
    if (title) heading = title[1];
    const headers = cells(lines[index]);
    const separator = cells(lines[index + 1]);
    if (
      headers.length < 2 ||
      separator.length !== headers.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    )
      continue;
    const start = index;
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      const row = cells(lines[index]);
      if (row.length !== headers.length || /^(?: {4}|\t)/.test(lines[index])) break;
      rows.push(row);
      index++;
    }
    const id = `table-${start}`;
    const rowGroups = groupsFor(
      id,
      'row',
      rows.map((row) => row[0]),
      rows.map(
        (row) =>
          row.slice(1).every((cell) => placeholder(cell)) &&
          (placeholder(row[0]) || !/[{}]/.test(row[0]))
      ),
      true
    );
    // A literal first column identifies rows and must survive column removal.
    const anchored = rows.some((row) => row[0] && !placeholder(row[0]));
    const columnGroups = groupsFor(
      id,
      'column',
      headers,
      headers.map(
        (_, column) =>
          !(anchored && column === 0) &&
          rows.some((row) => placeholder(row[column])) &&
          rows.every((row) => !row[column] || placeholder(row[column]))
      ),
      false,
      rowGroups.length === 0
    );
    if (rowGroups.length || columnGroups.length)
      tables.push({
        id,
        name: heading || headers.join(' / '),
        start,
        end: index,
        headers,
        separators: separator,
        rows,
        groups: [...rowGroups, ...columnGroups],
      });
    index--;
  }
  return tables;
}

export function initialTableLayout(tables: TemplateTable[]): TableLayoutState {
  return Object.fromEntries(
    tables.flatMap((table) =>
      table.groups.map((group) => [
        group.id,
        { ids: Array.from({ length: group.length }, (_, index) => index), nextId: group.length },
      ])
    )
  );
}

/** IDs never recycle, so deleting a populated item cannot restore its values in a newly added item. */
export function changeTableLayout(
  tables: TemplateTable[],
  state: TableLayoutState,
  groupId: string,
  removeId?: number
): TableLayoutState {
  const table = tables.find((item) => item.groups.some((group) => group.id === groupId));
  const group = table?.groups.find((item) => item.id === groupId);
  const current = state[groupId];
  if (!table || !group || !current) return state;
  if (removeId !== undefined) {
    if (!current.ids.includes(removeId)) return state;
    const columns = expandAxis(
      table.headers.length,
      table.groups.filter((item) => item.axis === 'column'),
      state
    );
    if (group.axis === 'column' && columns.length <= 1) return state;
    return {
      ...state,
      [groupId]: { ...current, ids: current.ids.filter((id) => id !== removeId) },
    };
  }
  if (!Number.isSafeInteger((group.sequence?.start || 0) + current.nextId)) return state;
  return {
    ...state,
    [groupId]: { ...current, ids: [...current.ids, current.nextId], nextId: current.nextId + 1 },
  };
}

/** Column names are independent of cell keys, so renaming never discards an entered value. */
export function renameTableColumn(
  state: TableLayoutState,
  groupId: string,
  ordinal: number,
  label: string
): TableLayoutState {
  const current = state[groupId];
  if (!current?.ids.includes(ordinal)) return state;
  return {
    ...state,
    [groupId]: {
      ...current,
      labels: { ...current.labels, [ordinal]: label.replace(/[\r\n]/g, ' ').slice(0, 96) },
    },
  };
}

function expandAxis(length: number, groups: AxisGroup[], state: TableLayoutState): AxisItem[] {
  const items: AxisItem[] = [];
  for (let index = 0; index < length; index++) {
    const group = groups.find((item) => item.start === index);
    if (!group) items.push({ id: String(index), index, ordinal: index });
    else {
      for (const ordinal of state[group.id]?.ids ||
        Array.from({ length: group.length }, (_, id) => id)) {
        items.push({
          id: `${group.id}-${ordinal}`,
          index: group.start + (ordinal < group.length ? ordinal : 0),
          ordinal,
          group,
        });
      }
      index += group.length - 1;
    }
  }
  return items;
}

/** Expand both axes before one-pass value substitution; the result drives the form, preview and save. */
export function applyTableLayout(
  markdown: string,
  tables: TemplateTable[],
  state: TableLayoutState
): { markdown: string; tables: TemplateTableView[] } {
  const lines = markdown.split('\n');
  const reserved = new Set(templateVariables(markdown));
  const views: TemplateTableView[] = [];
  const replacements: { start: number; end: number; lines: string[] }[] = [];
  for (const table of tables) {
    const rowItems = expandAxis(
      table.rows.length,
      table.groups.filter((group) => group.axis === 'row'),
      state
    );
    const columnItems = expandAxis(
      table.headers.length,
      table.groups.filter((group) => group.axis === 'column'),
      state
    );
    const label = (item: AxisItem, original: string) =>
      item.group?.sequence ? numberedLabel(item.group.sequence, item.ordinal) : original;
    const originalHeader = (column: AxisItem) => {
      const text = label(column, table.headers[column.index]);
      return column.group && !column.group.sequence && column.ordinal >= column.group.length
        ? `${text} (${column.ordinal + 1})`
        : text;
    };
    const headerText = columnItems.map((column) => {
      const custom = column.group && state[column.group.id]?.labels?.[column.ordinal];
      return typeof custom === 'string'
        ? custom.replace(/([\\`*_{}[\]<>#|!])/g, '\\$1')
        : originalHeader(column);
    });
    const columns = columnItems.map((column, index) => ({
      id: column.id,
      label: headerText[index].replace(/\\([\\`*_{}[\]<>#|!])/g, '$1'),
      groupId: column.group?.id,
      ordinal: column.ordinal,
    }));
    const output: string[] = [
      `| ${headerText.join(' | ')} |`,
      `| ${columnItems.map((column) => table.separators[column.index]).join(' | ')} |`,
    ];
    const rows = rowItems.map((row) => {
      const rowLabel = label(
        row,
        placeholder(table.rows[row.index][0]) ? String(row.ordinal + 1) : table.rows[row.index][0]
      );
      const cellText = columnItems.map((column) => {
        const original = table.rows[row.index][column.index];
        if (column.index === 0 && row.group?.sequence) return rowLabel;
        const added =
          (row.group && row.ordinal >= row.group.length) ||
          (column.group && column.ordinal >= column.group.length);
        if (!added || (original && !templateVariables(original).length)) return original;
        const name = `${rowLabel} · ${originalHeader(column)}`
          .replace(/[\\`*_{}[\]<>#|!\n]/g, ' ')
          .trim()
          .slice(0, 80);
        // Stable coordinates isolate new cells across tables and survive deletion of either axis.
        const coordinates = `${table.start}.${row.group?.start ?? row.index}-${row.ordinal}.${
          column.group?.start ?? column.index
        }-${column.ordinal}`;
        const available = Math.max(1, 96 - coordinates.length);
        let unique = `${name.slice(0, available)} (${coordinates})`;
        let suffix = 2;
        while (reserved.has(unique)) {
          const addition = ` (${suffix++})`;
          unique = `${name.slice(
            0,
            Math.max(1, available - addition.length)
          )}${addition} (${coordinates})`;
        }
        return `{{${unique}}}`;
      });
      output.push(`| ${cellText.join(' | ')} |`);
      return {
        id: row.id,
        label: rowLabel,
        groupId: row.group?.id,
        ordinal: row.ordinal,
        cells: cellText.map((text, index) => ({
          columnId: columns[index].id,
          variables: templateVariables(text),
        })),
      };
    });
    views.push({ id: table.id, name: table.name, groups: table.groups, columns, rows });
    replacements.push({ start: table.start, end: table.end, lines: output });
  }
  for (const replacement of replacements.reverse())
    lines.splice(replacement.start, replacement.end - replacement.start, ...replacement.lines);
  return { markdown: lines.join('\n'), tables: views };
}
