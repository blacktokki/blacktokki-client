import type { EmbeddingPipeline } from '../../types';

/** Native runtimes use lightweight vectors without loading the browser's WASM runtime. */
export const createEmbeddingPipeline = (): Promise<EmbeddingPipeline | null> =>
  Promise.resolve(null);
