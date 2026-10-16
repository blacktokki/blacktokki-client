import {
  CacheEntries,
  KEYWORD_RELATION_CACHE,
  keywordRelationEntries,
} from './keywordRelationCache';
import type { EntailmentScores, RelationValidation } from './relationDiscovery';

export type RelationNliReference = { id: string; patterns: string[] };
export type RelationNliCacheRecord = {
  scores: EntailmentScores;
  relationships: RelationNliReference[];
};
export type RelationNliCatalog = {
  records: Map<string, RelationNliCacheRecord>;
  patterns: Set<string>;
  relationships: Map<string, Set<string>>;
  legacyRecords: number;
};
export type ValidationUpdate = { candidate: number; index: number; validation: RelationValidation };
export type RelationNliCacheStore = {
  load: (
    scope: string,
    version: string,
    inputs: string[]
  ) => Promise<Map<string, EntailmentScores>>;
  save: (
    scope: string,
    version: string,
    scores: [string, EntailmentScores][],
    references?: Map<string, RelationNliReference[]>
  ) => Promise<void>;
  catalog?: (scope: string, version: string) => Promise<RelationNliCatalog>;
  prune: (scope: string, version: string, inputs: Set<string>) => Promise<void>;
};

/** Treat corrupt or incomplete cache entries as misses. Failed inference is never persisted. */
export function isRelationNliScore(value: unknown): value is EntailmentScores {
  if (!value || typeof value !== 'object') return false;
  const scores = value as EntailmentScores;
  const values = [scores.entailment, scores.neutral, scores.contradiction];
  return (
    values.every((score) => Number.isFinite(score) && score >= 0 && score <= 1) &&
    Math.abs(values.reduce((sum, score) => sum + score, 0) - 1) < 0.001
  );
}

/** Read old score-only records; final-result identity metadata contains only SHA-256 values. */
function readResult(json: string | null): RelationNliCacheRecord | undefined {
  if (!json) return;
  try {
    const value = JSON.parse(json);
    if (isRelationNliScore(value)) return { scores: value, relationships: [] };
    if (!isRelationNliScore(value?.scores)) return;
    const relationships: RelationNliReference[] = Array.isArray(value.relationships)
      ? value.relationships.filter(
          (item: RelationNliReference) =>
            item &&
            /^[a-f0-9]{64}$/.test(item.id) &&
            Array.isArray(item.patterns) &&
            item.patterns.length &&
            item.patterns.every((pattern) => /^[a-f0-9]{64}$/.test(pattern))
        )
      : [];
    return { scores: value.scores, relationships };
  } catch {}
}

/** Independent result records survive partial native writes without a cursor or manifest. */
export function createRelationNliCacheStore(
  entries: CacheEntries = keywordRelationEntries
): RelationNliCacheStore {
  const prefix = (scope: string) => `${KEYWORD_RELATION_CACHE}:${scope}/`;
  const resultPrefix = (scope: string, version: string) => `${prefix(scope)}nli/${version}/`;
  return {
    load: async (scope, version, inputs) => {
      const result = new Map<string, EntailmentScores>();
      for (let offset = 0; offset < inputs.length; offset += 200) {
        const batch = inputs.slice(offset, offset + 200);
        const values = await entries.read(
          batch.map((input) => resultPrefix(scope, version) + input)
        );
        values.forEach((json, index) => {
          const record = readResult(json);
          if (record) result.set(batch[index], record.scores);
        });
      }
      return result;
    },
    catalog: async (scope, version) => {
      const current = resultPrefix(scope, version);
      const keys = await entries.keys(current);
      const result: RelationNliCatalog = {
        records: new Map(),
        patterns: new Set(),
        relationships: new Map(),
        legacyRecords: 0,
      };
      for (let offset = 0; offset < keys.length; offset += 200) {
        const batch = keys.slice(offset, offset + 200);
        const values = await entries.read(batch);
        values.forEach((json, index) => {
          const record = readResult(json);
          if (!record) return;
          result.records.set(batch[index].slice(current.length), record);
          if (!record.relationships.length) result.legacyRecords++;
          for (const relationship of record.relationships) {
            let patterns = result.relationships.get(relationship.id);
            if (!patterns) result.relationships.set(relationship.id, (patterns = new Set()));
            relationship.patterns.forEach((pattern) => {
              patterns.add(pattern);
              result.patterns.add(pattern);
            });
          }
        });
      }
      return result;
    },
    save: async (scope, version, scores, references) => {
      await entries.write(
        scores.map(([input, value]) => {
          if (!isRelationNliScore(value)) throw new Error('Cannot cache invalid NLI scores.');
          const { entailment, neutral, contradiction } = value;
          const relationships = (references?.get(input) || [])
            .filter(
              (item) =>
                /^[a-f0-9]{64}$/.test(item.id) &&
                Array.isArray(item.patterns) &&
                item.patterns.length > 0 &&
                item.patterns.every((pattern) => /^[a-f0-9]{64}$/.test(pattern))
            )
            .map((item) => ({ id: item.id, patterns: item.patterns }));
          return [
            resultPrefix(scope, version) + input,
            JSON.stringify(
              relationships.length
                ? {
                    scores: { entailment, neutral, contradiction },
                    relationships,
                  }
                : { entailment, neutral, contradiction }
            ),
          ];
        })
      );
    },
    prune: async (scope, version, inputs) => {
      const current = resultPrefix(scope, version);
      const obsolete = (await entries.keys(`${prefix(scope)}nli/`)).filter(
        (entry) => !entry.startsWith(current) || !inputs.has(entry.slice(current.length))
      );
      // Prune analysis scores without touching search vectors in the shared namespace.
      if (obsolete.length) await entries.remove(obsolete);
    },
  };
}

/** SHA-256 keys keep source texts out of persistent storage on web and native runtimes. */
export async function relationCacheHash(text: string): Promise<string> {
  if (
    text.length <= 8 * 1024 * 1024 &&
    globalThis.crypto?.subtle &&
    typeof TextEncoder !== 'undefined'
  ) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    );
  }
  // Stream UTF-8 through SHA-256 when Web Crypto is unavailable; keep only one block in memory.
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  const words = new Int32Array(64);
  const block = new Uint8Array(64);
  const compress = () => {
    for (let i = 0; i < 16; i++) {
      const at = i * 4;
      words[i] = (block[at] << 24) | (block[at + 1] << 16) | (block[at + 2] << 8) | block[at + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = words[i - 15],
        b = words[i - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[i] = words[i - 16] + s0 + words[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const t1 = (h + s1 + ((e & f) ^ (~e & g)) + constants[i] + words[i]) | 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((word, i) => (state[i] = (state[i] + word) | 0));
  };
  let blockLength = 0;
  let byteLength = 0;
  const append = (byte: number) => {
    block[blockLength++] = byte;
    byteLength++;
    if (blockLength === 64) {
      compress();
      blockLength = 0;
    }
  };
  for (const character of text) {
    let code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) append(code);
    else if (code < 0x800) {
      append(0xc0 | (code >> 6));
      append(0x80 | (code & 63));
    } else if (code < 0x10000) {
      append(0xe0 | (code >> 12));
      append(0x80 | ((code >> 6) & 63));
      append(0x80 | (code & 63));
    } else {
      append(0xf0 | (code >> 18));
      append(0x80 | ((code >> 12) & 63));
      append(0x80 | ((code >> 6) & 63));
      append(0x80 | (code & 63));
    }
  }
  const length = byteLength * 8;
  append(0x80);
  while (blockLength !== 56) append(0);
  const high = Math.floor(length / 0x100000000);
  const low = length >>> 0;
  for (const word of [high, low])
    for (let shift = 24; shift >= 0; shift -= 8) append((word >>> shift) & 255);
  return state.map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
}
