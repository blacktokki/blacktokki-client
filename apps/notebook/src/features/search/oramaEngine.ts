import { toMarkdown } from '@blacktokki/editor';
import { count, create, insert, remove, search, Orama } from '@orama/orama';

import { getEmbeddingVector, getEmbeddingVectors, VECTOR_DIMENSION } from './embeddingService';
import { createSearchIndexComponent } from './searchIndexComponent';
import { Content } from '../../types';

export interface SearchResult {
  id: number;
  distance: number;
  title: string;
  paragraph?: string;
  description: string;
}

interface HeaderSection {
  level: number;
  headerText: string;
  body: string;
}

interface IndexedChunk {
  id: string;
  title: string;
  paragraph: string;
  text: string;
  embedding: number[];
}

export interface SearchIndex {
  scope: string;
  cancellation: AbortController;
  db: Orama<any> | null;
  documents: Map<number, { title: string; html: string; chunks: IndexedChunk[] }>;
  snapshots: WeakMap<Content[], number>;
  contents?: Content[];
  indexedContents?: Content[];
  sourceRevision: number;
  syncing?: Promise<void>;
  results: Map<string, Promise<SearchResult[]>>;
}

let activeIndex: SearchIndex | undefined;
const yieldSearchWork = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const assertActive = (index: SearchIndex) => {
  if (!index.db) throw new Error('Search notebook has changed');
  return index.db;
};

// Parse markdown into sections divided by headers (#, ##, ###, etc.)
export function parseMarkdownSections(mdText: string): HeaderSection[] {
  const lines = mdText.split(/\r?\n/);
  const sections: HeaderSection[] = [];

  let currentLevel = 0;
  let currentHeader = '';
  let currentBodyLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      if (currentHeader || currentBodyLines.length > 0) {
        sections.push({
          level: currentLevel,
          headerText: currentHeader,
          body: currentBodyLines.join('\n').trim(),
        });
      }
      currentLevel = headerMatch[1].length;
      currentHeader = line.trim();
      currentBodyLines = [];
    } else {
      currentBodyLines.push(line);
    }
  }

  if (currentHeader || currentBodyLines.length > 0) {
    sections.push({
      level: currentLevel,
      headerText: currentHeader,
      body: currentBodyLines.join('\n').trim(),
    });
  }

  return sections;
}

// Chunk markdown into hierarchical header sections
export function chunkMarkdownSections(mdText: string): { paragraph?: string; text: string }[] {
  if (!mdText || mdText.trim().length === 0) {
    return [];
  }

  const sections = parseMarkdownSections(mdText);
  if (sections.length === 0) {
    return [{ text: mdText.trim() }];
  }

  const chunks: { paragraph?: string; text: string }[] = [];

  for (let i = 0; i < sections.length; i++) {
    const rootSec = sections[i];
    let fullChunkText = rootSec.headerText
      ? `${rootSec.headerText}\n${rootSec.body}`.trim()
      : rootSec.body;

    // Aggregate child sections (level > rootSec.level)
    if (rootSec.level > 0) {
      for (let j = i + 1; j < sections.length; j++) {
        const nextSec = sections[j];
        if (nextSec.level > 0 && nextSec.level <= rootSec.level) {
          break; // Sibling or parent header reached
        }
        const addition = nextSec.headerText
          ? `${nextSec.headerText}\n${nextSec.body}`.trim()
          : `${nextSec.body}`.trim();
        fullChunkText += `\n\n${addition}`;
      }
    }

    const headerName = rootSec.headerText
      ? rootSec.headerText.replace(/^#{1,6}\s+/, '')
      : undefined;

    if (fullChunkText.length > 0) {
      chunks.push({
        paragraph: headerName,
        text: fullChunkText,
      });
    }
  }

  return chunks;
}

// Custom CJK and English N-gram Tokenizer
const cjkTokenizer = {
  tokenize(text: string): string[] {
    if (!text) return [];
    const normalized = text.toLowerCase().trim();
    const tokens: string[] = [];

    // Word tokens
    const words = normalized.split(/[\s,./?!:;()[\]{}'"]+/).filter(Boolean);
    tokens.push(...words);

    // Bi-gram N-grams for CJK/Korean support
    for (let i = 0; i < normalized.length - 1; i++) {
      const bi = normalized.substring(i, i + 2).trim();
      if (bi.length === 2 && !bi.includes(' ')) {
        tokens.push(bi);
      }
    }
    return tokens;
  },
};

/** Keep one notebook's index in memory and cancel work belonging to the previous scope. */
export const getSearchIndex = (scope = 'default'): SearchIndex => {
  if (activeIndex?.scope === scope) return activeIndex;
  if (activeIndex) {
    activeIndex.cancellation.abort();
    activeIndex.db = null;
    activeIndex.documents.clear();
    activeIndex.results.clear();
    activeIndex.contents = undefined;
    activeIndex.indexedContents = undefined;
  }
  activeIndex = {
    scope,
    cancellation: new AbortController(),
    db: create({
      schema: {
        id: 'string',
        original_id: 'number',
        title: 'string',
        paragraph: 'string',
        description: 'string',
        link: 'string',
        embedding: `vector[${VECTOR_DIMENSION}]`,
      },
      components: {
        tokenizer: cjkTokenizer as any,
        index: createSearchIndexComponent(),
      },
    }),
    documents: new Map(),
    snapshots: new WeakMap(),
    sourceRevision: 0,
    results: new Map(),
  };
  return activeIndex;
};

export const getOrInitOramaDb = async (index = getSearchIndex()): Promise<Orama<any>> =>
  assertActive(index);

/** Register the current source, including restored snapshots and equal-size edits. */
export const getSearchSourceRevision = (index: SearchIndex, contents: Content[]): number => {
  if (index.contents === contents) return index.sourceRevision;
  index.cancellation.abort();
  index.cancellation = new AbortController();
  index.contents = contents;
  index.sourceRevision++;
  index.snapshots.set(contents, index.sourceRevision);
  return index.sourceRevision;
};

const synchronizeContents = async (contents: Content[], index: SearchIndex) => {
  const db = assertActive(index);
  let sliceStart = performance.now();
  const yieldIfNeeded = async () => {
    if (performance.now() - sliceStart >= 8) {
      await yieldSearchWork();
      assertActive(index);
      sliceStart = performance.now();
    }
  };
  const currentIds = new Set(
    contents.filter((content) => content.id && content.title).map((content) => content.id)
  );
  for (const [id, document] of index.documents) {
    if (contents !== index.contents) return;
    if (currentIds.has(id)) continue;
    index.results.clear();
    for (const chunk of document.chunks) {
      remove(db, chunk.id);
      await yieldIfNeeded();
    }
    index.documents.delete(id);
  }

  const updates: { content: Content; chunks: IndexedChunk[] }[] = [];
  for (const content of contents) {
    if (contents !== index.contents) return;
    assertActive(index);
    if (!content.id || !content.title) continue;
    const html = content.description || '';
    const previous = index.documents.get(content.id);
    if (previous?.title === content.title && previous.html === html) continue;
    index.results.clear();
    const markdown = html ? toMarkdown(html) : '';
    const prepared = chunkMarkdownSections(markdown);
    if (!prepared.length) prepared.push({ paragraph: content.title, text: content.title });
    const chunks = prepared.map((source, row) => {
      const paragraph = source.paragraph || content.title;
      const previousChunk = previous?.chunks[row];
      return previousChunk?.title === content.title &&
        previousChunk.paragraph === paragraph &&
        previousChunk.text === source.text
        ? previousChunk
        : {
            id: `note-${content.id}-chunk-${row}`,
            title: content.title,
            paragraph,
            text: source.text,
            embedding: [],
          };
    });
    updates.push({ content, chunks });
    await yieldIfNeeded();
  }
  const pending = updates.flatMap(({ chunks }) =>
    chunks.filter((chunk) => !chunk.embedding.length)
  );
  const vectors = pending.length
    ? await getEmbeddingVectors(
        pending.map((chunk) => chunk.title + ' ' + chunk.text),
        index.cancellation.signal
      ).catch((error) => {
        if (index.db && contents !== index.contents) return [];
        throw error;
      })
    : [];
  assertActive(index);
  if (contents !== index.contents) return;
  pending.forEach((chunk, row) => {
    chunk.embedding = vectors[row];
  });
  for (const { content, chunks } of updates) {
    if (contents !== index.contents) return;
    const previous = index.documents.get(content.id);
    for (let row = 0; row < chunks.length; row++) {
      const chunk = chunks[row];
      const previousChunk = previous?.chunks[row];
      if (chunk === previousChunk) continue;
      if (previousChunk) remove(db, previousChunk.id);
      insert(db, {
        id: chunk.id,
        original_id: content.id,
        title: content.title,
        paragraph: chunk.paragraph,
        description: chunk.text,
        embedding: chunk.embedding,
      });
      await yieldIfNeeded();
    }
    for (const chunk of previous?.chunks.slice(chunks.length) || []) {
      remove(db, chunk.id);
      await yieldIfNeeded();
    }
    index.documents.set(content.id, {
      title: content.title,
      html: content.description || '',
      chunks,
    });
    await yieldIfNeeded();
  }
};

/** Unchanged notes and sections retain their index and vectors. */
export const indexNoteContents = (contents: Content[], index = getSearchIndex()): Promise<void> => {
  assertActive(index);
  if (!index.snapshots.has(contents)) getSearchSourceRevision(index, contents);
  if (index.syncing) return index.syncing;
  if (index.contents === index.indexedContents) return Promise.resolve();
  const task = (async () => {
    while (index.contents !== index.indexedContents) {
      const snapshot = index.contents!;
      await synchronizeContents(snapshot, index);
      assertActive(index);
      index.indexedContents = snapshot;
    }
  })().finally(() => {
    if (index.syncing === task) index.syncing = undefined;
  });
  index.syncing = task;
  return task;
};

export const searchVectorDb = async (
  query: string,
  page: number = 0,
  size: number = 20,
  index = getSearchIndex()
): Promise<SearchResult[]> => {
  const trimmedQuery = query ? query.trim() : '';
  if (!trimmedQuery) return [];
  if (index.contents) await indexNoteContents(index.contents, index);
  const db = assertActive(index);
  if (!count(db)) return [];
  const key = JSON.stringify([index.sourceRevision, trimmedQuery]);
  let cached = index.results.get(key);
  if (!cached) {
    const sourceRevision = index.sourceRevision;
    const task = (async () => {
      const queryVector = await getEmbeddingVector(trimmedQuery, index.cancellation.signal).catch(
        (error) => {
          if (sourceRevision !== index.sourceRevision) return undefined;
          throw error;
        }
      );
      assertActive(index);
      if (sourceRevision !== index.sourceRevision) {
        return searchVectorDb(trimmedQuery, 0, Number.MAX_SAFE_INTEGER, index);
      }
      const results = await search(db, {
        term: trimmedQuery,
        mode: 'hybrid',
        vector: { property: 'embedding', value: queryVector! },
        similarity: 0.0,
        limit: count(db),
        includeVectors: true,
      });
      return results.hits.map((hit) => {
        const doc = hit.document as any;
        return {
          id: doc.original_id || 0,
          distance: Math.max(0, 1 - (hit.score || 0)),
          title: doc.title || '',
          paragraph: doc.paragraph,
          description: doc.description || '',
        };
      });
    })();
    cached = task;
    index.results.set(key, task);
    while (index.results.size > 2) index.results.delete(index.results.keys().next().value!);
    task.catch(() => {
      if (index.results.get(key) === task) index.results.delete(key);
    });
  }
  const results = await cached;
  assertActive(index);
  return results.slice(page * size, (page + 1) * size);
};
