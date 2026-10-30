import {
  EMBEDDING_INFERENCE_TIMEOUT,
  EMBEDDING_LOAD_TIMEOUT,
  EmbeddingPipeline,
  EmbeddingWorkerRequest,
  EmbeddingWorkerResponse,
} from '../../types';

/** Keep model loading, tokenization and inference off the scrolling thread. */
export const createEmbeddingPipeline = async (): Promise<EmbeddingPipeline | null> => {
  if (typeof Worker === 'undefined') return null;
  const worker = new Worker(new URL('./embeddingWorker', window.location.href));
  let requestId = 0;
  let stopped = false;
  const pending = new Map<
    number,
    {
      resolve: (data: Float32Array | undefined) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const stop = (error: Error) => {
    stopped = true;
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  worker.onmessage = ({ data: response }: MessageEvent<EmbeddingWorkerResponse>) => {
    const request = pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(response.id);
    if (response.error) request.reject(new Error(response.error));
    else request.resolve(response.data);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    stop(new Error(event.message || 'Embedding worker failed'));
  };
  worker.onmessageerror = () => stop(new Error('Invalid embedding worker response'));
  const send = (request: EmbeddingWorkerRequest, timeout: number) =>
    new Promise<Float32Array | undefined>((resolve, reject) => {
      if (stopped) {
        reject(new Error('Embedding worker stopped'));
        return;
      }
      const timer = setTimeout(() => stop(new Error('Embedding worker timed out')), timeout);
      pending.set(request.id, { resolve, reject, timer });
      try {
        worker.postMessage(request);
      } catch (error) {
        stop(error instanceof Error ? error : new Error(String(error)));
      }
    });
  try {
    await send({ id: ++requestId, type: 'initialize' }, EMBEDDING_LOAD_TIMEOUT);
  } catch (error) {
    stop(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
  const extractor: EmbeddingPipeline = Object.assign(
    async (texts: string[], options: Parameters<EmbeddingPipeline>[1]) => {
      const data = await send(
        { id: ++requestId, type: 'embed', texts, options },
        EMBEDDING_INFERENCE_TIMEOUT
      );
      if (!data) throw new Error('Missing embedding worker output');
      return { data };
    },
    { dispose: async () => stop(new Error('Embedding worker disposed')) }
  );
  return extractor;
};
