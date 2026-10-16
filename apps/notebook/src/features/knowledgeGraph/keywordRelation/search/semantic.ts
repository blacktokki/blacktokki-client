import type { GraphSearchCache, SearchDocument } from './types';
import { relationCacheHash } from '../relationCheckpoint';
import { checkRelationCancelled } from '../relationDiscovery';
import type { RelationDiscoveryRuntime } from '../relationDiscovery';
import { createRelationDiscoveryRuntime, RELATION_MODELS } from '../relationModels';
import { yieldGraphSearch } from './snapshot';

const model = `${RELATION_MODELS.embedding}:mean:normalized:search-v1`;
const inputText = (document: SearchDocument) => document.text.slice(0, 384);
const queryVectors = new Map<string, number[]>();
const valid = (vector: unknown): vector is number[] =>
  Array.isArray(vector) &&
  vector.length > 0 &&
  vector.every(Number.isFinite) &&
  vector.some((value) => value !== 0);

/** Persist only SHA-256 text identities and vectors, never source or graph text. */
export async function prepareGraphSearchVectors({
  scope,
  documents,
  cache,
  signal,
  onProgress,
  runtime,
}: {
  scope: string;
  documents: SearchDocument[];
  cache: GraphSearchCache;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
  runtime?: RelationDiscoveryRuntime;
}) {
  const previous = await cache.read<{ model: string; vectors: [string, number[]][] }>(
    scope,
    'vectors'
  );
  const saved = new Map(
    previous?.model === model && Array.isArray(previous.vectors)
      ? previous.vectors.filter(
          (item) => Array.isArray(item) && typeof item[0] === 'string' && valid(item[1])
        )
      : []
  );
  const texts = new Map<string, string>();
  const keys = new Map<string, string>();
  const hashes = new Map<string, Promise<string>>();
  for (let offset = 0; offset < documents.length; offset += 128) {
    checkRelationCancelled(signal);
    const batch = documents.slice(offset, offset + 128);
    const identities = await Promise.all(
      batch.map((document) => {
        const text = inputText(document);
        let pending = hashes.get(text);
        if (!pending) {
          pending = relationCacheHash(JSON.stringify([model, text]));
          hashes.set(text, pending);
        }
        return pending;
      })
    );
    batch.forEach((document, index) => {
      const key = identities[index];
      keys.set(document.id, key);
      texts.set(key, inputText(document));
    });
    await yieldGraphSearch(signal);
  }
  const vectors = new Map<string, number[]>();
  for (const key of texts.keys()) if (saved.has(key)) vectors.set(key, saved.get(key)!);
  let processed = vectors.size;
  onProgress?.(processed, texts.size);
  const pending = [...texts.keys()].filter((key) => !vectors.has(key));
  const inference = runtime || createRelationDiscoveryRuntime(signal);
  let failure: Error | undefined;
  try {
    for (let offset = 0; offset < pending.length; offset += 128) {
      checkRelationCancelled(signal);
      // The runtime sorts this window by token length and forms safe GPU batches of eight.
      const batch = pending.slice(offset, offset + 128);
      const result = (position: number, vector?: number[]) => {
        checkRelationCancelled(signal);
        if (valid(vector)) vectors.set(batch[position], vector);
        else failure = new Error('Semantic search embeddings are unavailable.');
        onProgress?.(++processed, texts.size);
      };
      if (inference.embedMany)
        await inference.embedMany(
          batch.map((key) => texts.get(key)!),
          { onBatch: () => {}, onResult: result }
        );
      else
        for (const [position, key] of batch.entries())
          result(position, await inference.embed(texts.get(key)!));
      if (failure) throw failure;
      await cache.write(scope, 'vectors', { model, vectors: [...vectors] });
      await yieldGraphSearch(signal);
    }
    await cache.write(scope, 'vectors', { model, vectors: [...vectors] });
    checkRelationCancelled(signal);
    return { model, byDocument: new Map([...keys].map(([id, key]) => [id, vectors.get(key)!])) };
  } finally {
    if (!runtime) await inference.dispose?.();
  }
}

type PreparedVectors = Awaited<ReturnType<typeof prepareGraphSearchVectors>>;
type VectorJob = {
  promise: Promise<PreparedVectors>;
  controller: AbortController;
  listeners: Set<(processed: number, total: number) => void>;
  progress?: [number, number];
};
const vectorJobs = new Map<string, VectorJob>();

/** Share one scoped indexing job between background analysis and an open search screen. */
export function ensureGraphSearchVectors({
  scope,
  revision,
  documents,
  cache,
  signal,
  onProgress,
}: {
  scope: string;
  revision: string;
  documents: SearchDocument[];
  cache: GraphSearchCache;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
}): Promise<PreparedVectors> {
  if (signal?.aborted)
    return Promise.reject(
      Object.assign(new Error('Graph search cancelled.'), { name: 'AbortError' })
    );
  const key = JSON.stringify([scope, revision, model]);
  let job = vectorJobs.get(key);
  if (!job) {
    const controller = new AbortController();
    const listeners = new Set<(processed: number, total: number) => void>();
    job = {
      controller,
      listeners,
      promise: prepareGraphSearchVectors({
        scope,
        documents,
        cache,
        signal: controller.signal,
        onProgress: (processed, total) => {
          job!.progress = [processed, total];
          listeners.forEach((listener) => listener(processed, total));
        },
      }),
    };
    vectorJobs.set(key, job);
    const active = job;
    const release = () => {
      if (vectorJobs.get(key) === active) vectorJobs.delete(key);
    };
    active.promise.then(release, release);
  }
  const active = job;
  return new Promise<PreparedVectors>((resolve, reject) => {
    const listener = (processed: number, total: number) => onProgress?.(processed, total);
    active.listeners.add(listener);
    if (active.progress) listener(...active.progress);
    const leave = () => {
      active.listeners.delete(listener);
      signal?.removeEventListener('abort', abort);
      if (!active.listeners.size && vectorJobs.get(key) === active) {
        vectorJobs.delete(key);
        active.controller.abort();
      }
    };
    const abort = () => {
      const cancelled = Object.assign(new Error('Graph search cancelled.'), {
        name: 'AbortError',
      });
      leave();
      reject(cancelled);
    };
    signal?.addEventListener('abort', abort, { once: true });
    active.promise.then(
      (vectors) => {
        if (!signal?.aborted) {
          leave();
          resolve(vectors);
        }
      },
      (error) => {
        if (!signal?.aborted) {
          leave();
          reject(error);
        }
      }
    );
  });
}

export async function graphSemanticScores(
  query: string,
  byDocument: Map<string, number[]>,
  signal?: AbortSignal,
  runtime?: RelationDiscoveryRuntime,
  scope = ''
) {
  const input = query.slice(0, 384);
  const key = await relationCacheHash(JSON.stringify([scope, model, input]));
  checkRelationCancelled(signal);
  let inference = runtime;
  try {
    let queryVector = queryVectors.get(key);
    if (!queryVector) {
      inference ||= createRelationDiscoveryRuntime(signal);
      queryVector = await inference.embed(input);
      if (valid(queryVector)) {
        if (queryVectors.size >= 32) queryVectors.delete(queryVectors.keys().next().value!);
        queryVectors.set(key, queryVector);
      }
    }
    checkRelationCancelled(signal);
    if (!valid(queryVector)) throw new Error('Semantic search embeddings are unavailable.');
    const norm = (vector: number[]) =>
      Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    const queryNorm = norm(queryVector);
    const scores = new Map<string, number>();
    let processed = 0;
    for (const [id, vector] of byDocument) {
      if (++processed % 256 === 0) await yieldGraphSearch(signal);
      if (!valid(vector) || vector.length !== queryVector.length)
        throw new Error('Semantic search index uses incompatible vectors.');
      scores.set(
        id,
        vector.reduce((sum, value, position) => sum + value * queryVector[position], 0) /
          (norm(vector) * queryNorm)
      );
    }
    return scores;
  } finally {
    if (!runtime) await inference?.dispose?.();
  }
}
