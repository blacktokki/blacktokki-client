/** Scoped storage, hashing and validation for relationship collections and graph search. */
import {
  relationKeywordKey,
  checkRelationCancelled,
  yieldRelationWork,
  associationContextLabels,
} from './keyword/keywordUtils';
import { referenceRelationSource, restoreRelationSource } from './relationSourceCache';
import { createSearchDiagnostic } from './search/diagnostics';
import { relationAssociationRevision } from './types';
import type {
  GraphSearchCache,
  RelationAssociationPreparation,
  InductiveRelationCandidate,
  RelationDiscoveryResult,
  RelationObservation,
} from './types';

export const KEYWORD_RELATION_CACHE = '@blacktokki:notebook:keyword_relation';

const sha = /^[a-f0-9]{64}$/;

/** Keep only model-tagged vectors and hashed metadata for a completed search graph. */
function minimalSearchVectors(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const record = value as { model?: unknown; vectors?: unknown; graph?: unknown };
  if (
    typeof record.model !== 'string' ||
    !/^[A-Za-z0-9._/-]{1,128}:mean:normalized:search-v1$/.test(record.model) ||
    !Array.isArray(record.vectors)
  )
    return;
  const vectors = record.vectors
    .filter(
      (item: unknown): item is [string, number[]] =>
        Array.isArray(item) &&
        sha.test(item[0]) &&
        Array.isArray(item[1]) &&
        item[1].length > 0 &&
        item[1].length <= 2048 &&
        item[1].every(Number.isFinite)
    )
    .map(([identity, vector]: [string, number[]]) => [identity, vector] as [string, number[]]);
  const graph = record.graph as
    | {
        version?: unknown;
        revision?: unknown;
        inputRevision?: unknown;
        documentCount?: unknown;
        documents?: unknown;
      }
    | undefined;
  return {
    model: record.model,
    vectors,
    ...(graph?.version === 1 &&
      typeof graph.revision === 'string' &&
      sha.test(graph.revision) &&
      Array.isArray(graph.documents) &&
      graph.documentCount === graph.documents.length &&
      graph.documents.every((identity) => typeof identity === 'string' && sha.test(identity)) && {
        graph: {
          version: 1 as const,
          revision: graph.revision,
          documentCount: graph.documents.length,
          ...(typeof graph.inputRevision === 'string' &&
            sha.test(graph.inputRevision) && { inputRevision: graph.inputRevision }),
          documents: graph.documents as string[],
        },
      }),
  };
}

type CacheEntries = {
  read: (keys: string[]) => Promise<(string | null)[]>;
  write: (entries: [string, string][]) => Promise<void>;
};

let database: Promise<IDBDatabase> | undefined;

const asyncStorage = async () =>
  (await import('@react-native-async-storage/async-storage')).default;

let fallbackReady: Promise<void> | undefined;

/** Retire source-bearing collections by key/header only; keep expensive embedding vectors. */
function prepareFallback() {
  return (fallbackReady ||= (async () => {
    const storage = await asyncStorage();
    const keys = (await storage.getAllKeys()).filter((key) =>
      key.startsWith(KEYWORD_RELATION_CACHE)
    );
    const retired = keys.filter(
      (key) =>
        !(['patterns', 'metadata', 'vectors'] as const).some((kind) =>
          key.startsWith(`${KEYWORD_RELATION_CACHE}_${kind}:`)
        )
    );
    const patterns = keys.filter((key) => key.startsWith(`${KEYWORD_RELATION_CACHE}_patterns:`));
    if (patterns.length) {
      const headers = await storage.multiGet(
        patterns.map((key) => key.replace('_patterns:', '_metadata:'))
      );
      headers.forEach(([, json], index) => {
        try {
          if (json && JSON.parse(json).revision === revision) return;
        } catch {}
        retired.push(patterns[index], patterns[index].replace('_patterns:', '_metadata:'));
      });
    }
    if (retired.length) await storage.multiRemove([...new Set(retired)]);
  })().catch((error) => {
    fallbackReady = undefined;
    throw error;
  }));
}

function openDatabase() {
  return (database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(KEYWORD_RELATION_CACHE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('entries')) {
        request.result.createObjectStore('entries');
        return;
      }
      const store = request.transaction!.objectStore('entries');
      const cursor = store.openKeyCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (
          typeof entry.key !== 'string' ||
          !entry.key.startsWith(`${KEYWORD_RELATION_CACHE}_vectors:`)
        )
          store.delete(entry.primaryKey);
        entry.continue();
      };
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Keyword relation cache upgrade is blocked.'));
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, finish: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('entries', mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Keyword relation cache transaction aborted.'));
    tx.onerror = () => reject(tx.error);
    action(tx.objectStore('entries'), (value) => (result = value));
  });
}

/** Store source references, hashed pattern identities and text-free search vectors. */
export const keywordRelationEntries: CacheEntries = {
  read: async (keys) => {
    if (typeof indexedDB === 'undefined') {
      await prepareFallback();
      return (await (await asyncStorage()).multiGet(keys)).map(([, value]) => value);
    }
    return transaction('readonly', (store, finish) => {
      const values: (string | null)[] = Array(keys.length).fill(null);
      keys.forEach((key, index) => {
        const request = store.get(key);
        request.onsuccess = () => (values[index] = request.result ?? null);
      });
      finish(values);
    });
  },
  write: async (entries) => {
    if (typeof indexedDB === 'undefined') {
      await prepareFallback();
      const storage = await asyncStorage();
      for (const [key, value] of entries) await storage.setItem(key, value);
      return undefined;
    }
    return transaction('readwrite', (store, finish) => {
      entries.forEach(([key, value]) => store.put(value, key));
      finish(undefined);
    });
  },
};

type CacheKind = 'patterns' | 'metadata' | 'vectors';

/** Use the same resource-prefix/account/notebook layout as other notebook storage. */
export const keywordRelationCacheKey = (scope: string, kind: CacheKind) =>
  `${KEYWORD_RELATION_CACHE}_${kind}:${scope}`;

/** Persist only model-tagged, hashed embeddings; graph text and snapshots stay in memory. */
export const graphSearchCache: GraphSearchCache = {
  read: async <T>(scope: string, key: string, onRead?: Parameters<GraphSearchCache['read']>[2]) => {
    if (key !== 'vectors') return undefined;
    const diagnostic = createSearchDiagnostic(undefined, {});
    let status: '완료' | '실패' = '완료';
    try {
      const [value] = await diagnostic.measure('저장소조회', () =>
        keywordRelationEntries.read([keywordRelationCacheKey(scope, 'vectors')])
      );
      diagnostic.update({ 저장문자수: value?.length || 0, 저장여부: !!value });
      if (!value) return undefined;
      const parsed = diagnostic.sync('JSON해석', () => JSON.parse(value));
      const minimal = diagnostic.sync('저장형식검증', () => minimalSearchVectors(parsed));
      diagnostic.update({ 벡터수: minimal?.vectors.length, 문서수: minimal?.graph?.documentCount });
      if (!minimal) {
        status = '실패';
        if (value !== 'null')
          await keywordRelationEntries.write([[keywordRelationCacheKey(scope, 'vectors'), 'null']]);
      } else if (
        Object.keys(parsed).some((key) => !['model', 'vectors', 'graph'].includes(key)) ||
        parsed.vectors.length !== minimal.vectors.length ||
        parsed.vectors.some((row: unknown) => !Array.isArray(row) || row.length !== 2) ||
        (parsed.graph &&
          (!minimal.graph ||
            Object.keys(parsed.graph).some(
              (key) =>
                !['version', 'revision', 'inputRevision', 'documentCount', 'documents'].includes(
                  key
                )
            )))
      ) {
        try {
          await keywordRelationEntries.write([
            [keywordRelationCacheKey(scope, 'vectors'), JSON.stringify(minimal)],
          ]);
        } catch {
          status = '실패';
        }
      }
      return minimal as T | undefined;
    } catch {
      status = '실패';
      return undefined;
    } finally {
      diagnostic.update({ 저장소조회상태: status });
      diagnostic.finish(status);
      onRead?.(diagnostic.readTiming());
    }
  },
  write: async (scope, key, value) => {
    if (key !== 'vectors') return;
    const minimal = minimalSearchVectors(value);
    if (!minimal) return;
    try {
      await keywordRelationEntries.write([
        [keywordRelationCacheKey(scope, 'vectors'), JSON.stringify(minimal)],
      ]);
    } catch {
      // Search can still use its in-memory vectors when durable storage is unavailable.
    }
  },
};

/** Compute SHA-256 identities and integrity checks for cached data. */
export async function relationCacheHash(text: string, signal?: AbortSignal): Promise<string> {
  checkRelationCancelled(signal);
  // Bound temporary UTF-8/native buffers without sending ordinary large sources to JS hashing.
  if (
    text.length <= 32 * 1024 * 1024 &&
    globalThis.crypto?.subtle &&
    typeof TextEncoder !== 'undefined'
  ) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    checkRelationCancelled(signal);
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
  let yieldedAt = 0;
  let yielded = Date.now();
  const append = (byte: number) => {
    block[blockLength++] = byte;
    byteLength++;
    if (blockLength === 64) {
      compress();
      blockLength = 0;
    }
  };
  for (const character of text) {
    if (signal && byteLength - yieldedAt >= 32768) {
      checkRelationCancelled(signal);
      if (Date.now() - yielded >= 8) {
        await yieldRelationWork(signal);
        yielded = Date.now();
      }
      yieldedAt = byteLength;
    }
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

const revision = 'relation-patterns-v3';

/** Localized analysis identity stays in the payload; persistent keys use account/notebook/privacy. */
function patternScope(scope: string): { key: string; labels?: string[] } {
  try {
    const value = JSON.parse(scope);
    if (Array.isArray(value) && value.length > 1 && value.every((item) => typeof item === 'string'))
      return { key: value[0], labels: value.slice(1) };
  } catch {}
  return { key: scope };
}

const patternKeyOf = (scope: string) =>
  keywordRelationCacheKey(patternScope(scope).key, 'patterns');

const metadataKeyOf = (scope: string) =>
  keywordRelationCacheKey(patternScope(scope).key, 'metadata');

export type RelationPatternCacheInfo = {
  status: 'missing' | 'reusable' | 'outdated' | 'unavailable';
  reason?: 'source' | 'rules' | 'patterns' | 'invalid';
  /** Scores are reusable only from a compatible result still held in this session. */
  hasEvaluations: boolean;
};

/** Compare pattern and evidence identities without duplicating their source-derived text. */
async function savedPattern(candidate: InductiveRelationCandidate) {
  return {
    key: await relationCacheHash(candidate.id),
    id: await relationCacheHash(JSON.stringify([candidate.id, candidate.observations])),
    template: await relationCacheHash(candidate.template),
    patternTemplate:
      candidate.patternTemplate && (await relationCacheHash(candidate.patternTemplate)),
    variants:
      candidate.variants &&
      (await Promise.all(candidate.variants.map((text) => relationCacheHash(text)))),
  };
}

type StoredPatternRecord = {
  revision: string;
  source: string;
  rules: string;
  labels?: string;
  patterns: Awaited<ReturnType<typeof savedPattern>>[];
  preparation?: Awaited<ReturnType<typeof saveRelationCandidateInputs>>;
};

/** Restore completed pattern collections while evaluation results remain in session memory. */
export function createRelationPatternCacheStore(entries: CacheEntries = keywordRelationEntries) {
  const inspectRecord = async (
    record: StoredPatternRecord,
    source: string,
    result?: RelationDiscoveryResult,
    signal?: AbortSignal,
    labels?: string[]
  ): Promise<RelationPatternCacheInfo> => {
    const info = { hasEvaluations: false };
    try {
      checkRelationCancelled(signal);
      if (
        record?.revision !== revision ||
        !sha.test(record.source) ||
        typeof record.rules !== 'string' ||
        !Array.isArray(record.patterns)
      )
        return { ...info, status: 'outdated', reason: 'invalid' };
      if (record.source !== source) return { ...info, status: 'outdated', reason: 'source' };
      if (record.rules !== relationAssociationRevision)
        return { ...info, status: 'outdated', reason: 'rules' };
      if (record.labels !== (labels && (await relationCacheHash(JSON.stringify(labels), signal))))
        return { ...info, status: 'outdated', reason: 'rules' };
      if (!result)
        return record.preparation?.revision === relationCandidateCacheRevision
          ? { ...info, status: 'reusable' }
          : { ...info, status: 'outdated', reason: 'invalid' };
      const patterns = new Map<string, Awaited<ReturnType<typeof savedPattern>>>();
      for (const pattern of record.patterns) {
        if (
          !pattern ||
          typeof pattern.key !== 'string' ||
          !sha.test(pattern.key) ||
          typeof pattern.id !== 'string' ||
          !sha.test(pattern.id) ||
          patterns.has(pattern.key)
        )
          return { ...info, status: 'outdated', reason: 'invalid' };
        patterns.set(pattern.key, pattern);
        if (signal && patterns.size % 128 === 0) {
          await yieldRelationWork(signal);
        }
      }
      const matches =
        patterns.size === result.candidates.length &&
        (await Promise.all(result.candidates.map(savedPattern))).every((expected) => {
          const stored = patterns.get(expected.key);
          return (
            stored?.id === expected.id &&
            stored.template === expected.template &&
            stored.patternTemplate === expected.patternTemplate &&
            JSON.stringify(stored.variants) === JSON.stringify(expected.variants) &&
            patterns.delete(expected.key)
          );
        });
      checkRelationCancelled(signal);
      return matches
        ? { ...info, status: 'reusable' }
        : { ...info, status: 'outdated', reason: 'patterns' };
    } catch {
      checkRelationCancelled(signal);
      return { ...info, status: 'unavailable' };
    }
  };
  const inspect = async (
    scope: string,
    source: string,
    result?: RelationDiscoveryResult,
    signal?: AbortSignal
  ): Promise<RelationPatternCacheInfo> => {
    try {
      const [json] = await entries.read([patternKeyOf(scope)]);
      checkRelationCancelled(signal);
      return json
        ? await inspectRecord(JSON.parse(json), source, result, signal, patternScope(scope).labels)
        : { status: 'missing', hasEvaluations: false };
    } catch {
      checkRelationCancelled(signal);
      return { status: 'unavailable', hasEvaluations: false };
    }
  };
  return {
    inspect,
    /** Inspect a small completed-run header before extracting entities or collecting candidates. */
    probe: async (
      scope: string,
      source: string,
      signal?: AbortSignal
    ): Promise<RelationPatternCacheInfo> => {
      try {
        const [json] = await entries.read([metadataKeyOf(scope)]);
        checkRelationCancelled(signal);
        if (!json) return await inspect(scope, source, undefined, signal);
        const metadata = JSON.parse(json);
        if (
          metadata?.revision !== revision ||
          typeof metadata.source !== 'string' ||
          !sha.test(metadata.source) ||
          typeof metadata.rules !== 'string' ||
          !Number.isSafeInteger(metadata.patternCount) ||
          metadata.patternCount < 0
        )
          return { status: 'outdated', reason: 'invalid', hasEvaluations: false };
        const reason =
          metadata.source !== source
            ? 'source'
            : metadata.rules !== relationAssociationRevision
            ? 'rules'
            : metadata.labels !==
              (patternScope(scope).labels &&
                (await relationCacheHash(JSON.stringify(patternScope(scope).labels), signal)))
            ? 'rules'
            : metadata.preparationRevision !== relationCandidateCacheRevision
            ? 'invalid'
            : undefined;
        return {
          status: reason ? 'outdated' : 'reusable',
          hasEvaluations: false,
          ...(reason && { reason }),
        };
      } catch {
        checkRelationCancelled(signal);
        return { status: 'unavailable', hasEvaluations: false };
      }
    },
    /** Read once and validate both unscored inputs and their saved patterns before publication. */
    restorePreparation: async (
      scope: string,
      source: string,
      signal?: AbortSignal,
      onProgress?: (processed: number, total: number) => void,
      sourceText?: string
    ): Promise<RelationAssociationPreparation | undefined> => {
      try {
        checkRelationCancelled(signal);
        onProgress?.(0, 3);
        const [json] = await entries.read([patternKeyOf(scope)]);
        checkRelationCancelled(signal);
        onProgress?.(1, 3);
        if (!json) return;
        const record = JSON.parse(json);
        if (
          record?.revision !== revision ||
          record.source !== source ||
          record.rules !== relationAssociationRevision ||
          record.labels !==
            (patternScope(scope).labels &&
              (await relationCacheHash(JSON.stringify(patternScope(scope).labels), signal)))
        )
          return;
        if (sourceText === undefined) return;
        const prepared = await restoreRelationCandidateInputs(
          record.preparation,
          sourceText,
          signal
        );
        if (!prepared) return;
        onProgress?.(2, 3);
        if (
          (await inspectRecord(record, source, prepared.result, signal, patternScope(scope).labels))
            .status === 'reusable'
        ) {
          checkRelationCancelled(signal);
          onProgress?.(3, 3);
          return prepared;
        }
      } catch {
        checkRelationCancelled(signal);
        return undefined;
      }
    },
    save: async (
      scope: string,
      source: string,
      result: RelationDiscoveryResult,
      signal?: AbortSignal,
      prepared?: RelationAssociationPreparation,
      sourceText?: string
    ) => {
      checkRelationCancelled(signal);
      if (!sha.test(source) || result.associationProgress?.status !== 'completed')
        throw new Error('Only completed relationship patterns can be saved.');
      if (prepared && sourceText === undefined)
        throw new Error('Current source is required to save candidate references.');
      const patterns = await Promise.all(result.candidates.map(savedPattern));
      const preparation =
        prepared && sourceText !== undefined
          ? await saveRelationCandidateInputs(prepared, sourceText, signal)
          : undefined;
      const localized = patternScope(scope).labels;
      const labels = localized && (await relationCacheHash(JSON.stringify(localized), signal));
      checkRelationCancelled(signal);
      await entries.write([
        [
          patternKeyOf(scope),
          JSON.stringify({
            revision,
            rules: relationAssociationRevision,
            source,
            ...(labels && { labels }),
            patterns,
            preparation,
          }),
        ],
        [
          metadataKeyOf(scope),
          JSON.stringify({
            revision,
            rules: relationAssociationRevision,
            source,
            ...(labels && { labels }),
            patternCount: patterns.length,
            ...(preparation && { preparationRevision: preparation.revision }),
          }),
        ],
      ]);
    },
  };
}

export const relationPatternCacheStore = createRelationPatternCacheStore();

const relationCandidateCacheRevision = 'association-candidates-v2';

const observationFields = new Set([
  'noteTitle',
  'section',
  'sectionPath',
  'evidenceId',
  'evidence',
  'source',
  'target',
  'sourceType',
  'targetType',
  'sourceEntityTypes',
  'targetEntityTypes',
  'origin',
  'template',
  'direction',
]);

// Preserve field order because existing evidence identities hash the serialized observation.
const observation = (row: RelationObservation): RelationObservation =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => observationFields.has(key))
  ) as RelationObservation;

/** Retain collection inputs and raw occurrence counts; never retain association evaluations. */
async function saveRelationCandidateInputs(
  prepared: RelationAssociationPreparation,
  sourceText: string,
  signal?: AbortSignal
) {
  const { result } = prepared;
  const extraction = result.entityExtraction;
  const data = {
    result: {
      method: 'association' as const,
      noteCount: result.noteCount,
      entityCount: result.entityCount,
      observationCount: result.observationCount,
      warnings: [],
      associationStats: result.associationStats && {
        contextCount: result.associationStats.contextCount,
        pairCount: result.associationStats.pairCount,
        evidenceCount: result.associationStats.evidenceCount,
      },
      discoveryStats: result.discoveryStats,
      entityExtraction: extraction && {
        status: extraction.status,
        noteCount: extraction.noteCount,
        inputCount: extraction.inputCount,
        mentionCount: extraction.mentionCount,
        entities: extraction.entities.map(({ text, type, key, mentionCount, noteCount }) => ({
          text,
          type,
          key,
          mentionCount,
          noteCount,
        })),
        details: extraction.details,
        enumerations: extraction.enumerations,
        entityTypes: extraction.entityTypes,
      },
      inputPatterns: result.inputPatterns,
      candidates: result.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        template: candidate.template,
        patternTemplate: candidate.patternTemplate,
        variants: candidate.variants,
        noteSupport: candidate.noteSupport,
        pairSupport: candidate.pairSupport,
        recurring: candidate.recurring,
        associationContext: candidate.associationContext,
        associationFamily: candidate.associationFamily,
        associationRoles: candidate.associationRoles,
        observations: candidate.observations.map(observation),
        measurements: [],
      })),
    },
    families: [...prepared.families].map(
      ([key, family]) =>
        [
          key,
          {
            contextCount: family.contextCount,
            marginals: [...family.marginals],
            pairs: [...family.pairs],
          },
        ] as const
    ),
  };
  const json = JSON.stringify(data);
  const digest = await relationCacheHash(json, signal);
  const references = await referenceRelationSource(json, sourceText, signal);
  checkRelationCancelled(signal);
  return { revision: relationCandidateCacheRevision, digest, references };
}

type StoredInputs = Awaited<ReturnType<typeof saveRelationCandidateInputs>>;

const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/** Validate a completed collection before evaluating it, without scanning source contexts again. */
async function restoreRelationCandidateInputs(
  value: unknown,
  sourceText: string,
  signal?: AbortSignal
): Promise<RelationAssociationPreparation | undefined> {
  if (!value || typeof value !== 'object') return;
  const saved = value as StoredInputs;
  if (
    saved.revision !== relationCandidateCacheRevision ||
    !saved.references ||
    typeof saved.digest !== 'string'
  )
    return;
  const json = await restoreRelationSource(saved.references, sourceText, signal);
  if (saved.digest !== (await relationCacheHash(json, signal))) return;
  const data = JSON.parse(json) as {
    result: RelationDiscoveryResult;
    families: [
      string,
      { contextCount: number; marginals: [string, number][]; pairs: [string, number][] }
    ][];
  };
  checkRelationCancelled(signal);
  const { result } = data;
  if (
    !result ||
    !count(result.noteCount) ||
    !count(result.entityCount) ||
    !count(result.observationCount) ||
    !Array.isArray(result.candidates) ||
    !Array.isArray(result.inputPatterns) ||
    result.entityExtraction?.status !== 'completed' ||
    !Array.isArray(result.entityExtraction.entities) ||
    !Array.isArray(data.families)
  )
    return;
  const families: RelationAssociationPreparation['families'] = new Map();
  for (const entry of data.families) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || families.has(entry[0])) return;
    const [key, family] = entry;
    if (
      !family ||
      !count(family.contextCount) ||
      !Array.isArray(family.marginals) ||
      !Array.isArray(family.pairs)
    )
      return;
    const validCounts = (entries: [string, number][]) =>
      entries.every(
        (entry) =>
          Array.isArray(entry) &&
          typeof entry[0] === 'string' &&
          count(entry[1]) &&
          entry[1] <= family.contextCount
      ) && new Set(entries.map(([key]) => key)).size === entries.length;
    if (!validCounts(family.marginals) || !validCounts(family.pairs)) return;
    families.set(key, {
      contextCount: family.contextCount,
      marginals: new Map(family.marginals),
      pairs: new Map(family.pairs),
    });
  }
  for (const candidate of result.candidates) {
    const family = families.get(candidate.associationFamily!);
    if (
      !family ||
      !Object.hasOwn(associationContextLabels, candidate.associationContext!) ||
      !Array.isArray(candidate.observations) ||
      !candidate.observations.length ||
      !Array.isArray(candidate.measurements) ||
      candidate.measurements.length ||
      'association' in candidate
    )
      return;
    for (const row of candidate.observations) {
      if (
        typeof row.source !== 'string' ||
        typeof row.target !== 'string' ||
        typeof row.evidence !== 'string' ||
        typeof row.noteTitle !== 'string'
      )
        return;
      const a = relationKeywordKey(row.source),
        b = relationKeywordKey(row.target);
      const pairs = family.pairs.get(JSON.stringify([a, b].sort()));
      if (
        !pairs ||
        pairs > (family.marginals.get(a) || 0) ||
        pairs > (family.marginals.get(b) || 0)
      )
        return;
    }
  }
  checkRelationCancelled(signal);
  if (result.entityExtraction.details)
    result.entityExtraction.details = Object.assign(
      Object.create(null),
      result.entityExtraction.details
    );
  return { result: result as RelationDiscoveryResult, families };
}
