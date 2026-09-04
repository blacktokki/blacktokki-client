import { toMarkdown } from '@blacktokki/editor';
import { create, insert, remove, search, Orama } from '@orama/orama';

import { getEmbeddingVector, VECTOR_DIMENSION } from './embeddingService';
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

let dbInstance: Orama<any> | null = null;
const indexedDocHashes = new Map<string, string>();
const indexedChunkIds = new Map<number, string[]>();

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

export const getOrInitOramaDb = async (): Promise<Orama<any>> => {
  if (dbInstance) {
    return dbInstance;
  }
  dbInstance = create({
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
    },
  });
  return dbInstance;
};

export const indexNoteContents = async (contents: Content[]) => {
  const db = await getOrInitOramaDb();

  for (const content of contents) {
    if (!content.id || !content.title) continue;
    const docKey = `note-${content.id}`;

    // Convert HTML content description to Markdown format
    const mdDescription = content.description ? toMarkdown(content.description) : '';
    const contentHash = `${content.title}:${mdDescription}:${content.updated || ''}`;

    if (indexedDocHashes.get(docKey) === contentHash) {
      continue;
    }

    // Delete previous chunk documents if note was updated
    const oldChunkIds = indexedChunkIds.get(content.id) || [];
    for (const oldId of oldChunkIds) {
      try {
        await remove(db, oldId);
      } catch (e) {
        // ignore
      }
    }

    const chunks = chunkMarkdownSections(mdDescription);
    if (chunks.length === 0) {
      chunks.push({ paragraph: content.title, text: content.title });
    }

    const newChunkIds: string[] = [];

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const chunkId = `note-${content.id}-chunk-${idx}`;
      const textToEmbed = `${content.title} ${chunk.text}`;
      const embeddingVector = await getEmbeddingVector(textToEmbed);

      await insert(db, {
        id: chunkId,
        original_id: content.id,
        title: content.title,
        paragraph: chunk.paragraph || content.title,
        description: chunk.text,
        embedding: embeddingVector,
      });

      newChunkIds.push(chunkId);
    }

    indexedChunkIds.set(content.id, newChunkIds);
    indexedDocHashes.set(docKey, contentHash);
  }
};

export const searchVectorDb = async (
  query: string,
  page: number = 0,
  size: number = 20
): Promise<SearchResult[]> => {
  const trimmedQuery = query ? query.trim() : '';
  if (!trimmedQuery) {
    return [];
  }

  const db = await getOrInitOramaDb();
  const queryVector = await getEmbeddingVector(trimmedQuery);

  try {
    const results = await search(db, {
      term: trimmedQuery,
      mode: 'hybrid',
      vector: {
        property: 'embedding',
        value: queryVector,
      },
      similarity: 0.0,
      limit: size,
      offset: page * size,
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
  } catch (e) {
    console.error('Orama vector search error:', e);
    return [];
  }
};
