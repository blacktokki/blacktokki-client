import { useAuthContext } from '@blacktokki/account';
import { toHtml, toMarkdown, toRaw } from '@blacktokki/editor';
import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from 'react-query';

import { findTemplateTables, TemplateTable } from './tableLayout';
import { noteTitleIssue, templateVariables } from './template';
import { ExampleNote } from './types';
import { useUsageMode } from '../../hooks/useUsageMode';
import { getContentList, patchContent, postContent } from '../../services/notebook';
import { getStoreItems, saveStoreItems } from '../../services/storage';
import { Content, PostContent } from '../../types';

export type TemplateSheetRow = {
  id: string;
  original?: ExampleNote;
  draft?: ExampleNote;
  title: string;
  values: Record<string, string>;
  initialValues?: Record<string, string>;
  deleted: boolean;
  repeats?: Record<string, RepeatState>;
};
type RepeatState = {
  html: string;
  rows: (string | undefined)[];
  columns: (string | undefined)[];
  next: Record<string, number>;
};
export type SheetRepeat = {
  table: TemplateTable;
  group: TemplateTable['groups'][number];
  name: string;
  variables: string[];
};
export type RepeatCell = {
  row: number;
  column: number;
  label: string;
  value: string;
  fieldIndex: number;
};
type Binding = { nodes: Element[] } | { node: Element; start: number; end: number };
type Projection = {
  document: Document;
  values: Record<string, string>;
  bindings: Map<string, Binding>;
  missing: Map<string, { unit: Element; heading?: Element; anchor?: Element }>;
};
export const sheetFieldKey = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*[.)]?\s+|^\d+(?:\.\d+)*[.)](?=\p{L})/u, '')
    .replace(/\s+/g, '');
const label = (node?: Element) => (node?.textContent || '').trim();
const heading = (node: Element) => /^H[1-6]$/.test(node.tagName);
const visible = (node: Element) => !node.closest('pre, code, script, style, .yaml-frontmatter');
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const placeholder = /\{\{\s*([^{}\n]{1,100}?)\s*\}\}/g;
const inline = (markdown: string) =>
  toHtml(markdown)
    .trim()
    .replace(/^<p(?:\s[^>]*)?>|<\/p>$/g, '')
    .replace(/<\/p>\s*<p(?:\s[^>]*)?>/g, '<br>');
let modelCache:
  | {
      markdown: string;
      templates: Element[];
      headings: Element[];
      owners: Map<string, Element>;
      variables: string[];
    }
  | undefined;

/** Match structural labels, while keeping the source DOM and all unrelated content intact. */
function project(markdown: string, note: ExampleNote): Projection {
  if (modelCache?.markdown !== markdown) {
    const templates = Array.from(parse(toHtml(markdown)).body.querySelectorAll('*')).filter(
      visible
    );
    const owners = new Map<string, Element>();
    for (const node of templates)
      if (/^(P|LI|TD|TH|H[1-6])$/.test(node.tagName))
        for (const name of templateVariables(node.textContent || '')) owners.set(name, node);
    modelCache = {
      markdown,
      templates,
      headings: templates.filter(heading),
      owners,
      variables: templateVariables(markdown).filter((value) => value !== 'title'),
    };
  }
  const document = parse(note.description || '');
  const { templates, headings: templateHeadings, owners, variables } = modelCache;
  const sources = Array.from(document.body.querySelectorAll('*')).filter(visible);
  const sourceHeadings = sources.filter(heading);
  const matched = new Map<Element, Element>();
  let cursor = 0;
  for (const item of templateHeadings) {
    const text = label(item);
    const variable = templateVariables(text);
    const index = sourceHeadings.findIndex((candidate, position) => {
      if (position < cursor) return false;
      if (!variable.length) return sheetFieldKey(label(candidate)) === sheetFieldKey(text);
      if (variable.includes('title'))
        return (
          sheetFieldKey(label(candidate)) === sheetFieldKey(note.title.split('/').at(-1) || '')
        );
      return (
        /\d|\{\{/.test(label(candidate)) &&
        sheetFieldKey(label(candidate)) !== sheetFieldKey(note.title.split('/').at(-1) || '')
      );
    });
    if (index >= 0) {
      matched.set(item, sourceHeadings[index]);
      cursor = index + 1;
    }
  }
  const context = (node: Element) =>
    templateHeadings.filter((item) => templates.indexOf(item) < templates.indexOf(node)).at(-1);
  const region = (parent?: Element) => {
    const start = parent ? sources.indexOf(parent) + 1 : 0;
    const end = sources.findIndex((item, index) => index >= start && heading(item));
    return sources.slice(start, end < 0 ? undefined : end);
  };
  const values: Record<string, string> = {};
  const bindings = new Map<string, Binding>();
  const missing: Projection['missing'] = new Map();
  const usedLists = new Set<Element>();
  const tables = new Map<
    Element,
    {
      rows: Element[];
      headers: string[];
      targets: Element[];
      labels: Map<string, Element>;
      columns: Map<string, number>;
    }
  >();
  const fields = (node: Element) => {
    let offset = 0;
    let boundary = 0;
    const result = node.innerHTML.split(/(<br\s*\/?\s*>)/i).flatMap((part) => {
      const start = offset;
      offset += part.length;
      if (/^<br\b/i.test(part)) {
        boundary = start;
        return [];
      }
      const match = /^([^:：\n]{1,60})[:：]/.exec(toRaw(part).trim());
      const token = [...part.matchAll(/<[^>]*>|[^<]+/g)].find(
        (item) => !item[0].startsWith('<') && /[:：]/.test(item[0])
      );
      const colonStart = token ? token.index! + token[0].search(/[:：]/) : -1;
      const colon =
        colonStart >= 0 ? /^[:：](?:\s*<\/[^>]+>)*\s*/.exec(part.slice(colonStart)) : null;
      return match && colon
        ? [{ name: match[1], start: start + colonStart + colon[0].length, end: offset, boundary }]
        : [];
    });
    return result.map((item, index) => ({
      ...item,
      end: result[index + 1]?.boundary ?? node.innerHTML.length,
    }));
  };
  for (const name of variables) {
    values[name] = '';
    const owner = owners.get(name);
    if (!owner) continue;
    const parent = context(owner);
    const sourceParent = parent && matched.get(parent);
    const area = parent && !sourceParent ? [] : region(sourceParent);
    let binding: Binding | undefined;
    const table = owner.closest('table');
    if (heading(owner)) {
      const target = matched.get(owner);
      if (target) binding = { node: target, start: 0, end: target.innerHTML.length };
    } else if (table) {
      let mapped = tables.get(table);
      if (!mapped) {
        const modelRows = tableRows(table);
        const headers = Array.from(modelRows[0]?.children || []).map(label);
        const targetTable = area.find(
          (node) =>
            node.tagName === 'TABLE' &&
            headers.every((name) =>
              Array.from(node.querySelector('tr')?.children || []).some(
                (cell) => sheetFieldKey(label(cell)) === sheetFieldKey(name)
              )
            )
        );
        const targets = tableRows(targetTable);
        mapped = {
          rows: modelRows,
          headers,
          targets,
          labels: new Map(
            targets.map((row) => [sheetFieldKey(label(row.children[0])), row] as const).reverse()
          ),
          columns: new Map(
            Array.from(targets[0]?.children || [])
              .map((cell, index) => [sheetFieldKey(label(cell)), index] as const)
              .reverse()
          ),
        };
        tables.set(table, mapped);
      }
      const row = owner.closest('tr')!;
      const rowIndex = mapped.rows.indexOf(row);
      const cellIndex = Array.from(row.children).indexOf(owner);
      const rowLabel = label(row.children[0]);
      const targetRow = templateVariables(rowLabel).length
        ? mapped.targets[rowIndex]
        : mapped.labels.get(sheetFieldKey(rowLabel));
      const targetColumn = mapped.columns.get(sheetFieldKey(mapped.headers[cellIndex]));
      const target =
        targetRow?.children[
          targetColumn === undefined || targetColumn < 0 ? cellIndex : targetColumn
        ];
      if (target) binding = { node: target, start: 0, end: target.innerHTML.length };
    } else {
      const field = fields(owner).find((item) =>
        templateVariables(toRaw(owner.innerHTML.slice(item.start, item.end))).includes(name)
      );
      if (field) {
        for (const node of area.filter(
          (item) => ['P', 'LI'].includes(item.tagName) && !item.querySelector('p')
        )) {
          const target = fields(node).find(
            (item) => sheetFieldKey(item.name) === sheetFieldKey(field.name)
          );
          if (target) {
            binding = { node, start: target.start, end: target.end };
            break;
          }
        }
      } else if (owner.closest('ul,ol')) {
        const target = area.find(
          (node) =>
            ['UL', 'OL'].includes(node.tagName) && !usedLists.has(node) && !fields(node).length
        );
        if (target) {
          binding = { nodes: [target] };
          usedLists.add(target);
        }
      } else if (/^(?:Date|날짜)(?:\s*\(\d+\))?$/.test(name)) {
        const target = area.find(
          (node) =>
            node.tagName === owner.tagName &&
            (/^(?:\d{4}(?:년|[-./])|\d{1,2}(?:월|[-./]))/.test(label(node)) ||
              templateVariables(label(node)).includes(name))
        );
        if (target) binding = { node: target, start: 0, end: target.innerHTML.length };
      } else if (sourceParent) {
        const nodes: Element[] = [];
        let next = sourceParent.nextElementSibling;
        while (
          next &&
          (!heading(next) || Number(next.tagName[1]) > Number(sourceParent.tagName[1]))
        ) {
          nodes.push(next);
          next = next.nextElementSibling;
        }
        if (nodes.length) binding = { nodes };
      } else {
        const target = area.find(
          (node) =>
            node.tagName === owner.tagName && !fields(node).length && !node.closest('table,ul,ol')
        );
        if (target) binding = { node: target, start: 0, end: target.innerHTML.length };
      }
    }
    if (binding) {
      const html =
        'nodes' in binding
          ? binding.nodes.map((node) => node.outerHTML).join('\n')
          : binding.node.innerHTML.slice(binding.start, binding.end);
      const value = toMarkdown(html).trim();
      values[name] = templateVariables(value).includes(name) ? '' : value;
      bindings.set(name, binding);
    } else {
      missing.set(name, {
        unit: table || owner.closest('ul,ol') || owner,
        heading: parent,
        anchor: sourceParent,
      });
    }
  }
  return { document, values, bindings, missing };
}

export function templateSheetRow(
  markdown: string,
  note: ExampleNote,
  id = note.title
): TemplateSheetRow {
  const values = project(markdown, note).values;
  return { id, original: note, title: note.title, values, initialValues: values, deleted: false };
}

/** Patch only changed cells; untouched notes retain their exact original HTML. */
export function renderSheetRow(markdown: string, row: TemplateSheetRow): string {
  if (!row.original && !row.draft) {
    let added = blankSheetRow(markdown, row.id);
    added = editSheetValue(markdown, added, undefined, row.title);
    for (const [name, value] of Object.entries(row.values))
      if (value) added = editSheetValue(markdown, added, name, value);
    return added.draft!.description || '';
  }
  if (row.draft) {
    return renderSheetRow(markdown, {
      ...row,
      draft: undefined,
      original: row.draft,
      initialValues: project(markdown, row.draft).values,
    });
  }
  const base = row.original || { title: row.title, description: toHtml(markdown) };
  if (
    row.original &&
    row.title === base.title &&
    row.initialValues &&
    Object.keys(row.values).every((name) => row.values[name] === row.initialValues![name])
  )
    return base.description || '';
  const projection = project(markdown, base);
  const changed = Object.keys(row.values).filter(
    (name) => !row.original || row.values[name] !== projection.values[name]
  );
  if (changed.length > 1) {
    let edited = templateSheetRow(markdown, base, row.id);
    edited = editSheetValue(markdown, edited, undefined, row.title);
    for (const name of changed) edited = editSheetValue(markdown, edited, name, row.values[name]);
    return edited.draft!.description || '';
  }
  if (!changed.length && row.title === base.title) return base.description || '';
  const patches = new Map<Element, { start: number; end: number; html: string }[]>();
  const pending = new Map<Element, { heading?: Element; anchor?: Element }>();
  for (const name of changed) {
    const binding = projection.bindings.get(name);
    if (binding && 'node' in binding) {
      const list = patches.get(binding.node) || [];
      list.push({ ...binding, html: inline(row.values[name]) });
      patches.set(binding.node, list);
    } else if (binding) {
      const first = binding.nodes[0];
      first.insertAdjacentHTML('beforebegin', toHtml(row.values[name]));
      binding.nodes.forEach((node) => node.remove());
    } else if (row.values[name]) {
      const missing = projection.missing.get(name);
      if (missing) pending.set(missing.unit, missing);
    }
  }
  for (const [node, edits] of patches) {
    let html = node.innerHTML;
    for (const edit of edits.sort((a, b) => b.start - a.start))
      html = html.slice(0, edit.start) + edit.html + html.slice(edit.end);
    node.innerHTML = html;
  }
  const insertedHeadings = new Set<Element>();
  for (const [unit, target] of pending) {
    let html = unit.outerHTML.replace(placeholder, (_, name: string) =>
      inline(row.values[name.trim()] || '')
    );
    if (!target.anchor && target.heading && !insertedHeadings.has(target.heading)) {
      html = target.heading.outerHTML + html;
      insertedHeadings.add(target.heading);
    }
    let anchor = target.anchor;
    while (anchor?.nextElementSibling && !heading(anchor.nextElementSibling))
      anchor = anchor.nextElementSibling;
    if (anchor) anchor.insertAdjacentHTML('afterend', html);
    else projection.document.body.insertAdjacentHTML('beforeend', html);
  }
  if (row.title !== base.title || !row.original) {
    const first = projection.document.body.querySelector('h1,h2,h3,h4,h5,h6');
    if (
      first &&
      (sheetFieldKey(label(first)) === sheetFieldKey(base.title.split('/').at(-1) || '') ||
        templateVariables(first.innerHTML).includes('title'))
    )
      first.textContent = row.title.split('/').at(-1) || row.title;
  }
  return projection.document.body.innerHTML;
}

/** Keep overlapping parent/card/field cells synchronized after each edit. */
export function editSheetValue(
  markdown: string,
  row: TemplateSheetRow,
  name: string | undefined,
  value: string
): TemplateSheetRow {
  const base = row.draft || row.original || { title: row.title, description: toHtml(markdown) };
  const working = templateSheetRow(markdown, base, row.id);
  working.title = name === undefined ? value : row.title;
  if (name !== undefined) working.values = { ...working.values, [name]: value };
  const description = renderSheetRow(markdown, working);
  const draft = { title: working.title, description };
  return { ...row, title: working.title, values: project(markdown, draft).values, draft };
}

export function blankSheetRow(markdown: string, id: string): TemplateSheetRow {
  const document = parse(toHtml(markdown));
  const walker = document.createTreeWalker(document.body, 4);
  let node = walker.nextNode();
  while (node) {
    node.textContent = (node.textContent || '').replace(placeholder, '');
    node = walker.nextNode();
  }
  const draft = { title: '', description: document.body.innerHTML };
  return { id, title: '', draft, values: project(markdown, draft).values, deleted: false };
}

/** Share repeat detection with the single-note form, but group the sheet labels by repeat. */
export function sheetRepeatGroups(markdown: string): SheetRepeat[] {
  return findTemplateTables(markdown).flatMap((table) =>
    table.groups.map((group) => ({
      table,
      group,
      name:
        table.name +
        (table.groups.length > 1
          ? ` · ${group.sequence?.prefix || (group.axis === 'row' ? table.rows[group.start][0] : table.headers[group.start]).replace(placeholder, (_, name: string) => (name.trim() === 'title' ? '' : name.trim())).trim() || group.start + 1}`
          : ''),
      variables: templateVariables(
        (group.axis === 'row'
          ? table.rows.slice(group.start, group.start + group.length).flat()
          : table.rows.flatMap((row) => row.slice(group.start, group.start + group.length))
        ).join('\n')
      ),
    }))
  );
}

const tableRows = (table?: Element) =>
  Array.from(table?.querySelectorAll('tr') || []).filter((row) => row.closest('table') === table);
const sequenceOrdinal = (text: string, group: SheetRepeat['group']) => {
  const pattern = group.sequence;
  if (!pattern || !text.startsWith(pattern.prefix) || !text.endsWith(pattern.suffix)) return;
  const number = text.slice(
    pattern.prefix.length,
    pattern.suffix ? -pattern.suffix.length : undefined
  );
  if (/^\d+$/.test(number)) return Number(number) - pattern.start;
};
const repeatLabel = (repeat: SheetRepeat, ordinal: number) => {
  const pattern = repeat.group.sequence;
  return pattern
    ? `${pattern.prefix}${String(pattern.start + ordinal).padStart(pattern.width, '0')}${pattern.suffix}`
    : `${repeat.table.headers[repeat.group.start]} (${ordinal + 1})`;
};

/** Locate actual source rows/columns, including entries beyond the template's initial size. */
function repeatProjection(markdown: string, row: TemplateSheetRow, repeat: SheetRepeat) {
  const document = parse(renderSheetRow(markdown, row));
  const { table: definition } = repeat;
  const model = parse(
    toHtml(markdown.split('\n').slice(definition.start, definition.end).join('\n'))
  ).querySelector('table')!;
  const modelRows = tableRows(model);
  const groups = (axis: SheetRepeat['group']['axis']) =>
    definition.groups.filter((group) => group.axis === axis);
  const axisLabels = (table: Element, axis: 'row' | 'column') =>
    axis === 'row'
      ? tableRows(table)
          .slice(1)
          .map((item) => label(item.children[0]))
      : Array.from(tableRows(table)[0]?.children || []).map(label);
  const modelLabels = (axis: 'row' | 'column') => axisLabels(model, axis);
  const fixed = (axis: 'row' | 'column') =>
    modelLabels(axis).flatMap((name, index) =>
      groups(axis).some((group) => index >= group.start && index < group.start + group.length)
        ? []
        : [{ name, index }]
    );
  const preceding = markdown.split('\n').slice(0, definition.start);
  const title = preceding.findLast((line) => /^#{1,6}\s/.test(line));
  const titleText = title?.replace(placeholder, (_, name: string) =>
    name.trim() === 'title' ? row.title.split('/').at(-1) || '' : `{{${name}}}`
  );
  const elements = Array.from(document.body.querySelectorAll('*')).filter(visible);
  const parent =
    titleText &&
    elements.find(
      (node) =>
        heading(node) &&
        sheetFieldKey(label(node)) ===
          sheetFieldKey(toRaw(toHtml(titleText.replace(/^#+\s+/, ''))).trim())
    );
  const inRegion = (node: Element) => {
    if (!parent) return !titleText || templateVariables(titleText).length > 0;
    const start = elements.indexOf(parent);
    const end = elements.findIndex(
      (item, index) => index > start && heading(item) && item.tagName <= parent.tagName
    );
    return elements.indexOf(node) > start && (end < 0 || elements.indexOf(node) < end);
  };
  const candidates = elements.filter(
    (node) => node.tagName === 'TABLE' && !node.parentElement?.closest('table') && inRegion(node)
  );
  const matching = candidates.filter((node) =>
    fixed('column').every(({ name }) =>
      axisLabels(node, 'column').some((value) => sheetFieldKey(value) === sheetFieldKey(name))
    )
  );
  const ordinal = parse(toHtml(preceding.join('\n'))).querySelectorAll('table').length;
  const allTables = elements.filter(
    (node) => node.tagName === 'TABLE' && !node.parentElement?.closest('table')
  );
  const similarity = (node: Element) =>
    (['row', 'column'] as const).reduce((score, axis) => {
      const names = axisLabels(node, axis);
      return (
        score +
        names.filter(
          (name) =>
            fixed(axis).some((item) => sheetFieldKey(item.name) === sheetFieldKey(name)) ||
            groups(axis).some((group) => sequenceOrdinal(name, group) !== undefined)
        ).length
      );
    }, 0);
  const partial = candidates
    .map((node) => ({ node, score: similarity(node) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const table = matching.includes(allTables[ordinal])
    ? allTables[ordinal]
    : matching[0] || partial[0]?.node;
  const owners = (axis: 'row' | 'column') => {
    const labels = table ? axisLabels(table, axis) : [];
    const anchors = fixed(axis).map((item) => ({
      ...item,
      position: labels.findIndex((text) => sheetFieldKey(text) === sheetFieldKey(item.name)),
    }));
    return labels.map((text, index) => {
      if (anchors.some((item) => item.position === index)) return;
      const numbered = groups(axis).find((group) => sequenceOrdinal(text, group) !== undefined);
      if (numbered) return numbered.id;
      return groups(axis).find((group) => {
        const boundaries = [
          ...anchors,
          ...groups(axis).flatMap((other) =>
            other.id === group.id
              ? []
              : labels.flatMap((name, position) =>
                  sequenceOrdinal(name, other) === undefined
                    ? []
                    : [{ index: other.start, position }]
                )
          ),
        ];
        const before = Math.max(
          -1,
          ...boundaries
            .filter((item) => item.index < group.start && item.position >= 0)
            .map((item) => item.position)
        );
        const after = Math.min(
          labels.length,
          ...boundaries
            .filter((item) => item.index >= group.start + group.length && item.position >= 0)
            .map((item) => item.position)
        );
        return index > before && index < after;
      })?.id;
    });
  };
  const previous = row.repeats?.[definition.id];
  const state: RepeatState =
    previous && previous.html === table?.outerHTML
      ? {
          ...previous,
          rows: [...previous.rows],
          columns: [...previous.columns],
          next: { ...previous.next },
        }
      : {
          html: table?.outerHTML || '',
          rows: owners('row'),
          columns: owners('column'),
          next: { ...previous?.next },
        };
  const sourceRows = tableRows(table);
  const modelIndex = (axis: 'row' | 'column', index: number, source = table) => {
    const owner = (axis === 'row' ? state.rows : state.columns)[index];
    const group = groups(axis).find((item) => item.id === owner);
    if (group) return group.start;
    const text = source && axisLabels(source, axis)[index];
    return Math.max(
      0,
      modelLabels(axis).findIndex((name) => sheetFieldKey(name) === sheetFieldKey(text || ''))
    );
  };
  return { document, table, model, modelRows, sourceRows, state, modelIndex, parent, title };
}

const repeatItemCache = new WeakMap<
  TemplateSheetRow,
  {
    markdown: string;
    values: TemplateSheetRow['values'];
    html?: string;
    items: Map<string, { index: number; label: string; cells: RepeatCell[]; removable: boolean }[]>;
  }
>();
export function sheetRepeatItems(markdown: string, row: TemplateSheetRow, repeat: SheetRepeat) {
  const html = (row.draft || row.original)?.description;
  let cached = repeatItemCache.get(row);
  if (
    !cached ||
    cached.markdown !== markdown ||
    cached.values !== row.values ||
    cached.html !== html
  ) {
    cached = { markdown, values: row.values, html, items: new Map() };
    repeatItemCache.set(row, cached);
  }
  const found = cached.items.get(repeat.group.id);
  if (found) return found;
  const projection = repeatProjection(markdown, row, repeat);
  const { sourceRows, state, modelRows, modelIndex } = projection;
  const axis = repeat.group.axis;
  const members = axis === 'row' ? state.rows : state.columns;
  const items = members.flatMap((owner, index) => {
    if (owner !== repeat.group.id) return [];
    const cells: RepeatCell[] = [];
    if (axis === 'column')
      cells.push({
        row: 0,
        column: index,
        label: '',
        value: label(sourceRows[0].children[index]),
        fieldIndex: -1,
      });
    sourceRows.slice(1).forEach((tr, r) => {
      if (axis === 'row' && r !== index) return;
      Array.from(tr.children).forEach((cell, column) => {
        if (axis === 'column' && column !== index) return;
        const modelCell =
          modelRows[modelIndex('row', r) + 1]?.children[modelIndex('column', column)];
        if (!modelCell || !templateVariables(modelCell.textContent || '').length) return;
        cells.push({
          row: r + 1,
          column,
          label: axis === 'row' ? label(sourceRows[0].children[column]) : label(tr.children[0]),
          value: toMarkdown(cell.innerHTML).trim(),
          fieldIndex: axis === 'row' ? modelIndex('column', column) : modelIndex('row', r),
        });
      });
    });
    return [
      {
        index,
        label:
          axis === 'row'
            ? label(sourceRows[index + 1].children[0])
            : label(sourceRows[0].children[index]),
        cells,
        removable: axis === 'row' || state.columns.length > 1,
      },
    ];
  });
  cached.items.set(repeat.group.id, items);
  return items;
}

/** Edit the staged DOM directly so resizing keeps rich content and unrelated table cells. */
export function editSheetRepeat(
  markdown: string,
  row: TemplateSheetRow,
  repeat: SheetRepeat,
  edit: { cell: RepeatCell; value: string } | { remove: number } | { add: true }
): TemplateSheetRow {
  const projection = repeatProjection(markdown, row, repeat);
  let { table } = projection;
  const { document, model, state, modelIndex } = projection;
  if (!table) {
    if (!('add' in edit)) return row;
    table = model.cloneNode(true) as Element;
    table.innerHTML = table.innerHTML.replace(placeholder, '');
    if (projection.parent) {
      let anchor = projection.parent;
      while (
        anchor.nextElementSibling &&
        (!heading(anchor.nextElementSibling) ||
          anchor.nextElementSibling.tagName > projection.parent.tagName)
      )
        anchor = anchor.nextElementSibling;
      anchor.insertAdjacentElement('afterend', table);
    } else {
      if (projection.title)
        document.body.insertAdjacentHTML(
          'beforeend',
          toHtml(
            projection.title.replace(placeholder, (_, name: string) =>
              name.trim() === 'title' ? row.title.split('/').at(-1) || '' : ''
            )
          )
        );
      document.body.appendChild(table);
    }
    state.rows = repeat.table.rows.map(
      (_, index) =>
        repeat.table.groups.find(
          (group) =>
            group.axis === 'row' && index >= group.start && index < group.start + group.length
        )?.id
    );
    state.columns = repeat.table.headers.map(
      (_, index) =>
        repeat.table.groups.find(
          (group) =>
            group.axis === 'column' && index >= group.start && index < group.start + group.length
        )?.id
    );
    // A missing repeat starts empty; the requested addition inserts just one item.
    for (let index = state.rows.length - 1; index >= 0; index--)
      if (state.rows[index] === repeat.group.id && repeat.group.axis === 'row') {
        tableRows(table)[index + 1].remove();
        state.rows.splice(index, 1);
      }
    for (let index = state.columns.length - 1; index >= 0; index--)
      if (state.columns[index] === repeat.group.id && repeat.group.axis === 'column') {
        tableRows(table).forEach((tr) => tr.children[index]?.remove());
        state.columns.splice(index, 1);
      }
  }
  const trs = tableRows(table);
  const axis = repeat.group.axis;
  const members = axis === 'row' ? state.rows : state.columns;
  const labels =
    axis === 'row'
      ? trs.slice(1).map((tr) => label(tr.children[0]))
      : Array.from(trs[0].children).map(label);
  const next = Math.max(
    state.next[repeat.group.id] || 0,
    ...labels.flatMap((text, index) =>
      members[index] === repeat.group.id ? [(sequenceOrdinal(text, repeat.group) ?? index) + 1] : []
    )
  );
  state.next[repeat.group.id] = next;
  if ('cell' in edit) {
    const target = trs[edit.cell.row]?.children[edit.cell.column];
    if (!target) return row;
    if (edit.cell.row === 0) target.textContent = edit.value.replace(/[\r\n]/g, ' ').slice(0, 96);
    else target.innerHTML = inline(edit.value);
  } else if ('remove' in edit) {
    if (members[edit.remove] !== repeat.group.id || (axis === 'column' && members.length <= 1))
      return row;
    if (axis === 'row') trs[edit.remove + 1].remove();
    else trs.forEach((tr) => tr.children[edit.remove]?.remove());
    members.splice(edit.remove, 1);
  } else {
    const last = members.lastIndexOf(repeat.group.id);
    const position =
      last >= 0
        ? last + 1
        : members.findIndex((_, index) => modelIndex(axis, index, table) > repeat.group.start);
    const at = position < 0 ? members.length : position;
    const clean = (node?: Element) => {
      const cloned = (node?.cloneNode(true) || document.createElement('td')) as Element;
      cloned.innerHTML = cloned.innerHTML.replace(placeholder, '');
      return cloned;
    };
    if (axis === 'row') {
      const tr = document.createElement('tr');
      state.columns.forEach((_, column) =>
        tr.appendChild(
          clean(
            projection.modelRows[repeat.group.start + 1]?.children[
              modelIndex('column', column, table)
            ]
          )
        )
      );
      if (repeat.group.sequence) tr.children[0].textContent = repeatLabel(repeat, next);
      const before = trs[at + 1];
      (before?.parentElement || trs.at(-1)?.parentElement || table).insertBefore(
        tr,
        before || null
      );
    } else
      trs.forEach((tr, r) => {
        const cell = clean(
          projection.modelRows[r === 0 ? 0 : modelIndex('row', r - 1, table) + 1]?.children[
            repeat.group.start
          ]
        );
        if (r === 0) cell.textContent = repeatLabel(repeat, next);
        tr.insertBefore(cell, tr.children[at] || null);
      });
    members.splice(at, 0, repeat.group.id);
    state.next[repeat.group.id] = next + 1;
  }
  return stageRepeatRow(markdown, row, repeat, document, table, state);
}

function stageRepeatRow(
  markdown: string,
  row: TemplateSheetRow,
  repeat: SheetRepeat,
  document: Document,
  table: Element,
  state: RepeatState
): TemplateSheetRow {
  state.html = table.outerHTML;
  const draft = { title: row.title, description: document.body.innerHTML };
  return {
    ...row,
    draft,
    values: project(markdown, draft).values,
    repeats: { ...row.repeats, [repeat.table.id]: state },
  };
}

/** Materialize only the edited note's missing item/field, preserving its existing table content. */
export function editSheetRepeatCell(
  markdown: string,
  row: TemplateSheetRow,
  repeat: SheetRepeat,
  index: number,
  exemplar: RepeatCell,
  occurrence: number,
  value: string
): TemplateSheetRow {
  const matching = (item: ReturnType<typeof sheetRepeatItems>[number] | undefined) =>
    item?.cells.filter((cell) =>
      exemplar.row === 0
        ? cell.row === 0
        : cell.row !== 0 && sheetFieldKey(cell.label) === sheetFieldKey(exemplar.label)
    )[occurrence];
  let items = sheetRepeatItems(markdown, row, repeat);
  const existing = matching(items[index]);
  if (existing) return editSheetRepeat(markdown, row, repeat, { cell: existing, value });
  if (!value) return row;
  let next = row;
  while (items.length <= index) {
    const added = editSheetRepeat(markdown, next, repeat, { add: true });
    if (added === next) return row;
    next = added;
    items = sheetRepeatItems(markdown, next, repeat);
  }
  const created = matching(items[index]);
  if (created) return editSheetRepeat(markdown, next, repeat, { cell: created, value });
  const { document, table, modelRows, state, modelIndex } = repeatProjection(
    markdown,
    next,
    repeat
  );
  if (!table) return row;
  const itemIndex = items[index].index;
  if (exemplar.row === 0)
    return editSheetRepeat(markdown, next, repeat, {
      cell: { ...exemplar, row: 0, column: itemIndex },
      value,
    });
  const axis = repeat.group.axis === 'row' ? 'column' : 'row';
  const members = axis === 'row' ? state.rows : state.columns;
  const owner = repeat.table.groups.find(
    (group) =>
      group.axis === axis &&
      exemplar.fieldIndex >= group.start &&
      exemplar.fieldIndex < group.start + group.length
  );
  const clean = (node?: Element) => {
    const cloned = (node?.cloneNode(true) || document.createElement('td')) as Element;
    cloned.innerHTML = cloned.innerHTML.replace(placeholder, '');
    return cloned;
  };
  const positions = () =>
    (axis === 'column'
      ? Array.from(tableRows(table)[0].children).map(label)
      : tableRows(table)
          .slice(1)
          .map((tr) => label(tr.children[0]))
    ).flatMap((name, at) => (sheetFieldKey(name) === sheetFieldKey(exemplar.label) ? [at] : []));
  let fields = positions();
  while (fields.length <= occurrence) {
    const later = members.findIndex((_, at) => modelIndex(axis, at, table) > exemplar.fieldIndex);
    const at = later < 0 ? members.length : later;
    const trs = tableRows(table);
    if (axis === 'column')
      trs.forEach((tr, r) => {
        const cell = clean(
          modelRows[r === 0 ? 0 : modelIndex('row', r - 1, table) + 1]?.children[
            exemplar.fieldIndex
          ]
        );
        if (r === 0) cell.textContent = exemplar.label;
        tr.insertBefore(cell, tr.children[at] || null);
      });
    else {
      const tr = document.createElement('tr');
      state.columns.forEach((_, c) =>
        tr.appendChild(
          clean(modelRows[exemplar.fieldIndex + 1]?.children[modelIndex('column', c, table)])
        )
      );
      if (tr.children[0]) tr.children[0].textContent = exemplar.label;
      const before = trs[at + 1];
      (before?.parentElement || trs.at(-1)?.parentElement || table).insertBefore(
        tr,
        before || null
      );
    }
    members.splice(at, 0, owner?.id);
    fields = positions();
  }
  const trs = tableRows(table);
  const r = repeat.group.axis === 'row' ? itemIndex + 1 : fields[occurrence] + 1;
  const c = repeat.group.axis === 'row' ? fields[occurrence] : itemIndex;
  const tr = trs[r];
  if (!tr) return row;
  while (tr.children.length <= c) {
    const column = tr.children.length;
    tr.appendChild(
      clean(
        modelRows[modelIndex('row', r - 1, table) + 1]?.children[
          modelIndex('column', column, table)
        ]
      )
    );
  }
  tr.children[c].innerHTML = inline(value);
  return stageRepeatRow(markdown, next, repeat, document, table, state);
}

/** Accept clipboard tables, including quoted cells containing tabs or line breaks. */
export function parseSheetPaste(text: string): string[][] {
  const rows: string[][] = [[]];
  let value = '';
  let quoted = false;
  const input = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"' && (quoted || !value)) {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === '\t' || char === '\n')) {
      rows.at(-1)!.push(value);
      value = '';
      if (char === '\n') rows.push([]);
    } else value += char;
  }
  rows.at(-1)!.push(value);
  return rows;
}

export type SheetChange = {
  id: string;
  original?: ExampleNote;
  title: string;
  description: string;
  deleted: boolean;
};

export function sheetChanges(markdown: string, rows: TemplateSheetRow[]): SheetChange[] {
  return rows
    .filter((row) => row.original || !row.deleted)
    .map((row) => ({
      id: row.id,
      original: row.original,
      title: row.title.normalize('NFC'),
      description: row.deleted ? '' : renderSheetRow(markdown, row),
      deleted: row.deleted,
    }))
    .filter(
      (row) =>
        !row.original ||
        row.deleted ||
        row.title !== row.original.title ||
        row.description !== row.original.description
    );
}

/** Validate the whole sheet before the first write, including collisions outside the source list. */
export function validateSheet(
  rows: Pick<TemplateSheetRow, 'title' | 'deleted' | 'original'>[],
  current: ExampleNote[]
): string | undefined {
  const used = new Set<string>();
  for (const row of rows.filter((row) => !row.deleted)) {
    const issue = noteTitleIssue(row.title);
    if (issue) return issue;
    const title = row.title.normalize('NFC').toLowerCase();
    if (used.has(title)) return 'Page with new title already exists';
    used.add(title);
    if (
      current.some(
        (note) =>
          note.title.normalize('NFC').toLowerCase() === title && note.title !== row.original?.title
      )
    )
      return 'Page with new title already exists';
  }
}

type SheetStorage = {
  isLocal: boolean;
  notebookId: number;
  userId: number;
  isActive: () => boolean;
};

/** Preflight every operation, then retain each successful row if a later operation fails. */
export async function saveSheetNotes(
  changes: SheetChange[],
  storage: SheetStorage,
  onApplied: (change: SheetChange, note?: ExampleNote) => void
): Promise<void> {
  const current = storage.isLocal
    ? await getStoreItems('NOTE', storage.notebookId)
    : await getContentList(storage.notebookId, ['NOTE']);
  const issue = validateSheet(changes, current);
  if (issue) throw new Error(issue);
  for (const change of changes) {
    if (!change.original) continue;
    const previous = current.find((note) => note.title === change.original!.title);
    if (!previous || (previous.description || '') !== (change.original.description || ''))
      throw new Error('Concurrent edit detected (Conflict)');
  }
  const active = () => {
    if (!storage.isActive())
      throw new Error('The notebook changed. Reopen the editor before saving.');
  };
  for (const change of [...changes].sort((a, b) => Number(a.deleted) - Number(b.deleted))) {
    active();
    const previous =
      change.original && current.find((note) => note.title === change.original!.title);
    const value: Content | PostContent = {
      ...previous,
      title: change.deleted ? previous!.title : change.title,
      description: change.deleted ? '' : change.description,
      type: 'NOTE',
      userId: previous?.userId ?? storage.userId,
      parentId: storage.notebookId,
      order: previous?.order || 0,
      input: previous?.input || change.title,
      option: previous?.option || {},
      updated: storage.isLocal ? new Date().toISOString() : undefined,
    };
    if (storage.isLocal) {
      if (change.deleted) {
        await saveStoreItems('NOTE', [], previous!.title, storage.notebookId);
      } else {
        await saveStoreItems(
          'NOTE',
          [value],
          undefined,
          storage.notebookId,
          !previous || previous.title !== change.title
        );
        if (previous && previous.title !== change.title) {
          active();
          await saveStoreItems('NOTE', [], previous.title, storage.notebookId);
        }
      }
      onApplied(
        change,
        change.deleted ? undefined : { title: change.title, description: change.description }
      );
    } else {
      let id = previous?.id;
      if (id !== undefined) await patchContent(id, value);
      else id = await postContent(value);
      onApplied(
        change,
        change.deleted ? undefined : { title: change.title, description: change.description }
      );
      active();
      const snapshot = { ...value, id: undefined, type: 'SNAPSHOT' as const, parentId: id };
      await postContent(snapshot);
    }
  }
}

/** Use the ordinary notebook scope and propagate local storage failures to the sheet. */
export function useTemplateSheet() {
  const { auth } = useAuthContext();
  const { notebook } = useUsageMode();
  const queryClient = useQueryClient();
  const scope = `${auth.isLocal}:${auth.user?.id}:${notebook?.id}`;
  const current = useRef(scope);
  current.current = scope;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useMutation({
    mutationFn: ({
      changes,
      onApplied,
    }: {
      changes: SheetChange[];
      onApplied: (change: SheetChange, note?: ExampleNote) => void;
    }) =>
      saveSheetNotes(
        changes,
        {
          isLocal: !!auth.isLocal,
          notebookId: notebook?.id || 0,
          userId: auth.user?.id || 0,
          isActive: () => mounted.current && current.current === scope,
        },
        onApplied
      ),
    onSettled: async () => {
      await Promise.all(
        [
          'pageContents',
          'pageContent',
          'snapshotContents',
          'snapshotContentsAll',
          'recentTabs',
          'lastTab',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      );
    },
  });
}
