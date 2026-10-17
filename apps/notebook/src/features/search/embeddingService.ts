export const VECTOR_DIMENSION = 384;

let pipelinePromise: Promise<any> | null = null;
let pipelineInstance: any = null;

// Fast N-gram & DJB2 feature hashing vectorizer for Korean/English text
export const generateLightweightVector = (
  text: string,
  dim: number = VECTOR_DIMENSION
): number[] => {
  const vector = new Array(dim).fill(0);
  if (!text) return vector;

  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/[\s,./?!:;()[\]{}'"]+/).filter(Boolean);

  // Word level feature hash
  for (const word of words) {
    let hash = 5381;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) + hash + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vector[idx] += 2.0;
  }

  // Bi-gram level feature hash for CJK / subwords
  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.substring(i, i + 2);
    let hash = 0;
    for (let j = 0; j < bigram.length; j++) {
      hash = (hash << 5) - hash + bigram.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vector[idx] += 1.0;
  }

  // L2 Normalize
  let normSum = 0;
  for (let i = 0; i < dim; i++) {
    normSum += vector[i] * vector[i];
  }
  const norm = Math.sqrt(normSum);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] = vector[i] / norm;
    }
  }

  return vector;
};

// Initialize Transformers.js pipeline asynchronously
export const initEmbeddingPipeline = async () => {
  if (pipelineInstance) return pipelineInstance;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        pipelineInstance = extractor;
        return extractor;
      } catch (e) {
        console.warn('Transformers.js pipeline initialization skipped/fallback:', e);
        return null;
      }
    })();
  }
  return await pipelinePromise;
};

let embeddingQueue: Promise<unknown> = Promise.resolve();

/** Cancel a consumer's wait without starting another inference while the current one is running. */
export const waitForEmbeddingWork = <T>(work: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return work;
  const cancelled = () =>
    Object.assign(new Error('Embedding preparation cancelled'), { name: 'AbortError' });
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
};

/** Bound inference batches and serialize model calls to avoid competing inference sessions. */
export const getEmbeddingVectors = (texts: string[], signal?: AbortSignal): Promise<number[][]> => {
  if (!texts.length) return Promise.resolve([]);
  const task = embeddingQueue.then(async () => {
    signal?.throwIfAborted();
    const extractor = await waitForEmbeddingWork(initEmbeddingPipeline(), signal);
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 8) {
      if (offset) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      const batch = texts.slice(offset, offset + 8);
      try {
        if (extractor) {
          const output = await extractor(batch, { pooling: 'mean', normalize: true });
          signal?.throwIfAborted();
          if (output?.data?.length !== batch.length * VECTOR_DIMENSION) {
            throw new Error('Unexpected embedding dimensions');
          }
          for (let row = 0; row < batch.length; row++) {
            vectors.push(
              Array.from(output.data.slice(row * VECTOR_DIMENSION, (row + 1) * VECTOR_DIMENSION))
            );
          }
          continue;
        }
      } catch (e) {
        if (signal?.aborted) throw e;
        console.warn('Fallback to lightweight vectorizer for embedding batch:', e);
        if (extractor && batch.length > 1) {
          for (const text of batch) {
            signal?.throwIfAborted();
            try {
              const output = await extractor([text], { pooling: 'mean', normalize: true });
              if (output?.data?.length !== VECTOR_DIMENSION)
                throw new Error('Unexpected embedding dimensions');
              vectors.push(Array.from(output.data));
            } catch {
              vectors.push(generateLightweightVector(text, VECTOR_DIMENSION));
            }
          }
          continue;
        }
      }
      vectors.push(...batch.map((text) => generateLightweightVector(text, VECTOR_DIMENSION)));
    }
    return vectors;
  });
  embeddingQueue = task.catch(() => undefined);
  return waitForEmbeddingWork(task, signal);
};

export const getEmbeddingVector = async (text: string, signal?: AbortSignal): Promise<number[]> => {
  if (!text || text.trim().length === 0) return new Array(VECTOR_DIMENSION).fill(0);
  return (await getEmbeddingVectors([text], signal))[0];
};
