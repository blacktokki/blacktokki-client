import type {
  RelationEntityResult,
  RelationMention,
  RelationObservation,
} from '../relationDiscovery';
import {
  classifyRelationKeywords,
  relationKeywordKey as key,
  TABLE_RECORD_TYPE,
} from '../relationKeywords';
import { namedAtoms, prepareRelationBlocks } from './claims';
import { noteBasename, RelationTextBlock } from './corpus';
import type { SchemaObservation } from './schema';

export type TableContext = {
  noteTitle: string;
  section: string;
  sectionPath: string[];
  evidence: string;
  reason: 'ambiguous-subject' | 'non-atomic-value';
};
type Cell = { block: RelationTextBlock; mentions: RelationMention[] };

/** A list of whole named values may contain any non-lexical separators, including line breaks. */
function atomicValues({ block, mentions }: Cell): RelationMention[] | undefined {
  return namedAtoms(block.text, () => mentions);
}

/**
 * Retain possible row-role pairs instead of treating a unique column as a semantic subject.
 * Record membership and learned role eligibility are checked separately by validation.ts.
 */
export function discoverTableRelations(
  noteTitle: string,
  blocks: RelationTextBlock[],
  match: (text: string) => RelationMention[]
): { observations: RelationObservation[]; contexts: TableContext[] } {
  prepareRelationBlocks(blocks, match, noteTitle);
  const tables = new Map<number, Map<number, Cell[]>>();
  for (const block of blocks) {
    if (block.table === undefined || block.row === undefined || !block.column) continue;
    let rows = tables.get(block.table);
    if (!rows) tables.set(block.table, (rows = new Map()));
    const row = rows.get(block.row) || [];
    row.push({ block, mentions: match(block.text) });
    rows.set(block.row, row);
  }
  const observations: SchemaObservation[] = [];
  const contexts: TableContext[] = [];
  const owner = noteBasename(noteTitle);
  // The current document owns its explicitly recorded fields even when its title is rare.
  // This never resolves an unlinked body mention to another document.
  if (!match(owner).some((item) => item.start === 0 && item.end === owner.length))
    for (const block of blocks) {
      if (!block.field || !block.explicitFieldEntry) continue;
      const values = namedAtoms(block.text, match);
      if (!values) continue;
      const ending = block.field.charCodeAt(block.field.length - 1) - 0xac00;
      for (const value of values) {
        if (key(owner) === value.key) continue;
        observations.push({
          noteTitle,
          section: block.section,
          sectionPath: block.sectionPath,
          source: owner,
          target: value.text,
          sourceType: null,
          targetType: value.type,
          origin: 'field',
          direction: 'document-value',
          evidence: `${owner}\n${block.field}: ${block.text}`,
          template: `{{E1}}의 ${block.field}${
            ending >= 0 && ending <= 11171 && ending % 28 ? '은' : '는'
          } {{E2}}이다.`,
          schema: {
            kind: 'field',
            subject: owner,
            targetHeader: block.field,
            value: block.text,
            location: { targetStart: value.start, targetEnd: value.end },
          },
        });
      }
    }
  for (const rows of tables.values()) {
    const columns = new Map<number, Cell[]>();
    for (const row of rows.values())
      for (const cell of row) {
        const values = columns.get(cell.block.columnIndex!) || [];
        values.push(cell);
        columns.set(cell.block.columnIndex!, values);
      }
    const indices = [...columns.keys()].sort((a, b) => a - b);
    const stats = new Map(
      [...columns].map(([column, cells]) => [
        column,
        {
          unique: new Set(cells.map(({ block }) => key(block.text))).size / cells.length,
          atomic: cells.filter((cell) => !!atomicValues(cell)).length / cells.length,
        },
      ])
    );
    for (const unsorted of rows.values()) {
      const row = [...unsorted].sort((a, b) => a.block.columnIndex! - b.block.columnIndex!);
      if (row.length < 2) continue;
      const evidence = row.map(({ block }) => `${block.column}: ${block.text}`).join('; ');
      const context = {
        noteTitle,
        section: row[0].block.section,
        sectionPath: row[0].block.sectionPath,
        evidence,
      };
      // Unresolved headers are preserved in the candidates as well as in contextual evidence.
      contexts.push({ ...context, reason: 'ambiguous-subject' });
      let incomplete = false;
      for (const source of row) {
        if (!source.mentions.length) continue;
        const addresses = [...source.block.text.matchAll(/https?:\/\/\S+/gi)];
        if (
          /^[a-z][a-z\d+.-]*:\/\//i.test(source.block.text) ||
          (addresses.length &&
            source.mentions.every((item) =>
              addresses.some(
                (address) =>
                  item.start >= address.index! && item.end <= address.index! + address[0].length
              )
            ))
        )
          continue;
        const sourceValues = atomicValues(source);
        if (sourceValues && sourceValues.length !== 1) continue;
        const sourceText = sourceValues?.[0].text || source.block.text;
        const sourceType = sourceValues ? sourceValues[0].type : TABLE_RECORD_TYPE;
        for (const target of row) {
          if (target === source) continue;
          const values = atomicValues(target);
          if (!values) {
            incomplete = true;
            continue;
          }
          for (const value of values) {
            if (key(sourceText) === value.key) continue;
            const sourceStats = stats.get(source.block.columnIndex!)!;
            const targetStats = stats.get(target.block.columnIndex!)!;
            observations.push({
              ...context,
              source: sourceText,
              target: value.text,
              sourceType,
              targetType: value.type,
              origin: 'table',
              template: `${source.block.column}: {{E1}}; ${target.block.column}: {{E2}}`,
              direction: 'column-order',
              schema: {
                kind: 'table',
                subject: sourceText,
                sourceHeader: source.block.column!,
                targetHeader: target.block.column!,
                value: target.block.text,
                location: {
                  table: target.block.table!,
                  row: target.block.row!,
                  sourceColumn: source.block.columnIndex!,
                  targetColumn: target.block.columnIndex!,
                  targetStart: value.start,
                  targetEnd: value.end,
                },
                structure: {
                  width: indices.length,
                  sourcePosition: indices.indexOf(source.block.columnIndex!),
                  targetPosition: indices.indexOf(target.block.columnIndex!),
                  sourceUnique: sourceStats.unique,
                  targetUnique: targetStats.unique,
                  sourceAtomic: sourceStats.atomic,
                  targetAtomic: targetStats.atomic,
                  unresolvedHeaders: row.some(({ block }) => !!block.unresolvedColumns),
                },
              },
            });
          }
        }
      }
      if (incomplete) contexts.push({ ...context, reason: 'non-atomic-value' });
    }
  }
  return { observations, contexts };
}

/** Add explicit record subjects and current-document field owners with their original provenance. */
export function includeTableAnchors(
  inventory: RelationEntityResult,
  observations: RelationObservation[]
): RelationEntityResult {
  const entities = new Map(
    inventory.entities.map((entity) => [entity.key || key(entity.text), entity])
  );
  const details = { ...inventory.details };
  const added = new Map<string, { notes: Set<string>; occurrences: number }>();
  for (const observation of observations) {
    if (observation.origin !== 'table' && observation.origin !== 'field') continue;
    const id = key(observation.source);
    if (entities.has(id) && !added.has(id)) continue;
    let entry = added.get(id);
    if (!entry) {
      entry = { notes: new Set(), occurrences: 0 };
      added.set(id, entry);
      entities.set(id, {
        text: observation.source,
        key: id,
        type: observation.origin === 'table' ? TABLE_RECORD_TYPE : null,
        noteCount: 0,
        mentionCount: 0,
      });
      details[id] = { sources: [], sentences: [] };
    }
    if (observation.origin === 'table') entities.get(id)!.type = TABLE_RECORD_TYPE;
    const section = observation.origin === 'table' ? observation.section : '';
    const sourceText = observation.origin === 'table' ? observation.evidence : observation.source;
    const sources = details[id].sources;
    if (
      sources.some(
        (source) =>
          source.noteTitle === observation.noteTitle &&
          source.section === section &&
          source.text === sourceText
      )
    )
      continue;
    entry.notes.add(observation.noteTitle);
    entry.occurrences++;
    sources.push({
      noteTitle: observation.noteTitle,
      section,
      sectionPath: observation.origin === 'table' ? observation.sectionPath : [],
      kind: observation.origin === 'table' ? 'table-cell' : 'title',
      keyword: observation.source,
      text: sourceText,
    });
    Object.assign(entities.get(id)!, {
      noteCount: entry.notes.size,
      mentionCount: entry.occurrences,
    });
  }
  if (!added.size) return inventory;
  return {
    ...inventory,
    entities: classifyRelationKeywords([...entities.values()]),
    details,
    mentionCount:
      inventory.mentionCount +
      [...added.values()].reduce((sum, entry) => sum + entry.occurrences, 0),
  };
}
