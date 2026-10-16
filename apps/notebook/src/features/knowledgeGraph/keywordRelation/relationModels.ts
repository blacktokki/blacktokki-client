import type { EntailmentScores, RelationDiscoveryRuntime } from './relationDiscovery';

export const RELATION_MODELS = {
  embedding: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  nli: 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7',
};

export const RELATION_MODEL_DTYPES = {
  embedding: { webgpu: 'fp16', cpu: 'q8' },
  nli: { webgpu: 'fp16', cpu: 'q8' },
} as const;
const EMBEDDING_BATCH_SIZE = 8;
const EMBEDDING_BATCH_TOKENS = 512;
type RelationModelStage = keyof typeof RELATION_MODELS;

export type RelationModelProgress = {
  stage: 'embedding' | 'nli';
  status: string;
  file?: string;
  progress?: number;
  backend?: 'webgpu' | 'wasm';
  dtype?: 'fp32' | 'fp16' | 'q8';
  error?: string;
};
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
async function modelOptions(
  stage: RelationModelStage,
  progress: (progress: RelationModelProgress) => void,
  forceCpu: boolean,
  fallbackReason?: string
) {
  let backend: 'webgpu' | 'wasm' = 'wasm';
  let reason = fallbackReason;
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
      else if (adapter) reason = 'GPU does not support shader-f16; using the CPU q8 model.';
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
  }
  const dtype = RELATION_MODEL_DTYPES[stage][backend === 'webgpu' ? 'webgpu' : 'cpu'];
  progress({ stage, status: 'backend', backend, dtype, error: reason });
  return {
    dtype,
    ...(backend === 'webgpu' || typeof document !== 'undefined' ? { device: backend } : {}),
    progress_callback: (update: Omit<RelationModelProgress, 'stage'>) =>
      progress({ ...update, stage, backend, dtype }),
  };
}

type Disposable = { dispose: () => Promise<void> };
type EmbeddingPipeline = Disposable & {
  tokenizer: (text: string, options: { truncation: boolean }) => { input_ids: { dims: number[] } };
} & ((
    text: string | string[],
    options: { pooling: string; normalize: boolean }
  ) => Promise<{ data: ArrayLike<number>; dims: number[] }>);
type NliPipeline = Disposable & {
  tokenizer: (
    text: string,
    options: { text_pair: string; truncation: boolean }
  ) => Record<string, unknown>;
  model: ((input: Record<string, unknown>) => Promise<{ logits: { data: ArrayLike<number> } }>) & {
    config: { id2label: Record<string, string>; max_position_embeddings?: number };
  };
};

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

/** Read the model label map instead of assuming a fixed label order or dropping neutral. */
export function relationNliScores(
  logits: ArrayLike<number>,
  labels: Record<string, string>
): EntailmentScores {
  const values = Array.from(logits);
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  const scores: Partial<EntailmentScores> = {};
  Object.entries(labels).forEach(([index, label]) => {
    const name = label.toLowerCase();
    if (name === 'entailment' || name === 'neutral' || name === 'contradiction')
      scores[name] = exponentials[Number(index)] / total;
  });
  if (Object.values(scores).length !== 3 || !Object.values(scores).every(Number.isFinite))
    throw new Error('The NLI model must expose entailment, neutral and contradiction labels.');
  return scores as EntailmentScores;
}

/** Load models lazily in this runtime and discard results after cancellation. */
export function createRelationDiscoveryRuntime(
  signal?: AbortSignal,
  onProgress?: (progress: RelationModelProgress) => void
): RelationDiscoveryRuntime {
  let embedding: Promise<EmbeddingPipeline> | undefined;
  let nli: Promise<NliPipeline> | undefined;
  let disposed = false;
  const cpuStages = new Map<RelationModelStage, string>();
  const backends: Record<RelationModelStage, 'webgpu' | 'wasm'> = {
    embedding: 'wasm',
    nli: 'wasm',
  };
  const checkActive = () => {
    if (disposed || signal?.aborted)
      throw Object.assign(new Error('Relation discovery cancelled.'), { name: 'AbortError' });
  };
  const report = (progress: RelationModelProgress) => {
    if (!disposed && !signal?.aborted) onProgress?.(progress);
  };
  const load = async (stage: RelationModelStage) => {
    try {
      checkActive();
      const { pipeline } = await library();
      checkActive();
      const options = await modelOptions(stage, report, cpuStages.has(stage), cpuStages.get(stage));
      checkActive();
      backends[stage] = options.device || 'wasm';
      const model = (await pipeline(
        stage === 'embedding' ? 'feature-extraction' : 'text-classification',
        RELATION_MODELS[stage],
        options
      )) as unknown as EmbeddingPipeline | NliPipeline;
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
  const release = async (stage: RelationModelStage) => {
    const model = stage === 'embedding' ? embedding : nli;
    if (stage === 'embedding') embedding = undefined;
    else nli = undefined;
    await (await model?.catch(() => undefined))?.dispose();
  };
  const infer = async <T>(stage: RelationModelStage, operation: () => Promise<T>): Promise<T> => {
    checkActive();
    try {
      return await operation();
    } catch (error) {
      checkActive();
      if (
        backends[stage] !== 'webgpu' ||
        (error instanceof Error && error.name === 'RelationContextTooLongError')
      )
        throw error;
      cpuStages.set(stage, error instanceof Error ? error.message : String(error));
      await release(stage);
      checkActive();
      return operation();
    }
  };
  const embeddingModel = async () => {
    const model = await (embedding ||= load('embedding') as Promise<EmbeddingPipeline>);
    checkActive();
    return model;
  };
  const embed = (text: string, onCall?: () => void) =>
    infer('embedding', async () => {
      const model = await embeddingModel();
      onCall?.();
      const output = await model(text, { pooling: 'mean', normalize: true });
      checkActive();
      return embeddingVectors(output, 1)[0];
    });
  return {
    release,
    dispose: async () => {
      disposed = true;
      for (const stage of ['embedding', 'nli'] as const) await release(stage);
    },
    embed,
    embedMany: async (texts, { onBatch, onResult }) => {
      checkActive();
      if (!texts.length) return;
      let model: EmbeddingPipeline;
      try {
        model = await infer('embedding', embeddingModel);
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
        if (backends.embedding === 'webgpu' && Date.now() - lastYield >= 16) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          lastYield = Date.now();
        }
      };
      if (backends.embedding === 'webgpu') {
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
        if (backends.embedding !== 'webgpu' || batch.length === 1) {
          for (const entry of batch) {
            let vector: number[] | undefined;
            try {
              vector = await embed(entry.text, () => onBatch([entry.index]));
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
          onBatch(batch.map((entry) => entry.index));
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
          backends.embedding === 'webgpu' &&
          offset < entries.length &&
          batch.length < EMBEDDING_BATCH_SIZE &&
          entries[offset].tokens * (batch.length + 1) <= EMBEDDING_BATCH_TOKENS
        )
          batch.push(entries[offset++]);
        await runBatch(batch);
        await yieldToEvents();
      }
    },
    entailment: (premise, hypothesis) =>
      infer('nli', async () => {
        const model = await (nli ||= load('nli') as Promise<NliPipeline>);
        checkActive();
        const inputs = model.tokenizer(premise, { text_pair: hypothesis, truncation: false });
        const ids = inputs.input_ids as { dims: number[] };
        const tokens = ids.dims.at(-1)!;
        const limit = model.model.config.max_position_embeddings || 512;
        if (tokens > limit)
          throw Object.assign(
            new Error('NLI input has ' + tokens + ' tokens; model limit is ' + limit + '.'),
            { name: 'RelationContextTooLongError' }
          );
        const output = await model.model(inputs);
        checkActive();
        return relationNliScores(output.logits.data, model.model.config.id2label);
      }),
  };
}
