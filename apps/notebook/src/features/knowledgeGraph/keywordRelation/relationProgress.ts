export type RelationInferenceSnapshot = {
  model: 'embedding' | 'nli';
  phase: 'embedding' | 'merge' | 'validation' | 'retry';
  unit: 'pattern' | 'validation';
  total: number;
  processed: number;
  modelChecks: number;
  modelFailures: number;
  reusedChecks?: number;
  failedRecords?: number;
  inFlightInputChars?: number;
  checkLimit?: number;
  savedBatch?: number;
};

export type RelationInferenceProgress = RelationInferenceSnapshot & {
  status: 'running' | 'completed' | 'failed';
  elapsedMs: number;
};

/** Report current counts whenever the event loop can process the progress timer. */
export function createRelationInferenceProgress(
  snapshot: () => RelationInferenceSnapshot,
  report?: (progress: RelationInferenceProgress) => void,
  signal?: AbortSignal
) {
  let closed = false;
  const started = Date.now();
  const notify = (status: RelationInferenceProgress['status'] = 'running') => {
    if (!closed && !signal?.aborted)
      report?.({ ...snapshot(), status, elapsedMs: Date.now() - started });
  };
  notify();
  const timer = report ? setInterval(() => notify(), 2000) : undefined;
  const stop = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', stop);
    if (timer !== undefined) clearInterval(timer);
  };
  signal?.addEventListener('abort', stop, { once: true });
  return {
    stop,
    finish: (status: RelationInferenceProgress['status'] = 'completed') => {
      notify(status);
      stop();
    },
  };
}
