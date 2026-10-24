import { toMarkdown } from '@blacktokki/editor';

import { checkRelationCancelled, yieldRelationWork } from './keyword/keywordUtils';

/** External-source copies, previous-output copies (-1), and generated characters absent in source. */
type SourcePart = [number, number, number] | string;
export type RelationSourceReferences = { parts: SourcePart[] };

const width = 8;
/** Decode standard source encodings without retaining decoded titles, metadata or link text. */
function viewsOf(source: string) {
  const entities = new Map<string, string>();
  const decoded = source
    .replace(/(?:%[\da-f]{2})+/gi, (value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    })
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi, (value) => {
      if (!entities.has(value)) entities.set(value, toMarkdown(value));
      return entities.get(value)!;
    });
  const normalized = source.normalize('NFC').toLowerCase();
  return [
    source,
    normalized,
    decoded,
    decoded === source ? normalized : decoded.normalize('NFC').toLowerCase(),
  ];
}

/**
 * Store collection JSON as references into the canonical current notes, never a second source copy.
 * Previous-output copies deduplicate repeated structure. Literal characters may only be generated
 * characters absent from the source views, including JSON punctuation not present in empty notes.
 */
export async function referenceRelationSource(
  text: string,
  source: string,
  signal?: AbortSignal
): Promise<RelationSourceReferences> {
  checkRelationCancelled(signal);
  const views = viewsOf(source);
  const chunks = new Map<string, [number, number]>();
  const characters = new Map<string, [number, number]>();
  const previous = new Map<string, number>();
  const parts: SourcePart[] = [];
  let checkpoint = Date.now();
  const breathe = async () => {
    checkRelationCancelled(signal);
    if (signal && Date.now() - checkpoint >= 8) {
      await yieldRelationWork(signal);
      checkpoint = Date.now();
    }
  };
  for (let view = 0; view < views.length; view++) {
    const value = views[view];
    for (let at = 0; at < value.length; at++) {
      if (!characters.has(value[at])) characters.set(value[at], [view, at]);
      if (at % width === 0 && at + width <= value.length) {
        const key = value.slice(at, at + width);
        if (!chunks.has(key)) chunks.set(key, [view, at]);
      }
      if (at % 65536 === 0) await breathe();
    }
  }
  for (let at = 0; at < text.length; ) {
    const key = text.slice(at, at + width);
    let match = key.length === width ? chunks.get(key) : undefined;
    let length = match ? width : 0;
    if (match) {
      const [view, start] = match;
      while (
        start + length < views[view].length &&
        at + length < text.length &&
        views[view][start + length] === text[at + length]
      )
        length++;
    }
    const start = key.length === width ? previous.get(key) : undefined;
    if (start !== undefined) {
      let size = width;
      while (start + size < at && at + size < text.length && text[start + size] === text[at + size])
        size++;
      if (size > length && start + size <= at) {
        match = [-1, start];
        length = size;
      }
    }
    if (!match) {
      match = characters.get(text[at]);
      length = 1;
    }
    const last = parts[parts.length - 1];
    if (match) {
      if (
        match[0] >= 0 &&
        Array.isArray(last) &&
        last[0] === match[0] &&
        last[1] + last[2] === match[1]
      )
        last[2] += length;
      else parts.push([...match, length]);
    } else if (typeof last === 'string') parts[parts.length - 1] = last + text[at];
    else parts.push(text[at]);
    const end = at + length;
    for (; at < end; at++) {
      // A previous-output copy must end before the next token starts.
      const position = at - width + 1;
      if (position >= 0) {
        const prior = text.slice(position, position + width);
        if (!previous.has(prior)) previous.set(prior, position);
      }
      if (at % 65536 === 0) await breathe();
    }
  }
  checkRelationCancelled(signal);
  return { parts };
}

/** Rehydrate once from the already loaded notes; no extraction or relationship collection runs. */
export async function restoreRelationSource(
  references: RelationSourceReferences,
  source: string,
  signal?: AbortSignal
): Promise<string> {
  checkRelationCancelled(signal);
  if (!references || !Array.isArray(references.parts))
    throw new Error('Invalid source references.');
  const views = viewsOf(source);
  const output: string[] = [];
  const offsets: number[] = [];
  let length = 0;
  let checkpoint = Date.now();
  for (let index = 0; index < references.parts.length; index++) {
    const part = references.parts[index];
    let text: string;
    if (typeof part === 'string') text = part;
    else {
      if (
        !Array.isArray(part) ||
        part.length !== 3 ||
        !part.every(Number.isSafeInteger) ||
        part[0] < -1 ||
        part[0] >= views.length ||
        part[1] < 0 ||
        part[2] <= 0
      )
        throw new Error('Invalid source range.');
      if (part[0] === -1) {
        const end = part[1] + part[2];
        if (end > length) throw new Error('Previous output is unavailable.');
        let low = 0,
          high = offsets.length;
        while (low + 1 < high) {
          const middle = (low + high) >>> 1;
          if (offsets[middle] <= part[1]) low = middle;
          else high = middle;
        }
        const pieces: string[] = [];
        for (let position = low; position < output.length && offsets[position] < end; position++)
          pieces.push(
            output[position].slice(
              Math.max(0, part[1] - offsets[position]),
              end - offsets[position]
            )
          );
        text = pieces.join('');
      } else {
        const value = views[part[0]];
        if (part[1] + part[2] > value.length) throw new Error('Source range is unavailable.');
        text = value.slice(part[1], part[1] + part[2]);
      }
    }
    offsets.push(length);
    output.push(text);
    length += text.length;
    if (index % 4096 === 0) {
      checkRelationCancelled(signal);
      if (signal && Date.now() - checkpoint >= 8) {
        await yieldRelationWork(signal);
        checkpoint = Date.now();
      }
    }
  }
  checkRelationCancelled(signal);
  return output.join('');
}
