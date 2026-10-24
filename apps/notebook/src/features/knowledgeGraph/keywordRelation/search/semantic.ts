import { checkRelationCancelled } from '../keyword/keywordUtils';
import { relationCacheHash } from '../keywordRelationCache';
import { GRAPH_SEARCH_EMBEDDING_CHARS } from '../types';
import type {
  GraphSearchCache,
  GraphSearchVectorCache,
  SearchDocument,
  RelationDiscoveryRuntime,
} from '../types';
import type { SearchDiagnostic } from './diagnostics';
import { createSearchDiagnostic } from './diagnostics';
import { createRelationDiscoveryRuntime, RELATION_MODELS } from './models';
import { yieldGraphSearch } from './snapshot';

const model = `${RELATION_MODELS.embedding}:mean:normalized:search-v1`;
const inputText = (document: SearchDocument) =>
  document.text.slice(0, GRAPH_SEARCH_EMBEDDING_CHARS);
const queryVectors = new Map<string, number[]>();
const valid = (vector: unknown): vector is number[] =>
  Array.isArray(vector) &&
  vector.length > 0 &&
  vector.every(Number.isFinite) &&
  vector.some((value) => value !== 0);

function completedGraphVectors(
  saved: GraphSearchVectorCache | undefined,
  identity: { revision?: string; inputRevision?: string; count?: number }
) {
  const graph = saved?.graph;
  if (
    saved?.model !== model ||
    graph?.version !== 1 ||
    typeof graph.revision !== 'string' ||
    (!identity.revision && !identity.inputRevision) ||
    (identity.revision !== undefined && identity.revision !== graph.revision) ||
    (identity.inputRevision !== undefined && identity.inputRevision !== graph.inputRevision) ||
    !Array.isArray(graph.documents) ||
    graph.documentCount !== graph.documents.length ||
    (identity.count !== undefined && identity.count !== graph.documents.length) ||
    !Array.isArray(saved.vectors)
  )
    return;
  const vectors = new Map(
    saved.vectors.filter(
      (item) => Array.isArray(item) && typeof item[0] === 'string' && valid(item[1])
    )
  );
  let dimension: number | undefined;
  for (const key of graph.documents) {
    const vector = vectors.get(key);
    if (!vector || (dimension !== undefined && vector.length !== dimension)) return;
    dimension = vector.length;
  }
  return { graph, vectors, total: new Set(graph.documents).size };
}

/** Check completed vector coverage without rebuilding the graph or loading a model. */
export async function restoreGraphSearchEmbeddingCache({
  scope,
  inputRevision,
  cache,
  signal,
  diagnostic,
}: {
  scope: string;
  inputRevision: string;
  cache: GraphSearchCache;
  signal?: AbortSignal;
  diagnostic?: SearchDiagnostic;
}) {
  checkRelationCancelled(signal);
  const read = () => cache.read<GraphSearchVectorCache>(scope, 'vectors', diagnostic?.record);
  const previous = await (diagnostic ? diagnostic.measure('캐시읽기', read) : read());
  checkRelationCancelled(signal);
  const validate = () => completedGraphVectors(previous, { inputRevision });
  const restored = diagnostic ? diagnostic.sync('캐시검증', validate) : validate();
  if (restored) return { revision: restored.graph.revision, total: restored.total };
}

/** Persist only hashed identities, document-to-vector positions and vectors, never graph text. */
async function prepareGraphSearchVectors({
  scope,
  revision,
  inputRevision,
  documents,
  cache,
  signal,
  onProgress,
  runtime,
}: {
  scope: string;
  revision?: string;
  inputRevision?: string;
  documents: SearchDocument[];
  cache: GraphSearchCache;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
  runtime?: RelationDiscoveryRuntime;
}) {
  checkRelationCancelled(signal);
  const previous = await cache.read<GraphSearchVectorCache>(scope, 'vectors');
  checkRelationCancelled(signal);
  const restored = completedGraphVectors(previous, { revision, count: documents.length });
  if (restored) {
    if (inputRevision && inputRevision !== restored.graph.inputRevision) {
      await cache.write(scope, 'vectors', {
        ...previous,
        graph: { ...restored.graph, inputRevision },
      });
      checkRelationCancelled(signal);
    }
    return {
      model,
      total: restored.total,
      byDocument: new Map(
        documents.map((document, index) => [
          document.id,
          restored.vectors.get(restored.graph.documents[index])!,
        ])
      ),
    };
  }
  const saved = new Map(
    previous?.model === model && Array.isArray(previous.vectors)
      ? previous.vectors.filter(
          (item) => Array.isArray(item) && typeof item[0] === 'string' && valid(item[1])
        )
      : []
  );
  if (new Set([...saved.values()].map((vector) => vector.length)).size > 1) saved.clear();
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
  const pending = [...texts.keys()].filter((key) => !vectors.has(key));
  if (pending.length) onProgress?.(processed, texts.size);
  let inference = runtime;
  let failure: Error | undefined;
  try {
    for (let offset = 0; offset < pending.length; offset += 128) {
      checkRelationCancelled(signal);
      inference ||= createRelationDiscoveryRuntime(signal);
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
          { onResult: result }
        );
      else
        for (const [position, key] of batch.entries())
          result(position, await inference.embed(texts.get(key)!));
      if (failure) throw failure;
      await cache.write(scope, 'vectors', { model, vectors: [...vectors] });
      await yieldGraphSearch(signal);
    }
    checkRelationCancelled(signal);
    await cache.write(scope, 'vectors', {
      model,
      vectors: [...vectors],
      ...(revision && {
        graph: {
          version: 1,
          revision,
          documentCount: documents.length,
          ...(inputRevision && { inputRevision }),
          documents: documents.map((document) => keys.get(document.id)!),
        },
      }),
    });
    checkRelationCancelled(signal);
    return {
      model,
      total: texts.size,
      byDocument: new Map([...keys].map(([id, key]) => [id, vectors.get(key)!])),
    };
  } finally {
    if (!runtime) await inference?.dispose?.();
  }
}

/** Retain one lazily loaded model for this search session and serialize successive queries. */
export function createGraphSearchSession(scope: string) {
  const controller = new AbortController();
  let inference: RelationDiscoveryRuntime | undefined;
  let pending = Promise.resolve();
  let disposal: Promise<void> | undefined;
  let warmed = false;
  let initialized = false;
  const diagnostic = createSearchDiagnostic(undefined, {});
  let scored:
    | { query: string; documents: Map<string, number[]>; scores: Map<string, number> }
    | undefined;
  const getInference = () => (inference ||= createRelationDiscoveryRuntime(controller.signal));
  const runtime: RelationDiscoveryRuntime = {
    embed: (text) => getInference().embed(text),
    embedMany: async (texts, options) => {
      const current = getInference();
      if (current.embedMany) return current.embedMany(texts, options);
      for (const [index, text] of texts.entries()) {
        checkRelationCancelled(controller.signal);
        options.onResult(index, await current.embed(text));
      }
    },
  };
  const run = <T>(
    signal: AbortSignal | undefined,
    operation: (runtime: RelationDiscoveryRuntime) => Promise<T>
  ) => {
    const task = pending.then(async () => {
      checkRelationCancelled(controller.signal);
      checkRelationCancelled(signal);
      try {
        const value = await operation(runtime);
        checkRelationCancelled(controller.signal);
        return value;
      } catch (error) {
        if (!controller.signal.aborted && !signal?.aborted) {
          const failed = inference;
          inference = undefined;
          warmed = false;
          initialized = false;
          await Promise.resolve(failed?.dispose?.()).catch(() => undefined);
        }
        throw error;
      }
    });
    pending = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  };
  return {
    initialize: (signal?: AbortSignal) =>
      run(signal, async () => {
        if (initialized) return;
        await diagnostic.measure('모델파일준비', () => getInference().prepare?.());
        initialized = true;
      }),
    timing: () => diagnostic.readTiming(),
    warmup: (text: string, signal?: AbortSignal) =>
      run(signal, async (runtime) => {
        if (warmed) return;
        const vector = await diagnostic.measure('모델첫추론', () =>
          runtime.embed(text.slice(0, GRAPH_SEARCH_EMBEDDING_CHARS))
        );
        if (!valid(vector)) throw new Error('Semantic search embeddings are unavailable.');
        checkRelationCancelled(signal);
        warmed = true;
      }),
    scores: (query: string, documents: Map<string, number[]>, signal?: AbortSignal) =>
      run(signal, async (runtime) => {
        if (scored?.query === query && scored.documents === documents) return scored.scores;
        const scores = await graphSemanticScores(query, documents, signal, runtime, scope);
        checkRelationCancelled(controller.signal);
        checkRelationCancelled(signal);
        scored = { query, documents, scores };
        return scores;
      }),
    vectors: (
      options: Omit<Parameters<typeof prepareGraphSearchVectors>[0], 'scope' | 'runtime'> & {
        revision: string;
      }
    ) =>
      run(options.signal, (runtime) => prepareGraphSearchVectors({ ...options, scope, runtime })),
    dispose: () => {
      controller.abort();
      scored = undefined;
      return (disposal ||= pending.then(() => inference?.dispose?.()));
    },
  };
}

async function graphSemanticScores(
  query: string,
  byDocument: Map<string, number[]>,
  signal?: AbortSignal,
  runtime?: RelationDiscoveryRuntime,
  scope = ''
) {
  const input = query.slice(0, GRAPH_SEARCH_EMBEDDING_CHARS);
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
      if (!Array.isArray(vector) || vector.length !== queryVector.length)
        throw new Error('Semantic search index uses incompatible vectors.');
      let product = 0;
      let magnitude = 0;
      let nonzero = false;
      for (let position = 0; position < vector.length; position++) {
        const value = vector[position];
        if (!Number.isFinite(value))
          throw new Error('Semantic search index uses incompatible vectors.');
        nonzero ||= value !== 0;
        product += value * queryVector[position];
        magnitude += value * value;
      }
      if (!nonzero) throw new Error('Semantic search index uses incompatible vectors.');
      scores.set(id, product / (Math.sqrt(magnitude) * queryNorm));
    }
    return scores;
  } finally {
    if (!runtime) await inference?.dispose?.();
  }
}
