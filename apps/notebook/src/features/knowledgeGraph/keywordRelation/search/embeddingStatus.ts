import { useCallback, useSyncExternalStore } from 'react';

export type SearchEmbeddingStatus = {
  phase: 'idle' | 'running' | 'completed' | 'failed';
  processed: number;
  total: number;
  revision?: string;
  error?: string;
};

const idle: SearchEmbeddingStatus = { phase: 'idle', processed: 0, total: 0 };
type EmbeddingSource = 'extension' | 'search';
const bySource = new Map<string, Partial<Record<EmbeddingSource, SearchEmbeddingStatus>>>();
const listeners = new Set<() => void>();

export function publishSearchEmbeddingStatus(
  scope: string,
  status: SearchEmbeddingStatus,
  source: EmbeddingSource = 'extension'
) {
  const sources = bySource.get(scope) || {};
  const previousSource = sources[source] || idle;
  if (
    previousSource.phase === status.phase &&
    previousSource.processed === status.processed &&
    previousSource.total === status.total &&
    previousSource.revision === status.revision &&
    previousSource.error === status.error
  )
    return;
  if (status.phase === 'idle') delete sources[source];
  else sources[source] = status;
  if (sources.extension || sources.search) bySource.set(scope, sources);
  else bySource.delete(scope);
  listeners.forEach((listener) => listener());
}

export function useSearchEmbeddingStatus(scope: string, source?: EmbeddingSource) {
  const snapshot = useCallback(() => {
    const sources = bySource.get(scope);
    if (source) return sources?.[source] || idle;
    const values = [sources?.extension, sources?.search];
    return (
      values.find((value) => value?.phase === 'running') ||
      values.find((value) => value?.phase === 'failed') ||
      sources?.extension ||
      sources?.search ||
      idle
    );
  }, [scope, source]);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => idle
  );
}
