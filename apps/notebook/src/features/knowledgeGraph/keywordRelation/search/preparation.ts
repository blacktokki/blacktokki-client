import { createSearchDiagnostic } from './diagnostics';
import type { SearchDiagnostic } from './diagnostics';
import { createGraphSearchIndex } from './engine';
import type { GraphSearchIndex } from './engine';
import { createGraphSearchSession } from './semantic';
import { createGraphSearchSnapshot, graphSearchInputRevision } from './snapshot';
import { checkRelationCancelled } from '../keyword/keywordUtils';
import type { GraphSearchCache, GraphSearchCacheReadTiming } from '../types';

type Progress = (processed: number, total: number, stage?: 'snapshot' | 'index') => void;
type Job<T> = {
  key: string;
  controller: AbortController;
  promise: Promise<T>;
  listeners: Set<Progress>;
  progress?: Parameters<Progress>;
  complete: boolean;
  failed: boolean;
  timing?: GraphSearchCacheReadTiming;
};
type Session = ReturnType<typeof createGraphSearchSession>;
type VectorOptions = Parameters<Session['vectors']>[0];
type ScopePreparation = {
  owners: number;
  session: Session;
  caches: WeakMap<GraphSearchCache, GraphSearchCache>;
  revisions: WeakMap<object, Job<string>>;
  index?: Job<GraphSearchIndex>;
  vectors?: Job<Awaited<ReturnType<Session['vectors']>>>;
};
const scopes = new Map<string, ScopePreparation>();

/** Share one payload across cache checks and concurrent search/background consumers. */
function sharedCache(shared: ScopePreparation, source: GraphSearchCache) {
  let cache = shared.caches.get(source);
  if (!cache) {
    const reads = new Map<
      string,
      { promise: Promise<unknown>; timing?: GraphSearchCacheReadTiming }
    >();
    cache = {
      read: <T>(scope: string, key: string, onRead?: Parameters<GraphSearchCache['read']>[2]) => {
        const id = JSON.stringify([scope, key]);
        const reused = reads.has(id);
        if (!reused) {
          const entry: { promise: Promise<unknown>; timing?: GraphSearchCacheReadTiming } = {
            promise: Promise.resolve(undefined),
          };
          entry.promise = source
            .read(scope, key, (timing) => {
              entry.timing = timing;
            })
            .catch((error) => {
              if (reads.get(id) === entry) reads.delete(id);
              throw error;
            });
          reads.set(id, entry);
        }
        const entry = reads.get(id)!;
        return entry.promise.then((value) => {
          if (entry.timing) onRead?.({ ...entry.timing, reused });
          return value as T | undefined;
        });
      },
      write: async (scope, key, value) => {
        const id = JSON.stringify([scope, key]);
        reads.delete(id);
        try {
          await source.write(scope, key, value);
        } finally {
          reads.delete(id);
        }
      },
    };
    shared.caches.set(source, cache);
    shared.caches.set(cache, cache);
  }
  return cache;
}

function start<T>(
  key: string,
  operation: (signal: AbortSignal, onProgress: Progress) => Promise<T>
): Job<T> {
  const controller = new AbortController();
  const listeners = new Set<Progress>();
  const job: Job<T> = {
    key,
    controller,
    listeners,
    complete: false,
    failed: false,
    promise: Promise.resolve().then(() =>
      operation(controller.signal, (processed, total, stage) => {
        job.progress = [processed, total, stage];
        listeners.forEach((listener) => listener(processed, total, stage));
      })
    ),
  };
  job.promise.then(
    () => (job.complete = true),
    () => {
      job.complete = true;
      job.failed = true;
    }
  );
  return job;
}

/** One observer can leave without cancelling work still needed by another observer. */
function observe<T>(job: Job<T>, signals: (AbortSignal | undefined)[], onProgress?: Progress) {
  return new Promise<T>((resolve, reject) => {
    const listener: Progress = (processed, total, stage) => onProgress?.(processed, total, stage);
    const leave = () => {
      job.listeners.delete(listener);
      for (const signal of signals) signal?.removeEventListener('abort', abort);
      if (!job.complete && !job.listeners.size) job.controller.abort();
    };
    const abort = () => {
      leave();
      reject(Object.assign(new Error('Graph search cancelled.'), { name: 'AbortError' }));
    };
    if (signals.some((signal) => signal?.aborted)) {
      abort();
      return;
    }
    job.listeners.add(listener);
    for (const signal of signals) signal?.addEventListener('abort', abort, { once: true });
    if (job.progress) listener(...job.progress);
    job.promise.then(
      (value) => {
        if (signals.some((signal) => signal?.aborted)) return;
        leave();
        resolve(value);
      },
      (error: unknown) => {
        if (signals.some((signal) => signal?.aborted)) return;
        leave();
        reject(error);
      }
    );
  });
}

/** Hand analysis preparation to search in memory; release text, vectors and model with the last owner. */
export function acquireGraphSearchPreparation(scope: string) {
  let prepared = scopes.get(scope);
  if (!prepared) {
    prepared = {
      owners: 0,
      session: createGraphSearchSession(scope),
      caches: new WeakMap(),
      revisions: new WeakMap(),
    };
    scopes.set(scope, prepared);
  }
  const shared = prepared;
  shared.owners++;
  const owner = new AbortController();
  let disposal: Promise<void> | undefined;
  return {
    revision: (input: Parameters<typeof createGraphSearchSnapshot>[0], signal?: AbortSignal) => {
      checkRelationCancelled(owner.signal);
      checkRelationCancelled(signal);
      if (input.scope !== scope) throw new Error('Graph search preparation scope mismatch.');
      let job = shared.revisions.get(input);
      if (!job || job.failed || job.controller.signal.aborted) {
        job = start('revision', (signal) => graphSearchInputRevision({ ...input, signal }));
        shared.revisions.set(input, job);
      }
      return observe(job, [owner.signal, signal]);
    },
    cache: (source: GraphSearchCache) => {
      checkRelationCancelled(owner.signal);
      return sharedCache(shared, source);
    },
    index: (
      input: Parameters<typeof createGraphSearchSnapshot>[0],
      inputRevision: string,
      signal?: AbortSignal,
      onProgress?: Progress,
      diagnostic?: SearchDiagnostic
    ) => {
      checkRelationCancelled(owner.signal);
      checkRelationCancelled(signal);
      if (input.scope !== scope) throw new Error('Graph search preparation scope mismatch.');
      let job = shared.index;
      if (job?.key !== inputRevision || job.controller.signal.aborted || job.failed) {
        job = start(inputRevision, async (signal, progress) => {
          const metrics = createSearchDiagnostic(undefined, {});
          const snapshot = await metrics.measure('검색자료구성', () =>
            createGraphSearchSnapshot({
              ...input,
              signal,
              onProgress: (processed, total) => progress(processed, total, 'snapshot'),
            })
          );
          const index = await metrics.measure('검색색인구성', () =>
            createGraphSearchIndex(snapshot, signal, (processed, total) =>
              progress(processed, total, 'index')
            )
          );
          metrics.finish('완료');
          job!.timing = metrics.readTiming();
          return index;
        });
        shared.index = job;
      }
      const current = job;
      return observe(job, [owner.signal, signal], onProgress).then((index) => {
        if (current.timing) diagnostic?.record(current.timing);
        return index;
      });
    },
    vectors: (options: VectorOptions) => {
      checkRelationCancelled(owner.signal);
      checkRelationCancelled(options.signal);
      const key = JSON.stringify([options.revision, options.inputRevision]);
      let job = shared.vectors;
      if (job?.key !== key || job.controller.signal.aborted || job.failed) {
        job = start(key, (signal, onProgress) =>
          shared.session.vectors({
            ...options,
            cache: sharedCache(shared, options.cache),
            signal,
            onProgress,
          })
        );
        shared.vectors = job;
      }
      return observe(job, [owner.signal, options.signal], options.onProgress);
    },
    scores: (query: string, vectors: Map<string, number[]>, signal?: AbortSignal) => {
      checkRelationCancelled(owner.signal);
      return shared.session.scores(query, vectors, signal).then((scores) => {
        checkRelationCancelled(owner.signal);
        return scores;
      });
    },
    warmup: (text: string, signal?: AbortSignal) => {
      checkRelationCancelled(owner.signal);
      return shared.session.warmup(text, signal).then(() => {
        checkRelationCancelled(owner.signal);
      });
    },
    initialize: (signal?: AbortSignal) => {
      checkRelationCancelled(owner.signal);
      return shared.session.initialize(signal);
    },
    modelTiming: () => shared.session.timing(),
    dispose: () => {
      if (disposal) return disposal;
      owner.abort();
      if (--shared.owners) return (disposal = Promise.resolve());
      if (scopes.get(scope) === shared) scopes.delete(scope);
      shared.index?.controller.abort();
      shared.vectors?.controller.abort();
      shared.index = undefined;
      shared.vectors = undefined;
      return (disposal = shared.session.dispose());
    },
  };
}

export type GraphSearchPreparation = ReturnType<typeof acquireGraphSearchPreparation>;
