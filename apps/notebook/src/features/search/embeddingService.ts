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
        const { pipeline, env } = await import('@xenova/transformers');
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

// Main function to get embedding vector for a given text
export const getEmbeddingVector = async (text: string): Promise<number[]> => {
  if (!text || text.trim().length === 0) {
    return new Array(VECTOR_DIMENSION).fill(0);
  }

  try {
    const extractor = await initEmbeddingPipeline();
    if (extractor) {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      if (output && output.data) {
        return Array.from(output.data).slice(0, VECTOR_DIMENSION) as number[];
      }
    }
  } catch (e) {
    console.warn('Fallback to lightweight vectorizer for text:', text.substring(0, 30), e);
  }

  return generateLightweightVector(text, VECTOR_DIMENSION);
};
