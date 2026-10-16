import type { RelationMention } from '../relationDiscovery';
import type { RelationTextBlock } from './corpus';

type Matcher = (text: string) => RelationMention[];
type Deferred = { block: RelationTextBlock; reason: string };
const originals = new WeakMap<RelationTextBlock[], RelationTextBlock[]>();
const deferred = new WeakMap<RelationTextBlock[], Deferred[]>();
const byNote = new Map<string, Deferred[]>();
export function retainDeferredNotes(titles: Set<string>) {
  for (const title of byNote.keys()) if (!titles.has(title)) byNote.delete(title);
}
export const deferredRelationCorpus = () =>
  [...byNote].flatMap(([noteTitle, entries]) => entries.map((item) => ({ noteTitle, ...item })));

/** A punctuation join inside an identifier is different from an explicit, spaced list separator. */
export function wholeIdentifier(text: string, mention: RelationMention): boolean {
  const before = text.slice(0, mention.start),
    after = text.slice(mention.end);
  const token = (
    (before.match(/\S*$/)?.[0] || '') +
    mention.text +
    (after.match(/^\S*/)?.[0] || '')
  ).replace(/^[([{]+/u, '');
  const path = /^(?:[a-z][a-z\d+.-]*:\/\/|\.?\.?\/)/i.test(token);
  return !/[\p{L}\p{N}][._-]$/u.test(before) && !/^[._-][\p{L}\p{N}]/u.test(after) && !path;
}

/** Whole named atoms or explicitly delimited lists; spaces/parentheses never split a compound. */
export function namedAtoms(text: string, match: Matcher): RelationMention[] | undefined {
  const mentions = match(text);
  if (!mentions.length || mentions.some((item) => !wholeIdentifier(text, item))) return;
  let previous = 0;
  for (let index = 0; index < mentions.length; index++) {
    const item = mentions[index],
      gap = text.slice(previous, item.start);
    if (!index) {
      if (!/^\s*(?:[-*]\s+)?(?:\[[ xX]\]\s*)?[([{「『]?\s*$/u.test(gap)) return;
    } else if (
      !/^\s*[,;/·|]\s*$/u.test(gap) &&
      !(mentions[index - 1].text.startsWith('@') && item.text.startsWith('@') && /^\s+$/u.test(gap))
    )
      return;
    previous = item.end;
  }
  if (!/^\s*[)\]}」』]?\s*$/u.test(text.slice(previous))) return;
  return [...new Map(mentions.map((mention) => [mention.key, mention])).values()];
}

function sentenceReason(block: RelationTextBlock, match: Matcher): string | undefined {
  const text = block.text,
    mentions = match(text);
  if (mentions.length !== 2 || mentions[0].key === mentions[1].key) return;
  if (mentions.some((item) => !wholeIdentifier(text, item))) return 'identifier-boundary';
  if (/[?？]$/.test(text)) return 'question-not-assertion';
  const between = text.slice(mentions[0].end, mentions[1].start);
  if (/^\s*[,/·|]\s*$/u.test(between)) return 'parallel-list';
  // Parser attachments are diagnostics on a retained candidate, never deletion criteria.
  // A coordinated subject can express a reciprocal relationship; syntax alone cannot decide it.
}

/**
 * The existing table-discovery hook runs before the legacy field/sentence loop. Replace that
 * loop's work list here; original blocks and complete sentences remain available in memory.
 * Recompute from the original list on dictionary changes, never from a previously filtered list.
 */
export function prepareRelationBlocks(
  blocks: RelationTextBlock[],
  match: Matcher,
  noteTitle?: string
) {
  let source = originals.get(blocks);
  if (!source) originals.set(blocks, (source = [...blocks]));
  const eligible: RelationTextBlock[] = [],
    held: Deferred[] = [];
  for (const block of source) {
    if (block.column) {
      eligible.push(block);
      continue;
    }
    if (block.field) {
      if (namedAtoms(block.text, match)) eligible.push(block);
      else {
        // An explicit list may also contain names outside the three-note dictionary. Keep only
        // complete, qualified entries; never choose a noun from within an explanatory entry.
        let depth = 0,
          start = 0;
        const entries: string[] = [];
        for (let at = 0; at < block.text.length; at++) {
          const ch = block.text[at];
          if ('([{'.includes(ch)) depth++;
          if (')]}'.includes(ch)) depth--;
          if (!depth && ',;·'.includes(ch)) {
            entries.push(block.text.slice(start, at).trim());
            start = at + 1;
          }
        }
        entries.push(block.text.slice(start).trim());
        const complete =
          entries.length > 1
            ? entries.filter((value) => namedAtoms(value, match)?.length === 1)
            : [];
        if (complete.length) eligible.push(...complete.map((text) => ({ ...block, text })));
        held.push({ block, reason: 'non-atomic-field-value' });
      }
      continue;
    }
    const reason = sentenceReason(block, match);
    if (reason) held.push({ block, reason });
    else eligible.push(block);
  }
  blocks.splice(0, blocks.length, ...eligible);
  deferred.set(blocks, held);
  if (noteTitle !== undefined) byNote.set(noteTitle, held);
}

export const deferredRelationBlocks = (blocks: RelationTextBlock[]) => deferred.get(blocks) || [];
