export interface TopicTaskOptions {
  signal?: AbortSignal;
  budgetMs?: number;
  onSlice?: (elapsedMs: number) => void;
}

/** Cooperatively execute pure inference and HTML extraction, cancelling on scope changes or blur. */
export function runTopicTask<T>(
  steps: Generator<void, T>,
  options: TopicTaskOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const now = () => globalThis.performance?.now() ?? Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const channel = typeof MessageChannel === 'function' ? new MessageChannel() : undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      channel?.port1.close();
      channel?.port2.close();
      options.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      steps.return(undefined as T);
      const error = new Error('Topic inference cancelled');
      error.name = 'AbortError';
      reject(error);
    };
    const execute = () => {
      if (finished) return;
      if (options.signal?.aborted) {
        abort();
        return;
      }
      const started = now();
      try {
        for (let i = 0; i < 4096; i++) {
          const next = steps.next();
          if (next.done) {
            finished = true;
            cleanup();
            options.onSlice?.(now() - started);
            resolve(next.value);
            return;
          }
          if (now() - started >= (options.budgetMs ?? 4)) break;
        }
        options.onSlice?.(now() - started);
        schedule();
      } catch (error) {
        finished = true;
        cleanup();
        reject(error);
      }
    };
    const schedule = () => {
      if (channel) channel.port2.postMessage(null);
      else timer = setTimeout(execute, 0);
    };
    if (channel) channel.port1.onmessage = execute;
    options.signal?.addEventListener('abort', abort, { once: true });
    schedule();
  });
}
