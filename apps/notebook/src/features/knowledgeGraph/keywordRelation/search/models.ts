import { checkRelationCancelled, createRelationCancellationError } from '../keyword/keywordUtils';
import type { RelationDiscoveryRuntime } from '../types';

export const RELATION_MODELS = {
  embedding: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
};

const EMBEDDING_DTYPES = { webgpu: 'fp16', cpu: 'q8' } as const;
const EMBEDDING_BATCH_SIZE = 8;
const EMBEDDING_BATCH_TOKENS = 512;

const library = async () => {
  const loaded = await import('@huggingface/transformers');
  const wasm = loaded.env.backends.onnx.wasm;
  if (wasm) {
    wasm.numThreads = 1;
    wasm.proxy = false;
  }
  return loaded;
};

const modelLoadError = (cause: unknown) =>
  Object.assign(new Error(cause instanceof Error ? cause.message : String(cause)), {
    name: 'RelationModelLoadError',
  });

/** Use fp16 on compatible GPUs and q8 for direct CPU execution. */
async function modelOptions(forceCpu: boolean) {
  let backend: 'webgpu' | 'wasm' = 'wasm';
  if (!forceCpu && typeof navigator !== 'undefined') {
    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter: () => Promise<{
            features?: { has: (feature: string) => boolean };
          } | null>;
        };
      }
    ).gpu;
    try {
      const adapter = await gpu?.requestAdapter();
      if (adapter?.features?.has('shader-f16')) backend = 'webgpu';
    } catch {}
  }
  const dtype = EMBEDDING_DTYPES[backend === 'webgpu' ? 'webgpu' : 'cpu'];
  return {
    dtype,
    ...(backend === 'webgpu' || typeof document !== 'undefined' ? { device: backend } : {}),
  };
}

type Disposable = { dispose: () => Promise<void> };
type EmbeddingPipeline = Disposable & {
  tokenizer: (text: string, options: { truncation: boolean }) => { input_ids: { dims: number[] } };
} & ((
    text: string | string[],
    options: { pooling: string; normalize: boolean }
  ) => Promise<{ data: ArrayLike<number>; dims: number[] }>);
/** Validate pooled output once for both individual inputs and GPU batches. */
function embeddingVectors(output: Awaited<ReturnType<EmbeddingPipeline>>, count: number) {
  const data = Array.from(output.data);
  const shape = output.dims || [1, data.length];
  const width = shape[1];
  if (
    shape.length !== 2 ||
    shape[0] !== count ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    data.length !== count * width ||
    !data.every(Number.isFinite)
  )
    throw new Error(
      count === 1
        ? 'Embedding model returned an invalid vector.'
        : 'Embedding model returned an invalid batch tensor.'
    );
  return count === 1
    ? [data]
    : Array.from({ length: count }, (_, index) => data.slice(index * width, (index + 1) * width));
}

/** 검색용 임베딩만 지연 로딩하고 중단 이후의 결과를 폐기한다. */
export function createRelationDiscoveryRuntime(signal?: AbortSignal): RelationDiscoveryRuntime {
  let embedding: Promise<EmbeddingPipeline> | undefined;
  let disposed = false;
  let forceCpu = false;
  let backend: 'webgpu' | 'wasm' = 'wasm';
  const checkActive = () => {
    checkRelationCancelled(signal);
    if (disposed) throw createRelationCancellationError();
  };
  const load = async () => {
    try {
      checkActive();
      const { pipeline } = await library();
      checkActive();
      const options = await modelOptions(forceCpu);
      checkActive();
      backend = options.device || 'wasm';
      const model = (await pipeline(
        'feature-extraction',
        RELATION_MODELS.embedding,
        options
      )) as unknown as EmbeddingPipeline;
      if (disposed || signal?.aborted) {
        await model.dispose();
        checkActive();
      }
      return model;
    } catch (error) {
      checkActive();
      throw modelLoadError(error);
    }
  };
  const release = async () => {
    const model = embedding;
    embedding = undefined;
    await (await model?.catch(() => undefined))?.dispose();
  };
  const infer = async <T>(operation: () => Promise<T>): Promise<T> => {
    checkActive();
    try {
      return await operation();
    } catch (error) {
      checkActive();
      if (backend !== 'webgpu') throw error;
      forceCpu = true;
      await release();
      checkActive();
      return operation();
    }
  };
  const embeddingModel = async () => {
    const model = await (embedding ||= load());
    checkActive();
    return model;
  };
  const embed = (text: string) =>
    infer(async () => {
      const model = await embeddingModel();
      const output = await model(text, { pooling: 'mean', normalize: true });
      checkActive();
      return embeddingVectors(output, 1)[0];
    });
  return {
    prepare: () =>
      infer(async () => {
        await embeddingModel();
      }),
    dispose: async () => {
      disposed = true;
      await release();
    },
    embed,
    embedMany: async (texts, { onResult }) => {
      checkActive();
      if (!texts.length) return;
      let model: EmbeddingPipeline;
      try {
        model = await infer(embeddingModel);
      } catch {
        checkActive();
        texts.forEach((_, index) => {
          checkActive();
          onResult(index);
        });
        return;
      }
      const entries = texts.map((text, index) => ({ text, index, tokens: 0 }));
      let lastYield = Date.now();
      const yieldToEvents = async () => {
        if (backend === 'webgpu' && Date.now() - lastYield >= 16) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          lastYield = Date.now();
        }
      };
      if (backend === 'webgpu') {
        for (const entry of entries) {
          checkActive();
          try {
            entry.tokens = model.tokenizer(entry.text, { truncation: true }).input_ids.dims.at(-1)!;
          } catch {
            entry.tokens = EMBEDDING_BATCH_TOKENS;
          }
          if ((entry.index + 1) % 128 === 0) await yieldToEvents();
        }
        entries.sort((a, b) => a.tokens - b.tokens || a.index - b.index);
      }
      const runBatch = async (batch: typeof entries): Promise<void> => {
        checkActive();
        if (backend !== 'webgpu' || batch.length === 1) {
          for (const entry of batch) {
            let vector: number[] | undefined;
            try {
              vector = await embed(entry.text);
            } catch {
              checkActive();
            }
            onResult(entry.index, vector);
            await yieldToEvents();
          }
          return;
        }
        let vectors: number[][];
        try {
          const current = await embeddingModel();
          const output = await current(
            batch.map((entry) => entry.text),
            {
              pooling: 'mean',
              normalize: true,
            }
          );
          checkActive();
          vectors = embeddingVectors(output, batch.length);
        } catch {
          checkActive();
          // Batch failures can be memory pressure; try smaller GPU batches before CPU fallback.
          const middle = Math.ceil(batch.length / 2);
          await runBatch(batch.slice(0, middle));
          await yieldToEvents();
          await runBatch(batch.slice(middle));
          return;
        }
        batch.forEach((entry, index) => {
          checkActive();
          onResult(entry.index, vectors[index]);
        });
      };
      for (let offset = 0; offset < entries.length; ) {
        const batch = [entries[offset++]];
        // Bound padded tokens as well as row count to keep long inputs in smaller batches.
        while (
          backend === 'webgpu' &&
          offset < entries.length &&
          batch.length < EMBEDDING_BATCH_SIZE &&
          entries[offset].tokens * (batch.length + 1) <= EMBEDDING_BATCH_TOKENS
        )
          batch.push(entries[offset++]);
        await runBatch(batch);
        await yieldToEvents();
      }
    },
  };
}
