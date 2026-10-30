import { env, pipeline } from '@huggingface/transformers';

import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from '../../types';

env.allowLocalModels = false;
const loading = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const workerScope = self as unknown as Pick<Worker, 'onmessage' | 'postMessage'>;

workerScope.onmessage = async ({ data: request }: MessageEvent<EmbeddingWorkerRequest>) => {
  try {
    const extractor = await loading;
    if (request.type === 'initialize') {
      workerScope.postMessage({ id: request.id } satisfies EmbeddingWorkerResponse);
      return;
    }
    const output = await extractor(request.texts, request.options);
    const data = Float32Array.from(output.data as Float32Array);
    workerScope.postMessage({ id: request.id, data } satisfies EmbeddingWorkerResponse, [
      data.buffer,
    ]);
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies EmbeddingWorkerResponse);
  }
};
