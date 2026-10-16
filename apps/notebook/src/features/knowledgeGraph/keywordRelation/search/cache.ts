import type { GraphSearchCache } from './types';
import {
  KEYWORD_RELATION_CACHE,
  keywordRelationEntries,
  minimalSearchVectors,
} from '../keywordRelationCache';

const keyOf = (scope: string) => `${KEYWORD_RELATION_CACHE}:${scope}/search/vectors`;

/** Persist only model-tagged, hashed embeddings; graph text and snapshots stay in memory. */
export const graphSearchCache: GraphSearchCache = {
  read: async <T>(scope: string, key: string) => {
    if (key !== 'vectors') return undefined;
    try {
      const [value] = await keywordRelationEntries.read([keyOf(scope)]);
      return value ? (minimalSearchVectors(JSON.parse(value)) as T | undefined) : undefined;
    } catch {
      return undefined;
    }
  },
  write: async (scope, key, value) => {
    if (key !== 'vectors') return;
    const minimal = minimalSearchVectors(value);
    if (!minimal) return;
    try {
      await keywordRelationEntries.write([[keyOf(scope), JSON.stringify(minimal)]]);
    } catch {
      // Search can still use its in-memory vectors when durable storage is unavailable.
    }
  },
};
