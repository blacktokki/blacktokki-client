import { createRelationKeywordMatcher } from './relationKeywords';
import type { RelationEntityDetail } from './relationResults';

type SentenceSegment = { text: string; entityKey?: string };
const matchers = new WeakMap<
  Map<string, RelationEntityDetail>,
  ReturnType<typeof createRelationKeywordMatcher>
>();

/** Preserve source spelling and punctuation while sharing one longest-first matcher per inventory. */
export function relationSentenceSegments(
  text: string,
  entities: Map<string, RelationEntityDetail>,
  endpoints: Set<string>
): SentenceSegment[] {
  let match = matchers.get(entities);
  if (!match) {
    match = createRelationKeywordMatcher(
      [...entities.values()].sort(
        (a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text)
      )
    );
    matchers.set(entities, match);
  }
  const segments: SentenceSegment[] = [];
  let cursor = 0;
  for (const mention of match(text)) {
    if (!endpoints.has(mention.key)) continue;
    if (mention.start > cursor) segments.push({ text: text.slice(cursor, mention.start) });
    segments.push({ text: mention.text, entityKey: mention.key });
    cursor = mention.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/** Keep literal slashes in headings; older in-memory results can still use their displayed path. */
export function relationSectionParams(
  noteTitle: string,
  section: string,
  sectionPath?: string[]
): { title: string; paragraph?: string; section?: string } {
  const path = sectionPath?.length ? sectionPath : section.split(' / ').filter(Boolean);
  const paragraph = path.at(-1);
  const parent = path.at(-2);
  return paragraph
    ? { title: noteTitle, paragraph, ...(parent ? { section: parent } : {}) }
    : { title: noteTitle };
}
